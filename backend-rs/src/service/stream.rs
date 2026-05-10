/// SSE 事件序列化（Server-Sent Events 格式）
///
/// 协议约定：
///   chunk:           event: chunk\ndata: {"content": "..."}\n\n
///   done:            event: done\ndata: {"session_id": "..."}\n\n
///   tool_exec_start: event: tool_exec_start\ndata: {"name":"...","call_id":"...","arguments":{...}}\n\n
///   tool_exec_chunk: event: tool_exec_chunk\ndata: {"call_id":"...","content":"..."}\n\n
///   tool_exec_end:   event: tool_exec_end\ndata: {"call_id":"..."}\n\n

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

pub fn build_tool_exec_start(name: &str, call_id: &str, arguments: Value) -> String {
    format!(
        "event: tool_exec_start\ndata: {}\n\n",
        serde_json::json!({"name": name, "call_id": call_id, "arguments": arguments})
    )
}

pub fn build_tool_exec_chunk(call_id: &str, content: &str) -> String {
    format!(
        "event: tool_exec_chunk\ndata: {}\n\n",
        serde_json::json!({"call_id": call_id, "content": content})
    )
}

pub fn build_tool_exec_end(call_id: &str) -> String {
    format!(
        "event: tool_exec_end\ndata: {}\n\n",
        serde_json::json!({"call_id": call_id})
    )
}
