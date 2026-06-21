pub mod base;
pub mod file_state;
pub mod filesystem;
pub mod generate_html;
pub mod import_knowledge;
pub mod registry;
pub mod shell;
pub mod skill;
pub mod web;

pub use base::Tool;
pub use registry::ToolRegistry;

use file_state::FileStateTool;
use filesystem::{EditFileTool, ListDirTool, ReadFileTool, WriteFileTool};
use generate_html::GenerateHTMLTool;
use import_knowledge::ImportKnowledgeTool;
use shell::RunCommandTool;
use skill::InvokeSkillTool;
use web::{WebFetchTool, WebSearchTool};

/// Create and populate a ToolRegistry with all standard tools.
pub fn create_tool_registry(
    workspace: &str,
    agent_id: &str,
    provider_name: Option<&str>,
    model: Option<&str>,
) -> ToolRegistry {
    let mut registry = ToolRegistry::new();
    registry.register(Box::new(RunCommandTool::new(workspace, 60)));
    registry.register(Box::new(ReadFileTool::new(workspace)));
    registry.register(Box::new(WriteFileTool::new(workspace)));
    registry.register(Box::new(EditFileTool::new(workspace)));
    registry.register(Box::new(ListDirTool::new(workspace)));
    registry.register(Box::new(FileStateTool::new(workspace)));
    registry.register(Box::new(GenerateHTMLTool::new(provider_name, model)));
    registry.register(Box::new(WebSearchTool));
    registry.register(Box::new(WebFetchTool));
    registry.register(Box::new(InvokeSkillTool::new(agent_id)));
    registry.register(Box::new(ImportKnowledgeTool::new(workspace, agent_id)));
    registry
}
