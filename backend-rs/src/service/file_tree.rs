use std::path::{Path, PathBuf};

use serde_json::{json, Value};

use crate::core::config::get_agent_workspace_dir;

fn build_tree(dir: &Path, rel: &str) -> Value {
    let name = dir
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("workspace");
    let mut children: Vec<Value> = Vec::new();
    let mut entries: Vec<_> = std::fs::read_dir(dir)
        .map(|it| it.filter_map(|e| e.ok()).collect())
        .unwrap_or_default();
    entries.sort_by(|a, b| {
        let ak = (
            a.path().is_file(),
            a.file_name().to_string_lossy().to_lowercase(),
        );
        let bk = (
            b.path().is_file(),
            b.file_name().to_string_lossy().to_lowercase(),
        );
        ak.cmp(&bk)
    });
    for entry in entries {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let child_rel = if rel.is_empty() {
            name.clone()
        } else {
            format!("{}/{}", rel, name)
        };
        if path.is_dir() {
            children.push(build_tree(&path, &child_rel));
        } else {
            let meta = path.metadata().ok();
            let mut node = json!({
                "id": child_rel,
                "name": name,
                "type": "file",
                "path": child_rel,
            });
            if let Some(m) = meta.as_ref() {
                node["size"] = json!(m.len() as i64);
                if let Ok(modified) = m.modified() {
                    let dt: chrono::DateTime<chrono::Utc> = modified.into();
                    node["modifiedAt"] = json!(dt.format("%Y-%m-%dT%H:%M:%S").to_string());
                }
            }
            children.push(node);
        }
    }
    json!({
        "id": if rel.is_empty() { "root" } else { rel },
        "name": name,
        "type": "folder",
        "path": rel,
        "children": children,
    })
}

/// 返回 agent workspace 根目录的递归目录树。
pub fn build_workspace_tree(agent_id: &str) -> Value {
    build_tree(&get_agent_workspace_dir(agent_id), "")
}

/// 词法规范化路径：解析 `.` / `..`，不访问文件系统。
fn normalize_lexically(path: &Path) -> PathBuf {
    use std::path::Component;

    let mut out = PathBuf::new();
    for comp in path.components() {
        match comp {
            Component::CurDir => {}
            Component::ParentDir => {
                // pop 失败（已在根）时 out 为空 → starts_with 判定为越界
                let _ = out.pop();
            }
            c => out.push(c.as_os_str()),
        }
    }
    out
}

/// 读取 workspace 内相对路径的文本文件内容。
/// 越界（含 `..` / 绝对路径 / symlink 逃逸）恒返回 400，与 Python 对齐；
/// 文件缺失 404，超 1MB 413。
fn read_workspace_file_at(ws: &Path, rel_path: &str) -> Result<String, (u16, String)> {
    // 词法预检（两侧均为未 canonicalize 的原始路径，避免 Windows \\?\ 前缀差异）：
    // `..` 越界 / 绝对路径越界恒 400（不依赖文件是否存在）
    let ws_lex = normalize_lexically(ws);
    let target_lex = normalize_lexically(&ws.join(rel_path));
    if !target_lex.starts_with(&ws_lex) {
        return Err((400, "路径越界".to_string()));
    }
    let ws_canon = ws.canonicalize().unwrap_or_else(|_| ws.to_path_buf());
    let target_canon = target_lex
        .canonicalize()
        .map_err(|_| (404, "文件不存在".to_string()))?;
    // canonicalize 可能跟随 symlink 逃逸到 workspace 外 → 二次校验（两侧均带 \\?\ 前缀，一致）
    if !target_canon.starts_with(&ws_canon) {
        return Err((400, "路径越界".to_string()));
    }
    if !target_canon.is_file() {
        return Err((404, "文件不存在".to_string()));
    }
    if target_canon.metadata().map(|m| m.len()).unwrap_or(0) > 1_000_000 {
        return Err((413, "文件过大".to_string()));
    }
    std::fs::read_to_string(&target_canon).map_err(|_| (500, "读取失败".to_string()))
}

/// 读取 workspace 内相对路径的文本文件内容（含路径越界防护 + 大小限制）。
pub fn read_workspace_file(agent_id: &str, rel_path: &str) -> Result<String, (u16, String)> {
    read_workspace_file_at(&get_agent_workspace_dir(agent_id), rel_path)
}

