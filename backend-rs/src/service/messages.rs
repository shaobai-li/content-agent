use serde::{Deserialize, Serialize};
use serde_json::Value;
use tracing::warn;

use crate::core::config::get_agent_messages_path;
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
    let path = get_agent_messages_path(agent_id);
    if !path.exists() {
        return vec![];
    }
    match std::fs::read_to_string(&path) {
        Ok(content) => {
            let all: Vec<Message> = serde_json::from_str(&content).unwrap_or_else(|e| {
                warn!("failed to parse messages for {}: {}", agent_id, e);
                vec![]
            });
            all.into_iter()
                .filter(|m| m.session_id == session_id)
                .collect()
        }
        Err(e) => {
            warn!("failed to read messages for {}: {}", agent_id, e);
            vec![]
        }
    }
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
    let path = get_agent_messages_path(agent_id);
    let mut all: Vec<Value> = if path.exists() {
        std::fs::read_to_string(&path)
            .ok()
            .and_then(|c| serde_json::from_str(&c).ok())
            .unwrap_or_default()
    } else {
        vec![]
    };

    let now = chrono::Utc::now().to_rfc3339();
    let mut message = serde_json::json!({
        "message_id": new_uuid(),
        "session_id": session_id,
        "role": role,
        "created_at": now,
    });

    if let Some(c) = content {
        message["content"] = serde_json::Value::String(c.to_string());
    } else {
        message["content"] = serde_json::Value::Null;
    }

    if let Some(tc) = tool_calls {
        message["tool_calls"] = tc;
    }
    if let Some(tci) = tool_call_id {
        message["tool_call_id"] = tci.into();
    }

    all.push(message);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    std::fs::write(&path, serde_json::to_string_pretty(&all).unwrap()).ok();
}

pub fn delete_session_messages(agent_id: &str, session_id: &str) {
    let path = get_agent_messages_path(agent_id);
    if !path.exists() {
        return;
    }
    let all: Vec<Value> = std::fs::read_to_string(&path)
        .ok()
        .and_then(|c| serde_json::from_str(&c).ok())
        .unwrap_or_default();
    let all: Vec<Value> = all
        .into_iter()
        .filter(|m| m.get("session_id").and_then(|v| v.as_str()) != Some(session_id))
        .collect();
    std::fs::write(&path, serde_json::to_string_pretty(&all).unwrap()).ok();
}
