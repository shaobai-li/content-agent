use async_trait::async_trait;
use once_cell::sync::Lazy;
use regex::Regex;
use serde_json::Value;

use super::base::Tool;

static GENERATE_HTML_PARAMS: Lazy<Value> = Lazy::new(|| {
    serde_json::json!({
        "type": "object",
        "properties": {
            "prompt": {
                "type": "string",
                "description": "描述要生成的 HTML 内容，例如「一个数据可视化看板，展示三个指标卡片和折线图」"
            },
            "description": {
                "type": "string",
                "description": "对生成结果的补充说明或要求"
            }
        },
        "required": ["prompt"]
    })
});

const DEFAULT_API_BASE: &str = "https://api.deepseek.com";
const DEFAULT_MODEL: &str = "deepseek-chat";

/// LLM 系统提示词：指示模型输出独立完整的 HTML 页面
const GENERATE_HTML_SYSTEM_PROMPT: &str = r#"你是一个 HTML 生成专家。根据用户的描述生成一个完整的、可独立运行的 HTML 文件。
要求：
- 生成完整的 HTML 文档（<!DOCTYPE html> 开头）
- 所有 CSS 和 JavaScript 内联在单个文件中
- 使用现代化设计风格
- 确保页面自包含、可正常运行
- 不要添加任何外部依赖（CDN 引用除外）
- **仅输出纯 HTML 代码，不要用 ```html 或任何 markdown 代码块包裹，不要加额外解释**"#;

/// 生成 HTML 的工具，通过直接调用 LLM API 实现。
///
/// 当前使用 HTTP 直连，后续 P05（Provider Factory）完成后可切换为统一 Provider 层。
pub struct GenerateHTMLTool {
    api_key: String,
    api_base: String,
    model: String,
}

impl GenerateHTMLTool {
    /// provider_name 决定从哪个 env var 读取 API key（如 "deepseek" → DEEPSEEK_API_KEY）
    /// model 指定模型名，默认 deepseek-chat
    pub fn new(provider_name: Option<&str>, model: Option<&str>) -> Self {
        let resolved_provider = provider_name.unwrap_or("deepseek");
        let env_var = format!("{}_API_KEY", resolved_provider.to_uppercase());
        let api_key = std::env::var(&env_var)
            .unwrap_or_else(|_| String::new());
        let api_base = std::env::var(format!("{}_API_BASE", resolved_provider.to_uppercase()))
            .unwrap_or_else(|_| DEFAULT_API_BASE.to_string());

        Self {
            api_key,
            api_base,
            model: model.unwrap_or(DEFAULT_MODEL).to_string(),
        }
    }
}

#[async_trait]
impl Tool for GenerateHTMLTool {
    fn name(&self) -> &str {
        "generate_html"
    }

    fn description(&self) -> &str {
        "生成独立 HTML 页面并在 Canvas 面板中以可视化卡片展示。"
    }

    fn parameters(&self) -> &Value {
        &GENERATE_HTML_PARAMS
    }

    fn read_only(&self) -> bool {
        false
    }

    async fn execute(&self, params: Value) -> Result<String, String> {
        let prompt = params
            .get("prompt")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Error: missing required parameter 'prompt'".to_string())?;

        let description = params
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        if self.api_key.is_empty() {
            return Err("Error: API key not configured. Set DEEPSEEK_API_KEY or provider env var.".to_string());
        }

        let user_message = if description.is_empty() {
            prompt.to_string()
        } else {
            format!("{}\n\n补充说明：{}", prompt, description)
        };

        let messages = serde_json::json!([
            {"role": "system", "content": GENERATE_HTML_SYSTEM_PROMPT},
            {"role": "user", "content": user_message}
        ]);

        let raw = self.call_llm(messages).await?;
        let html = strip_markdown_code_block(&raw);

        if html.is_empty() {
            return Err("Error: LLM returned empty response".to_string());
        }

        Ok(html)
    }
}

impl GenerateHTMLTool {
    /// 通过 reqwest 直连 LLM API 进行非流式调用
    async fn call_llm(&self, messages: Value) -> Result<String, String> {
        let client = reqwest::Client::new();
        let url = format!("{}/v1/chat/completions", self.api_base);

        let resp = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&serde_json::json!({
                "model": self.model,
                "messages": messages,
                "max_tokens": 4096,
                "temperature": 0.7,
            }))
            .send()
            .await
            .map_err(|e| format!("API 请求失败: {}", e))?;

        let body: Value = resp
            .json()
            .await
            .map_err(|e| format!("解析 API 响应失败: {}", e))?;

        let content = body["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string();

        Ok(content)
    }
}

/// 移除 LLM 输出中可能包裹的 markdown 代码块标记
fn strip_markdown_code_block(content: &str) -> String {
    let re = Regex::new(r"^```.*?\n|```$").unwrap();
    re.replace_all(content.trim(), "").trim().to_string()
}

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_html_params_schema() {
        let tool = GenerateHTMLTool::new(None, None);
        let params = tool.parameters();

        assert_eq!(params["type"], "object");
        assert!(params["properties"]["prompt"]["type"].as_str().is_some());
        assert!(params["required"].as_array().unwrap().contains(&"prompt".to_string().into()));
    }

    #[test]
    fn test_strip_markdown_code_block() {
        let input = "```html\n<!DOCTYPE html>\n<html></html>\n```";
        let result = strip_markdown_code_block(input);
        assert_eq!(result, "<!DOCTYPE html>\n<html></html>");
    }

    #[test]
    fn test_strip_markdown_no_block() {
        let input = "<!DOCTYPE html>\n<html></html>";
        let result = strip_markdown_code_block(input);
        assert_eq!(result, input);
    }

    #[test]
    fn test_strip_markdown_code_block_no_lang() {
        let input = "```\nHello\n```";
        let result = strip_markdown_code_block(input);
        assert_eq!(result, "Hello");
    }

    #[test]
    fn test_strip_markdown_empty() {
        assert_eq!(strip_markdown_code_block(""), "");
    }

    #[test]
    fn test_tool_name_and_description() {
        let tool = GenerateHTMLTool::new(None, None);
        assert_eq!(tool.name(), "generate_html");
        assert!(tool.description().contains("Canvas"));
        assert!(!tool.read_only());
    }
}
