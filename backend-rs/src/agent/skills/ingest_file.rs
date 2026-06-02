use std::path::PathBuf;

use crate::agent::skills::parsers::parse_file;

/// 将文件导入到 agent workspace，返回 workspace 内的路径
pub fn import_file(agent_id: &str, source_path: &str) -> Result<PathBuf, String> {
    let src = PathBuf::from(source_path);
    let filename = src
        .file_name()
        .ok_or_else(|| "Invalid source path".to_string())?;

    let workspace = crate::core::config::get_agent_workspace_dir(agent_id);
    let dest = workspace.join("uploads").join(filename);
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {e}"))?;
    }
    std::fs::copy(&src, &dest).map_err(|e| format!("Failed to copy file: {e}"))?;
    Ok(dest)
}

/// 解析文件内容
pub fn parse_document(file_path: &PathBuf) -> Result<crate::agent::skills::parsers::ParsedDocument, String> {
    parse_file(file_path)
}

/// 解析文件并写入 knowledge base 节点（待集成 P14 Knowledge Base API）
pub fn ingest_file(
    _agent_id: &str,
    _file_path: &PathBuf,
    _kb_id: &str,
) -> Result<(), String> {
    // TODO: 解析后写入 knowledge base 节点
    // 需要 knowledge_base service 提供写入接口
    Err("Knowledge base write not yet implemented. File parsing completed.".to_string())
}
