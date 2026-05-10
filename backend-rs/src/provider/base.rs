use std::collections::HashMap;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallRequest {
    pub id: String,
    pub name: String,
    pub arguments: HashMap<String, Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extra_content: Option<HashMap<String, Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_specific_fields: Option<HashMap<String, Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub function_provider_specific_fields: Option<HashMap<String, Value>>,
}

impl ToolCallRequest {
    pub fn to_openai_tool_call(&self) -> Value {
        let mut tc = serde_json::json!({
            "id": self.id,
            "type": "function",
            "function": {
                "name": self.name,
                "arguments": serde_json::to_string(&self.arguments).unwrap_or_default(),
            },
        });
        if let Some(ec) = &self.extra_content {
            tc["extra_content"] = serde_json::to_value(ec).unwrap_or(Value::Null);
        }
        if let Some(psf) = &self.provider_specific_fields {
            tc["provider_specific_fields"] = serde_json::to_value(psf).unwrap_or(Value::Null);
        }
        if let Some(fpsf) = &self.function_provider_specific_fields {
            tc["function"]["provider_specific_fields"] = serde_json::to_value(fpsf).unwrap_or(Value::Null);
        }
        tc
    }
}

#[derive(Debug, Clone)]
pub struct LLMResponse {
    pub content: Option<String>,
    pub tool_calls: Vec<ToolCallRequest>,
    pub finish_reason: String,
    pub usage: HashMap<String, u32>,
    pub reasoning_content: Option<String>,
    pub error_status_code: Option<u16>,
    pub error_kind: Option<String>,
    pub error_type: Option<String>,
    pub error_code: Option<String>,
    pub error_retry_after_s: Option<f64>,
    pub error_should_retry: Option<bool>,
}

impl LLMResponse {
    pub fn has_tool_calls(&self) -> bool {
        !self.tool_calls.is_empty()
    }

    pub fn should_execute_tools(&self) -> bool {
        if !self.has_tool_calls() {
            return false;
        }
        matches!(self.finish_reason.as_str(), "tool_calls" | "stop")
    }
}

#[derive(Debug, Clone)]
pub struct GenerationSettings {
    pub temperature: f64,
    pub max_tokens: u32,
    pub reasoning_effort: Option<String>,
}

impl Default for GenerationSettings {
    fn default() -> Self {
        Self {
            temperature: 0.7,
            max_tokens: 4096,
            reasoning_effort: None,
        }
    }
}

#[async_trait]
pub trait LLMProvider: Send + Sync {
    async fn chat(
        &self,
        messages: Vec<Value>,
        tools: Option<Vec<Value>>,
        model: Option<&str>,
        max_tokens: Option<u32>,
        temperature: Option<f64>,
        reasoning_effort: Option<&str>,
        tool_choice: Option<Value>,
    ) -> LLMResponse;

    async fn chat_stream(
        &self,
        messages: Vec<Value>,
        tools: Option<Vec<Value>>,
        model: Option<&str>,
        max_tokens: Option<u32>,
        temperature: Option<f64>,
        reasoning_effort: Option<&str>,
        tool_choice: Option<Value>,
        on_content_delta: Option<Box<dyn Fn(String) + Send>>,
    ) -> LLMResponse;

    fn get_default_model(&self) -> &str;
}

// ---------------------------------------------------------------------------
// Message utility functions (ported from Python LLMProvider base class)
// ---------------------------------------------------------------------------

const ALLOWED_MSG_KEYS: &[&str] = &[
    "role", "content", "tool_calls", "tool_call_id", "name",
    "reasoning_content", "extra_content",
];

const SYNTHETIC_USER_CONTENT: &str = "(conversation continued)";

/// Keep only provider-safe message keys and normalize assistant content.
pub fn sanitize_request_messages(messages: &[Value], allowed_keys: &[&str]) -> Vec<Value> {
    messages
        .iter()
        .map(|msg| {
            let mut clean = Value::Object(serde_json::Map::new());
            if let Some(obj) = msg.as_object() {
                for key in allowed_keys {
                    if let Some(val) = obj.get(*key) {
                        clean.as_object_mut().unwrap().insert(key.to_string(), val.clone());
                    }
                }
            }
            if clean.get("role").and_then(|r| r.as_str()) == Some("assistant") && !clean.as_object().unwrap().contains_key("content") {
                clean.as_object_mut().unwrap().insert("content".to_string(), Value::Null);
            }
            clean
        })
        .collect()
}