/// 写入 workspace 内相对路径的文本文件内容（覆盖）。
/// 越界（含 `..` / 绝对路径 / symlink 逃逸）恒 400，缺失 404，超 1MB 413。
fn write_workspace_file_at(ws: &Path, rel_path: &str, content: &str) -> Result<Value, (u16, String)> {
    let ws_lex = normalize_lexically(ws);
    let target_lex = normalize_lexically(&ws.join(rel_path));
    if !target_lex.starts_with(&ws_lex) {
        return Err((400, "路径越界".to_string()));
    }
    let ws_canon = ws.canonicalize().unwrap_or_else(|_| ws.to_path_buf());
    let target_canon = target_lex
        .canonicalize()
        .map_err(|_| (404, "文件不存在".to_string()))?;
    if !target_canon.starts_with(&ws_canon) {
        return Err((400, "路径越界".to_string()));
    }
    if !target_canon.is_file() {
        return Err((404, "文件不存在".to_string()));
    }
    if content.len() > 1_000_000 {
        return Err((413, "文件过大".to_string()));
    }
    std::fs::write(&target_canon, content.as_bytes()).map_err(|_| (500, "写入失败".to_string()))?;
    let meta = target_canon
        .metadata()
        .map_err(|_| (500, "写入失败".to_string()))?;
    let dt: chrono::DateTime<chrono::Utc> = meta
        .modified()
        .map_err(|_| (500, "写入失败".to_string()))?
        .into();
    Ok(json!({
        "ok": true,
        "path": rel_path,
        "size": meta.len() as i64,
        "modifiedAt": dt.format("%Y-%m-%dT%H:%M:%S").to_string(),
    }))
}

/// 写入 workspace 内相对路径的文本文件内容（覆盖，含路径越界防护 + 大小限制）。
pub fn write_workspace_file(
    agent_id: &str,
    rel_path: &str,
    content: &str,
) -> Result<Value, (u16, String)> {
    write_workspace_file_at(&get_agent_workspace_dir(agent_id), rel_path, content)
}

/// 移动 workspace 内文件/文件夹到目标目录（target_dir 为空或 "." 表示工作区根）。
/// 越界恒 400，源缺失 404，目标非目录 400，循环 400，同名 409，位置不变 400。
fn move_workspace_file_at(
    ws: &Path,
    source: &str,
    target_dir: &str,
) -> Result<Value, (u16, String)> {
    let ws_lex = normalize_lexically(ws);
    let ws_canon = ws.canonicalize().unwrap_or_else(|_| ws.to_path_buf());

    // 词法预检（不依赖文件存在）：source / target_dir 越界恒 400
    let src_lex = normalize_lexically(&ws.join(source));
    if !src_lex.starts_with(&ws_lex) {
        return Err((400, "路径越界".to_string()));
    }
    let trimmed = target_dir.trim();
    let dst_dir_lex = if trimmed.is_empty() || trimmed == "." {
        ws_lex.clone()
    } else {
        let d = normalize_lexically(&ws.join(target_dir));
        if !d.starts_with(&ws_lex) {
            return Err((400, "路径越界".to_string()));
        }
        d
    };

    // canonicalize 后二次校验（防 symlink 逃逸）
    let src_canon = src_lex
        .canonicalize()
        .map_err(|_| (404, "源文件不存在".to_string()))?;
    if !src_canon.starts_with(&ws_canon) {
        return Err((400, "路径越界".to_string()));
    }
    let dst_dir_canon = dst_dir_lex
        .canonicalize()
        .map_err(|_| (400, "目标必须是目录".to_string()))?;
    if !dst_dir_canon.is_dir() {
        return Err((400, "目标必须是目录".to_string()));
    }
    if !dst_dir_canon.starts_with(&ws_canon) {
        return Err((400, "路径越界".to_string()));
    }

    // 循环防护：不能把文件夹移入自身或子目录
    if src_canon.is_dir() && dst_dir_canon.starts_with(&src_canon) {
        return Err((400, "不能移入自身或子目录".to_string()));
    }
    let name = src_canon
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");
    let dst = dst_dir_canon.join(name);
    if dst == src_canon {
        return Err((400, "目标位置不变".to_string()));
    }
    if dst.exists() {
        return Err((409, "目标已存在同名文件或文件夹".to_string()));
    }
    std::fs::rename(&src_canon, &dst).map_err(|_| (500, "移动失败".to_string()))?;

    // 相对路径（用词法路径计算，两侧均无 \\?\ 前缀、恒一致；与 Python as_posix 统一 / 分隔）
    let dst_lex = dst_dir_lex.join(name);
    let rel = dst_lex.strip_prefix(&ws_lex).unwrap_or(&dst_lex);
    let to = rel.to_string_lossy().replace('\\', "/");
    Ok(json!({ "ok": true, "from": source, "to": to }))
}

