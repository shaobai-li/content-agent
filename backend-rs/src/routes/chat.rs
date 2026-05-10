use std::convert::Infallible;

use axum::{
    extract::{Multipart, Path},
    response::Response,
    routing::post,
    Router,
};
use futures_util::stream;

use crate::service::messages::save_message;
use crate::service::sessions::save_session_if_new;
use crate::service::stream::{build_stream_chunk, build_stream_done};

pub fn router() -> Router {
    Router::new()
        .route("/api/agents/{agent_id}/chat/stream", post(chat_stream_handler))
}

async fn chat_stream_handler(
    Path(agent_id): Path<String>,
    mut multipart: Multipart,
) -> Response {
    // Parse multipart form fields
    let mut text = String::new();
    let mut session_id: Option<String> = None;

    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "text" => text = field.text().await.unwrap_or_default(),
            "session_id" => session_id = field.text().await.ok(),
            _ => {}
        }
    }

    let session_id = session_id.unwrap_or_else(|| uuid::Uuid::new_v4().simple().to_string());

    // Check if agent exists
    let agent_config = crate::core::config::get_agent_config(&agent_id);
    if agent_config.is_none() {
        let s = stream::iter([
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

    // Save session if new
    save_session_if_new(&agent_id, &session_id, &text);

    // Save user message
    save_message(&agent_id, &session_id, "user", Some(&text), None, None);

    // Mock streaming response for Phase 2 (AgentRunner will replace this in Phase 4)
    let mock_reply = format!("Echo: {}", text);
    let msg = mock_reply.clone();
    let sid = session_id.clone();

    let save = move || {
        save_message(&agent_id, &sid, "assistant", Some(&msg), None, None);
    };
    save();

    let events: Vec<Result<String, Infallible>> = vec![
        Ok(build_stream_chunk(&mock_reply)),
        Ok(build_stream_done(&session_id, None)),
    ];

    Response::builder()
        .header("Content-Type", "text/event-stream")
        .header("Cache-Control", "no-cache")
        .header("Connection", "keep-alive")
        .header("X-Accel-Buffering", "no")
        .body(axum::body::Body::from_stream(stream::iter(events)))
        .unwrap()
}
