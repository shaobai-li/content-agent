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
}
