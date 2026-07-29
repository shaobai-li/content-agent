/// Tool: PDF → Markdown via pdf2md CLI.
///
/// 调用已安装的 pdf2md 命令，使用 PyMuPDF 进行布局感知的本地 PDF 解析
///（标题层级、双栏排版、表格提取、图文区域识别）。
/// 当文本不足或扫描页过多时自动 fallback 到 MinerU OCR。
use async_trait::async_trait;
use once_cell::sync::Lazy;
use serde_json::Value;

use super::base::Tool;

static PDF2MD_PARAMS: Lazy<Value> = Lazy::new(|| {
    serde_json::json!({
        "type": "object",
        "properties": {
            "input": {
                "type": "string",
                "description": "PDF 文件的绝对路径"
            },
            "output": {
                "type": "string",
                "description": "输出 Markdown 文件路径"
            },
            "no_ocr": {
                "type": "boolean",
                "description": "禁用 MinerU OCR fallback，仅使用本地 PyMuPDF 解析（默认 false）"
            },
            "force_ocr": {
                "type": "boolean",
                "description": "跳过本地解析，强制使用 MinerU OCR（默认 false）"
            }
        },
        "required": ["input", "output"]
    })
});

pub struct Pdf2mdTool;

impl Pdf2mdTool {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl Tool for Pdf2mdTool {
    fn name(&self) -> &str {
        "pdf2md"
    }

    fn description(&self) -> &str {
        "将 PDF 文件转换为 Markdown 文本。\
         使用 PyMuPDF 进行布局感知的本地解析，\
         自动识别标题层级、双栏排版、表格和图文区域。\
         当本地文本不足或扫描页过多时，可自动 fallback 到 MinerU OCR。\
         输出为 UTF-8 编码的 Markdown 文件。"
    }

    fn parameters(&self) -> &Value {
        &PDF2MD_PARAMS
    }

    fn read_only(&self) -> bool {
        false
    }

    fn concurrency_safe(&self) -> bool {
        false
    }

    async fn execute(&self, params: Value) -> Result<String, String> {
        let input = params
            .get("input")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Error: missing required parameter 'input'".to_string())?;
        let output = params
            .get("output")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Error: missing required parameter 'output'".to_string())?;
        let no_ocr = params
            .get("no_ocr")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let force_ocr = params
            .get("force_ocr")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let mut cmd = tokio::process::Command::new("pdf2md");
        cmd.arg("--input").arg(input);
        cmd.arg("--output").arg(output);
        if no_ocr {
            cmd.arg("--no-ocr");
        }
        if force_ocr {
            cmd.arg("--force-ocr");
        }

        // pdf2md 依赖 AGENT_WORKSPACE 环境变量来查找 config.json
        if let Ok(ws) = std::env::var("AGENT_WORKSPACE") {
            cmd.env("AGENT_WORKSPACE", &ws);
        }

        let child = cmd
            .output()
            .await
            .map_err(|e| format!("执行 pdf2md 失败: {}", e))?;

        if !child.status.success() {
            let stderr = String::from_utf8_lossy(&child.stderr);
            return Err(format!("pdf2md 转换失败: {}", stderr.trim()));
        }

        // pdf2md 输出 JSON 到 stdout，直接透传
        let stdout = String::from_utf8_lossy(&child.stdout);
        Ok(stdout.trim().to_string())
    }
}
