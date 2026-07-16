pub mod base;
pub mod file_state;
pub mod filesystem;
pub mod import_knowledge;
pub mod load_html_to_canvas;
pub mod mcp;
pub mod registry;
pub mod shell;
pub mod skill;
pub mod web;

pub use base::Tool;
pub use registry::ToolRegistry;

use file_state::FileStateTool;
use filesystem::{EditFileTool, ListDirTool, ReadFileTool, WriteFileTool};
use import_knowledge::ImportKnowledgeTool;
use load_html_to_canvas::LoadHTMLToCanvasTool;
use shell::RunCommandTool;
use skill::InvokeSkillTool;
use web::{WebFetchTool, WebSearchTool};

/// Create and populate a ToolRegistry with all standard tools.
pub fn create_tool_registry(
    workspace: &str,
    agent_id: &str,
    provider_name: Option<&str>,
    model: Option<&str>,
    _mcp_servers: Option<&std::collections::HashMap<String, serde_json::Value>>,
) -> ToolRegistry {
    let mut registry = ToolRegistry::new();
    registry.register(Box::new(RunCommandTool::new(workspace, 60)));
    registry.register(Box::new(ReadFileTool::new(workspace)));
    registry.register(Box::new(WriteFileTool::new(workspace)));
    registry.register(Box::new(EditFileTool::new(workspace)));
    registry.register(Box::new(ListDirTool::new(workspace)));
    registry.register(Box::new(FileStateTool::new(workspace)));
    registry.register(Box::new(WebSearchTool));
    registry.register(Box::new(WebFetchTool));
    registry.register(Box::new(InvokeSkillTool::new(agent_id)));
    registry.register(Box::new(ImportKnowledgeTool::new(workspace, agent_id)));
    registry.register(Box::new(LoadHTMLToCanvasTool::new(workspace)));
    registry
}
