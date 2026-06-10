use std::collections::HashSet;
use std::sync::Arc;

use serde_json::Value;

use crate::agent::hook::AgentHook;
use crate::provider::base::{LLMProvider, LLMResponse, ToolCallRequest};
use crate::tools::ToolRegistry;

const DEFAULT_ERROR_MESSAGE: &str = "Sorry, I encountered an error calling the AI model.";
const PERSISTED_MODEL_ERROR_PLACEHOLDER: &str = "[Assistant reply unavailable due to model error.]";
const MAX_EMPTY_RETRIES: u32 = 2;
const MAX_LENGTH_RECOVERIES: u32 = 3;
const MAX_INJECTIONS_PER_TURN: usize = 3;
const MAX_INJECTION_CYCLES: u32 = 5;
const SNIP_SAFETY_BUFFER: u32 = 1024;
const MICROCOMPACT_KEEP_RECENT: usize = 10;
const MICROCOMPACT_MIN_CHARS: usize = 500;
const BACKFILL_CONTENT: &str = "[Tool result unavailable — call was interrupted or lost]";
const HINT: &str = "\n\n[Analyze the error above and try a different approach.]";

/// Configuration for a single agent execution.
pub struct AgentRunSpec {
    pub initial_messages: Vec<Value>,
    pub tools: ToolRegistry,
    pub model: String,
    pub max_iterations: u32,
    pub max_tool_result_chars: usize,
    pub temperature: Option<f64>,
    pub max_tokens: Option<u32>,
    pub reasoning_effort: Option<String>,
    pub error_message: Option<String>,
    pub max_iterations_message: Option<String>,
    pub concurrent_tools: bool,
    pub fail_on_tool_error: bool,
    pub context_window_tokens: Option<u32>,
    pub provider_retry_mode: String,
    pub hook: Option<Arc<dyn AgentHook>>,
}

/// Outcome of a shared agent execution.
pub struct AgentRunResult {
    pub final_content: Option<String>,
    pub messages: Vec<Value>,
    pub tools_used: Vec<String>,
    pub usage: std::collections::HashMap<String, u32>,
    pub stop_reason: String,
    pub error: Option<String>,
    pub tool_events: Vec<Value>,
    pub had_injections: bool,
}

/// Run a tool-capable LLM loop without product-layer concerns.
pub struct AgentRunner {
    pub provider: Arc<dyn LLMProvider>,
}

impl AgentRunner {
    pub fn new(provider: Arc<dyn LLMProvider>) -> Self {
        Self { provider }
    }