/// Sanitize message content: fix empty blocks, strip internal _meta fields.
pub fn sanitize_empty_content(messages: &[Value]) -> Vec<Value> {
    messages
        .iter()
        .map(|msg| {
            let content = msg.get("content");
            let role = msg.get("role").and_then(|r| r.as_str());

            match content {
                Some(Value::String(s)) if s.is_empty() => {
                    let mut clean = msg.clone();
                    if role == Some("assistant") && msg.get("tool_calls").is_some() {
                        clean.as_object_mut().unwrap().insert("content".to_string(), Value::Null);
                    } else {
                        clean.as_object_mut().unwrap().insert("content".to_string(), Value::String("(empty)".to_string()));
                    }
                    clean
                }
                Some(Value::Array(items)) => {
                    let mut new_items = Vec::new();
                    let mut changed = false;
                    for item in items {
                        if let Some(obj) = item.as_object() {
                            let item_type = obj.get("type").and_then(|t| t.as_str());
                            if matches!(item_type, Some("text" | "input_text" | "output_text")) {
                                if obj.get("text").map_or(true, |t| t.is_null() || t.as_str().map_or(true, |s| s.is_empty())) {
                                    changed = true;
                                    continue;
                                }
                            }
                            if obj.contains_key("_meta") {
                                let filtered: serde_json::Map<_, _> = obj.iter()
                                    .filter(|(k, _)| *k != "_meta")
                                    .map(|(k, v)| (k.clone(), v.clone()))
                                    .collect();
                                new_items.push(Value::Object(filtered));
                                changed = true;
                            } else {
                                new_items.push(item.clone());
                            }
                        } else {
                            new_items.push(item.clone());
                        }
                    }
                    if changed {
                        let mut clean = msg.clone();
                        let obj = clean.as_object_mut().unwrap();
                        if new_items.is_empty() && role == Some("assistant") && msg.get("tool_calls").is_some() {
                            obj.insert("content".to_string(), Value::Null);
                        } else if new_items.is_empty() {
                            obj.insert("content".to_string(), Value::String("(empty)".to_string()));
                        } else {
                            obj.insert("content".to_string(), Value::Array(new_items));
                        }
                        clean
                    } else {
                        msg.clone()
                    }
                }
                Some(Value::Object(_)) => {
                    let mut clean = msg.clone();
                    clean.as_object_mut().unwrap().insert(
                        "content".to_string(),
                        Value::Array(vec![msg.get("content").unwrap().clone()]),
                    );
                    clean
                }
                _ => msg.clone(),
            }
        })
        .collect()
}

/// Merge consecutive same-role messages and drop trailing assistant messages.
pub fn enforce_role_alternation(messages: &[Value]) -> Vec<Value> {
    if messages.is_empty() {
        return messages.to_vec();
    }

    let mut merged: Vec<Value> = Vec::new();
    for msg in messages {
        let role = msg.get("role").and_then(|r| r.as_str()).unwrap_or("");
        if let Some(prev) = merged.last() {
            let prev_role = prev.get("role").and_then(|r| r.as_str()).unwrap_or("");
            if role != "system" && role != "tool" && prev_role == role && matches!(role, "user" | "assistant") {
                if role == "assistant" {
                    let curr_has_tools = msg.get("tool_calls").and_then(|t| t.as_array()).map_or(false, |t| !t.is_empty());
                    if curr_has_tools {
                        *merged.last_mut().unwrap() = msg.clone();
                        continue;
                    }
                    let prev_has_tools = prev.get("tool_calls").and_then(|t| t.as_array()).map_or(false, |t| !t.is_empty());
                    if prev_has_tools {
                        continue;
                    }
                }
                let prev_content = prev.get("content").and_then(|c| c.as_str()).unwrap_or("").to_string();
                let curr_content = msg.get("content").and_then(|c| c.as_str()).unwrap_or("").to_string();
                if !prev_content.is_empty() || !curr_content.is_empty() {
                    let combined = format!("{}\n\n{}", prev_content, curr_content).trim().to_string();
                    merged.last_mut().unwrap().as_object_mut().unwrap().insert("content".to_string(), Value::String(combined));
                } else {
                    merged.push(msg.clone());
                }
                continue;
            }
        }
        merged.push(msg.clone());
    }

    // Remove trailing assistant messages, track the last one popped
    let mut last_popped: Option<Value> = None;
    while merged.last().and_then(|m| m.get("role").and_then(|r| r.as_str())) == Some("assistant") {
        last_popped = merged.pop();
    }

    // If removing trailing assistant messages left only system messages,
    // recover by converting the last popped assistant to a user message.
    if last_popped.is_some()
        && !merged.iter().any(|m| matches!(m.get("role").and_then(|r| r.as_str()), Some("user" | "tool")))
    {
        if let Some(mut recovered) = last_popped {
            recovered.as_object_mut().unwrap().insert("role".to_string(), Value::String("user".to_string()));
            merged.push(recovered);
        }
    }

    // Safety net: first non-system message must not be bare assistant.
    for i in 0..merged.len() {
        let role = merged[i].get("role").and_then(|r| r.as_str());
        if role != Some("system") {
            if role == Some("assistant") && merged[i].get("tool_calls").map_or(true, |t| t.as_array().map_or(true, |a| a.is_empty())) {
                merged.insert(i, serde_json::json!({"role": "user", "content": SYNTHETIC_USER_CONTENT}));
            }
            break;
        }
    }

    merged
}