/// 移动 workspace 内文件/文件夹到目标目录（含路径越界防护）。
pub fn move_workspace_file(
    agent_id: &str,
    source: &str,
    target_dir: &str,
) -> Result<Value, (u16, String)> {
    move_workspace_file_at(&get_agent_workspace_dir(agent_id), source, target_dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_ws() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let ws = dir.path().to_path_buf();
        std::fs::create_dir_all(ws.join("docs")).unwrap();
        std::fs::write(ws.join("docs/README.md"), "# hello").unwrap();
        std::fs::write(ws.join("SYSTEM.md"), "system").unwrap();
        std::fs::write(ws.join("big.bin"), vec![b'x'; 1_000_001]).unwrap();
        (dir, ws)
    }

    #[test]
    fn build_tree_lists_folders_and_files() {
        let (_dir, ws) = make_ws();
        let tree = build_tree(&ws, "");
        assert_eq!(tree["id"], "root");
        assert_eq!(tree["type"], "folder");
        let names: Vec<String> = tree["children"]
            .as_array()
            .unwrap()
            .iter()
            .map(|c| c["name"].as_str().unwrap().to_string())
            .collect();
        assert!(names.contains(&"docs".to_string()));
        assert!(names.contains(&"SYSTEM.md".to_string()));
        assert!(names.contains(&"big.bin".to_string()));
    }

    #[test]
    fn read_file_ok() {
        let (_dir, ws) = make_ws();
        assert_eq!(read_workspace_file_at(&ws, "docs/README.md").unwrap(), "# hello");
    }

    #[test]
    fn read_file_outside_returns_400() {
        let (_dir, ws) = make_ws();
        let err = read_workspace_file_at(&ws, "../secret.txt").unwrap_err();
        assert_eq!(err.0, 400);
    }

    #[test]
    fn read_file_absolute_path_returns_400() {
        let (_dir, ws) = make_ws();
        let err = read_workspace_file_at(&ws, "/etc/passwd").unwrap_err();
        assert_eq!(err.0, 400);
    }

    #[test]
    fn read_file_missing_returns_404() {
        let (_dir, ws) = make_ws();
        let err = read_workspace_file_at(&ws, "nope.md").unwrap_err();
        assert_eq!(err.0, 404);
    }

    #[test]
    fn read_file_too_large_returns_413() {
        let (_dir, ws) = make_ws();
        let err = read_workspace_file_at(&ws, "big.bin").unwrap_err();
        assert_eq!(err.0, 413);
    }

    #[test]
    fn write_file_ok() {
        let (_dir, ws) = make_ws();
        let result = write_workspace_file_at(&ws, "docs/README.md", "# updated").unwrap();
        assert_eq!(result["ok"], true);
        assert_eq!(result["path"], "docs/README.md");
        assert_eq!(read_workspace_file_at(&ws, "docs/README.md").unwrap(), "# updated");
    }

    #[test]
    fn write_file_outside_returns_400() {
        let (_dir, ws) = make_ws();
        let err = write_workspace_file_at(&ws, "../secret.txt", "x").unwrap_err();
        assert_eq!(err.0, 400);
    }

    #[test]
    fn write_file_missing_returns_404() {
        let (_dir, ws) = make_ws();
        let err = write_workspace_file_at(&ws, "nope.md", "x").unwrap_err();
        assert_eq!(err.0, 404);
    }

    #[test]
    fn write_file_too_large_returns_413() {
        let (_dir, ws) = make_ws();
        let err = write_workspace_file_at(&ws, "docs/README.md", &"x".repeat(1_000_001)).unwrap_err();
        assert_eq!(err.0, 413);
    }

    #[test]
    fn move_file_ok() {
        let (_dir, ws) = make_ws();
        let result = move_workspace_file_at(&ws, "SYSTEM.md", "docs").unwrap();
        assert_eq!(result["ok"], true);
        assert_eq!(result["to"], "docs/SYSTEM.md");
        assert!(!ws.join("SYSTEM.md").exists());
        assert!(ws.join("docs/SYSTEM.md").is_file());
    }

    #[test]
    fn move_file_to_root_ok() {
        let (_dir, ws) = make_ws();
        let result = move_workspace_file_at(&ws, "docs/README.md", "").unwrap();
        assert_eq!(result["ok"], true);
        assert_eq!(result["to"], "README.md");
        assert!(ws.join("README.md").is_file());
        assert!(!ws.join("docs/README.md").exists());
    }

    #[test]
    fn move_file_outside_returns_400() {
        let (_dir, ws) = make_ws();
        let err = move_workspace_file_at(&ws, "../secret.txt", "docs").unwrap_err();
        assert_eq!(err.0, 400);
    }

    #[test]
    fn move_file_missing_returns_404() {
        let (_dir, ws) = make_ws();
        let err = move_workspace_file_at(&ws, "nope.md", "docs").unwrap_err();
        assert_eq!(err.0, 404);
    }

    #[test]
    fn move_file_target_not_dir_returns_400() {
        let (_dir, ws) = make_ws();
        let err = move_workspace_file_at(&ws, "docs/README.md", "SYSTEM.md").unwrap_err();
        assert_eq!(err.0, 400);
    }

    #[test]
    fn move_file_loop_returns_400() {
        let (_dir, ws) = make_ws();
        std::fs::create_dir_all(ws.join("docs/sub")).unwrap();
        let err = move_workspace_file_at(&ws, "docs", "docs/sub").unwrap_err();
        assert_eq!(err.0, 400);
    }

    #[test]
    fn move_file_conflict_returns_409() {
        let (_dir, ws) = make_ws();
        std::fs::write(ws.join("docs/SYSTEM.md"), "dup").unwrap();
        let err = move_workspace_file_at(&ws, "SYSTEM.md", "docs").unwrap_err();
        assert_eq!(err.0, 409);
    }
}