    pub async fn run(&self, spec: AgentRunSpec) -> AgentRunResult {
        let mut messages = spec.initial_messages.clone();
        let mut final_content: Option<String> = None;
        let mut tools_used: Vec<String> = Vec::new();
        let mut usage: std::collections::HashMap<String, u32> = std::collections::HashMap::new();
        let mut error: Option<String> = None;
        let mut stop_reason = "completed".to_string();
        let mut tool_events: Vec<Value> = Vec::new();
        let mut empty_content_retries = 0u32;
        let mut length_recovery_count = 0u32;
        let mut had_injections = false;
        let mut injection_cycles = 0u32;

        for _iteration in 0..spec.max_iterations {
            let messages_for_model = Self::apply_context_governance(&messages, &spec);
            let response = self.request_model(&spec, &messages_for_model).await;
            let raw_usage = Self::usage_dict(Some(&response.usage));
            Self::accumulate_usage(&mut usage, &raw_usage);

            if response.should_execute_tools() {
                let assistant_msg = build_assistant_message(
                    response.content.as_deref().unwrap_or(""),
                    &response.tool_calls,
                    response.reasoning_content.as_deref(),
                );
                messages.push(assistant_msg);
                for tc in &response.tool_calls {
                    tools_used.push(tc.name.clone());
                }

                if let Some(hook) = &spec.hook {
                    hook.before_execute_tools(&response.tool_calls).await;
                }

                let (results, events, fatal_error) = self.execute_tools(
                    &spec, &response.tool_calls,
                ).await;
                tool_events.extend(events);

                if let Some(hook) = &spec.hook {
                    hook.after_iteration(&response.tool_calls, &results).await;
                }

                for (tc, result) in response.tool_calls.iter().zip(results.iter()) {
                    let tool_msg = serde_json::json!({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "name": tc.name,
                        "content": self.normalize_tool_result(&spec, &tc.id, &tc.name, result),
                    });
                    messages.push(tool_msg);
                }

                if let Some(fe) = fatal_error {
                    error = Some(format!("Error: {fe}"));
                    final_content.clone_from(&error);
                    stop_reason = "tool_error".to_string();
                    Self::append_final_message(&mut messages, &final_content);
                    break;
                }

                empty_content_retries = 0;
                length_recovery_count = 0;

                let (drained, _new_cycles) = Self::try_drain_injections(
                    &mut messages, None, injection_cycles,
                ).await;
                if drained { had_injections = true; }
                injection_cycles = _new_cycles;

                continue;
            }

            let clean = response.content.clone().unwrap_or_default();
            if response.finish_reason != "error" && clean.trim().is_empty() {
                empty_content_retries += 1;
                if empty_content_retries < MAX_EMPTY_RETRIES {
                    continue;
                }
            }

            if response.finish_reason == "length" && !clean.trim().is_empty() {
                length_recovery_count += 1;
                if length_recovery_count <= MAX_LENGTH_RECOVERIES {
                    let msg = build_assistant_message(&clean, &[], response.reasoning_content.as_deref());
                    messages.push(msg);
                    messages.push(serde_json::json!({
                        "role": "user",
                        "content": "请继续你的输出（this is a length recovery message）"
                    }));
                    continue;
                }
            }

            let assistant_msg = if response.finish_reason != "error" && !clean.trim().is_empty() {
                Some(build_assistant_message(&clean, &[], response.reasoning_content.as_deref()))
            } else {
                None
            };

            let (drained, _new_cycles) = Self::try_drain_injections(
                &mut messages, assistant_msg.as_ref(), injection_cycles,
            ).await;
            if drained { had_injections = true; }
            injection_cycles = _new_cycles;

            if response.finish_reason == "error" {
                let content = if clean.is_empty() { DEFAULT_ERROR_MESSAGE.to_string() } else { clean.clone() };
                final_content = Some(content);
                stop_reason = "error".to_string();
                error.clone_from(&final_content);
                Self::append_model_error_placeholder(&mut messages);
                break;
            }

            if clean.trim().is_empty() {
                final_content = Some("I couldn't generate a response. Please try again.".to_string());
                stop_reason = "empty_final_response".to_string();
                error.clone_from(&final_content);
                Self::append_final_message(&mut messages, &final_content);
                break;
            }

            if let Some(msg) = assistant_msg {
                messages.push(msg);
            }
            final_content = Some(clean);
            stop_reason = "completed".to_string();
            break;
        }

        AgentRunResult {
            final_content,
            messages,
            tools_used,
            usage,
            stop_reason,
            error,
            tool_events,
            had_injections,
        }
    }

    fn apply_context_governance(messages: &[Value], _spec: &AgentRunSpec) -> Vec<Value> {
        let mut result = Self::drop_orphan_tool_results(messages);
        result = Self::backfill_missing_tool_results(&result);
        result = Self::microcompact(&result);
        result = Self::drop_orphan_tool_results(&result);
        result = Self::backfill_missing_tool_results(&result);
        result
    }

    async fn request_model(&self, spec: &AgentRunSpec, messages: &[Value]) -> LLMResponse {
        let tools_defs = Some(spec.tools.get_definitions());
        let model = Some(spec.model.as_str());
        let reasoning_effort = spec.reasoning_effort.as_deref();

        if let Some(hook) = &spec.hook {
            if hook.wants_streaming() {
                let hook = hook.clone();
                // on_stream 是同步调用（内部仅做 mpsc::send），
                // 直接调用即可保证 SSE chunk 按原始顺序送达。
                let on_delta: Option<Box<dyn Fn(String) + Send>> = Some(Box::new(move |delta| {
                    hook.on_stream(&delta);
                }));
                return self
                    .provider
                    .chat_stream(
                        messages.to_vec(),
                        tools_defs,
                        model,
                        spec.max_tokens,
                        spec.temperature,
                        reasoning_effort,
                        None,
                        on_delta,
                    )
                    .await;
            }
        }

        self.provider
            .chat(
                messages.to_vec(),
                tools_defs,
                model,
                spec.max_tokens,
                spec.temperature,
                reasoning_effort,
                None,
            )
            .await
    }

