use axum::extract::Path;
use axum::Json;
use serde_json::Value;

use crate::service::messages;
use crate::utils::tool_hints::format_tool_hint;

pub fn router() -> axum::Router {
    axum::Router::new().route(
        "/api/agents/:agent_id/sessions/:session_id/messages",
        axum::routing::get(get_messages),
    )
}

async fn get_messages(
    Path((agent_id, session_id)): Path<(String, String)>,
) -> Json<Value> {
    let mut messages: Vec<Value> = messages::load_messages(&agent_id, &session_id)
        .into_iter()
        .map(|m| serde_json::to_value(m).unwrap_or_default())
        .collect();

    // 给每个 tool_calls 条目注入 hint 字段（对齐 Python 后端行为）
    for msg in messages.iter_mut() {
        let tool_calls = msg.get_mut("tool_calls");
        if let Some(Value::Array(calls)) = tool_calls {
            for tc in calls.iter_mut() {
                if tc.get("hint").and_then(|v| v.as_str()).is_some() {
                    continue; // 已存在则不重复注入
                }
                let name = tc
                    .get("function")
                    .and_then(|f| f.get("name"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                let raw_args = tc
                    .get("function")
                    .and_then(|f| f.get("arguments"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("{}");
                let args: Value = serde_json::from_str(raw_args).unwrap_or(Value::Object(Default::default()));
                let hint = format_tool_hint(name, &args);
                tc["hint"] = Value::String(hint);
            }
        }
    }

    Json(Value::Array(messages))
}
