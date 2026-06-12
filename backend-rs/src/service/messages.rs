use serde::{Deserialize, Serialize};
use serde_json::Value;
use tracing::warn;

use crate::core::config::{get_agent_messages_path, get_agent_session_messages_path};
use crate::core::ids::new_uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct Message {
    pub message_id: String,
    pub session_id: String,
    pub role: String,
    pub content: Option<String>,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

pub fn load_messages(agent_id: &str, session_id: &str) -> Vec<Message> {
    // 优先读 .jsonl
    let new_path = get_agent_session_messages_path(agent_id, session_id);
    if new_path.exists() {
        return read_jsonl(&new_path);
    }

    // 降级读旧 messages.json（兼容旧 session，不做迁移）
    let old_path = get_agent_messages_path(agent_id);
    if old_path.exists() {
        match std::fs::read_to_string(&old_path) {
            Ok(content) => {
                let all: Vec<Message> = serde_json::from_str(&content).unwrap_or_else(|e| {
                    warn!("failed to parse old messages.json for {}: {}", agent_id, e);
                    vec![]
                });
                return all.into_iter()
                    .filter(|m| m.session_id == session_id)
                    .collect();
            }
            Err(e) => {
                warn!("failed to read old messages.json for {}: {}", agent_id, e);
            }
        }
    }

    vec![]
}

fn read_jsonl(path: &std::path::Path) -> Vec<Message> {
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(e) => {
            warn!("failed to read jsonl for {:?}: {}", path, e);
            return vec![];
        }
    };
    content
        .lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect()
}

pub fn load_messages_raw(agent_id: &str) -> Vec<Value> {
    let path = get_agent_messages_path(agent_id);
    if !path.exists() {
        return vec![];
    }
    match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => vec![],
    }
}

pub fn save_message(
    agent_id: &str,
    session_id: &str,
    role: &str,
    content: Option<&str>,
    tool_calls: Option<Value>,
    tool_call_id: Option<&str>,
) {
    let path = get_agent_session_messages_path(agent_id, session_id);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let now = chrono::Utc::now().to_rfc3339();
    let mut message = serde_json::json!({
        "message_id": new_uuid(),
        "session_id": session_id,
        "role": role,
        "content": serde_json::Value::Null,
        "created_at": now,
    });

    if let Some(c) = content {
        message["content"] = serde_json::Value::String(c.to_string());
    }

    if let Some(tc) = tool_calls {
        message["tool_calls"] = tc;
    }
    if let Some(tci) = tool_call_id {
        message["tool_call_id"] = tci.into();
    }

    use std::io::Write;
    let line = serde_json::to_string(&message).unwrap();
    match std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        Ok(mut f) => {
            if let Err(e) = writeln!(f, "{}", line) {
                warn!("failed to write message to {:?}: {}", path, e);
            }
        }
        Err(e) => {
            warn!("failed to open {:?} for append: {}", path, e);
        }
    }
}

pub fn delete_session_messages(agent_id: &str, session_id: &str) {
    let path = get_agent_session_messages_path(agent_id, session_id);
    if path.exists() {
        if let Err(e) = std::fs::remove_file(&path) {
            warn!("failed to delete session messages {:?}: {}", path, e);
        }
    }
}
