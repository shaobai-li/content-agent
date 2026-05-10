use async_trait::async_trait;

use crate::provider::base::ToolCallRequest;

#[async_trait]
pub trait AgentHook: Send + Sync {
    fn wants_streaming(&self) -> bool {
        false
    }

    async fn on_stream(&self, _delta: &str) {}

    async fn before_execute_tools(&self, _tool_calls: &[ToolCallRequest]) {}

    async fn after_iteration(&self, _tool_calls: &[ToolCallRequest], _tool_results: &[String]) {}
}
