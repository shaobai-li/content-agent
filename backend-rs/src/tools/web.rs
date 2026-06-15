use async_trait::async_trait;
use once_cell::sync::Lazy;
use regex::Regex;
use serde_json::Value;

use super::base::Tool;

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

static WEB_SEARCH_PARAMS: Lazy<Value> = Lazy::new(|| {
    serde_json::json!({
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "搜索关键词"
            },
            "count": {
                "type": "integer",
                "description": "返回结果数（1-10，默认 5）",
                "default": 5,
                "minimum": 1,
                "maximum": 10
            }
        },
        "required": ["query"]
    })
});

static WEB_FETCH_PARAMS: Lazy<Value> = Lazy::new(|| {
    serde_json::json!({
        "type": "object",
        "properties": {
            "url": {
                "type": "string",
                "description": "待抓取 URL（仅 http/https）"
            },
            "extractMode": {
                "type": "string",
                "enum": ["markdown", "text"],
                "default": "markdown"
            },
            "maxChars": {
                "type": "integer",
                "description": "最大返回字符数",
                "default": 50000,
                "minimum": 100
            }
        },
        "required": ["url"]
    })
});

fn decode_duckduckgo_href(href: &str) -> String {
    // DuckDuckGo redirects through their own URL
    if href.starts_with("//") {
        return format!("https:{}", href);
    }
    if let Some(start) = href.find("uddg=") {
        let after = &href[start + 5..];
        if let Some(amp) = after.find('&') {
            url_decode(&after[..amp])
        } else {
            url_decode(after)
        }
    } else {
        href.to_string()
    }
}

fn url_decode(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.bytes();
    while let Some(b) = chars.next() {
        if b == b'%' {
            let hex: String = chars.by_ref().take(2).map(|c| c as char).collect();
            if let Ok(byte) = u8::from_str_radix(&hex, 16) {
                result.push(byte as char);
            } else {
                result.push('%');
                result.push_str(&hex);
            }
        } else if b == b'+' {
            result.push(' ');
        } else {
            result.push(b as char);
        }
    }
    result
}

fn strip_html_tags(html: &str) -> String {
    let re = Regex::new(r"<[^>]*>").unwrap();
    let result = re.replace_all(html, |caps: &regex::Captures| {
        let tag = &caps[0];
        if tag.starts_with("</") {
            String::new()
        } else if tag.ends_with("/>") {
            String::new()
        } else {
            String::new()
        }
    });
    let re_whitespace = Regex::new(r"\s+").unwrap();
    re_whitespace.replace_all(&result, " ").trim().to_string()
}

pub struct WebSearchTool;

#[async_trait]
impl Tool for WebSearchTool {
    fn name(&self) -> &str {
        "web_search"
    }

    fn description(&self) -> &str {
        "使用 DuckDuckGo 搜索网页，返回标题、链接和摘要。"
    }

    fn parameters(&self) -> &Value {
        &WEB_SEARCH_PARAMS
    }

    fn read_only(&self) -> bool {
        true
    }

