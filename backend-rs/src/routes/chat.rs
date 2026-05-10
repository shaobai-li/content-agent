use axum::{
    extract::{Multipart, Path},
    response::Response,
    routing::post,
    Router,
};

use crate::agent::registry::get_agent;
use crate::agent::turn_context::AgentTurnContext;
use crate::service::messages::save_message;
use crate::service::sessions::save_session_if_new;
use crate::service::stream::build_stream_done;
use crate::service::stream::build_stream_chunk;

pub fn router() -> Router {
    Router::new()
        .route("/api/agents/{agent_id}/chat/stream", post(chat_stream_handler))
}

async fn chat_stream_handler(
    Path(agent_id): Path<String>,
    mut multipart: Multipart,
) -> Response {
    let mut text = String::new();
    let mut session_id: Option<String> = None;
    let mut history_messages: Vec<serde_json::Value> = Vec::new();

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
            _ => {}
        }
    }

    let session_id = session_id.unwrap_or_else(|| uuid::Uuid::new_v4().simple().to_string());

    // Check agent exists
    let agent = match get_agent(&agent_id) {
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
    save_message(&agent_id, &session_id, "user", Some(&text), None, None);

    let ctx = AgentTurnContext::new(&agent_id, Some(session_id.clone()), text, history_messages);
    let stream = agent.handle_chat_stream(ctx).await;

    Response::builder()
        .header("Content-Type", "text/event-stream")
        .header("Cache-Control", "no-cache")
        .header("Connection", "keep-alive")
        .header("X-Accel-Buffering", "no")
        .body(axum::body::Body::from_stream(stream))
        .unwrap()
}
