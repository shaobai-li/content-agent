use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;
use serde_json::{json, Value};

use crate::core::config::AgentConfig;
use crate::provider::factory;

#[derive(Serialize)]
struct AgentSummary {
    id: String,
    name: String,
    locked: bool,
    model: String,
    session_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    last_reply_time: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    last_session_title: Option<String>,
}

pub fn router() -> Router {
    Router::new().route("/api/management/agents-summary", get(get_agents_summary))
}

async fn get_agents_summary() -> Json<Value> {
    let config = crate::core::config::get_config();
    let mut agents: Vec<AgentSummary> = Vec::new();

    for (agent_id, cfg) in &config.agents {
        if agent_id == "admin" {
            continue;
        }

        let sessions = crate::service::sessions::load_sessions(agent_id);
        let session_count = sessions.len();
        let last_session_title = sessions.first().map(|s| s.title.clone());

        let last_reply_time = sessions.first().and_then(|s| {
            let messages = crate::service::messages::load_messages(agent_id, &s.session_id);
            messages
                .iter()
                .rev()
                .find_map(|m| {
                    if m.role == "assistant" {
                        Some(m.created_at.clone())
                    } else {
                        None
                    }
                })
        });

        let model = resolve_model(cfg);

        agents.push(AgentSummary {
            id: agent_id.clone(),
            name: cfg.name.clone().unwrap_or_else(|| agent_id.clone()),
            locked: cfg.locked.unwrap_or(false),
            model,
            session_count,
            last_reply_time,
            last_session_title,
        });
    }

    Json(json!({"agents": agents}))
}

/// 从 config 解析显示用模型名
fn resolve_model(cfg: &AgentConfig) -> String {
    if let Some(model) = cfg.extra.get("model").and_then(|v| v.as_str()) {
        return model.to_string();
    }
    let provider = cfg
        .extra
        .get("provider")
        .and_then(|v| v.as_str())
        .unwrap_or("deepseek");
    factory::default_model_for(provider).to_string()
}
