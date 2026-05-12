use axum::{extract::Path, Json};
use serde_json::Value;

use crate::service::messages;

pub fn router() -> axum::Router {
    axum::Router::new().route(
        "/api/agents/:agent_id/sessions/:session_id/messages",
        axum::routing::get(get_messages),
    )
}

async fn get_messages(
    Path((agent_id, session_id)): Path<(String, String)>,
) -> Json<Value> {
    let messages = messages::load_messages(&agent_id, &session_id);
    Json(serde_json::to_value(messages).unwrap_or_default())
}
