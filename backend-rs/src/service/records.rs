use std::collections::{HashMap, HashSet};

use serde_json::Value;
use tracing::{debug, info};

use crate::core::config::get_database_nodes_path;
use crate::core::ids::new_uuid;
use crate::service::knowledge_base::ensure_kb_document;

fn utc_iso() -> String {
    chrono::Utc::now()
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string()
}

fn root_folder_node() -> Value {
    let now = utc_iso();
    serde_json::json!({
        "id": "fld_root",
        "node_type": "folder",
        "name": "Root",
        "parent_id": null,
        "created_at": now,
        "updated_at": now,
    })
}

pub fn get_all_records(agent_id: &str, kb_id: &str) -> Vec<Value> {
    debug!("get all records: {} / {}", agent_id, kb_id);
    let path = get_database_nodes_path(agent_id, kb_id);
    if !path.exists() {
        ensure_kb_document(agent_id, kb_id);
    }
    match std::fs::read_to_string(&path) {
        Ok(content) => {
            if let Ok(data) = serde_json::from_str::<Value>(&content) {
                data.get("nodes")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default()
            } else {
                vec![]
            }
        }
        Err(_) => vec![],
    }
}

fn load_nodes_doc(agent_id: &str, kb_id: &str) -> Option<Value> {
    let path = get_database_nodes_path(agent_id, kb_id);
    if !path.exists() {
        return None;
    }
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|c| serde_json::from_str::<Value>(&c).ok())
}

fn save_nodes_doc(agent_id: &str, kb_id: &str, data: &Value) {
    let path = get_database_nodes_path(agent_id, kb_id);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    std::fs::write(&path, serde_json::to_string_pretty(data).unwrap()).ok();
}

pub fn create_folder(name: &str, agent_id: &str, kb_id: &str, parent_id: &str) -> Value {
    info!("create folder: {} / {} name={}", agent_id, kb_id, name);
    let folder_name = name.trim();
    if folder_name.is_empty() {
        return serde_json::json!({"success": false, "message": "文件夹名称不能为空"});
    }

    let data = load_nodes_doc(agent_id, kb_id).unwrap_or_else(|| ensure_kb_document(agent_id, kb_id));
    let mut data = data;

    let nodes = data
        .get_mut("nodes")
        .and_then(|v| v.as_array_mut())
        .unwrap();

    if !nodes.iter().any(|n| n.get("id").and_then(|v| v.as_str()) == Some("fld_root")) {
        nodes.insert(0, root_folder_node());
    }

    let now = utc_iso();
    let folder_node = serde_json::json!({
        "id": format!("fld_{}", new_uuid()),
        "node_type": "folder",
        "name": folder_name,
        "parent_id": parent_id,
        "created_at": now,
        "updated_at": now,
    });
    nodes.push(folder_node.clone());
    save_nodes_doc(agent_id, kb_id, &data);

    serde_json::json!({"success": true, "folder": folder_node})
}

pub fn rename_node(node_id: &str, name: &str, agent_id: &str, kb_id: &str) -> Value {
    info!("rename node: {} / {} node={} name={}", agent_id, kb_id, node_id, name);
    let node_name = name.trim();
    if node_name.is_empty() {
        return serde_json::json!({"success": false, "message": "名称不能为空"});
    }

    let mut data = match load_nodes_doc(agent_id, kb_id) {
        Some(d) => d,
        None => return serde_json::json!({"success": false, "message": "记录文件不存在"}),
    };

    let node_opt = data
        .get_mut("nodes")
        .and_then(|v| v.as_array_mut())
        .and_then(|nodes| {
            nodes.iter_mut().find(|n| {
                n.get("id").and_then(|v| v.as_str()) == Some(node_id)
                    || (n.get("node_type").and_then(|v| v.as_str()) == Some("record")
                        && n.get("record_id").and_then(|v| v.as_str()) == Some(node_id))
            })
        });

    match node_opt {
        None => serde_json::json!({"success": false, "message": format!("节点 {} 不存在", node_id)}),
        Some(node) => {
            if node.get("id").and_then(|v| v.as_str()) == Some("fld_root") {
                return serde_json::json!({"success": false, "message": "根目录不允许重命名"});
            }
            node["name"] = Value::String(node_name.to_string());
            node["updated_at"] = Value::String(utc_iso());
            let result = node.clone();
            save_nodes_doc(agent_id, kb_id, &data);
            serde_json::json!({"success": true, "node": result})
        }
    }
}

fn find_node_idx(nodes: &[Value], node_id: &str) -> Option<usize> {
    nodes.iter().position(|n| {
        n.get("id").and_then(|v| v.as_str()) == Some(node_id)
            || (n.get("node_type").and_then(|v| v.as_str()) == Some("record")
                && n.get("record_id").and_then(|v| v.as_str()) == Some(node_id))
    })
}

