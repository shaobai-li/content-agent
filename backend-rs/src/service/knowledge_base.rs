use serde_json::Value;
use tracing::{debug, warn};

use crate::core::config::{get_agent_local_data_dir, get_database_nodes_path};
use crate::core::ids::new_uuid;

fn default_database_meta(agent_id: &str) -> (&str, &str) {
    match agent_id {
        "kb" => ("知识库数据库", "点击进入当前知识库数据页"),
        "std" => ("标准数据库", "点击进入当前知识库数据页"),
        _ => ("", ""),
    }
}

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

fn default_kb_document(kb_id: &str) -> Value {
    serde_json::json!({
        "kb_id": kb_id,
        "version": 1,
        "nodes": [root_folder_node()],
    })
}

pub fn get_database_registry_path(agent_id: &str) -> std::path::PathBuf {
    get_agent_local_data_dir(agent_id).join("databases.json")
}

pub fn ensure_kb_document(agent_id: &str, kb_id: &str) -> Value {
    let path = get_database_nodes_path(agent_id, kb_id);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    if !path.exists() {
        let data = default_kb_document(kb_id);
        std::fs::write(&path, serde_json::to_string_pretty(&data).unwrap()).ok();
        return data;
    }

    let content = std::fs::read_to_string(&path).unwrap_or_default();
    let mut data: Value = serde_json::from_str(&content).unwrap_or_else(|_| default_kb_document(kb_id));
    let mut changed = false;

    if data.get("kb_id").and_then(|v| v.as_str()) != Some(kb_id) {
        data["kb_id"] = Value::String(kb_id.to_string());
        changed = true;
    }
    if !data.get("version").and_then(|v| v.as_i64()).is_some_and(|v| v >= 1) {
        data["version"] = Value::Number(1.into());
        changed = true;
    }
    if !data.get("nodes").and_then(|v| v.as_array()).is_some_and(|nodes| {
        nodes.iter().any(|n| n.get("id").and_then(|v| v.as_str()) == Some("fld_root"))
    }) {
        let nodes = data.get_mut("nodes")
            .and_then(|v| v.as_array_mut())
            .unwrap();
        nodes.insert(0, root_folder_node());
        changed = true;
    }

    if changed {
        std::fs::write(&path, serde_json::to_string_pretty(&data).unwrap()).ok();
    }
    data
}

fn normalize_database_entry(entry: &Value) -> Option<Value> {
    let obj = entry.as_object()?;
    let id = obj.get("id")?.as_str()?.to_string();
    let name = obj.get("name")?.as_str()?.to_string();
    if id.trim().is_empty() || name.trim().is_empty() {
        return None;
    }
    let now = utc_iso();
    Some(serde_json::json!({
        "id": id,
        "name": name,
        "description": obj.get("description").and_then(|v| v.as_str()).unwrap_or(""),
        "created_at": obj.get("created_at").and_then(|v| v.as_str()).unwrap_or(&now),
        "updated_at": obj.get("updated_at").and_then(|v| v.as_str()).unwrap_or(&now),
    }))
}

fn save_database_registry(agent_id: &str, databases: &[Value]) {
    let path = get_database_registry_path(agent_id);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    std::fs::write(&path, serde_json::to_string_pretty(databases).unwrap()).ok();
}

fn ensure_database_registry(agent_id: &str) -> Vec<Value> {
    let path = get_database_registry_path(agent_id);
    let entries: Vec<Value> = if path.exists() {
        std::fs::read_to_string(&path)
            .ok()
            .and_then(|c| serde_json::from_str::<Vec<Value>>(&c).ok())
            .unwrap_or_default()
            .into_iter()
            .filter_map(|e| normalize_database_entry(&e))
            .collect()
    } else {
        vec![]
    };
    save_database_registry(agent_id, &entries);
    entries
}

pub fn list_knowledge_bases(agent_id: &str) -> Vec<Value> {
    debug!("list knowledge bases: {}", agent_id);
    ensure_database_registry(agent_id)
}

pub fn create_knowledge_base(name: &str, description: &str, agent_id: &str) -> Value {
    let name = name.trim();
    if name.is_empty() {
        warn!("create kb empty name: {}", agent_id);
        return serde_json::json!({"success": false, "message": "知识库名称不能为空"});
    }

    let mut databases = ensure_database_registry(agent_id);
    let existing_ids: Vec<String> = databases
        .iter()
        .filter_map(|d| d.get("id").and_then(|v| v.as_str()).map(String::from))
        .collect();

    let mut kb_id = format!("kb_{}", new_uuid());
    while existing_ids.contains(&kb_id) {
        kb_id = format!("kb_{}", new_uuid());
    }

    let now = utc_iso();
    let database = serde_json::json!({
        "id": kb_id,
        "name": name,
        "description": description.trim(),
        "created_at": now,
        "updated_at": now,
    });

    ensure_kb_document(agent_id, &kb_id);
    databases.push(database.clone());
    save_database_registry(agent_id, &databases);

    serde_json::json!({"success": true, "database": database})
}

pub fn rename_knowledge_base(agent_id: &str, kb_id: &str, new_name: &str) -> Value {
    let kb_id = kb_id.trim();
    let name = new_name.trim();
    if name.is_empty() {
        return serde_json::json!({"success": false, "message": "名称不能为空"});
    }

    let mut databases = ensure_database_registry(agent_id);
    let found = databases.iter().position(|d| {
        d.get("id").and_then(|v| v.as_str()) == Some(kb_id)
    });

    match found {
        None => {
            warn!("kb not found for rename: {} / {}", agent_id, kb_id);
            serde_json::json!({"success": false, "message": "知识库不存在"})
        }
        Some(idx) => {
            let now = utc_iso();
            databases[idx]["name"] = Value::String(name.to_string());
            databases[idx]["updated_at"] = Value::String(now);
            save_database_registry(agent_id, &databases);
            let database = databases[idx].clone();
            serde_json::json!({"success": true, "database": database})
        }
    }
}

pub fn delete_knowledge_base(agent_id: &str, kb_id: &str) -> Value {
    let kb_id = kb_id.trim();
    if kb_id.is_empty() {
        return serde_json::json!({"success": false, "message": "知识库不存在"});
    }

    let databases = ensure_database_registry(agent_id);
    let database = databases.iter().find(|d| d.get("id").and_then(|v| v.as_str()) == Some(kb_id));

    match database {
        None => {
            warn!("kb not found: {} / {}", agent_id, kb_id);
            serde_json::json!({"success": false, "message": "知识库不存在"})
        }
        Some(db) => {
            let db_clone = db.clone();
            let remaining: Vec<Value> = databases
                .into_iter()
                .filter(|d| d.get("id").and_then(|v| v.as_str()) != Some(kb_id))
                .collect();
            save_database_registry(agent_id, &remaining);

            let kb_dir = get_agent_local_data_dir(agent_id).join(kb_id);
            if kb_dir.exists() {
                std::fs::remove_dir_all(&kb_dir).ok();
            }

            serde_json::json!({"success": true, "database": db_clone})
        }
    }
}
