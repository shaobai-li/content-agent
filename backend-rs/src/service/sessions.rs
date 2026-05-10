use serde::{Deserialize, Serialize};
use serde_json::Value;
use tracing::warn;

use crate::core::config::get_agent_sessions_path;
use crate::service::messages::delete_session_messages;

const TITLE_MAX_LENGTH: usize = 30;

#[derive(Debug, Serialize, Deserialize)]
pub struct Session {
    pub session_id: String,
    pub title: String,
    pub content: String,
}

pub fn load_sessions(agent_id: &str) -> Vec<Session> {
    let path = get_agent_sessions_path(agent_id);
    if !path.exists() {
        return vec![];
    }
    match std::fs::read_to_string(&path) {
        Ok(content) => {
            let sessions: Vec<Session> = serde_json::from_str(&content).unwrap_or_else(|e| {
                warn!("failed to parse sessions for {}: {}", agent_id, e);
                vec![]
            });
            sessions
        }
        Err(e) => {
            warn!("failed to read sessions for {}: {}", agent_id, e);
            vec![]
        }
    }
}

pub fn load_sessions_raw(agent_id: &str) -> Vec<Value> {
    let path = get_agent_sessions_path(agent_id);
    if !path.exists() {
        return vec![];
    }
    match std::fs::read_to_string(&path) {
        Ok(content) => {
            serde_json::from_str(&content).unwrap_or_default()
        }
        Err(_) => vec![],
    }
}

pub fn save_session_if_new(agent_id: &str, session_id: &str, first_message: &str) {
    let path = get_agent_sessions_path(agent_id);
    let mut sessions = if path.exists() {
        std::fs::read_to_string(&path)
            .ok()
            .and_then(|c| serde_json::from_str::<Vec<Value>>(&c).ok())
            .unwrap_or_default()
    } else {
        vec![]
    };

    if sessions.iter().any(|s| s.get("session_id").and_then(|v| v.as_str()) == Some(session_id)) {
        return;
    }

    let title = first_message.trim();
    let title = if title.chars().count() > TITLE_MAX_LENGTH {
        format!("{}…", title.chars().take(TITLE_MAX_LENGTH).collect::<String>())
    } else {
        title.to_string()
    };

    let new_session = serde_json::json!({
        "session_id": session_id,
        "title": title,
        "content": title,
    });

    sessions.insert(0, new_session);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    std::fs::write(&path, serde_json::to_string_pretty(&sessions).unwrap()).ok();
}

pub fn delete_session(agent_id: &str, session_id: &str) {
    let path = get_agent_sessions_path(agent_id);
    if path.exists() {
        let sessions = std::fs::read_to_string(&path)
            .ok()
            .and_then(|c| serde_json::from_str::<Vec<Value>>(&c).ok())
            .unwrap_or_default();
        let sessions: Vec<Value> = sessions
            .into_iter()
            .filter(|s| s.get("session_id").and_then(|v| v.as_str()) != Some(session_id))
            .collect();
        std::fs::write(&path, serde_json::to_string_pretty(&sessions).unwrap()).ok();
    }
    delete_session_messages(agent_id, session_id);
}
