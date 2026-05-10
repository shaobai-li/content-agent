use axum::{extract::Path, Json};
use serde_json::Value;

use crate::service::sessions;

pub fn router() -> axum::Router {
    axum::Router::new()
        .route(
            "/api/agents/{agent_id}/sessions",
            axum::routing::get(get_sessions),
        )
        .route(
            "/api/agents/{agent_id}/sessions/{session_id}",
            axum::routing::delete(delete_session_handler),
        )
}

async fn get_sessions(Path(agent_id): Path<String>) -> Json<Value> {
    let result = sessions::load_sessions_raw(&agent_id);
    Json(Value::Array(result))
}

async fn delete_session_handler(
    Path((agent_id, session_id)): Path<(String, String)>,
) -> Json<Value> {
    sessions::delete_session(&agent_id, &session_id);
    Json(serde_json::json!({"success": true}))
}