pub fn move_node(node_id: &str, parent_id: &str, agent_id: &str, kb_id: &str) -> Value {
    info!("move node: {} / {} node={} to parent={}", agent_id, kb_id, node_id, parent_id);
    let target_parent_id = if parent_id.trim().is_empty() { "fld_root" } else { parent_id.trim() };

    let mut data = match load_nodes_doc(agent_id, kb_id) {
        Some(d) => d,
        None => return serde_json::json!({"success": false, "message": "记录文件不存在"}),
    };

    let nodes = match data.get("nodes").and_then(|v| v.as_array()) {
        Some(n) => n,
        None => return serde_json::json!({"success": false, "message": "记录文件不存在或无法解析"}),
    };

    let target_idx = match find_node_idx(nodes, node_id) {
        Some(i) => i,
        None => return serde_json::json!({"success": false, "message": format!("节点 {} 不存在", node_id)}),
    };

    if nodes[target_idx].get("id").and_then(|v| v.as_str()) == Some("fld_root") {
        return serde_json::json!({"success": false, "message": "根目录不允许移动"});
    }

    if target_parent_id != "fld_root" {
        let parent_exists = nodes.iter().any(|n| {
            n.get("id").and_then(|v| v.as_str()) == Some(target_parent_id)
                && n.get("node_type").and_then(|v| v.as_str()) == Some("folder")
        });
        if !parent_exists {
            return serde_json::json!({"success": false, "message": format!("目标文件夹 {} 不存在", target_parent_id)});
        }
    }

    let current_parent_id = nodes[target_idx].get("parent_id").and_then(|v| v.as_str());
    if current_parent_id == Some(target_parent_id) {
        return serde_json::json!({"success": true, "node": nodes[target_idx].clone()});
    }

    let is_folder = nodes[target_idx].get("node_type").and_then(|v| v.as_str()) == Some("folder");
    if is_folder {
        let folder_id = nodes[target_idx].get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let children_by_parent: HashMap<&str, Vec<&str>> = nodes
            .iter()
            .filter_map(|n| {
                let pid = n.get("parent_id").and_then(|v| v.as_str());
                let nid = n.get("id").and_then(|v| v.as_str());
                match (pid, nid) {
                    (Some(p), Some(n)) => Some((p, n)),
                    _ => None,
                }
            })
            .fold(HashMap::new(), |mut acc, (p, n)| {
                acc.entry(p).or_insert_with(Vec::new).push(n);
                acc
            });

        let mut descendant_ids = HashSet::new();
        let mut visit = vec![folder_id.as_str()];
        while let Some(fid) = visit.pop() {
            if !descendant_ids.insert(fid.to_string()) {
                continue;
            }
            if let Some(children) = children_by_parent.get(fid) {
                for child in children {
                    visit.push(child);
                }
            }
        }

        if descendant_ids.contains(target_parent_id) {
            return serde_json::json!({"success": false, "message": "文件夹不能移动到自身或子文件夹中"});
        }
    }

    // 修改节点（重新获取可变引用）
    let result = {
        let nodes_mut = data.get_mut("nodes").and_then(|v| v.as_array_mut()).unwrap();
        nodes_mut[target_idx]["parent_id"] = Value::String(target_parent_id.to_string());
        nodes_mut[target_idx]["updated_at"] = Value::String(utc_iso());
        nodes_mut[target_idx].clone()
    };
    save_nodes_doc(agent_id, kb_id, &data);

    serde_json::json!({"success": true, "node": result})
}

pub fn delete_node(node_id: &str, agent_id: &str, kb_id: &str) -> Value {
    info!("delete node: {} / {} node={}", agent_id, kb_id, node_id);
    let mut data = match load_nodes_doc(agent_id, kb_id) {
        Some(d) => d,
        None => return serde_json::json!({"success": false, "message": "记录文件不存在"}),
    };

    let nodes_imm = match data.get("nodes").and_then(|v| v.as_array()) {
        Some(n) => n.clone(),
        None => return serde_json::json!({"success": false, "message": "记录文件不存在或无法解析"}),
    };

    let target_idx = match find_node_idx(&nodes_imm, node_id) {
        Some(i) => i,
        None => return serde_json::json!({"success": false, "message": format!("节点 {} 不存在", node_id)}),
    };

    if nodes_imm[target_idx].get("id").and_then(|v| v.as_str()) == Some("fld_root") {
        return serde_json::json!({"success": false, "message": "根目录不允许删除"});
    }

    // 如果是文件夹，级联删除所有子节点
    let mut ids_to_delete = HashSet::new();
    if nodes_imm[target_idx].get("node_type").and_then(|v| v.as_str()) == Some("folder") {
        let children_by_parent: HashMap<&str, Vec<&str>> = nodes_imm
            .iter()
            .filter_map(|n| {
                let pid = n.get("parent_id").and_then(|v| v.as_str());
                let nid = n.get("id").and_then(|v| v.as_str());
                match (pid, nid) {
                    (Some(p), Some(n)) => Some((p, n)),
                    _ => None,
                }
            })
            .fold(HashMap::new(), |mut acc, (p, n)| {
                acc.entry(p).or_insert_with(Vec::new).push(n);
                acc
            });

        let folder_id = nodes_imm[target_idx].get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let mut visit = vec![folder_id.as_str()];
        while let Some(fid) = visit.pop() {
            if !ids_to_delete.insert(fid.to_string()) {
                continue;
            }
            if let Some(children) = children_by_parent.get(fid) {
                for child in children {
                    visit.push(child);
                }
            }
        }
    } else {
        if let Some(rid) = nodes_imm[target_idx].get("record_id").and_then(|v| v.as_str()) {
            ids_to_delete.insert(rid.to_string());
        }
        if let Some(nid) = nodes_imm[target_idx].get("id").and_then(|v| v.as_str()) {
            ids_to_delete.insert(nid.to_string());
        }
    }

    let remaining: Vec<Value> = nodes_imm
        .into_iter()
        .filter(|n| {
            let nid = n.get("id").and_then(|v| v.as_str());
            let rid = n.get("record_id").and_then(|v| v.as_str());
            !ids_to_delete.contains(nid.unwrap_or(""))
                && !ids_to_delete.contains(rid.unwrap_or(""))
        })
        .collect();

    data["nodes"] = Value::Array(remaining);
    save_nodes_doc(agent_id, kb_id, &data);

    serde_json::json!({"success": true, "message": format!("节点 {} 已删除", node_id)})
}
