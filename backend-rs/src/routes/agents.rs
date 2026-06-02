use axum::extract::Extension;
use axum::Json;
use serde_json::Value;

use crate::agent::registry;
use crate::core::auth::UserContext;

pub fn router() -> axum::Router {
    axum::Router::new()
        .route("/api/agents", axum::routing::get(list_agents))
}

async fn list_agents(Extension(ctx): Extension<UserContext>) -> Json<Value> {
    let mut agents = registry::list_agents().clone();

    // 追加当前用户的 custom agent
    for (agent_id, cfg) in &ctx.user_agents {
        if !agents.iter().any(|a| a.id == *agent_id) {
            agents.push(crate::agent::registry::AgentMeta {
                id: agent_id.clone(),
                name: cfg
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or(agent_id)
                    .to_string(),
                visible: true,
                locked: false,
                layout: None,
            });
        }
    }

    Json(serde_json::json!({ "agents": agents }))
}
