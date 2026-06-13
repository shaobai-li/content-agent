use std::sync::Arc;

use axum::{
    extract::{Extension, Multipart, Path},
    response::Response,
    routing::post,
    Router,
};

use tracing::warn;

use crate::agent::registry::{get_agent, register_agent};
use crate::agent::turn_context::AgentTurnContext;
use crate::core::auth::UserContext;
use crate::service::messages::save_message;
use crate::service::sessions::save_session_if_new;
use crate::service::stream::build_stream_done;
use crate::service::stream::build_stream_chunk;

pub fn router() -> Router {
    Router::new()
        .route("/api/agents/:agent_id/chat/stream", post(chat_stream_handler))
}

async fn chat_stream_handler(
    Path(agent_id): Path<String>,
    Extension(ctx): Extension<UserContext>,
    mut multipart: Multipart,
) -> Response {
    let mut text = String::new();
    let mut session_id: Option<String> = None;
    let mut history_messages: Vec<serde_json::Value> = Vec::new();
    let mut mentions: Vec<serde_json::Value> = Vec::new();
    let mut attachment_paths: Vec<String> = Vec::new();

    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "text" => text = field.text().await.unwrap_or_default(),
            "session_id" => session_id = field.text().await.ok(),
            "history" => {
                if let Ok(content) = field.text().await {
                    if let Ok(arr) = serde_json::from_str::<Vec<serde_json::Value>>(&content) {
                        history_messages = arr;
                    }
                }
            }
            "mentions" => {
                if let Ok(content) = field.text().await {
                    if let Ok(arr) = serde_json::from_str::<Vec<serde_json::Value>>(&content) {
                        mentions = arr;
                    }
                }
            }
            "attachment_paths" => {
                if let Ok(content) = field.text().await {
                    if let Ok(arr) = serde_json::from_str::<Vec<String>>(&content) {
                        attachment_paths = arr;
                    } else {
                        warn!("attachment_paths 字段 JSON 解析失败: {}", content);
                    }
                } else {
                    warn!("attachment_paths 字段读取失败");
                }
            }
            _ => {}
        }
    }

    let session_id = session_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    // 获取 agent 实例（Python: agent_config = get_agent_config(agent_id)）
    let mut agent = get_agent(&agent_id);

    // Python: if not agent_config: 检查 custom agent 并动态创建
    if agent.is_none() {
        if ctx.user_agents.contains_key(&agent_id) {
            // Python: instance = StandardAgent(agent_id=agent_id); register_agent(instance)
            let instance = Arc::new(crate::agent::standard::StandardAgent::new(&agent_id))
                as Arc<dyn crate::agent::base::BaseAgent>;
            register_agent(&agent_id, instance);
            // Python: agent_config = get_agent_config(agent_id) — 重新从 registry 获取
            agent = get_agent(&agent_id);
            tracing::info!("dynamically created StandardAgent for custom agent: {}", agent_id);
        }
    }

    // Python: if not agent_config: "Unknown agent" error
    let agent = match agent {
        Some(a) => a,
        None => {
            use std::convert::Infallible;
            let s = futures_util::stream::iter([
                Ok::<_, Infallible>(build_stream_chunk(&format!("Unknown agent: {}", agent_id))),
                Ok(build_stream_done("", None)),
            ]);
            return Response::builder()
                .header("Content-Type", "text/event-stream")
                .header("Cache-Control", "no-cache")
                .header("Connection", "keep-alive")
                .header("X-Accel-Buffering", "no")
                .body(axum::body::Body::from_stream(s))
                .unwrap();
        }
    };

    save_session_if_new(&agent_id, &session_id, &text);
    save_message(&agent_id, &session_id, "user", &text, None, None, None);

    let validated_paths = crate::service::files::resolve_validated_cache_paths(
        &agent_id,
        &attachment_paths,
    );

    let mut ctx = AgentTurnContext::new(&agent_id, Some(session_id.clone()), text, history_messages);
    ctx.mentions = mentions;
    ctx.resolved_attachment_paths = validated_paths
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect();
    let stream = agent.handle_chat_stream(ctx).await;

    Response::builder()
        .header("Content-Type", "text/event-stream")
        .header("Cache-Control", "no-cache")
        .header("Connection", "keep-alive")
        .header("X-Accel-Buffering", "no")
        .body(axum::body::Body::from_stream(stream))
        .unwrap()
}
