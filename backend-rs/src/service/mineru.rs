//! MinerU v4 精准解析 API 客户端（本地文件上传 + 轮询 + 提取 full.md）。

use std::io::Read;
use std::path::Path;
use std::time::{Duration, Instant};

use reqwest::Client;
use serde_json::{json, Value};
use zip::ZipArchive;

const DEFAULT_BASE_URL: &str = "https://mineru.net";

pub struct MinerUConfig {
    pub token: String,
    pub base_url: String,
    pub model_version: String,
    pub poll_interval_ms: u64,
    pub poll_timeout_secs: u64,
}

impl MinerUConfig {
    pub fn from_env() -> Result<Self, String> {
        let token = std::env::var("MINERU_API_TOKEN")
            .map_err(|_| "未配置 MINERU_API_TOKEN".to_string())?;
        if token.trim().is_empty() {
            return Err("MINERU_API_TOKEN 为空".to_string());
        }
        Ok(Self {
            token,
            base_url: std::env::var("MINERU_BASE_URL")
                .unwrap_or_else(|_| DEFAULT_BASE_URL.to_string()),
            model_version: std::env::var("MINERU_MODEL_VERSION")
                .unwrap_or_else(|_| "vlm".to_string()),
            poll_interval_ms: std::env::var("MINERU_POLL_INTERVAL_MS")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(3000),
            poll_timeout_secs: std::env::var("MINERU_POLL_TIMEOUT_SEC")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(300),
        })
    }

    /// 从 config.json 的 providers.mineru 读取配置。
    /// 字段：api_key（必填）, api_base（可选，默认 https://mineru.net）。
    pub fn from_config() -> Result<Self, String> {
        let user_id = crate::core::auth::get_current_user_id()
            .ok_or_else(|| "无法获取当前用户上下文".to_string())?;
        let cfg = crate::core::config::get_provider_config(&user_id, "mineru");
        let token = cfg
            .get("api_key")
            .ok_or_else(|| "config.json 中未配置 providers.mineru.api_key".to_string())?;
        if token.trim().is_empty() {
            return Err("providers.mineru.api_key 为空".to_string());
        }
        let base_url = cfg
            .get("api_base")
            .filter(|s| !s.trim().is_empty())
            .cloned()
            .unwrap_or_else(|| DEFAULT_BASE_URL.to_string());
        Ok(Self {
            token: token.clone(),
            base_url,
            model_version: String::from("vlm"),
            poll_interval_ms: 3000,
            poll_timeout_secs: 300,
        })
    }
}

/// 上传 PDF 到 MinerU，等待解析完成，返回 Markdown 文本。
pub async fn parse_pdf(path: &Path, config: &MinerUConfig) -> Result<String, String> {
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "无法获取 PDF 文件名".to_string())?;

    let client = Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let (batch_id, upload_url) = request_upload_url(&client, config, file_name).await?;
    upload_file(&client, path, &upload_url).await?;
    let zip_url = poll_batch_result(&client, config, &batch_id, file_name).await?;
    download_and_extract_md(&client, &zip_url).await
}

async fn request_upload_url(
    client: &Client,
    config: &MinerUConfig,
    file_name: &str,
) -> Result<(String, String), String> {
    let url = format!("{}/api/v4/file-urls/batch", config.base_url);
    let body = json!({
        "files": [{"name": file_name, "is_ocr": true}],
        "model_version": config.model_version,
        "enable_table": true,
        "enable_formula": true,
        "language": "ch",
    });

    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.token))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("MinerU 申请上传链接失败: {}", e))?;

    let status = resp.status();
    let payload: Value = resp
        .json()
        .await
        .map_err(|e| format!("MinerU 申请上传链接响应解析失败: {}", e))?;

    ensure_api_ok(&payload, status.as_u16(), "申请上传链接")?;

    let data = payload
        .get("data")
        .ok_or_else(|| "MinerU 响应缺少 data 字段".to_string())?;
    let batch_id = data
        .get("batch_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "MinerU 响应缺少 batch_id".to_string())?
        .to_string();
    let upload_url = data
        .get("file_urls")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .and_then(|v| v.as_str())
        .ok_or_else(|| "MinerU 响应缺少 file_urls".to_string())?
        .to_string();

    Ok((batch_id, upload_url))
}

