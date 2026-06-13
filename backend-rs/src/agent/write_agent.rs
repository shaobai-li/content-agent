use std::sync::Arc;

use async_trait::async_trait;
use futures_util::StreamExt;
use serde_json::Value;
use tokio::sync::mpsc;

use crate::agent::base::{AgentStream, BaseAgent};
use crate::agent::context::ContextBuilder;
use crate::agent::runner::{AgentRunner, AgentRunSpec};
use crate::agent::standard::history_llm_turns;
use crate::agent::turn_context::AgentTurnContext;
use crate::core::config::get_agent_workspace_dir;
use crate::provider::factory;
use crate::provider::openai_compat::{OpenAICompatProvider, ProviderConfig};
use crate::service::context_utils::append_attachments_to_user_text;
use crate::service::messages::save_message;
use crate::service::stream::build_stream_done;
use crate::tools::create_tool_registry;

const MAX_TOOL_ROUNDS: u32 = 15;

/// 写作专用 system prompt
const WRITE_SYSTEM_PROMPT: &str = r#"你是一个专业的写作助手。你的任务是根据用户的要求生成高质量的内容。

写作要求：
- 注意文章结构和逻辑清晰
- 使用适当的语气和风格
- 注重可读性和表达准确性
- 如用户要求修改，理解意图后进行针对性调整

可用工具：
- write_file：保存写作内容到文件
- read_file：阅读已有文档
- list_dir：浏览目录"#;

pub struct WriteAgent {
    agent_id: String,
}

impl WriteAgent {
    pub fn new(agent_id: &str) -> Self {
        Self {
            agent_id: agent_id.to_string(),
        }
    }
}

#[async_trait]
impl BaseAgent for WriteAgent {
    fn agent_id(&self) -> &str {
        &self.agent_id
    }

    fn get_config_dict(&self) -> Value {
        let ws = get_agent_workspace_dir(&self.agent_id);
        serde_json::json!({
            "agent_id": self.agent_id,
            "system_prompt": WRITE_SYSTEM_PROMPT,
            "workspace": ws.display().to_string(),
        })
    }

    async fn handle_chat_stream(&self, ctx: AgentTurnContext) -> AgentStream {
        let workspace = get_agent_workspace_dir(&self.agent_id);
        let builder = ContextBuilder::new(&workspace.display().to_string(), Some(&self.agent_id));

        let history = history_llm_turns(&ctx.history_messages);

        // 将附件缓存路径拼入 user_text，与 Python 端 append_attachments_to_user_text 一致
        let user_text = append_attachments_to_user_text(&ctx.user_text, &ctx.resolved_attachment_paths);
        let mut messages = builder.build_messages(&history, &user_text, &ctx.mentions);

        // 用写作专用 system prompt 替换默认
        let system_msg = serde_json::json!({"role": "system", "content": WRITE_SYSTEM_PROMPT});
        messages[0] = system_msg;

        let provider_name = ctx.provider.as_deref().unwrap_or("deepseek");
        let model = ctx.model.as_deref().unwrap_or_else(|| factory::default_model_for(provider_name));
        let registry = create_tool_registry(
            &workspace.display().to_string(),
            &self.agent_id,
            Some(provider_name),
            Some(model),
        );

        let provider = match factory::create_provider(provider_name, None, None, Some(model.to_string())) {
            Ok(p) => Arc::new(p) as Arc<dyn crate::provider::base::LLMProvider>,
            Err(e) => {
                tracing::warn!("创建 provider {provider_name} 失败: {e}，降级到 deepseek");
                let api_key = std::env::var("DEEPSEEK_API_KEY").ok();
                Arc::new(OpenAICompatProvider::new(api_key, None, Some("deepseek-chat".to_string()), None, Some(ProviderConfig::default())))
                    as Arc<dyn crate::provider::base::LLMProvider>
            }
        };

        let (tx, rx) = mpsc::unbounded_channel::<String>();
        let session_id = ctx.session_id.clone().unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

        let initial_msg_len = messages.len();
        let agent_id = self.agent_id.clone();
        let spec = AgentRunSpec {
            initial_messages: messages,
            tools: registry,
            model: model.to_string(),
            max_iterations: MAX_TOOL_ROUNDS,
            max_tool_result_chars: 100_000,
            temperature: Some(0.7),
            max_tokens: Some(4096),
            reasoning_effort: None,
            error_message: None,
            max_iterations_message: None,
            concurrent_tools: false,
            fail_on_tool_error: false,
            context_window_tokens: Some(65536),
            provider_retry_mode: "simple".to_string(),
            hook: None,
        };

        let runner = AgentRunner::new(provider);
        let current_user_id = crate::core::auth::get_current_user_id();
        let sid = session_id.clone();
        tokio::spawn(async move {
            let run_fut = async move {
                let result = runner.run(spec).await;

                // 保存 assistant 和 tool 消息（对齐 Python 端 write agent 行为）
                for msg in result.messages[initial_msg_len..].iter() {
                    let role = msg.get("role").and_then(|v| v.as_str()).unwrap_or("");
                    if role == "assistant" {
                        let content = msg.get("content").and_then(|v| v.as_str()).unwrap_or("");
                        save_message(
                            &agent_id, &sid, "assistant", content,
                            msg.get("tool_calls").cloned(),
                            None,
                            msg.get("reasoning_content").and_then(|v| v.as_str()),
                        );
                    } else if role == "tool" {
                        let content = msg.get("content").and_then(|v| v.as_str()).unwrap_or("");
                        save_message(
                            &agent_id, &sid, "tool", content,
                            None,
                            msg.get("tool_call_id").and_then(|v| v.as_str()),
                            None,
                        );
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_write_agent_config() {
        let agent = WriteAgent::new("write-test");
        assert_eq!(agent.agent_id(), "write-test");
    }

    #[test]
    fn test_write_agent_has_correct_name() {
        let agent = WriteAgent::new("write-assistant");
        assert_eq!(agent.agent_id(), "write-assistant");
    }
}
