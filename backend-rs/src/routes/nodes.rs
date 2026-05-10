use axum::{
    extract::{Path, Query},
    Json,
};
use serde::Deserialize;
use serde_json::Value;

use crate::service::records;

#[derive(Deserialize)]
pub struct KbQuery {
    pub kb_id: String,
}

pub fn router() -> axum::Router {
    axum::Router::new()
        .route(
            "/api/agents/{agent_id}/res/{res_name}",
            axum::routing::get(get_nodes).post(create_node),
        )
        .route(
            "/api/agents/{agent_id}/res/{res_name}/{node_id}",
            axum::routing::delete(delete_node).put(update_node),
        )
}

async fn get_nodes(
    Path((agent_id, res_name)): Path<(String, String)>,
    Query(query): Query<KbQuery>,
) -> Json<Value> {
    if res_name == "nodes" {
        let nodes = records::get_all_records(&agent_id, &query.kb_id);
        return Json(serde_json::json!({"nodes": nodes}));
    }
    Json(serde_json::json!({"error": format!("Unknown resource type: {}", res_name)}))
}

async fn create_node(
    Path((agent_id, res_name)): Path<(String, String)>,
    Query(query): Query<KbQuery>,
    Json(payload): Json<Value>,
) -> Json<Value> {
    if res_name == "nodes" {
        let name = payload.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let parent_id = payload
            .get("parent_id")
            .and_then(|v| v.as_str())
            .unwrap_or("fld_root");
        return Json(records::create_folder(name, &agent_id, &query.kb_id, parent_id));
    }
    Json(serde_json::json!({"error": format!("Unknown resource type: {}", res_name)}))
}

async fn delete_node(
    Path((agent_id, res_name, node_id)): Path<(String, String, String)>,
    Query(query): Query<KbQuery>,
) -> Json<Value> {
    if res_name == "nodes" {
        return Json(records::delete_node(&node_id, &agent_id, &query.kb_id));
    }
    Json(serde_json::json!({"error": format!("Unknown resource type: {}", res_name)}))
}

async fn update_node(
    Path((agent_id, res_name, node_id)): Path<(String, String, String)>,
    Query(query): Query<KbQuery>,
    Json(payload): Json<Value>,
) -> Json<Value> {
    if res_name == "nodes" {
        if let Some(parent_id) = payload.get("parent_id").and_then(|v| v.as_str()) {
            return Json(records::move_node(&node_id, parent_id, &agent_id, &query.kb_id));
        }
        if let Some(name) = payload.get("name").and_then(|v| v.as_str()) {
            return Json(records::rename_node(&node_id, name, &agent_id, &query.kb_id));
        }
        return Json(serde_json::json!({"error": "需要 name 或 parent_id 字段"}));
    }
    Json(serde_json::json!({"error": format!("Unknown resource type: {}", res_name)}))
}
