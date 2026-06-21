/// 知识库记录内容查看 API。
///
/// GET /api/agents/{agent_id}/kb/{kb_id}/records/{record_id}/content
use axum::extract::Path;
use serde_json::Value;

use crate::core::config::get_agent_local_data_dir;

pub fn router() -> axum::Router {
    axum::Router::new().route(
        "/api/agents/:agent_id/kb/:kb_id/records/:record_id/content",
        axum::routing::get(get_record_content),
    )
}

async fn get_record_content(
    Path((agent_id, kb_id, record_id)): Path<(String, String, String)>,
) -> Result<axum::Json<Value>, (axum::http::StatusCode, axum::Json<Value>)> {
    let kb_root = get_agent_local_data_dir(&agent_id).join(&kb_id);
    let raw_dir = kb_root.join("raw").join(format!("m_{}", record_id));

    if !raw_dir.is_dir() {
        return Err((
            axum::http::StatusCode::NOT_FOUND,
            axum::Json(serde_json::json!({
                "error": "记录不存在",
                "record_id": record_id,
            })),
        ));
    }

    // 读取 record.json
    let record_path = raw_dir.join("record.json");
    if !record_path.exists() {
        return Err((
            axum::http::StatusCode::NOT_FOUND,
            axum::Json(serde_json::json!({
                "error": "记录数据不存在",
                "record_id": record_id,
            })),
        ));
    }

    let record_content = match std::fs::read_to_string(&record_path) {
        Ok(c) => c,
        Err(e) => {
            tracing::error!("读取 record.json 失败: {}", e);
            return Err((
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                axum::Json(serde_json::json!({
                    "error": "读取记录数据失败",
                    "record_id": record_id,
                })),
            ));
        }
    };

    let record: Value = match serde_json::from_str(&record_content) {
        Ok(v) => v,
        Err(e) => {
            tracing::error!("解析 record.json 失败: {}", e);
            return Err((
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                axum::Json(serde_json::json!({
                    "error": "记录数据格式错误",
                    "record_id": record_id,
                })),
            ));
        }
    };

    if !record.is_object() {
        return Err((
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            axum::Json(serde_json::json!({
                "error": "记录数据格式错误",
                "record_id": record_id,
            })),
        ));
    }

    // 确定要读取的文件路径：parsed_path 优先，其次 source_path
    let content_path_str = record
        .get("parsed_path")
        .and_then(|v| v.as_str())
        .or_else(|| record.get("source_path").and_then(|v| v.as_str()))
        .unwrap_or("");

    if content_path_str.is_empty() {
        return Err((
            axum::http::StatusCode::NOT_FOUND,
            axum::Json(serde_json::json!({
                "error": "记录缺少文件路径",
                "record_id": record_id,
            })),
        ));
    }

    let content_path = std::path::Path::new(content_path_str);
    let content_path = if content_path.is_absolute() {
        content_path.to_path_buf()
    } else {
        kb_root.join(content_path_str)
    };

    if !content_path.exists() {
        tracing::warn!("content file not found: {:?}", content_path);
        return Err((
            axum::http::StatusCode::NOT_FOUND,
            axum::Json(serde_json::json!({
                "error": "文件不存在",
                "record_id": record_id,
            })),
        ));
    }

    let content = match std::fs::read_to_string(&content_path) {
        Ok(c) => c,
        Err(e) => {
            tracing::error!("读取文件内容失败: {}", e);
            return Err((
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                axum::Json(serde_json::json!({
                    "error": "读取文件内容失败",
                    "record_id": record_id,
                })),
            ));
        }
    };

    let file_name = record
        .get("source")
        .and_then(|s| s.get("name"))
        .and_then(|n| n.as_str())
        .unwrap_or_else(|| content_path.file_name().and_then(|n| n.to_str()).unwrap_or(""));
    let has_parsed = record.get("parsed_path").and_then(|v| v.as_str()).is_some();

    Ok(axum::Json(serde_json::json!({
        "record_id": record_id,
        "file_name": file_name,
        "content": content,
        "content_type": if has_parsed { "parsed" } else { "source" },
    })))
}