    async fn execute_tools(
        &self,
        spec: &AgentRunSpec,
        tool_calls: &[ToolCallRequest],
    ) -> (Vec<String>, Vec<Value>, Option<String>) {
        let batches = Self::partition_tool_batches(spec, tool_calls);
        let mut results: Vec<String> = Vec::new();
        let mut events: Vec<Value> = Vec::new();
        let mut fatal_error: Option<String> = None;

        for batch in batches {
            for tc in batch {
                let (result, event, error) = self.run_tool(spec, tc).await;
                results.push(result);
                events.push(event);
                if error.is_some() && fatal_error.is_none() {
                    fatal_error = error;
                    if spec.fail_on_tool_error {
                        return (results, events, fatal_error);
                    }
                }
            }
        }

        (results, events, fatal_error)
    }

    async fn run_tool(
        &self,
        spec: &AgentRunSpec,
        tool_call: &ToolCallRequest,
    ) -> (String, Value, Option<String>) {
        let args = serde_json::to_value(&tool_call.arguments).unwrap_or_default();
        let result = spec.tools.execute(&tool_call.name, args).await;

        let event_status = if result.starts_with("Error") { "error" } else { "ok" };
        let detail = result.replace('\n', " ")
            .trim()
            .chars()
            .take(120)
            .collect::<String>();
        let event = serde_json::json!({
            "name": tool_call.name,
            "status": event_status,
            "detail": detail,
        });

        if result.starts_with("Error") {
            let err_copy = result.clone();
            let with_hint = result + HINT;
            if spec.fail_on_tool_error {
                (with_hint, event, Some(err_copy))
            } else {
                (with_hint, event, None)
            }
        } else {
            (result, event, None)
        }
    }

    fn normalize_tool_result(&self, spec: &AgentRunSpec, _tool_call_id: &str, _tool_name: &str, result: &str) -> String {
        if result.len() > spec.max_tool_result_chars {
            let half = spec.max_tool_result_chars / 2;
            format!(
                "{}\n... ({} chars truncated) ...\n{}",
                &result[..half],
                result.len() - spec.max_tool_result_chars,
                &result[result.len() - half..],
            )
        } else {
            result.to_string()
        }
    }

    fn drop_orphan_tool_results(messages: &[Value]) -> Vec<Value> {
        let mut declared: HashSet<String> = HashSet::new();
        let mut updated: Option<Vec<Value>> = None;

        for (idx, msg) in messages.iter().enumerate() {
            let role = msg.get("role").and_then(|v| v.as_str()).unwrap_or("");
            if role == "assistant" {
                if let Some(tcs) = msg.get("tool_calls").and_then(|v| v.as_array()) {
                    for tc in tcs {
                        if let Some(id) = tc.get("id").and_then(|v| v.as_str()) {
                            declared.insert(id.to_string());
                        }
                    }
                }
            }
            if role == "tool" {
                if let Some(tid) = msg.get("tool_call_id").and_then(|v| v.as_str()) {
                    if !declared.contains(tid) {
                        if updated.is_none() {
                            updated = Some(messages[..idx].to_vec());
                        }
                        continue;
                    }
                }
            }
            if let Some(ref mut u) = updated {
                u.push(msg.clone());
            }
        }

        updated.unwrap_or_else(|| messages.to_vec())
    }

