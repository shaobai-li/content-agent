use std::pin::Pin;

use async_trait::async_trait;
use futures_util::Stream;

use super::turn_context::AgentTurnContext;

pub type AgentStream = Pin<Box<dyn Stream<Item = Result<String, std::convert::Infallible>> + Send>>;

#[async_trait]
pub trait BaseAgent: Send + Sync {
    fn agent_id(&self) -> &str;

    async fn handle_chat_stream(&self, ctx: AgentTurnContext) -> AgentStream;

    fn get_config_dict(&self) -> serde_json::Value;
}
