//! SSE 事件序列化（Server-Sent Events 格式）
//!
//! 协议约定：
//!   chunk:           event: chunk\ndata: {"content": "..."}\n\n
//!   done:            event: done\ndata: {"session_id": "..."}\n\n
//!   tool_exec_start: event: tool_exec_start\ndata: {"name":"...","call_id":"...","hint":"..."}\n\n
//!   tool_exec_end:   event: tool_exec_end\ndata: {"call_id":"...","status":"ok"}\n\n

use serde_json::Value;

pub fn build_stream_chunk(content: &str) -> String {
    format!("event: chunk\ndata: {}\n\n", serde_json::json!({"content": content}))
}

pub fn build_stream_done(session_id: &str, extra: Option<Value>) -> String {
    let mut data = serde_json::json!({"session_id": session_id});
    if let Some(e) = extra {
        if let Some(obj) = e.as_object() {
            for (k, v) in obj {
                data[k] = v.clone();
            }
        }
    }
    format!("event: done\ndata: {}\n\n", data)
}

pub fn build_tool_exec_start(name: &str, call_id: &str, hint: &str) -> String {
    format!(
        "event: tool_exec_start\ndata: {}\n\n",
        serde_json::json!({"name": name, "call_id": call_id, "hint": hint})
    )
}

pub fn build_tool_exec_end(call_id: &str, status: &str, error: Option<&str>) -> String {
    let mut payload = serde_json::json!({"call_id": call_id, "status": status});
    if let Some(e) = error {
        payload["error"] = serde_json::Value::String(e.to_string());
    }
    format!("event: tool_exec_end\ndata: {}\n\n", payload)
}

pub fn build_canvas_card(content: &str, card_type: &str, title: &str) -> String {
    format!(
        "event: canvas_card\ndata: {}\n\n",
        serde_json::json!({
            "content": content,
            "card_type": card_type,
            "title": title,
        })
    )
}
