use std::path::PathBuf;

use async_trait::async_trait;
use once_cell::sync::Lazy;
use serde_json::Value;

use super::base::Tool;

const MAX_HTML_SIZE: u64 = 200_000;

static LOAD_HTML_TO_CANVAS_PARAMS: Lazy<Value> = Lazy::new(|| {
    serde_json::json!({
        "type": "object",
        "properties": {
            "path": {
                "type": "string",
                "description": "HTML 文件路径，相对于工作区目录"
            }
        },
        "required": ["path"]
    })
});

/// 加载本地 HTML 文件并在 Canvas 面板中以可视化卡片展示。
pub struct LoadHTMLToCanvasTool {
    workspace: String,
}

impl LoadHTMLToCanvasTool {
    pub fn new(workspace: &str) -> Self {
        Self {
            workspace: workspace.to_string(),
        }
    }
}

#[async_trait]
impl Tool for LoadHTMLToCanvasTool {
    fn name(&self) -> &str {
        "load_html_to_canvas"
    }

    fn description(&self) -> &str {
        "加载本地 HTML 文件并在 Canvas 面板中以可视化卡片展示。"
    }

    fn parameters(&self) -> &Value {
        &LOAD_HTML_TO_CANVAS_PARAMS
    }

    fn read_only(&self) -> bool {
        true
    }

    fn concurrency_safe(&self) -> bool {
        true
    }

    async fn execute(&self, params: Value) -> Result<String, String> {
        let path = params
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Error: missing required parameter 'path'".to_string())?;

        let full_path = crate::tools::filesystem::resolve_under_workspace(&self.workspace, path)?;

        if !full_path.exists() {
            return Err(format!("Error: File not found at '{path}'"));
        }

        if !full_path.is_file() {
            return Err(format!("Error: '{path}' is not a file"));
        }

        // 检查文件大小
        let file_size = std::fs::metadata(&full_path)
            .map_err(|e| format!("Error: cannot read file metadata: {e}"))?
            .len();

        if file_size > MAX_HTML_SIZE {
            return Err(format!(
                "Error: File size ({file_size} bytes) exceeds the maximum allowed size ({MAX_HTML_SIZE} bytes)"
            ));
        }

        // 读取文件
        let html = std::fs::read_to_string(&full_path)
            .map_err(|e| format!("Error: Failed to read file '{path}': {e}"))?;

        Ok(html)
    }
}
