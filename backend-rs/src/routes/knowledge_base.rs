use axum::{extract::Path, Json};
use serde_json::Value;

use crate::service::knowledge_base;

pub fn router() -> axum::Router {
    axum::Router::new()
        .route(
            "/api/agents/{agent_id}/knowledge-bases",
            axum::routing::get(list_kb).post(create_kb),
        )
        .route(
            "/api/agents/{agent_id}/knowledge-bases/{kb_id}",
            axum::routing::delete(delete_kb),
        )
}

async fn list_kb(Path(agent_id): Path<String>) -> Json<Value> {
    let dbs = knowledge_base::list_knowledge_bases(&agent_id);
    Json(serde_json::json!({"databases": dbs}))
}

async fn create_kb(
    Path(agent_id): Path<String>,
    axum::Json(payload): axum::Json<Value>,
) -> Json<Value> {
    let name = payload.get("name").and_then(|v| v.as_str()).unwrap_or("");
    let description = payload.get("description").and_then(|v| v.as_str()).unwrap_or("");
    Json(knowledge_base::create_knowledge_base(name, description, &agent_id))
}

async fn delete_kb(
    Path((agent_id, kb_id)): Path<(String, String)>,
) -> Json<Value> {
    Json(knowledge_base::delete_knowledge_base(&agent_id, &kb_id))
}
