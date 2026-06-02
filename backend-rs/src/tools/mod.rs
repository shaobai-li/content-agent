pub mod base;
pub mod filesystem;
pub mod generate_html;
pub mod registry;
pub mod shell;
pub mod skill;
pub mod web;

pub use base::Tool;
pub use registry::ToolRegistry;

use filesystem::{EditFileTool, ListDirTool, ReadFileTool, WriteFileTool};
use generate_html::GenerateHTMLTool;
use shell::RunCommandTool;
use skill::InvokeSkillTool;
use web::{WebFetchTool, WebSearchTool};

/// Create and populate a ToolRegistry with all standard tools.
pub fn create_tool_registry(workspace: &str, agent_id: &str) -> ToolRegistry {
    let mut registry = ToolRegistry::new();
    registry.register(Box::new(RunCommandTool::new(workspace, 60)));
    registry.register(Box::new(ReadFileTool::new(workspace)));
    registry.register(Box::new(WriteFileTool::new(workspace)));
    registry.register(Box::new(EditFileTool::new(workspace)));
    registry.register(Box::new(ListDirTool::new(workspace)));
    registry.register(Box::new(GenerateHTMLTool::new(None, None)));
    registry.register(Box::new(WebSearchTool));
    registry.register(Box::new(WebFetchTool));
    registry.register(Box::new(InvokeSkillTool::new(workspace, agent_id)));
    registry
}
