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
use crate::provider::openai_compat::{OpenAICompatProvider, ProviderConfig};
use crate::service::stream::{
    build_stream_chunk, build_stream_done, build_tool_exec_chunk, build_tool_exec_end,
    build_tool_exec_start,
};
use crate::tools::create_tool_registry;

const MAX_TOOL_ROUNDS: u32 = 30;

struct StandardStreamingHook {
    tx: mpsc::UnboundedSender<String>,
}

#[async_trait]
impl AgentHook for StandardStreamingHook {
    fn wants_streaming(&self) -> bool {
        true
    }

    async fn on_stream(&self, delta: &str) {
        let _ = self.tx.send(build_stream_chunk(delta));
    }

    async fn before_execute_tools(&self, tool_calls: &[ToolCallRequest]) {
        for tc in tool_calls {
            let args = serde_json::to_value(&tc.arguments).unwrap_or_default();
            let _ = self.tx.send(build_tool_exec_start(&tc.name, &tc.id, args));
        }
    }

    async fn after_iteration(&self, tool_calls: &[ToolCallRequest], tool_results: &[String]) {
        for (tc, result) in tool_calls.iter().zip(tool_results.iter()) {
            for i in (0..result.len()).step_by(800) {
                let chunk = &result[i..result.len().min(i + 800)];
                let _ = self.tx.send(build_tool_exec_chunk(&tc.id, chunk));
            }
            let _ = self.tx.send(build_tool_exec_end(&tc.id));
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
        let messages = builder.build_messages(&history, &ctx.user_text, &ctx.mentions);
        let registry = create_tool_registry(&workspace.display().to_string(), &self.agent_id);

        let api_key = std::env::var("DEEPSEEK_API_KEY").ok();
        let provider = Arc::new(OpenAICompatProvider::new(
            api_key,
            None,
            Some("deepseek-reasoner".to_string()),
            None,
            Some(ProviderConfig::default()),
        ));

        let (tx, rx) = mpsc::unbounded_channel::<String>();
        let hook = Arc::new(StandardStreamingHook { tx: tx.clone() });
        let session_id = ctx
            .session_id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().simple().to_string());

        let spec = AgentRunSpec {
            initial_messages: messages,
            tools: registry,
            model: "deepseek-reasoner".to_string(),
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

        let sid = session_id.clone();
        tokio::spawn(async move {
            runner.run(spec).await;
            let _ = tx.send(build_stream_done(&sid, None));
        });

        Box::pin(tokio_stream::wrappers::UnboundedReceiverStream::new(rx).map(Ok))
    }
}

fn history_llm_turns(history_messages: &[Value]) -> Vec<Value> {
    let mut out: Vec<Value> = Vec::new();
    for hm in history_messages {
        let role = hm.get("role").and_then(|v| v.as_str()).unwrap_or("");
        match role {
            "user" | "assistant" => {
                let mut msg = serde_json::json!({
                    "role": role,
                    "content": hm.get("content"),
                });
                if let Some(tcs) = hm.get("tool_calls") {
                    msg["tool_calls"] = tcs.clone();
                }
                out.push(msg);
            }
            "tool" => {
                let mut msg = serde_json::json!({
                    "role": "tool",
                    "content": hm.get("content").and_then(|c| c.as_str()).unwrap_or(""),
                });
                if let Some(tid) = hm.get("tool_call_id") {
                    msg["tool_call_id"] = tid.clone();
                }
                out.push(msg);
            }
            _ => {}
        }
    }
    out
}
