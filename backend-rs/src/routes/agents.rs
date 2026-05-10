use axum::Json;
use serde_json::Value;

use crate::agent::registry;

pub fn router() -> axum::Router {
    axum::Router::new()
        .route("/api/agents", axum::routing::get(list_agents))
}

async fn list_agents() -> Json<Value> {
    let agents = registry::list_agents();
    Json(serde_json::json!({ "agents": agents }))
}
