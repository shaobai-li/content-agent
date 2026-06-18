use std::sync::Arc;

use async_trait::async_trait;
use futures_util::StreamExt;
use serde_json::Value;
use tokio::sync::mpsc;

use crate::agent::base::{AgentStream, BaseAgent};
use crate::agent::context::ContextBuilder;
use crate::agent::hook::AgentHook;
use crate::agent::runner::{AgentRunner, AgentRunSpec};
use crate::agent::turn_context::AgentTurnContext;
use crate::core::config::get_agent_workspace_dir;
use crate::provider::base::ToolCallRequest;
use crate::provider::factory;
use crate::provider::openai_compat::{OpenAICompatProvider, ProviderConfig};
use crate::service::context_utils::{append_attachments_to_user_text, get_article_context_messages};
use crate::service::messages::save_message;
use crate::service::stream::{
    build_canvas_card, build_stream_chunk, build_stream_done,
    build_tool_exec_end, build_tool_exec_start,
};
use crate::tools::create_tool_registry;
use crate::utils::tool_hints::format_tool_hint;

const MAX_TOOL_ROUNDS: u32 = 30;

struct StandardStreamingHook {
    tx: mpsc::UnboundedSender<String>,
}

#[async_trait]
impl AgentHook for StandardStreamingHook {
    fn wants_streaming(&self) -> bool {
        true
    }

    fn on_stream(&self, delta: &str) {
        let _ = self.tx.send(build_stream_chunk(delta));
    }

    async fn before_execute_tools(&self, tool_calls: &[ToolCallRequest]) {
        for tc in tool_calls {
            let args_value = serde_json::to_value(&tc.arguments).unwrap_or_default();
            let hint = format_tool_hint(&tc.name, &args_value);
            let _ = self.tx.send(build_tool_exec_start(&tc.name, &tc.id, &hint));
        }
    }

    async fn after_iteration(&self, tool_calls: &[ToolCallRequest], tool_results: &[String]) {
        for (tc, result) in tool_calls.iter().zip(tool_results.iter()) {
            let status = if result.starts_with("Error") { "error" } else { "ok" };
            let error = if status == "error" { Some(result.as_str()) } else { None };
            let _ = self.tx.send(build_tool_exec_end(&tc.id, status, error));
        }
    }
}

pub struct StandardAgent {
    agent_id: String,
}

impl StandardAgent {
    pub fn new(agent_id: &str) -> Self {
        Self {
            agent_id: agent_id.to_string(),
        }
    }
}

#[async_trait]
impl BaseAgent for StandardAgent {
    fn agent_id(&self) -> &str {
        &self.agent_id
    }

    fn get_config_dict(&self) -> Value {
        let ws = get_agent_workspace_dir(&self.agent_id);
        let builder = ContextBuilder::new(&ws.display().to_string(), Some(&self.agent_id));
        serde_json::json!({
            "agent_id": self.agent_id,
            "system_prompt": builder.resolve_base_prompt_alias(),
        })
    }