    fn backfill_missing_tool_results(messages: &[Value]) -> Vec<Value> {
        struct Declared {
            idx: usize,
            id: String,
            name: String,
        }
        let mut declared: Vec<Declared> = Vec::new();
        let mut fulfilled: HashSet<String> = HashSet::new();

        for (idx, msg) in messages.iter().enumerate() {
            let role = msg.get("role").and_then(|v| v.as_str()).unwrap_or("");
            if role == "assistant" {
                if let Some(tcs) = msg.get("tool_calls").and_then(|v| v.as_array()) {
                    for tc in tcs {
                        let id = tc.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                        let name = tc.get("function")
                            .and_then(|f| f.get("name"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        if !id.is_empty() {
                            declared.push(Declared { idx, id, name });
                        }
                    }
                }
            } else if role == "tool" {
                if let Some(tid) = msg.get("tool_call_id").and_then(|v| v.as_str()) {
                    fulfilled.insert(tid.to_string());
                }
            }
        }

        let missing: Vec<&Declared> = declared.iter().filter(|d| !fulfilled.contains(&d.id)).collect();
        if missing.is_empty() {
            return messages.to_vec();
        }

        let mut updated = messages.to_vec();
        let mut offset = 0;
        for decl in &missing {
            let insert_at = decl.idx + 1 + offset;
            updated.insert(insert_at, serde_json::json!({
                "role": "tool",
                "tool_call_id": decl.id,
                "name": decl.name,
                "content": BACKFILL_CONTENT,
            }));
            offset += 1;
        }
        updated
    }

    fn microcompact(messages: &[Value]) -> Vec<Value> {
        let compactable_tools: std::collections::HashSet<&str> = [
            "read_file", "exec", "grep", "glob",
            "web_search", "web_fetch", "list_dir",
        ].into();

        let compactable_indices: Vec<usize> = messages.iter().enumerate()
            .filter(|(_, msg)| {
                msg.get("role").and_then(|v| v.as_str()) == Some("tool")
                    && msg.get("name").and_then(|v| v.as_str())
                        .map_or(false, |n| compactable_tools.contains(n))
            })
            .map(|(i, _)| i)
            .collect();

        if compactable_indices.len() <= MICROCOMPACT_KEEP_RECENT {
            return messages.to_vec();
        }

        let stale = &compactable_indices[..compactable_indices.len() - MICROCOMPACT_KEEP_RECENT];
        let mut updated: Option<Vec<Value>> = None;

        for &idx in stale {
            let msg = &messages[idx];
            let content = msg.get("content").and_then(|v| v.as_str()).unwrap_or("");
            if content.len() < MICROCOMPACT_MIN_CHARS {
                continue;
            }
            let name = msg.get("name").and_then(|v| v.as_str()).unwrap_or("tool");
            let summary = format!("[{name} result omitted from context]");
            if updated.is_none() {
                updated = Some(messages.to_vec());
            }
            if let Some(ref mut u) = updated {
                u[idx]["content"] = Value::String(summary);
            }
        }

        updated.unwrap_or_else(|| messages.to_vec())
    }

    fn partition_tool_batches<'a>(spec: &'a AgentRunSpec, tool_calls: &'a [ToolCallRequest]) -> Vec<Vec<&'a ToolCallRequest>> {
        if !spec.concurrent_tools {
            return tool_calls.iter().map(|tc| vec![tc]).collect();
        }

        let mut batches: Vec<Vec<&ToolCallRequest>> = Vec::new();
        let mut current: Vec<&ToolCallRequest> = Vec::new();

        for tc in tool_calls {
            let can_batch = spec.tools.get(&tc.name)
                .map(|t| t.concurrency_safe())
                .unwrap_or(false);
            if can_batch {
                current.push(tc);
            } else {
                if !current.is_empty() {
                    batches.push(std::mem::take(&mut current));
                }
                batches.push(vec![tc]);
            }
        }
        if !current.is_empty() {
            batches.push(current);
        }
        batches
    }

    fn append_final_message(messages: &mut Vec<Value>, content: &Option<String>) {
        let content = match content {
            Some(c) if !c.is_empty() => c.clone(),
            _ => return,
        };
        if let Some(last) = messages.last() {
            if last.get("role") == Some(&Value::String("assistant".to_string()))
                && last.get("tool_calls").is_none()
            {
                if last.get("content") == Some(&Value::String(content.clone())) {
                    return;
                }
                let last_idx = messages.len() - 1;
                messages[last_idx] = serde_json::json!({
                    "role": "assistant",
                    "content": content,
                });
                return;
            }
        }
        messages.push(serde_json::json!({
            "role": "assistant",
            "content": content,
        }));
    }

    fn append_model_error_placeholder(messages: &mut Vec<Value>) {
        if let Some(last) = messages.last() {
            if last.get("role") == Some(&Value::String("assistant".to_string()))
                && last.get("tool_calls").is_none()
            {
                return;
            }
        }
        messages.push(serde_json::json!({
            "role": "assistant",
            "content": PERSISTED_MODEL_ERROR_PLACEHOLDER,
        }));
    }

    fn usage_dict(usage: Option<&std::collections::HashMap<String, u32>>) -> std::collections::HashMap<String, u32> {
        usage.cloned().unwrap_or_default()
    }

    fn accumulate_usage(target: &mut std::collections::HashMap<String, u32>, addition: &std::collections::HashMap<String, u32>) {
        for (key, value) in addition {
            *target.entry(key.clone()).or_insert(0) += *value;
        }
    }

    async fn try_drain_injections(
        _messages: &mut Vec<Value>,
        _assistant_message: Option<&Value>,
        _injection_cycles: u32,
    ) -> (bool, u32) {
        // Injection support deferred — requires external callback mechanism
        (false, _injection_cycles)
    }
}

fn build_assistant_message(content: &str, tool_calls: &[ToolCallRequest], reasoning_content: Option<&str>) -> Value {
    let tc_array: Vec<Value> = tool_calls.iter().map(|tc| tc.to_openai_tool_call()).collect();

    let mut msg = serde_json::json!({
        "role": "assistant",
        "content": content,
    });

    if !tc_array.is_empty() {
        msg["tool_calls"] = Value::Array(tc_array);
    }
    if let Some(rc) = reasoning_content {
        msg["reasoning_content"] = Value::String(rc.to_string());
    }

    msg
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    // ── usage_dict ──────────────────────────────────────────────────────

    #[test]
    fn test_usage_dict_with_values() {
        let mut usage = std::collections::HashMap::new();
        usage.insert("prompt_tokens".to_string(), 10);
        usage.insert("completion_tokens".to_string(), 5);
        let result = AgentRunner::usage_dict(Some(&usage));
        assert_eq!(result.get("prompt_tokens"), Some(&10));
        assert_eq!(result.get("completion_tokens"), Some(&5));
    }

    #[test]
    fn test_usage_dict_none_returns_empty() {
        let result = AgentRunner::usage_dict(None);
        assert!(result.is_empty());
    }

    // ── accumulate_usage ────────────────────────────────────────────────

    #[test]
    fn test_accumulate_usage_adds_values() {
        let mut target = std::collections::HashMap::new();
        target.insert("prompt_tokens".to_string(), 10);
        let mut addition = std::collections::HashMap::new();
        addition.insert("prompt_tokens".to_string(), 5);
        addition.insert("completion_tokens".to_string(), 3);
        AgentRunner::accumulate_usage(&mut target, &addition);
        assert_eq!(target.get("prompt_tokens"), Some(&15));
        assert_eq!(target.get("completion_tokens"), Some(&3));
    }

    // ── drop_orphan_tool_results ────────────────────────────────────────

    #[test]
    fn test_keeps_valid_tool_result() {
        let messages = vec![
            json!({"role": "assistant", "content": "", "tool_calls": [{"id": "tc1", "function": {"name": "foo"}}]}),
            json!({"role": "tool", "tool_call_id": "tc1", "content": "ok"}),
        ];
        let result = AgentRunner::drop_orphan_tool_results(&messages);
        assert_eq!(result.len(), 2);
    }

    #[test]
    fn test_drops_orphan_tool_result() {
        let messages = vec![
            json!({"role": "user", "content": "hi"}),
            json!({"role": "tool", "tool_call_id": "ghost", "content": "orphan"}),
        ];
        let result = AgentRunner::drop_orphan_tool_results(&messages);
        assert!(!result.iter().any(|m| m.get("role") == Some(&Value::String("tool".to_string()))));
    }

    #[test]
    fn test_returns_same_list_when_no_orphans() {
        let messages = vec![json!({"role": "user", "content": "hi"})];
        let result = AgentRunner::drop_orphan_tool_results(&messages);
        assert_eq!(result.len(), 1);
    }

    // ── backfill_missing_tool_results ───────────────────────────────────

    #[test]
    fn test_inserts_synthetic_result_for_missing_tool_call() {
        let messages = vec![
            json!({"role": "assistant", "content": "", "tool_calls": [
                {"id": "tc1", "function": {"name": "my_tool"}}
            ]}),
        ];
        let result = AgentRunner::backfill_missing_tool_results(&messages);
        let tool_msgs: Vec<&Value> = result.iter().filter(|m| m.get("role") == Some(&Value::String("tool".to_string()))).collect();
        assert_eq!(tool_msgs.len(), 1);
        assert_eq!(tool_msgs[0].get("tool_call_id").and_then(|v| v.as_str()), Some("tc1"));
        assert_eq!(tool_msgs[0].get("content").and_then(|v| v.as_str()), Some(BACKFILL_CONTENT));
    }

    #[test]
    fn test_no_change_when_all_tool_calls_fulfilled() {
        let messages = vec![
            json!({"role": "assistant", "content": "", "tool_calls": [{"id": "tc1", "function": {"name": "foo"}}]}),
            json!({"role": "tool", "tool_call_id": "tc1", "content": "done"}),
        ];
        let result = AgentRunner::backfill_missing_tool_results(&messages);
        assert_eq!(result.len(), 2);
    }

    // ── partition_tool_batches ──────────────────────────────────────────

    #[test]
    fn test_sequential_when_not_concurrent() {
        let tc1 = ToolCallRequest { id: "1".to_string(), name: "read_file".to_string(), arguments: std::collections::HashMap::new(), extra_content: None, provider_specific_fields: None, function_provider_specific_fields: None };
        let tc2 = ToolCallRequest { id: "2".to_string(), name: "read_file".to_string(), arguments: std::collections::HashMap::new(), extra_content: None, provider_specific_fields: None, function_provider_specific_fields: None };
        let spec = AgentRunSpec {
            initial_messages: vec![], tools: ToolRegistry::new(), model: "test".to_string(),
            max_iterations: 1, max_tool_result_chars: 1000, temperature: None, max_tokens: None,
            reasoning_effort: None, error_message: None, max_iterations_message: None,
            concurrent_tools: false, fail_on_tool_error: false, context_window_tokens: None,
            provider_retry_mode: "simple".to_string(), hook: None,
        };
        let tcs = [tc1, tc2];
        let batches = AgentRunner::partition_tool_batches(&spec, &tcs);
        assert_eq!(batches.len(), 2);
    }

    // ── build_assistant_message ─────────────────────────────────────────

    #[test]
    fn test_build_assistant_message_plain() {
        let msg = build_assistant_message("hello", &[], None);
        assert_eq!(msg.get("role").and_then(|v| v.as_str()), Some("assistant"));
        assert_eq!(msg.get("content").and_then(|v| v.as_str()), Some("hello"));
        assert!(msg.get("tool_calls").is_none());
    }

    #[test]
    fn test_build_assistant_message_with_tool_calls() {
        let tc = ToolCallRequest { id: "tc1".to_string(), name: "foo".to_string(), arguments: std::collections::HashMap::new(), extra_content: None, provider_specific_fields: None, function_provider_specific_fields: None };
        let msg = build_assistant_message("", &[tc], None);
        assert!(msg.get("tool_calls").is_some());
    }

    #[test]
    fn test_build_assistant_message_with_reasoning() {
        let msg = build_assistant_message("hello", &[], Some("thinking..."));
        assert_eq!(msg.get("reasoning_content").and_then(|v| v.as_str()), Some("thinking..."));
    }

    // ── normalize_tool_result ───────────────────────────────────────────

    #[test]
    fn test_normalize_tool_result_no_truncation() {
        let runner = AgentRunner { provider: Arc::new(MockProvider) };
        let spec = AgentRunSpec {
            initial_messages: vec![], tools: ToolRegistry::new(), model: "test".to_string(),
            max_iterations: 1, max_tool_result_chars: 1000, temperature: None, max_tokens: None,
            reasoning_effort: None, error_message: None, max_iterations_message: None,
            concurrent_tools: false, fail_on_tool_error: false, context_window_tokens: None,
            provider_retry_mode: "simple".to_string(), hook: None,
        };
        let result = runner.normalize_tool_result(&spec, "tc1", "foo", "short");
        assert_eq!(result, "short");
    }

    #[test]
    fn test_normalize_tool_result_truncation() {
        let runner = AgentRunner { provider: Arc::new(MockProvider) };
        let spec = AgentRunSpec {
            initial_messages: vec![], tools: ToolRegistry::new(), model: "test".to_string(),
            max_iterations: 1, max_tool_result_chars: 10, temperature: None, max_tokens: None,
            reasoning_effort: None, error_message: None, max_iterations_message: None,
            concurrent_tools: false, fail_on_tool_error: false, context_window_tokens: None,
            provider_retry_mode: "simple".to_string(), hook: None,
        };
        let long = "abcdefghijklmnopqrstuvwxyz";
        let result = runner.normalize_tool_result(&spec, "tc1", "foo", long);
        assert!(result.contains("truncated"));
        assert!(result.contains("ab"));
        assert!(result.contains("yz"));
    }

    // ── append_final_message ────────────────────────────────────────────

    #[test]
    fn test_append_final_message_push_when_last_not_assistant() {
        let mut messages = vec![json!({"role": "user", "content": "hi"})];
        AgentRunner::append_final_message(&mut messages, &Some("bye".to_string()));
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[1].get("role").and_then(|v| v.as_str()), Some("assistant"));
    }

    #[test]
    fn test_append_final_message_skips_when_content_matches_last() {
        let mut messages = vec![json!({"role": "assistant", "content": "bye"})];
        AgentRunner::append_final_message(&mut messages, &Some("bye".to_string()));
        assert_eq!(messages.len(), 1);
    }

    // ── append_model_error_placeholder ──────────────────────────────────

    #[test]
    fn test_append_placeholder_when_last_is_assistant() {
        let mut messages = vec![json!({"role": "assistant", "content": "hi"})];
        AgentRunner::append_model_error_placeholder(&mut messages);
        assert_eq!(messages.len(), 1); // already assistant, no change
    }

    #[test]
    fn test_append_placeholder_when_last_is_user() {
        let mut messages = vec![json!({"role": "user", "content": "hi"})];
        AgentRunner::append_model_error_placeholder(&mut messages);
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[1].get("content").and_then(|v| v.as_str()), Some(PERSISTED_MODEL_ERROR_PLACEHOLDER));
    }

