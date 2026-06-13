use serde::{Deserialize, Serialize};
use serde_json::Value;
use tracing::warn;

use crate::core::config::get_agent_session_messages_path;
use crate::core::ids::new_uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct Message {
    pub message_id: String,
    pub role: String,
    pub content: Option<String>,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

pub fn load_messages(agent_id: &str, session_id: &str) -> Vec<Message> {
    let path = get_agent_session_messages_path(agent_id, session_id);
    if !path.exists() {
        return vec![];
    }
    read_jsonl(&path)
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

pub fn save_message(
    agent_id: &str,
    session_id: &str,
    role: &str,
    content: &str,
    tool_calls: Option<Value>,
    tool_call_id: Option<&str>,
    reasoning_content: Option<&str>,
    name: Option<&str>,
) {
    let path = get_agent_session_messages_path(agent_id, session_id);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let now = chrono::Utc::now().to_rfc3339();
    let msg = Message {
        message_id: new_uuid(),
        role: role.to_string(),
        content: Some(content.to_string()),
        created_at: now,
        tool_calls,
        tool_call_id: tool_call_id.map(|s| s.to_string()),
        reasoning_content: reasoning_content.map(|s| s.to_string()),
        name: name.map(|s| s.to_string()),
    };

    use std::io::Write;
    let line = serde_json::to_string(&msg).unwrap();
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_message_serialization_order() {
        let msg = Message {
            message_id: "msg-1111".to_string(),
            role: "user".to_string(),
            content: Some("你好".to_string()),
            created_at: "2026-06-13T00:00:00+00:00".to_string(),
            tool_calls: None,
            tool_call_id: None,
            reasoning_content: None,
            name: None,
        };
        let json = serde_json::to_string(&msg).unwrap();
        // 字段顺序：message_id, role, content, created_at
        assert!(json.starts_with(r#"{"message_id":"#), "应 message_id 开头, 得到: {}", json);
        assert!(json.contains(r#""role":"#));
        assert!(json.contains(r#""content":"#));
        assert!(json.contains(r#""created_at":"#));
        // 确认 content 在 created_at 之前
        let content_pos = json.find("\"content\"").unwrap();
        let created_at_pos = json.find("\"created_at\"").unwrap();
        assert!(
            content_pos < created_at_pos,
            "content 应在 created_at 之前，实际: content@{} created_at@{}",
            content_pos,
            created_at_pos
        );
    }

    #[test]
    fn test_message_with_tool_calls_order() {
        let msg = Message {
            message_id: "msg-3333".to_string(),
            role: "assistant".to_string(),
            content: Some("".to_string()),
            created_at: "2026-06-13T00:00:00+00:00".to_string(),
            tool_calls: Some(serde_json::json!([{"id": "call-1", "function": {"name": "test", "arguments": "{}"}}])),
            tool_call_id: None,
            reasoning_content: None,
            name: None,
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.starts_with(r#"{"message_id":"#), "应 message_id 开头, 得到: {}", json);
        assert!(json.contains(r#""tool_calls":"#));
        // tool_calls 应在 created_at 之后
        let created_at_pos = json.find("\"created_at\"").unwrap();
        let tool_calls_pos = json.find("\"tool_calls\"").unwrap();
        assert!(
            created_at_pos < tool_calls_pos,
            "tool_calls 应在 created_at 之后，实际: created_at@{} tool_calls@{}",
            created_at_pos,
            tool_calls_pos
        );
    }

    #[test]
    fn test_message_with_tool_call_id_order() {
        let msg = Message {
            message_id: "msg-5555".to_string(),
            role: "tool".to_string(),
            content: Some("result".to_string()),
            created_at: "2026-06-13T00:00:00+00:00".to_string(),
            tool_calls: None,
            tool_call_id: Some("call-1".to_string()),
            reasoning_content: None,
            name: None,
        };
        let json = serde_json::to_string(&msg).unwrap();
        // tool_call_id 应在 created_at 之后
        let created_at_pos = json.find("\"created_at\"").unwrap();
        let tool_call_id_pos = json.find("\"tool_call_id\"").unwrap();
        assert!(
            created_at_pos < tool_call_id_pos,
            "tool_call_id 应在 created_at 之后，实际: created_at@{} tool_call_id@{}",
            created_at_pos,
            tool_call_id_pos
        );
    }

    #[test]
    fn test_message_skip_optional_fields() {
        let msg = Message {
            message_id: "msg-7777".to_string(),
            role: "user".to_string(),
            content: Some("hello".to_string()),
            created_at: "2026-06-13T00:00:00+00:00".to_string(),
            tool_calls: None,
            tool_call_id: None,
            reasoning_content: None,
            name: None,
        };
        let json = serde_json::to_string(&msg).unwrap();
        // tool_calls、tool_call_id、reasoning_content 和 name 应为空时被跳过
        assert!(!json.contains("tool_calls"), "不应包含 tool_calls: {}", json);
        assert!(!json.contains("tool_call_id"), "不应包含 tool_call_id: {}", json);
        assert!(!json.contains("reasoning_content"), "不应包含 reasoning_content: {}", json);
        assert!(!json.contains(r#""name""#), "不应包含 name: {}", json);
    }

    #[test]
    fn test_message_with_reasoning_content() {
        let msg = Message {
            message_id: "msg-9999".to_string(),
            role: "assistant".to_string(),
            content: Some("hello".to_string()),
            created_at: "2026-06-13T00:00:00+00:00".to_string(),
            tool_calls: None,
            tool_call_id: None,
            reasoning_content: Some("thinking...".to_string()),
            name: None,
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("reasoning_content"), "应包含 reasoning_content: {}", json);
        assert_eq!(
            serde_json::from_str::<Message>(&json).unwrap().reasoning_content,
            Some("thinking...".to_string())
        );
    }

    #[test]
    fn test_message_with_name() {
        let msg = Message {
            message_id: "msg-aaaa".to_string(),
            role: "tool".to_string(),
            content: Some("result".to_string()),
            created_at: "2026-06-13T00:00:00+00:00".to_string(),
            tool_calls: None,
            tool_call_id: Some("call-1".to_string()),
            reasoning_content: None,
            name: Some("get_weather".to_string()),
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains(r#""name""#), "应包含 name: {}", json);
        assert_eq!(
            serde_json::from_str::<Message>(&json).unwrap().name,
            Some("get_weather".to_string())
        );
    }
}
