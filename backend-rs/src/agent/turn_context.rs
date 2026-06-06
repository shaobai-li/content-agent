use serde_json::Value;

/// A snapshot of a single chat turn input.
#[derive(Debug, Clone)]
pub struct AgentTurnContext {
    pub agent_id: String,
    pub session_id: Option<String>,
    pub mentions: Vec<Value>,
    pub user_text: String,
    pub resolved_attachment_paths: Vec<String>,
    pub history_messages: Vec<Value>,
    pub provider: Option<String>,
    pub model: Option<String>,
}

impl AgentTurnContext {
    pub fn new(
        agent_id: &str,
        session_id: Option<String>,
        user_text: String,
        history_messages: Vec<Value>,
    ) -> Self {
        Self {
            agent_id: agent_id.to_string(),
            session_id,
            mentions: Vec::new(),
            user_text,
            resolved_attachment_paths: Vec::new(),
            history_messages,
            provider: None,
            model: None,
        }
    }
}
