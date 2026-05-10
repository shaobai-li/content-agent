use std::collections::HashMap;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallRequest {
    pub id: String,
    pub name: String,
    pub arguments: HashMap<String, Value>,
}

impl ToolCallRequest {
    pub fn to_openai_tool_call(&self) -> Value {
        serde_json::json!({
            "id": self.id,
            "type": "function",
            "function": {
                "name": self.name,
                "arguments": serde_json::to_string(&self.arguments).unwrap_or_default(),
            },
        })
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