    async fn execute(&self, params: Value) -> Result<String, String> {
        use std::time::Duration;

        let query = params
            .get("query")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Error: missing required parameter 'query'".to_string())?;

        let count = params
            .get("count")
            .and_then(|v| v.as_i64())
            .unwrap_or(5)
            .max(1)
            .min(10) as usize;

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .build()
            .map_err(|e| format!("Error creating client: {e}"))?;

        let resp = client
            .get("https://duckduckgo.com/html/")
            .query(&[("q", query)])
            .header("User-Agent", USER_AGENT)
            .send()
            .await
            .map_err(|e| format!("Error searching: {e}"))?;

        let html = resp
            .text()
            .await
            .map_err(|e| format!("Error reading response: {e}"))?;

        // Parse results using regex (matching Python approach)
        let result_pattern = Regex::new(
            r##"<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>(.*?)</a>"##
        )
        .map_err(|_| "Error: invalid regex".to_string())?;

        let mut results: Vec<(String, String, String)> = Vec::new();
        for cap in result_pattern.captures_iter(&html) {
            let href = decode_duckduckgo_href(&cap[1]);
            let title_html = &cap[2];
            let title = strip_html_tags(title_html);

            // Extract snippet from text after the match
            let snippet_end = cap.get(2).map(|m| m.end()).unwrap_or(0);
            let tail = &html[cap.get(0).map(|m| m.end()).unwrap_or(0)..]
                .chars()
                .take(1500)
                .collect::<String>();

            let snippet_re = Regex::new(r##"class="[^"]*result__snippet[^"]*"[^>]*>(.*?)</"##)
                .ok();
            let snippet = snippet_re
                .and_then(|re| {
                    re.captures(tail)
                        .map(|scap| strip_html_tags(&scap[1]))
                })
                .unwrap_or_default();

            results.push((title, href, snippet));

            if results.len() >= count {
                break;
            }
        }

        if results.is_empty() {
            return Ok("(no results)".to_string());
        }

        let output: Vec<String> = results
            .iter()
            .enumerate()
            .map(|(i, (title, href, snippet))| {
                format!(
                    "{}. [{title}]({href})\n   {snippet}",
                    i + 1
                )
            })
            .collect();

        Ok(output.join("\n\n"))
    }
}

pub struct WebFetchTool;

#[async_trait]
impl Tool for WebFetchTool {
    fn name(&self) -> &str {
        "web_fetch"
    }

    fn description(&self) -> &str {
        "抓取 URL 内容，支持 markdown/text 提取。"
    }

    fn parameters(&self) -> &Value {
        &WEB_FETCH_PARAMS
    }

    fn read_only(&self) -> bool {
        true
    }

    async fn execute(&self, params: Value) -> Result<String, String> {
        use std::time::Duration;

        let url = params
            .get("url")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Error: missing required parameter 'url'".to_string())?;

        let extract_mode = params
            .get("extractMode")
            .and_then(|v| v.as_str())
            .unwrap_or("markdown");

        let max_chars = params
            .get("maxChars")
            .and_then(|v| v.as_i64())
            .unwrap_or(50000)
            .max(100) as usize;

        // Validate URL
        let lower_url = url.to_lowercase();
        if !lower_url.starts_with("http://") && !lower_url.starts_with("https://") {
            return Ok(format!(
                r#"{{"error": "URL validation failed: only http/https allowed", "url": "{url}"}}"#
            ));
        }

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .build()
            .map_err(|e| format!("Error creating client: {e}"))?;

        let resp = client
            .get(url)
            .header("User-Agent", USER_AGENT)
            .send()
            .await
            .map_err(|e| format!("Error fetching URL: {e}"))?;

        let content_type = resp
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_lowercase();

        let text = resp
            .text()
            .await
            .map_err(|e| format!("Error reading response: {e}"))?;

        let result = if content_type.contains("application/json") {
            // Pretty-print JSON
            serde_json::from_str::<serde_json::Value>(&text)
                .map(|v| serde_json::to_string_pretty(&v).unwrap_or(text.clone()))
                .unwrap_or(text)
        } else if content_type.contains("text/html") || text[..300.min(text.len())].to_lowercase().contains("<html") {
            if extract_mode == "markdown" {
                // Simple HTML to text conversion
                strip_html_tags(&text)
            } else {
                strip_html_tags(&text)
            }
        } else {
            text
        };

        let result = result;
        if result.len() > max_chars {
            let half = max_chars / 2;
            // 调整到有效 UTF-8 字符边界，避免切碎多字节字符
            let prefix_end = (0..=half)
                .rev()
                .find(|&i| result.is_char_boundary(i))
                .unwrap_or(0);
            let suffix_start = (result.len() - half..result.len())
                .find(|&i| result.is_char_boundary(i))
                .unwrap_or(result.len());
            Ok(format!(
                "{}\n\n... ({} chars truncated) ...\n\n{}",
                &result[..prefix_end],
                result.len() - max_chars,
                &result[suffix_start..],
            ))
        } else {
            Ok(result)
        }
    }
}
