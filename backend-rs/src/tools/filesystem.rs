use std::path::PathBuf;

use async_trait::async_trait;
use once_cell::sync::Lazy;
use serde_json::Value;

use super::base::Tool;

fn resolve_under_workspace(workspace: &str, rel_path: &str) -> Result<PathBuf, String> {
    let root = std::path::Path::new(workspace)
        .canonicalize()
        .map_err(|e| format!("Error: cannot resolve workspace path: {e}"))?;

    let full = root.join(rel_path);
    let full = if full.exists() {
        full.canonicalize()
            .map_err(|e| format!("Error: cannot resolve path: {e}"))?
    } else {
        let parent = full
            .parent()
            .map(|p| p.canonicalize())
            .transpose()
            .map_err(|e| format!("Error: cannot resolve parent path: {e}"))?
            .unwrap_or_else(|| root.clone());
        let filename = full
            .file_name()
            .ok_or_else(|| "Error: invalid path".to_string())?;
        parent.join(filename)
    };

    if !full.starts_with(&root) {
        return Err("Error: Path outside workspace not allowed".to_string());
    }
    Ok(full)
}

static READ_FILE_PARAMS: Lazy<Value> = Lazy::new(|| {
    serde_json::json!({
        "type": "object",
        "properties": {
            "path": {
                "type": "string",
                "description": "相对于工作区根目录的文件路径"
            }
        },
        "required": ["path"]
    })
});

static WRITE_FILE_PARAMS: Lazy<Value> = Lazy::new(|| {
    serde_json::json!({
        "type": "object",
        "properties": {
            "path": {
                "type": "string",
                "description": "相对于工作区根目录的文件路径"
            },
            "content": {
                "type": "string",
                "description": "要写入的文本内容"
            }
        },
        "required": ["path", "content"]
    })
});

pub struct ReadFileTool {
    workspace: String,
}

impl ReadFileTool {
    pub fn new(workspace: &str) -> Self {
        Self {
            workspace: workspace.to_string(),
        }
    }
}

#[async_trait]
impl Tool for ReadFileTool {
    fn name(&self) -> &str {
        "read_file"
    }

    fn description(&self) -> &str {
        "读取文本文件内容。path 为相对于工作区根目录的相对路径。"
    }

    fn parameters(&self) -> &Value {
        &READ_FILE_PARAMS
    }

    fn read_only(&self) -> bool {
        true
    }

    async fn execute(&self, params: Value) -> Result<String, String> {
        let path = params
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Error: missing required parameter 'path'".to_string())?;

        let file_path = resolve_under_workspace(&self.workspace, path)?;

        if !file_path.exists() {
            return Ok(format!("Error: File {path} does not exist"));
        }

        match std::fs::read_to_string(&file_path) {
            Ok(content) => Ok(content),
            Err(e) => Ok(format!("Error reading file: {e}")),
        }
    }
}

pub struct WriteFileTool {
    workspace: String,
}

impl WriteFileTool {
    pub fn new(workspace: &str) -> Self {
        Self {
            workspace: workspace.to_string(),
        }
    }
}

#[async_trait]
impl Tool for WriteFileTool {
    fn name(&self) -> &str {
        "write_file"
    }

    fn description(&self) -> &str {
        "写入文本文件（按需创建父目录）。path 为相对于工作区根目录的相对路径。"
    }

    fn parameters(&self) -> &Value {
        &WRITE_FILE_PARAMS
    }

    async fn execute(&self, params: Value) -> Result<String, String> {
        let path = params
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Error: missing required parameter 'path'".to_string())?;

        let content = params
            .get("content")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Error: missing required parameter 'content'".to_string())?;

        let file_path = resolve_under_workspace(&self.workspace, path)?;

        if let Some(parent) = file_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Error creating directories: {e}"))?;
        }

        match std::fs::write(&file_path, content) {
            Ok(()) => Ok(format!("Successfully wrote to {path}")),
            Err(e) => Ok(format!("Error writing file: {e}")),
        }
    }
}