async fn upload_file(client: &Client, path: &Path, upload_url: &str) -> Result<(), String> {
    let bytes = tokio::fs::read(path)
        .await
        .map_err(|e| format!("读取 PDF 文件失败: {}", e))?;

    let resp = client
        .put(upload_url)
        .body(bytes)
        .send()
        .await
        .map_err(|e| format!("MinerU 上传文件失败: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!(
            "MinerU 上传文件失败: HTTP {} {}",
            status,
            body.chars().take(200).collect::<String>()
        ));
    }
    Ok(())
}

async fn poll_batch_result(
    client: &Client,
    config: &MinerUConfig,
    batch_id: &str,
    file_name: &str,
) -> Result<String, String> {
    let url = format!("{}/api/v4/extract-results/batch/{}", config.base_url, batch_id);
    let deadline =
        Instant::now() + Duration::from_secs(config.poll_timeout_secs.max(1));

    loop {
        if Instant::now() >= deadline {
            return Err(format!(
                "MinerU 解析超时（{} 秒）",
                config.poll_timeout_secs
            ));
        }

        let resp = client
            .get(&url)
            .header("Authorization", format!("Bearer {}", config.token))
            .header("Content-Type", "application/json")
            .send()
            .await
            .map_err(|e| format!("MinerU 查询任务失败: {}", e))?;

        let status = resp.status();
        let payload: Value = resp
            .json()
            .await
            .map_err(|e| format!("MinerU 查询任务响应解析失败: {}", e))?;

        ensure_api_ok(&payload, status.as_u16(), "查询任务")?;

        let results = payload
            .get("data")
            .and_then(|d| d.get("extract_result"))
            .and_then(|v| v.as_array())
            .ok_or_else(|| "MinerU 响应缺少 extract_result".to_string())?;

        let item = results
            .iter()
            .find(|r| {
                r.get("file_name")
                    .and_then(|v| v.as_str())
                    .map(|n| n == file_name)
                    .unwrap_or(false)
            })
            .or_else(|| results.first())
            .ok_or_else(|| "MinerU 响应中无任务结果".to_string())?;

        let state = item
            .get("state")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown");

        match state {
            "done" => {
                return item
                    .get("full_zip_url")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
                    .ok_or_else(|| "MinerU 任务完成但缺少 full_zip_url".to_string());
            }
            "failed" => {
                let err_msg = item
                    .get("err_msg")
                    .and_then(|v| v.as_str())
                    .unwrap_or("未知错误");
                return Err(format!("MinerU 解析失败: {}", err_msg));
            }
            "waiting-file" | "pending" | "running" | "converting" | "uploading" => {
                tokio::time::sleep(Duration::from_millis(config.poll_interval_ms)).await;
            }
            other => {
                return Err(format!("MinerU 未知任务状态: {}", other));
            }
        }
    }
}

async fn download_and_extract_md(client: &Client, zip_url: &str) -> Result<String, String> {
    let resp = client
        .get(zip_url)
        .send()
        .await
        .map_err(|e| format!("下载 MinerU 结果失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("下载 MinerU 结果失败: HTTP {}", resp.status()));
    }

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("读取 MinerU 结果 ZIP 失败: {}", e))?;

    extract_full_md_from_zip(&bytes)
}

fn extract_full_md_from_zip(bytes: &[u8]) -> Result<String, String> {
    let cursor = std::io::Cursor::new(bytes);
    let mut archive =
        ZipArchive::new(cursor).map_err(|e| format!("解压 MinerU ZIP 失败: {}", e))?;

    let mut best: Option<(usize, String)> = None;

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("读取 ZIP 条目失败: {}", e))?;
        let name = entry.name().to_string();
        if !name.ends_with("full.md") {
            continue;
        }
        let mut content = String::new();
        entry
            .read_to_string(&mut content)
            .map_err(|e| format!("读取 full.md 失败: {}", e))?;
        let depth = name.matches('/').count();
        if best.as_ref().map_or(true, |(d, _)| depth <= *d) {
            best = Some((depth, content));
        }
    }

    best.map(|(_, c)| c)
        .ok_or_else(|| "MinerU ZIP 中未找到 full.md".to_string())
}

fn ensure_api_ok(payload: &Value, http_status: u16, action: &str) -> Result<(), String> {
    let code = payload.get("code").and_then(|v| v.as_i64()).unwrap_or(-1);
    if code != 0 {
        let msg = payload
            .get("msg")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown");
        return Err(format!("MinerU {} 失败: {} (code={})", action, msg, code));
    }
    if http_status >= 400 {
        let msg = payload
            .get("msg")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown");
        return Err(format!(
            "MinerU {} 失败: HTTP {} {}",
            action, http_status, msg
        ));
    }
    Ok(())
}
