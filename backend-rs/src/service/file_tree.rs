use std::path::Path;

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

/// 读取 workspace 内相对路径的文本文件内容（含路径越界防护 + 大小限制）。
pub fn read_workspace_file(agent_id: &str, rel_path: &str) -> Result<String, (u16, String)> {
    let ws = get_agent_workspace_dir(agent_id);
    let ws_canon = ws.canonicalize().unwrap_or_else(|_| ws.clone());
    let target = ws.join(rel_path);
    let target_canon = target
        .canonicalize()
        .map_err(|_| (404, "文件不存在".to_string()))?;
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
