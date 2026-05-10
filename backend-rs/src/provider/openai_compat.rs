use std::collections::HashMap;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::time::Duration;

use async_trait::async_trait;
use futures_util::StreamExt;
use reqwest::Client;
use serde_json::Value;

use crate::provider::base::{
    enforce_role_alternation, sanitize_empty_content, sanitize_request_messages,
    LLMProvider, LLMResponse, ToolCallRequest,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWED_MSG_KEYS: &[&str] = &[
    "role", "content", "tool_calls", "tool_call_id", "name",
    "reasoning_content", "extra_content",
];

const STANDARD_TC_KEYS: &[&str] = &["id", "type", "index", "function"];
const STANDARD_FN_KEYS: &[&str] = &["name", "arguments"];

const TRANSIENT_ERROR_MARKERS: &[&str] = &[
    "429", "rate limit", "500", "502", "503", "504",
    "overloaded", "timeout", "timed out", "connection",
    "server error", "temporarily unavailable", "速率限制",
];

const RETRYABLE_STATUS_CODES: &[u16] = &[408, 409, 429];
const TRANSIENT_ERROR_KINDS: &[&str] = &["timeout", "connection"];

// ---------------------------------------------------------------------------
// Provider configuration (simplified ProviderSpec for Rust)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct ProviderConfig {
    pub name: String,
    pub default_api_base: String,
    pub strip_model_prefix: bool,
    pub supports_max_completion_tokens: bool,
    pub thinking_style: String,
    pub model_overrides: Vec<(String, Value)>,
}

impl Default for ProviderConfig {
    fn default() -> Self {
        Self {
            name: "deepseek".to_string(),
            default_api_base: "https://api.deepseek.com".to_string(),
            strip_model_prefix: false,
            supports_max_completion_tokens: false,
            thinking_style: "thinking_type".to_string(),
            model_overrides: Vec::new(),
        }
    }
}

// ---------------------------------------------------------------------------
// OpenAI Compat Provider
// ---------------------------------------------------------------------------

pub struct OpenAICompatProvider {
    api_key: String,
    api_base: String,
    default_model: String,
    extra_headers: HashMap<String, String>,
    client: Client,
    spec: Option<ProviderConfig>,
}