    async fn handle_chat_stream(&self, ctx: AgentTurnContext) -> AgentStream {
        let workspace = get_agent_workspace_dir(&self.agent_id);
        let builder = ContextBuilder::new(&workspace.display().to_string(), Some(&self.agent_id));

        let history = history_llm_turns(&ctx.history_messages);

        // 将附件缓存路径拼入 user_text，与 Python 端 append_attachments_to_user_text 一致
        let user_text = append_attachments_to_user_text(&ctx.user_text, &ctx.resolved_attachment_paths);
        let mut messages = builder.build_messages(&history, &user_text, &ctx.mentions);

        // 插入 article/url 引用上下文消息（context_utils）
        let article_msgs = get_article_context_messages(&ctx.mentions);
        if !article_msgs.is_empty() {
            messages.extend(article_msgs);
        }

        let provider_name = ctx.provider.as_deref().unwrap_or("deepseek");
        let model = ctx
            .model
            .as_deref()
            .unwrap_or_else(|| factory::default_model_for(provider_name));

        let registry =
            create_tool_registry(&workspace.display().to_string(), &self.agent_id, Some(provider_name), Some(model));

        // 使用 Provider Factory 动态创建（P05）
        let provider = match factory::create_provider(provider_name, None, None, Some(model.to_string())) {
            Ok(p) => Arc::new(p) as Arc<dyn crate::provider::base::LLMProvider>,
            Err(e) => {
                tracing::warn!("创建 provider {provider_name} 失败: {e}，降级到 deepseek");
                let api_key = std::env::var("DEEPSEEK_API_KEY").ok();
                Arc::new(OpenAICompatProvider::new(
                    api_key,
                    None,
                    Some("deepseek-chat".to_string()),
                    None,
                    Some(ProviderConfig::default()),
                )) as Arc<dyn crate::provider::base::LLMProvider>
            }
        };

        let (tx, rx) = mpsc::unbounded_channel::<String>();
        let hook = Arc::new(StandardStreamingHook { tx: tx.clone() });
        let session_id = ctx
            .session_id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

        let initial_msg_len = messages.len();
        let agent_id = self.agent_id.clone();
        let spec = AgentRunSpec {
            initial_messages: messages,
            tools: registry,
            model: model.to_string(),
            max_iterations: MAX_TOOL_ROUNDS,
            max_tool_result_chars: 100_000,
            temperature: None,
            max_tokens: None,
            reasoning_effort: None,
            error_message: None,
            max_iterations_message: None,
            concurrent_tools: false,
            fail_on_tool_error: false,
            context_window_tokens: Some(65536),
            provider_retry_mode: "simple".to_string(),
            hook: Some(hook),
        };

        let runner = AgentRunner::new(provider);

        // 捕获当前用户 ID，在 spawn 的 task 中重新 scope 以维持用户隔离
        let current_user_id = crate::core::auth::get_current_user_id();
        let sid = session_id.clone();
        tokio::spawn(async move {
            let run_fut = async move {
                let result = runner.run(spec).await;

                // 保存 assistant 和 tool 消息（对齐 Python agent.py 行为）
                for msg in result.messages[initial_msg_len..].iter() {
                    let role = msg.get("role").and_then(|v| v.as_str()).unwrap_or("");
                    if role == "assistant" {
                        let content = msg.get("content").and_then(|v| v.as_str()).unwrap_or("");
                        save_message(
                            &agent_id, &sid, "assistant", content,
                            msg.get("tool_calls").cloned(),
                            None,
                            msg.get("reasoning_content").and_then(|v| v.as_str()),
                            None,
                        );
                    } else if role == "tool" {
                        let content = msg.get("content").and_then(|v| v.as_str()).unwrap_or("");
                        save_message(
                            &agent_id, &sid, "tool", content,
                            None,
                            msg.get("tool_call_id").and_then(|v| v.as_str()),
                            None,
                            msg.get("name").and_then(|v| v.as_str()),
                        );
                    }
                }

                // 从完整结果中检测 generate_html 工具完成，推送 Canvas
                for tool_msg in result.messages[initial_msg_len..].iter() {
                    if tool_msg.get("role").and_then(|v| v.as_str()) == Some("tool")
                        && tool_msg.get("name").and_then(|v| v.as_str()) == Some("generate_html")
                    {
                        let html = tool_msg.get("content").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
                        if !html.is_empty() && !html.starts_with("Error") {
                            let _ = tx.send(build_canvas_card(&html, "html", "HTML 生成结果"));
                        }
                        break;
                    }
                }

                let _ = tx.send(build_stream_done(&sid, None));
            };
            if let Some(uid) = current_user_id {
                crate::core::auth::CURRENT_USER_ID.scope(uid, run_fut).await;
            } else {
                run_fut.await;
            }
        });

        Box::pin(tokio_stream::wrappers::UnboundedReceiverStream::new(rx).map(Ok))
    }
}

const LLM_KEEP_KEYS: &[&str] = &["tool_calls", "tool_call_id", "name", "reasoning_content"];

/// 从持久化历史中提取 LLM 所需的完整多轮对话。
///
/// 只保留 LLM 需要的字段，丢弃 ``message_id`` / ``created_at`` 等元数据。
/// 保留的字段与 nanobot ``get_history()`` 对齐：
/// ``role``, ``content``, ``tool_calls``, ``tool_call_id``, ``name``, ``reasoning_content``。
/// 只保留 ``user``, ``assistant``, ``tool`` 角色。
/// 同时在返回前丢弃开头的孤立 tool result（与 nanobot ``get_history()`` 行为对齐）。
pub fn history_llm_turns(history_messages: &[Value]) -> Vec<Value> {
    let mut out: Vec<Value> = Vec::new();
    for hm in history_messages {
        let role = hm.get("role").and_then(|v| v.as_str()).unwrap_or("");
        if role != "user" && role != "assistant" && role != "tool" {
            continue;
        }
        let content: Value = match role {
            "tool" => Value::String(hm.get("content").and_then(|c| c.as_str()).unwrap_or("").to_string()),
            _ => hm.get("content").cloned().unwrap_or(Value::Null),
        };
        let mut msg = serde_json::json!({
            "role": role,
            "content": content,
        });
        for key in LLM_KEEP_KEYS {
            if let Some(val) = hm.get(key) {
                msg[key] = val.clone();
            }
        }
        out.push(msg);
    }

    // 丢弃开头孤立的 tool result（前面没有对应的 assistant tool_calls 声明）
    let start = find_legal_message_start(&out);
    if start > 0 {
        out = out[start..].to_vec();
    }

    out
}