    // Mock provider for tests that need one
    struct MockProvider;
    #[async_trait::async_trait]
    impl LLMProvider for MockProvider {
        async fn chat(&self, _messages: Vec<Value>, _tools: Option<Vec<Value>>, _model: Option<&str>, _max_tokens: Option<u32>, _temperature: Option<f64>, _reasoning_effort: Option<&str>, _tool_choice: Option<Value>) -> LLMResponse {
            LLMResponse { content: Some("mock".to_string()), tool_calls: vec![], finish_reason: "stop".to_string(), usage: std::collections::HashMap::new(), reasoning_content: None, error_status_code: None, error_kind: None, error_type: None, error_code: None, error_retry_after_s: None, error_should_retry: None }
        }
        async fn chat_stream(&self, _messages: Vec<Value>, _tools: Option<Vec<Value>>, _model: Option<&str>, _max_tokens: Option<u32>, _temperature: Option<f64>, _reasoning_effort: Option<&str>, _tool_choice: Option<Value>, _on_content_delta: Option<Box<dyn Fn(String) + Send>>) -> LLMResponse {
            LLMResponse { content: Some("mock".to_string()), tool_calls: vec![], finish_reason: "stop".to_string(), usage: std::collections::HashMap::new(), reasoning_content: None, error_status_code: None, error_kind: None, error_type: None, error_code: None, error_retry_after_s: None, error_should_retry: None }
        }
        fn get_default_model(&self) -> &str { "mock" }
    }
}
