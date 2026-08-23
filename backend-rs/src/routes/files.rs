use std::collections::HashMap;

use axum::{
    extract::{Multipart, Path, Query},
    http::StatusCode,
    Json,
};
use serde_json::Value;

use crate::service::{file_tree, files};

pub fn router() -> axum::Router {
    axum::Router::new()
        .route(
            "/api/agents/:agent_id/attachments/cache",
            axum::routing::post(upload_attachment),
        )
        .route(
            "/api/agents/:agent_id/files/tree",
            axum::routing::get(get_workspace_tree),
        )
        .route(
            "/api/agents/:agent_id/files/content",
            axum::routing::get(get_workspace_file_content).put(update_workspace_file_content),
        )
}

async fn upload_attachment(
    Path(agent_id): Path<String>,
    mut multipart: Multipart,
) -> Json<Value> {
    let mut cached_path = String::new();

    while let Ok(Some(field)) = multipart.next_field().await {
        let filename = field
            .file_name()
            .map(|s| s.to_string())
            .unwrap_or_else(|| "unnamed".to_string());
        let data = field.bytes().await.unwrap_or_default();
        let path = files::save_upload_to_agent_cache_keep_name(
            &agent_id,
            &filename,
            &data,
        );
        cached_path = path.to_string_lossy().to_string();
    }

    Json(serde_json::json!({"cached_path": cached_path}))
}

async fn get_workspace_tree(Path(agent_id): Path<String>) -> Json<Value> {
    Json(serde_json::json!({ "tree": file_tree::build_workspace_tree(&agent_id) }))
}

async fn get_workspace_file_content(
    Path(agent_id): Path<String>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let path = params.get("path").cloned().unwrap_or_default();
    match file_tree::read_workspace_file(&agent_id, &path) {
        Ok(content) => Ok(Json(serde_json::json!({ "path": path, "content": content }))),
        Err((status, detail)) => Err((
            StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
            Json(serde_json::json!({ "detail": detail })),
        )),
    }
}

async fn update_workspace_file_content(
    Path(agent_id): Path<String>,
    Query(params): Query<HashMap<String, String>>,
    Json(payload): Json<serde_json::Value>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let path = params.get("path").cloned().unwrap_or_default();
    let Some(content) = payload.get("content").and_then(|c| c.as_str()) else {
        // 缺省/非字符串 content → 400（与 Python 对齐，避免把文件覆盖为空）
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "detail": "content 必须为字符串" })),
        ));
    };
    match file_tree::write_workspace_file(&agent_id, &path, content) {
        Ok(v) => Ok(Json(v)),
        Err((status, detail)) => Err((
            StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
            Json(serde_json::json!({ "detail": detail })),
        )),
    }
}