impl OpenAICompatProvider {
    pub fn new(
        api_key: Option<String>,
        api_base: Option<String>,
        default_model: Option<String>,
        extra_headers: Option<HashMap<String, String>>,
        spec: Option<ProviderConfig>,
    ) -> Self {
        let effective_base = api_base
            .clone()
            .or_else(|| spec.as_ref().map(|s| s.default_api_base.clone()))
            .unwrap_or_else(|| "https://api.deepseek.com".to_string());

        let mut headers = HashMap::new();
        if let Some(eh) = extra_headers {
            headers.extend(eh);
        }

        let client = Client::builder()
            .timeout(Duration::from_secs(300))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            api_key: api_key.unwrap_or_default(),
            api_base: effective_base,
            default_model: default_model.unwrap_or_else(|| "deepseek-chat".to_string()),
            extra_headers: headers,
            client,
            spec,
        }
    }

    // ------------------------------------------------------------------
    // Tool call ID / argument normalization
    // ------------------------------------------------------------------

    fn short_tool_id() -> String {
        uuid::Uuid::new_v4().simple().to_string()[..9].to_string()
    }

    fn normalize_tool_call_id(tool_call_id: &str) -> String {
        if tool_call_id.len() == 9 && tool_call_id.chars().all(|c| c.is_alphanumeric()) {
            return tool_call_id.to_string();
        }
        let mut hasher = DefaultHasher::new();
        tool_call_id.hash(&mut hasher);
        format!("{:09x}", hasher.finish())[..9].to_string()
    }

    fn normalize_tool_call_arguments(arguments: &Value) -> String {
        match arguments {
            Value::String(s) => {
                let stripped = s.trim();
                if stripped.is_empty() {
                    return "{}".to_string();
                }
                if let Ok(parsed) = serde_json::from_str::<Value>(stripped) {
                    if parsed.is_object() {
                        return serde_json::to_string(&parsed).unwrap_or_else(|_| "{}".to_string());
                    }
                }
                "{}".to_string()
            }
            Value::Object(_) => {
                serde_json::to_string(arguments).unwrap_or_else(|_| "{}".to_string())
            }
            _ => "{}".to_string(),
        }
    }

    // ------------------------------------------------------------------
    // Message sanitization
    // ------------------------------------------------------------------

    fn sanitize_messages(&self, messages: &[Value]) -> Vec<Value> {
        let sanitized = sanitize_request_messages(messages, ALLOWED_MSG_KEYS);
        let mut id_map: HashMap<String, String> = HashMap::new();

        let mut map_id = |value: &str| -> String {
            id_map.get(value).cloned().unwrap_or_else(|| {
                let new_id = Self::normalize_tool_call_id(value);
                id_map.insert(value.to_string(), new_id.clone());
                new_id
            })
        };

        let mut result: Vec<Value> = Vec::new();
        for mut clean in sanitized.into_iter() {
            if let Some(tool_calls) = clean.get("tool_calls").and_then(|t| t.as_array()) {
                let normalized: Vec<Value> = tool_calls.iter().map(|tc| {
                    let mut tc_clean = tc.clone();
                    if let Some(obj) = tc_clean.as_object_mut() {
                        if let Some(id_val) = obj.get("id").and_then(|v| v.as_str()) {
                            obj.insert("id".to_string(), Value::String(map_id(id_val)));
                        }
                        if let Some(func) = obj.get_mut("function") {
                            if let Some(func_obj) = func.as_object_mut() {
                                let args = func_obj.get("arguments").cloned().unwrap_or(Value::Null);
                                func_obj.insert(
                                    "arguments".to_string(),
                                    Value::String(Self::normalize_tool_call_arguments(&args)),
                                );
                            }
                        }
                    }
                    tc_clean
                }).collect();
                if let Some(obj) = clean.as_object_mut() {
                    obj.insert("tool_calls".to_string(), Value::Array(normalized));
                }
                if clean.get("role").and_then(|r| r.as_str()) == Some("assistant") {
                    if let Some(obj) = clean.as_object_mut() {
                        obj.insert("content".to_string(), Value::Null);
                    }
                }
            }
            let tool_call_id = clean.get("tool_call_id").and_then(|v| v.as_str()).map(|s| s.to_string());
            if let Some(ref tid) = tool_call_id {
                if !tid.is_empty() {
                    if let Some(obj) = clean.as_object_mut() {
                        obj.insert("tool_call_id".to_string(), Value::String(map_id(tid)));
                    }
                }
            }
            result.push(clean);
        }

        enforce_role_alternation(&result)
    }

    // ------------------------------------------------------------------
    // Temperature support check
    // ------------------------------------------------------------------

    fn supports_temperature(model_name: &str, reasoning_effort: Option<&str>) -> bool {
        if let Some(effort) = reasoning_effort {
            if effort.to_lowercase() != "none" {
                return false;
            }
        }
        let name = model_name.to_lowercase();
        !name.contains("gpt-5") && !name.starts_with("o1") && !name.starts_with("o3") && !name.starts_with("o4")
    }

    // ------------------------------------------------------------------
    // Build request payload
    // ------------------------------------------------------------------

    fn build_chat_payload(
        &self,
        messages: &[Value],
        tools: Option<&[Value]>,
        model: Option<&str>,
        max_tokens: u32,
        temperature: f64,
        reasoning_effort: Option<&str>,
        tool_choice: Option<&Value>,
        stream: bool,
    ) -> Value {
        let mut model_name = model.unwrap_or(&self.default_model).to_string();

        if let Some(spec) = &self.spec {
            if spec.strip_model_prefix {
                if let Some(idx) = model_name.rfind('/') {
                    model_name = model_name[idx + 1..].to_string();
                }
            }
        }

        let sanitized = self.sanitize_messages(messages);
        let sanitized = sanitize_empty_content(&sanitized);

        let mut payload = serde_json::json!({
            "model": model_name,
            "messages": sanitized,
        });

        if Self::supports_temperature(&model_name, reasoning_effort) {
            payload["temperature"] = Value::from(temperature);
        }

        if let Some(spec) = &self.spec {
            if spec.supports_max_completion_tokens {
                payload["max_completion_tokens"] = Value::from(max_tokens.max(1));
            } else {
                payload["max_tokens"] = Value::from(max_tokens.max(1));
            }

            // Apply model-specific overrides
            let model_lower = model_name.to_lowercase();
            for (pattern, overrides) in &spec.model_overrides {
                if model_lower.contains(pattern) {
                    if let Some(obj) = overrides.as_object() {
                        for (k, v) in obj {
                            payload[k] = v.clone();
                        }
                    }
                    break;
                }
            }
        } else {
            payload["max_tokens"] = Value::from(max_tokens.max(1));
        }

        // Reasoning effort
        if let Some(effort) = reasoning_effort {
            payload["reasoning_effort"] = Value::String(effort.to_string());
        }

        // Provider-specific thinking parameters
        if let (Some(spec), Some(effort)) = (&self.spec, reasoning_effort) {
            if !spec.thinking_style.is_empty() {
                let thinking_enabled = effort.to_lowercase() != "minimal";
                let extra = match spec.thinking_style.as_str() {
                    "thinking_type" => serde_json::json!({"thinking": {"type": if thinking_enabled { "enabled" } else { "disabled" }}}),
                    "enable_thinking" => serde_json::json!({"enable_thinking": thinking_enabled}),
                    "reasoning_split" => serde_json::json!({"reasoning_split": thinking_enabled}),
                    _ => Value::Null,
                };
                if !extra.is_null() {
                    if payload.get("extra_body").is_none() {
                        payload["extra_body"] = serde_json::json!({});
                    }
                    if let Some(extra_body) = payload["extra_body"].as_object_mut() {
                        if let Some(extra_obj) = extra.as_object() {
                            for (k, v) in extra_obj {
                                extra_body.insert(k.clone(), v.clone());
                            }
                        }
                    }
                }
            }
        }

        if let Some(tools_list) = tools {
            if !tools_list.is_empty() {
                payload["tools"] = Value::Array(tools_list.to_vec());
                payload["tool_choice"] = tool_choice.cloned().unwrap_or(Value::String("auto".to_string()));
            }
        }

        if stream {
            payload["stream"] = Value::Bool(true);
            payload["stream_options"] = serde_json::json!({"include_usage": true});
        }

        payload
    }
}

