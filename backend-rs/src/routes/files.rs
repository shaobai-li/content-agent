use axum::{
    extract::{Multipart, Path},
    Json,
};
use serde_json::Value;

use crate::service::files;

pub fn router() -> axum::Router {
    axum::Router::new().route(
        "/api/agents/{agent_id}/attachments/cache",
        axum::routing::post(upload_attachment),
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