/// Find the first index whose tool results have matching assistant calls.
fn find_legal_message_start(messages: &[Value]) -> usize {
    use std::collections::HashSet;
    let mut declared: HashSet<String> = HashSet::new();
    let mut start = 0usize;

    for (i, msg) in messages.iter().enumerate() {
        let role = msg.get("role").and_then(|v| v.as_str()).unwrap_or("");
        if role == "assistant" {
            if let Some(tcs) = msg.get("tool_calls").and_then(|v| v.as_array()) {
                for tc in tcs {
                    if let Some(id) = tc.get("id").and_then(|v| v.as_str()) {
                        declared.insert(id.to_string());
                    }
                }
            }
        } else if role == "tool" {
            let tid = msg.get("tool_call_id").and_then(|v| v.as_str());
            if let Some(tid) = tid {
                if !declared.contains(tid) {
                    start = i + 1;
                    declared.clear();
                    for prev in &messages[start..=i] {
                        if prev.get("role").and_then(|v| v.as_str()) == Some("assistant") {
                            if let Some(tcs) = prev.get("tool_calls").and_then(|v| v.as_array()) {
                                for tc in tcs {
                                    if let Some(id) = tc.get("id").and_then(|v| v.as_str()) {
                                        declared.insert(id.to_string());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    start
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn test_empty_input_returns_empty() {
        let empty: Vec<Value> = vec![];
        let result = history_llm_turns(&empty);
        assert!(result.is_empty());
    }

    #[test]
    fn test_user_message_preserved() {
        let result = history_llm_turns(&[json!({"role": "user", "content": "hello"})]);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].get("content").and_then(|v| v.as_str()), Some("hello"));
    }

    #[test]
    fn test_assistant_message_preserved() {
        let result = history_llm_turns(&[json!({"role": "assistant", "content": "reply"})]);
        assert_eq!(result[0].get("content").and_then(|v| v.as_str()), Some("reply"));
    }

    #[test]
    fn test_assistant_tool_calls_included() {
        let tc = json!([{"id": "tc1", "function": {"name": "foo"}}]);
        let result = history_llm_turns(&[json!({"role": "assistant", "content": "", "tool_calls": tc})]);
        assert!(result[0].get("tool_calls").is_some());
    }

    #[test]
    fn test_orphan_tool_message_is_dropped() {
        // 没有 assistant 声明过的 tool 消息应被丢弃
        let result = history_llm_turns(&[json!({"role": "tool", "content": "result", "tool_call_id": "tc1"})]);
        assert!(result.is_empty(), "孤立的 tool 消息应被丢弃");
    }

    #[test]
    fn test_tool_message_preserved_with_preceding_assistant() {
        // 有 assistant 声明过的 tool 消息应保留
        let result = history_llm_turns(&[
            json!({"role": "assistant", "content": "", "tool_calls": [{"id": "tc1", "function": {"name": "foo"}}]}),
            json!({"role": "tool", "content": "result", "tool_call_id": "tc1"}),
        ]);
        assert_eq!(result.len(), 2);
        assert_eq!(result[1].get("tool_call_id").and_then(|v| v.as_str()), Some("tc1"));
    }

    #[test]
    fn test_tool_message_empty_content_defaults_to_empty_string_with_preceding_assistant() {
        let result = history_llm_turns(&[
            json!({"role": "assistant", "content": "", "tool_calls": [{"id": "tc1", "function": {"name": "foo"}}]}),
            json!({"role": "tool", "content": null, "tool_call_id": "tc1"}),
        ]);
        assert_eq!(result[1].get("content").and_then(|v| v.as_str()), Some(""));
    }

    #[test]
    fn test_unknown_role_is_dropped() {
        let result = history_llm_turns(&[json!({"role": "system", "content": "ignored"})]);
        assert!(result.is_empty());
    }

    #[test]
    fn test_extra_fields_stripped_from_user_message() {
        let result = history_llm_turns(&[json!({"role": "user", "content": "hi", "message_id": "x", "created_at": "t"})]);
        assert!(result[0].get("message_id").is_none());
        assert!(result[0].get("created_at").is_none());
    }

    #[test]
    fn test_order_preserved() {
        let history = vec![
            json!({"role": "user", "content": "q1"}),
            json!({"role": "assistant", "content": "a1"}),
            json!({"role": "user", "content": "q2"}),
        ];
        let result = history_llm_turns(&history);
        let contents: Vec<&str> = result.iter().filter_map(|m| m.get("content").and_then(|v| v.as_str())).collect();
        assert_eq!(contents, vec!["q1", "a1", "q2"]);
    }

    #[test]
    fn test_tool_calls_not_included_when_absent() {
        let result = history_llm_turns(&[json!({"role": "assistant", "content": "plain"})]);
        assert!(result[0].get("tool_calls").is_none());
    }

    #[test]
    fn test_tool_call_id_not_included_when_absent() {
        let result = history_llm_turns(&[json!({"role": "tool", "content": "ok"})]);
        assert!(result[0].get("tool_call_id").is_none());
    }
}
