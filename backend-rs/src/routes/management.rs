use axum::extract::Extension;
use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;
use serde_json::{json, Value};

use crate::core::auth::UserContext;
use crate::core::config::AgentConfig;
use crate::provider::factory;

#[derive(Serialize)]
struct AgentSummary {
    name: String,
    title: String,
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

async fn get_agents_summary(Extension(ctx): Extension<UserContext>) -> Json<Value> {
    let config = crate::core::config::get_config();
    let mut agents: Vec<AgentSummary> = Vec::new();

    // 系统 agent（config/agents/*.yaml + config.yaml agents）
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
            name: agent_id.clone(),
            title: cfg
                .title
                .clone()
                .unwrap_or_else(|| crate::core::config::DEFAULT_AGENT_TITLE.to_string()),
            locked: cfg.locked.unwrap_or(false),
            model,
            session_count,
            last_reply_time,
            last_session_title,
        });
    }

    // 当前用户的 custom agent（DATA_DIR/u_{user_id}/agent/*.yaml）
    for (agent_id, cfg) in &ctx.user_agents {
        if agent_id == "admin" {
            continue;
        }
        if config.agents.contains_key(agent_id) {
            continue; // 已在系统 agent 中，跳过
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

        let model = resolve_model_from_value(cfg);

        agents.push(AgentSummary {
            name: agent_id.clone(),
            title: cfg
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or(crate::core::config::DEFAULT_AGENT_TITLE)
                .to_string(),
            locked: cfg.get("locked").and_then(|v| v.as_bool()).unwrap_or(false),
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

/// 从 Value 类型的配置解析显示用模型名（供 custom agent 使用）
fn resolve_model_from_value(cfg: &Value) -> String {
    if let Some(model) = cfg.get("model").and_then(|v| v.as_str()) {
        return model.to_string();
    }
    let provider = cfg
        .get("provider")
        .and_then(|v| v.as_str())
        .unwrap_or("deepseek");
    factory::default_model_for(provider).to_string()
}