#[async_trait]
impl LLMProvider for OpenAICompatProvider {
    fn get_default_model(&self) -> &str {
        &self.default_model
    }

    async fn chat(
        &self,
        messages: Vec<Value>,
        tools: Option<Vec<Value>>,
        model: Option<&str>,
        max_tokens: Option<u32>,
        temperature: Option<f64>,
        reasoning_effort: Option<&str>,
        tool_choice: Option<Value>,
    ) -> LLMResponse {
        let max_tokens = max_tokens.unwrap_or(4096);
        let temperature = temperature.unwrap_or(0.7);

        let payload = self.build_chat_payload(
            &messages,
            tools.as_deref(),
            model,
            max_tokens,
            temperature,
            reasoning_effort,
            tool_choice.as_ref(),
            false,
        );

        let url = format!("{}/chat/completions", self.api_base.trim_end_matches('/'));

        let mut req = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&payload);

        for (key, value) in &self.extra_headers {
            req = req.header(key.as_str(), value.as_str());
        }

        match req.send().await {
            Ok(resp) => {
                let status = resp.status();
                if !status.is_success() {
                    return Self::handle_http_error(resp, status.as_u16()).await;
                }
                match resp.json::<Value>().await {
                    Ok(json) => Self::parse_response(&json),
                    Err(e) => LLMResponse {
                        content: Some(format!("Error parsing response: {}", e)),
                        finish_reason: "error".to_string(),
                        ..Default::default()
                    },
                }
            }
            Err(e) => Self::handle_reqwest_error(e),
        }
    }

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
    ) -> LLMResponse {
        let max_tokens = max_tokens.unwrap_or(4096);
        let temperature = temperature.unwrap_or(0.7);
        let idle_timeout_s: u64 = std::env::var("STREAM_IDLE_TIMEOUT_S")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(90);

        let payload = self.build_chat_payload(
            &messages,
            tools.as_deref(),
            model,
            max_tokens,
            temperature,
            reasoning_effort,
            tool_choice.as_ref(),
            true,
        );

        let url = format!("{}/chat/completions", self.api_base.trim_end_matches('/'));

        let mut req = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&payload);

        for (key, value) in &self.extra_headers {
            req = req.header(key.as_str(), value.as_str());
        }

        match req.send().await {
            Ok(resp) => {
                let status = resp.status();
                if !status.is_success() {
                    return Self::handle_http_error(resp, status.as_u16()).await;
                }

                let mut chunks: Vec<Value> = Vec::new();
                let mut stream = resp.bytes_stream();
                let mut sse_buffer = String::new();

                loop {
                    match tokio::time::timeout(Duration::from_secs(idle_timeout_s), stream.next()).await {
                        Ok(Some(Ok(chunk))) => {
                            let text = String::from_utf8_lossy(&chunk);
                            sse_buffer.push_str(&text);

                            // Process complete SSE lines
                            while let Some(line_end) = sse_buffer.find('\n') {
                                let line = sse_buffer[..line_end].trim().to_string();
                                sse_buffer = sse_buffer[line_end + 1..].to_string();

                                if line.is_empty() {
                                    continue;
                                }
                                if line == "data: [DONE]" {
                                    break;
                                }
                                if let Some(data) = line.strip_prefix("data: ") {
                                    if let Ok(json) = serde_json::from_str::<Value>(data) {
                                        // Process delta for content
                                        if let Some(choices) = json.get("choices").and_then(|c| c.as_array()) {
                                            if let Some(choice) = choices.first() {
                                                if let Some(delta) = choice.get("delta") {
                                                    if let Some(content) = delta.get("content").and_then(|c| c.as_str()) {
                                                        if !content.is_empty() {
                                                            if let Some(ref on_delta) = on_content_delta {
                                                                on_delta(content.to_string());
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        chunks.push(json);
                                    }
                                }
                            }
                        }
                        Ok(Some(Err(e))) => {
                            return LLMResponse {
                                content: Some(format!("Error reading stream: {}", e)),
                                finish_reason: "error".to_string(),
                                error_kind: Some("connection".to_string()),
                                ..Default::default()
                            };
                        }
                        Ok(None) => break,
                        Err(_) => {
                            return LLMResponse {
                                content: Some(format!("Error calling LLM: stream stalled for more than {} seconds", idle_timeout_s)),
                                finish_reason: "error".to_string(),
                                error_kind: Some("timeout".to_string()),
                                ..Default::default()
                            };
                        }
                    }
                }

                Self::parse_chunks(&chunks)
            }
            Err(e) => Self::handle_reqwest_error(e),
        }
    }
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

impl OpenAICompatProvider {
    fn parse_response(data: &Value) -> LLMResponse {
        // Check for error response
        if let Some(error) = data.get("error") {
            return LLMResponse {
                content: Some(format!("Error: {}", error)),
                finish_reason: "error".to_string(),
                ..Default::default()
            };
        }

        let choices = data.get("choices").and_then(|c| c.as_array());
        let usage = Self::extract_usage(data);

        // Parse response based on choices availability
        if let Some(choices) = choices {
            if !choices.is_empty() {
                let choice0 = &choices[0];
                let msg = choice0.get("message").and_then(|m| m.as_object());
                let finish_reason = choice0
                    .get("finish_reason")
                    .and_then(|f| f.as_str())
                    .unwrap_or("stop")
                    .to_string();

                let content = msg.and_then(|m| m.get("content")).and_then(|c| c.as_str()).map(|s| s.to_string());
                let reasoning = msg
                    .and_then(|m| m.get("reasoning_content"))
                    .or_else(|| msg.and_then(|m| m.get("reasoning")))
                    .and_then(|r| r.as_str())
                    .map(|s| s.to_string());

                // Collect tool calls from all choices
                let mut tool_calls = Vec::new();
                for choice in choices {
                    if let Some(message) = choice.get("message").and_then(|m| m.as_object()) {
                        if let Some(tcs) = message.get("tool_calls").and_then(|t| t.as_array()) {
                            for tc in tcs {
                                if let Some(tc_obj) = tc.as_object() {
                                    let tc = Self::parse_tool_call(tc_obj);
                                    tool_calls.push(tc);
                                }
                            }
                        }
                    }
                }

                // Determine actual finish reason
                let final_finish_reason = choices
                    .iter()
                    .find_map(|ch| {
                        ch.get("finish_reason")
                            .and_then(|f| f.as_str())
                            .filter(|f| *f == "tool_calls" || *f == "stop")
                    })
                    .unwrap_or(&finish_reason)
                    .to_string();

                return LLMResponse {
                    content,
                    tool_calls,
                    finish_reason: final_finish_reason,
                    usage,
                    reasoning_content: reasoning,
                    ..Default::default()
                };
            }
        }

        // Handle empty choices - try extracting content directly
        if let Some(content) = data.get("content").and_then(|c| c.as_str()) {
            LLMResponse {
                content: Some(content.to_string()),
                finish_reason: data.get("finish_reason").and_then(|f| f.as_str()).unwrap_or("stop").to_string(),
                usage,
                ..Default::default()
            }
        } else {
            LLMResponse {
                content: Some("Error: API returned empty choices.".to_string()),
                finish_reason: "error".to_string(),
                usage,
                ..Default::default()
            }
        }
    }

    fn parse_tool_call(tc: &serde_json::Map<String, Value>) -> ToolCallRequest {
        let fn_obj = tc.get("function").and_then(|f| f.as_object());
        let args = fn_obj
            .and_then(|f| f.get("arguments"))
            .map(|a| Self::normalize_tool_call_arguments(a))
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();

        // Extract extra fields
        let (extra_content, prov, fn_prov) = Self::extract_tc_extras(tc);

        ToolCallRequest {
            id: Self::short_tool_id(),
            name: fn_obj.and_then(|f| f.get("name")).and_then(|n| n.as_str()).unwrap_or("").to_string(),
            arguments: args,
            extra_content,
            provider_specific_fields: prov,
            function_provider_specific_fields: fn_prov,
        }
    }

    fn extract_tc_extras(
        tc: &serde_json::Map<String, Value>,
    ) -> (Option<HashMap<String, Value>>, Option<HashMap<String, Value>>, Option<HashMap<String, Value>>) {
        let extra_content = tc.get("extra_content")
            .and_then(|v| v.as_object())
            .map(|obj| obj.iter().map(|(k, v)| (k.clone(), v.clone())).collect());

        // Provider-specific fields: keys in tc that are not standard
        let prov: Option<HashMap<String, Value>> = {
            let leftover: HashMap<_, _> = tc.iter()
                .filter(|(k, _)| !STANDARD_TC_KEYS.contains(&k.as_str()) && *k != "extra_content")
                .filter(|(_, v)| !v.is_null())
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect();
            if leftover.is_empty() { None } else { Some(leftover) }
        };

        // Function provider-specific fields
        let fn_prov = tc.get("function")
            .and_then(|f| f.as_object())
            .map(|fn_obj| {
                fn_obj.iter()
                    .filter(|(k, _)| !STANDARD_FN_KEYS.contains(&k.as_str()))
                    .filter(|(_, v)| !v.is_null())
                    .map(|(k, v)| (k.clone(), v.clone()))
                    .collect::<HashMap<_, _>>()
            })
            .filter(|m: &HashMap<String, Value>| !m.is_empty());

        (extra_content, prov, fn_prov)
    }
}

// ---------------------------------------------------------------------------
// Streaming chunk parsing
// ---------------------------------------------------------------------------

impl OpenAICompatProvider {
    fn parse_chunks(chunks: &[Value]) -> LLMResponse {
        let mut content_parts: Vec<String> = Vec::new();
        let mut reasoning_parts: Vec<String> = Vec::new();
        let mut tc_bufs: HashMap<usize, TcBuffer> = HashMap::new();
        let mut finish_reason = "stop".to_string();
        let mut usage: HashMap<String, u32> = HashMap::new();

        for chunk in chunks {
            if let Some(choices) = chunk.get("choices").and_then(|c| c.as_array()) {
                // Final chunk may contain usage but no choices
                if choices.is_empty() {
                    let u = Self::extract_usage(chunk);
                    if !u.is_empty() {
                        usage = u;
                    }
                    continue;
                }

                let choice = &choices[0];
                if let Some(fr) = choice.get("finish_reason").and_then(|f| f.as_str()) {
                    if !fr.is_empty() {
                        finish_reason = fr.to_string();
                    }
                }

                let delta = choice.get("delta").and_then(|d| d.as_object());

                if let Some(d) = delta {
                    // Content delta
                    if let Some(content) = d.get("content").and_then(|c| c.as_str()) {
                        if !content.is_empty() {
                            content_parts.push(content.to_string());
                        }
                    }

                    // Reasoning content delta
                    let reasoning = d.get("reasoning_content")
                        .or_else(|| d.get("reasoning"))
                        .and_then(|r| r.as_str());
                    if let Some(r) = reasoning {
                        if !r.is_empty() {
                            reasoning_parts.push(r.to_string());
                        }
                    }

                    // Tool call deltas
                    if let Some(tcs) = d.get("tool_calls").and_then(|t| t.as_array()) {
                        for (idx, tc) in tcs.iter().enumerate() {
                            Self::accum_tool_call(tc, idx, &mut tc_bufs);
                        }
                    }
                }

                // Update usage from the last chunk that has it
                let u = Self::extract_usage(chunk);
                if !u.is_empty() {
                    usage = u;
                }
            } else {
                // Non-standard chunk format, might be a string or have usage
                let u = Self::extract_usage(chunk);
                if !u.is_empty() {
                    usage = u;
                }
                if let Some(content) = chunk.get("content").and_then(|c| c.as_str()) {
                    content_parts.push(content.to_string());
                }
            }
        }

        let tool_calls: Vec<ToolCallRequest> = tc_bufs.into_values().map(|buf| {
            let parsed_args = if buf.arguments.is_empty() {
                HashMap::new()
            } else {
                serde_json::from_str(&buf.arguments).unwrap_or_default()
            };
            ToolCallRequest {
                id: if buf.id.is_empty() { Self::short_tool_id() } else { buf.id },
                name: buf.name,
                arguments: parsed_args,
                extra_content: buf.extra_content,
                provider_specific_fields: buf.prov,
                function_provider_specific_fields: buf.fn_prov,
            }
        }).collect();

        LLMResponse {
            content: if content_parts.is_empty() { None } else { Some(content_parts.join("")) },
            tool_calls,
            finish_reason,
            usage,
            reasoning_content: if reasoning_parts.is_empty() { None } else { Some(reasoning_parts.join("")) },
            ..Default::default()
        }
    }

    fn accum_tool_call(
        tc: &Value,
        idx_hint: usize,
        bufs: &mut HashMap<usize, TcBuffer>,
    ) {
        let tc_obj = match tc.as_object() {
            Some(obj) => obj,
            None => return,
        };

        let tc_index = tc_obj.get("index")
            .and_then(|i| i.as_i64())
            .map(|i| i as usize)
            .unwrap_or(idx_hint);

        let buf = bufs.entry(tc_index).or_insert_with(TcBuffer::default);

        if let Some(id) = tc_obj.get("id").and_then(|i| i.as_str()) {
            if !id.is_empty() {
                buf.id = id.to_string();
            }
        }

        if let Some(func) = tc_obj.get("function").and_then(|f| f.as_object()) {
            if let Some(name) = func.get("name").and_then(|n| n.as_str()) {
                if !name.is_empty() {
                    buf.name = name.to_string();
                }
            }
            if let Some(args) = func.get("arguments") {
                if let Some(s) = args.as_str() {
                    buf.arguments.push_str(s);
                }
            }
        }

        // Extract extras in streaming context (simplified)
        let tc_map: &serde_json::Map<String, Value> = tc_obj;
        if let Some(ec) = tc_map.get("extra_content").and_then(|v| v.as_object()) {
            buf.extra_content = Some(ec.iter().map(|(k, v)| (k.clone(), v.clone())).collect());
        }
    }

    // ------------------------------------------------------------------
    // Usage extraction
    // ------------------------------------------------------------------

    fn extract_usage(data: &Value) -> HashMap<String, u32> {
        let mut result = HashMap::new();

        let usage_obj = match data.get("usage") {
            Some(Value::Object(obj)) => obj,
            _ => return result,
        };

        if let Some(v) = usage_obj.get("prompt_tokens").and_then(|v| v.as_u64()) {
            result.insert("prompt_tokens".to_string(), v as u32);
        }
        if let Some(v) = usage_obj.get("completion_tokens").and_then(|v| v.as_u64()) {
            result.insert("completion_tokens".to_string(), v as u32);
        }
        if let Some(v) = usage_obj.get("total_tokens").and_then(|v| v.as_u64()) {
            result.insert("total_tokens".to_string(), v as u32);
        }

        // Support DeepSeek's prompt_cache_hit_tokens and other nested cached_tokens
        let cached = usage_obj.get("prompt_tokens_details")
            .and_then(|d| d.as_object())
            .and_then(|d| d.get("cached_tokens"))
            .or_else(|| usage_obj.get("cached_tokens"))
            .or_else(|| usage_obj.get("prompt_cache_hit_tokens"))
            .and_then(|v| v.as_u64());

        if let Some(c) = cached {
            result.insert("cached_tokens".to_string(), c as u32);
        }

        result
    }

    // ------------------------------------------------------------------
    // Error handling
    // ------------------------------------------------------------------

    async fn handle_http_error(resp: reqwest::Response, status: u16) -> LLMResponse {
        let body_text = resp.text().await.unwrap_or_default();
        let error_status_code = Some(status);
        let mut error_kind: Option<String> = None;
        let mut error_type: Option<String> = None;
        let mut error_code: Option<String> = None;

        // Try to parse error body
        if let Ok(body_json) = serde_json::from_str::<Value>(&body_text) {
            if let Some(error) = body_json.get("error") {
                if let Some(obj) = error.as_object() {
                    error_type = obj.get("type").and_then(|v| v.as_str()).map(|s| s.to_string());
                    error_code = obj.get("code").and_then(|v| v.as_str()).map(|s| s.to_string());
                } else if let Some(s) = error.as_str() {
                    error_code = Some(s.to_string());
                }
            }
        }

        if status == 429 || status >= 500 {
            error_kind = Some("transient".to_string());
        }

        LLMResponse {
            content: Some(format!("Error: {}", body_text.trim().chars().take(500).collect::<String>())),
            finish_reason: "error".to_string(),
            error_status_code,
            error_kind,
            error_type,
            error_code,
            ..Default::default()
        }
    }

    fn handle_reqwest_error(e: reqwest::Error) -> LLMResponse {
        let error_kind = if e.is_timeout() {
            Some("timeout".to_string())
        } else if e.is_connect() {
            Some("connection".to_string())
        } else {
            None
        };

        LLMResponse {
            content: Some(format!("Error calling LLM: {}", e)),
            finish_reason: "error".to_string(),
            error_kind,
            ..Default::default()
        }
    }
}

// ---------------------------------------------------------------------------
// Helper types
// ---------------------------------------------------------------------------

#[derive(Default)]
struct TcBuffer {
    id: String,
    name: String,
    arguments: String,
    extra_content: Option<HashMap<String, Value>>,
    prov: Option<HashMap<String, Value>>,
    fn_prov: Option<HashMap<String, Value>>,
}

impl Default for LLMResponse {
    fn default() -> Self {
        Self {
            content: None,
            tool_calls: Vec::new(),
            finish_reason: "stop".to_string(),
            usage: HashMap::new(),
            reasoning_content: None,
            error_status_code: None,
            error_kind: None,
            error_type: None,
            error_code: None,
            error_retry_after_s: None,
            error_should_retry: None,
        }
    }
}
