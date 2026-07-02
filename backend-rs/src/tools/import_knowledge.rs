/// Tool: 批量导入文件到指定知识库。
///
/// 功能等价于 Python 版 import_knowledge.py，实现为 Rust 原生 agent tool。
use std::io::Read;
use std::path::{Path, PathBuf};

use async_trait::async_trait;
use once_cell::sync::Lazy;
use serde_json::{json, Value};

use super::base::Tool;
use crate::core::config::get_agent_local_data_dir;
use crate::service::knowledge_base::list_knowledge_bases;
use crate::service::mineru::{self, MinerUConfig};

// ═══════════════════════════════════════════════════════════════════════
// Parameters schema
// ═══════════════════════════════════════════════════════════════════════

static IMPORT_KNOWLEDGE_PARAMS: Lazy<Value> = Lazy::new(|| {
    json!({
        "type": "object",
        "properties": {
            "database_name": {
                "type": "string",
                "description": "知识库名称（在 databases.json 中注册的名称）"
            },
            "file_paths": {
                "type": "array",
                "items": {"type": "string"},
                "description": "要导入的文件路径列表（支持绝对路径或相对于 workspace 的路径）"
            }
        },
        "required": ["database_name", "file_paths"]
    })
});

// ═══════════════════════════════════════════════════════════════════════
// Tool struct
// ═══════════════════════════════════════════════════════════════════════

pub struct ImportKnowledgeTool {
    workspace: String,
    agent_id: String,
}

impl ImportKnowledgeTool {
    pub fn new(workspace: &str, agent_id: &str) -> Self {
        Self {
            workspace: workspace.to_string(),
            agent_id: agent_id.to_string(),
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Helper: timestamp
// ═══════════════════════════════════════════════════════════════════════

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

// ═══════════════════════════════════════════════════════════════════════
// Helper: SHA256 fingerprint
// ═══════════════════════════════════════════════════════════════════════

fn fingerprint_sha256(path: &Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};

    let mut file = std::fs::File::open(path)
        .map_err(|e| format!("无法打开文件 {}: {}", path.display(), e))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 1_048_576]; // 1 MiB chunks

    loop {
        let n = file
            .read(&mut buffer)
            .map_err(|e| format!("读取文件失败: {}", e))?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

// ═══════════════════════════════════════════════════════════════════════
// Helper: file validation
// ═══════════════════════════════════════════════════════════════════════

fn validate_source_file(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Err(format!("输入文件不存在: {}", path.display()));
    }
    if !path.is_file() {
        return Err(format!("输入路径不是文件: {}", path.display()));
    }
    // 尝试打开确认可读
    std::fs::File::open(path)
        .map_err(|e| format!("输入文件不可读: {}", e))?;
    Ok(())
}

// ═══════════════════════════════════════════════════════════════════════
// Helper: metadata.json management
// ═══════════════════════════════════════════════════════════════════════

fn metadata_path(kb_root: &Path) -> PathBuf {
    kb_root.join("metadata.json")
}

fn load_metadata(kb_root: &Path) -> Result<Value, String> {
    let path = metadata_path(kb_root);
    if !path.exists() {
        return Ok(json!({}));
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("读取 metadata.json 失败: {}", e))?;
    let data: Value = serde_json::from_str(&content)
        .map_err(|e| format!("解析 metadata.json 失败: {}", e))?;
    if !data.is_object() {
        return Err(format!("metadata.json 顶层必须是对象: {}", path.display()));
    }
    Ok(data)
}

fn save_metadata(kb_root: &Path, data: &Value) -> Result<(), String> {
    let path = metadata_path(kb_root);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("创建目录失败: {}", e))?;
    }
    let content = serde_json::to_string_pretty(data)
        .map_err(|e| format!("序列化 metadata 失败: {}", e))?;
    std::fs::write(&path, content)
        .map_err(|e| format!("写入 metadata.json 失败: {}", e))
}

fn is_duplicate_by_fingerprint(metadata: &Value, sha256_hex: &str) -> bool {
    metadata
        .get("fingerprints")
        .and_then(|f| f.as_object())
        .map_or(false, |f| f.contains_key(sha256_hex))
}

// ═══════════════════════════════════════════════════════════════════════
// Helper: ID / path
// ═══════════════════════════════════════════════════════════════════════

fn material_dir(kb_root: &Path, m_id: &str) -> PathBuf {
    kb_root.join("raw").join(format!("m_{}", m_id))
}

// ═══════════════════════════════════════════════════════════════════════
// Helper: record.json
// ═══════════════════════════════════════════════════════════════════════

fn build_record(
    m_id: &str,
    input_path: &Path,
    sha256_hex: &str,
    status: &str,
    error: Option<&str>,
) -> Value {
    let mut record = json!({
        "m_id": m_id,
        "status": status,
        "created_at": now_iso(),
        "source": {
            "path": input_path.to_string_lossy(),
            "name": input_path.file_name().map(|n| n.to_string_lossy()).unwrap_or_default(),
            "size_bytes": std::fs::metadata(input_path).map(|m| m.len()).unwrap_or(0),
            "sha256": sha256_hex,
        }
    });
    if let Some(err) = error {
        record["error"] = json!(err);
    }
    record
}

fn save_record_json(m_dir: &Path, record: &Value) -> Result<PathBuf, String> {
    std::fs::create_dir_all(m_dir)
        .map_err(|e| format!("创建目录失败: {}", e))?;
    let record_path = m_dir.join("record.json");
    let content = serde_json::to_string_pretty(record)
        .map_err(|e| format!("序列化 record 失败: {}", e))?;
    std::fs::write(&record_path, content)
        .map_err(|e| format!("写入 record.json 失败: {}", e))?;
    Ok(record_path)
}

// ═══════════════════════════════════════════════════════════════════════
// Helper: metadata mutations
// ═══════════════════════════════════════════════════════════════════════

fn append_import_to_metadata(
    mut metadata: Value,
    m_id: &str,
    sha256_hex: &str,
    input_path: &Path,
) -> Value {
    // fingerprints
    if !metadata.get("fingerprints").and_then(|f| Some(f.is_object())).unwrap_or(false) {
        metadata["fingerprints"] = json!({});
    }
    metadata["fingerprints"][sha256_hex] = json!({
        "m_id": m_id,
        "imported_at": now_iso(),
        "source_name": input_path.file_name().map(|n| n.to_string_lossy()).unwrap_or_default(),
    });

    // imports list
    if !metadata.get("imports").and_then(|i| Some(i.is_array())).unwrap_or(false) {
        metadata["imports"] = json!([]);
    }
    metadata["imports"]
        .as_array_mut()
        .unwrap()
        .push(json!({
            "m_id": m_id,
            "status": "imported",
            "source_name": input_path.file_name().map(|n| n.to_string_lossy()).unwrap_or_default(),
            "sha256": sha256_hex,
            "timestamp": now_iso(),
        }));
    metadata["last_import_at"] = json!(now_iso());
    metadata
}

fn append_failure_to_metadata(
    mut metadata: Value,
    m_id: &str,
    sha256_hex: Option<&str>,
    error: &str,
    input_path: Option<&Path>,
) -> Value {
    if !metadata.get("imports").and_then(|i| Some(i.is_array())).unwrap_or(false) {
        metadata["imports"] = json!([]);
    }
    let mut payload = json!({
        "m_id": m_id,
        "status": "failed",
        "error": error,
        "timestamp": now_iso(),
    });
    if let Some(sha) = sha256_hex {
        payload["sha256"] = json!(sha);
    }
    if let Some(path) = input_path {
        if let Some(name) = path.file_name() {
            payload["source_name"] = json!(name.to_string_lossy());
        }
    }
    metadata["imports"].as_array_mut().unwrap().push(payload);
    metadata["last_failure_at"] = json!(now_iso());
    metadata
}

// ═══════════════════════════════════════════════════════════════════════
// Helper: view/nodes.json sync
// ═══════════════════════════════════════════════════════════════════════

fn sync_import_to_nodes(
    kb_root: &Path,
    m_id: &str,
    input_path: &Path,
    sha256_hex: &str,
) -> Result<(), String> {
    let nodes_path = kb_root.join("view").join("nodes.json");
    if let Some(parent) = nodes_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("创建目录失败: {}", e))?;
    }

    let mut data: Value = if nodes_path.exists() {
        let content = std::fs::read_to_string(&nodes_path)
            .map_err(|e| format!("读取 nodes.json 失败: {}", e))?;
        serde_json::from_str(&content).unwrap_or_else(|_| json!({
            "kb_id": kb_root.file_name().map(|n| n.to_string_lossy()).unwrap_or_default(),
            "version": 1,
            "nodes": []
        }))
    } else {
        json!({
            "kb_id": kb_root.file_name().map(|n| n.to_string_lossy()).unwrap_or_default(),
            "version": 1,
            "nodes": []
        })
    };

    if !data.is_object() {
        data = json!({
            "kb_id": kb_root.file_name().map(|n| n.to_string_lossy()).unwrap_or_default(),
            "version": 1,
            "nodes": []
        });
    }

    let nodes = data["nodes"].as_array_mut()
        .ok_or_else(|| "nodes 字段不是数组".to_string())?;

    // 幂等：已存在则跳过
    let existing_ids: Vec<&str> = nodes
        .iter()
        .filter_map(|n| n.get("record_id").and_then(|v| v.as_str()))
        .collect();
    if existing_ids.contains(&m_id) {
        return Ok(());
    }

    // 确保根文件夹存在
    let has_root = nodes
        .iter()
        .any(|n| n.get("id").and_then(|v| v.as_str()) == Some("fld_root"));
    if !has_root {
        let now = chrono::Utc::now()
            .format("%Y-%m-%dT%H:%M:%SZ")
            .to_string();
        nodes.insert(
            0,
            json!({
                "id": "fld_root",
                "node_type": "folder",
                "name": "Root",
                "parent_id": null,
                "created_at": now,
                "updated_at": now,
            }),
        );
    }

    let now = chrono::Utc::now()
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string();
    let file_name = input_path
        .file_name()
        .map(|n| n.to_string_lossy())
        .unwrap_or_default();
    let file_ext = input_path
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    let size_bytes = std::fs::metadata(input_path).map(|m| m.len()).unwrap_or(0);

    nodes.push(json!({
        "id": format!("rec_{}", m_id),
        "node_type": "record",
        "record_id": m_id,
        "name": file_name,
        "file_ext": file_ext,
        "size_bytes": size_bytes,
        "sha256": sha256_hex,
        "parent_id": "fld_root",
        "created_at": now,
        "updated_at": now,
    }));

    let content = serde_json::to_string_pretty(&data)
        .map_err(|e| format!("序列化 nodes.json 失败: {}", e))?;
    std::fs::write(&nodes_path, content)
        .map_err(|e| format!("写入 nodes.json 失败: {}", e))
}

// ═══════════════════════════════════════════════════════════════════════
// Helper: content_paths（B 版特有：记录文档读取路径）
// ═══════════════════════════════════════════════════════════════════════

fn content_paths(src: &Path, parsed: Option<&Value>) -> Value {
    if let Some(p) = parsed {
        if let Some(md_path) = p.get("markdown_path").and_then(|v| v.as_str()) {
            return json!({"parsed_path": md_path});
        }
    }
    json!({"source_path": src.to_string_lossy()})
}

// ═══════════════════════════════════════════════════════════════════════
// Parsers: PDF / DOCX / PPTX → markdown
// ═══════════════════════════════════════════════════════════════════════

const PDF_MIN_TOTAL_CHARS: usize = 50;
const PDF_MIN_CHARS_PER_PAGE: f64 = 20.0;

/// 尝试解析文档，返回 `{"markdown_path": "..."}` 或 None。
async fn extract_parsed_md(src: &Path, output_dir: &Path) -> Result<Option<Value>, String> {
    std::fs::create_dir_all(output_dir)
        .map_err(|e| format!("创建目录失败: {}", e))?;
    let md_path = output_dir.join("parsed.md");

    match src.extension().and_then(|e| e.to_str()).unwrap_or("") {
        "pdf" => {
            let (text, meta) = extract_pdf_with_fallback(src).await?;
            std::fs::write(&md_path, &text)
                .map_err(|e| format!("写入 parsed.md 失败: {}", e))?;
            let mut parsed = json!({"markdown_path": md_path.to_string_lossy(), "parser": "pdf_extract"});
            if let Some(obj) = meta.as_object() {
                for (k, v) in obj {
                    parsed[k] = v.clone();
                }
            }
            Ok(Some(parsed))
        }
        "docx" => {
            let text = extract_docx_text(src)?;
            std::fs::write(&md_path, &text)
                .map_err(|e| format!("写入 parsed.md 失败: {}", e))?;
            Ok(Some(json!({"markdown_path": md_path.to_string_lossy()})))
        }
        "pptx" => {
            let text = extract_pptx_text(src)?;
            std::fs::write(&md_path, &text)
                .map_err(|e| format!("写入 parsed.md 失败: {}", e))?;
            Ok(Some(json!({"markdown_path": md_path.to_string_lossy()})))
        }
        _ => Ok(None), // md / txt 等无需解析
    }
}

/// 本地抽取 PDF；文本不足时 fallback 到 MinerU OCR。
async fn extract_pdf_with_fallback(src: &Path) -> Result<(String, Value), String> {
    let text = extract_pdf_text(src)?;
    let page_count = pdf_page_count(src).unwrap_or(0);

    if !is_pdf_text_insufficient(&text, page_count) {
        return Ok((text, json!({})));
    }

    let fallback_reason = format_pdf_insufficient_reason(&text, page_count);
    let config = MinerUConfig::from_config().map_err(|e| {
        format!(
            "PDF 文本不足（{}），需要 MinerU OCR，但 {}",
            fallback_reason, e
        )
    })?;

    let md = mineru::parse_pdf(src, &config)
        .await
        .map_err(|e| format!("MinerU OCR 失败: {}", e))?;

    Ok((
        md,
        json!({
            "parser": "mineru_vlm_ocr",
            "fallback_reason": fallback_reason,
        }),
    ))
}

fn is_pdf_text_insufficient(text: &str, page_count: u32) -> bool {
    let trimmed = text.trim();
    let len = trimmed.chars().count();

    if trimmed.is_empty() {
        return true;
    }
    if len < PDF_MIN_TOTAL_CHARS {
        return true;
    }
    if page_count > 0 {
        let chars_per_page = len as f64 / page_count as f64;
        if chars_per_page < PDF_MIN_CHARS_PER_PAGE {
            return true;
        }
    }
    false
}

fn format_pdf_insufficient_reason(text: &str, page_count: u32) -> String {
    let len = text.trim().chars().count();
    if page_count > 0 {
        let chars_per_page = len as f64 / page_count as f64;
        format!(
            "insufficient_text: {} chars / {} pages ({:.1} chars/page)",
            len, page_count, chars_per_page
        )
    } else {
        format!("insufficient_text: {} chars", len)
    }
}

fn pdf_page_count(path: &Path) -> Result<u32, String> {
    let doc = lopdf::Document::load(path).map_err(|e| format!("读取 PDF 页数失败: {}", e))?;
    Ok(doc.get_pages().len() as u32)
}

/// 提取 PDF 文本内容。
fn extract_pdf_text(path: &Path) -> Result<String, String> {
    pdf_extract::extract_text(path)
        .map_err(|e| format!("PDF 解析失败: {}", e))
}

/// 提取 DOCX 文本内容（解压 → 解析 word/document.xml 中的 <w:t> 元素）。
fn extract_docx_text(path: &Path) -> Result<String, String> {
    use std::io::BufReader;

    use quick_xml::events::Event;
    use quick_xml::Reader;
    use zip::ZipArchive;

    let file = std::fs::File::open(path)
        .map_err(|e| format!("无法打开 DOCX: {}", e))?;
    let mut archive =
        ZipArchive::new(file).map_err(|e| format!("无法解压 DOCX: {}", e))?;
    let entry = archive
        .by_name("word/document.xml")
        .map_err(|_| "DOCX 中找不到 word/document.xml".to_string())?;

    let mut reader = Reader::from_reader(BufReader::new(entry));
    reader.config_mut().trim_text(true);

    let mut text = String::new();
    let mut in_text = false;
    let mut buf = Vec::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                if e.local_name().as_ref() == b"t" {
                    in_text = true;
                }
            }
            Ok(Event::End(ref e)) => {
                match e.local_name().as_ref() {
                    b"t" => in_text = false,
                    b"p" => text.push('\n'),
                    _ => {}
                }
            }
            Ok(Event::Text(ref e)) => {
                if in_text {
                    if let Ok(t) = e.unescape() {
                        text.push_str(&t);
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("解析 DOCX XML 失败: {}", e)),
            _ => {}
        }
        buf.clear();
    }

    Ok(text.trim().to_string())
}

/// 提取 PPTX 文本内容（解压 → 遍历 ppt/slides/slide*.xml 中的 <a:t> 元素）。
fn extract_pptx_text(path: &Path) -> Result<String, String> {
    use std::io::BufReader;

    use quick_xml::events::Event;
    use quick_xml::Reader;
    use zip::ZipArchive;

    let file = std::fs::File::open(path)
        .map_err(|e| format!("无法打开 PPTX: {}", e))?;
    let mut archive =
        ZipArchive::new(file).map_err(|e| format!("无法解压 PPTX: {}", e))?;

    let slide_indices: Vec<usize> = (0..archive.len())
        .filter(|i| {
            archive
                .by_index(*i)
                .ok()
                .map(|e| e.name().to_string().starts_with("ppt/slides/slide"))
                .unwrap_or(false)
        })
        .collect();

    let mut all_text = String::new();

    for idx in slide_indices {
        let entry = archive
            .by_index(idx)
            .map_err(|e| format!("读取 PPTX slide 失败: {}", e))?;

        let slide_name = entry.name().to_string();

        let mut reader = Reader::from_reader(BufReader::new(entry));
        reader.config_mut().trim_text(true);

        let mut slide_text = String::new();
        let mut in_text = false;
        let mut buf = Vec::new();

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) => {
                    if e.local_name().as_ref() == b"t" {
                        in_text = true;
                    }
                }
                Ok(Event::End(ref e)) => {
                    match e.local_name().as_ref() {
                        b"t" => in_text = false,
                        b"p" => slide_text.push('\n'),
                        _ => {}
                    }
                }
                Ok(Event::Text(ref e)) => {
                    if in_text {
                        if let Ok(t) = e.unescape() {
                            slide_text.push_str(&t);
                        }
                    }
                }
                Ok(Event::Eof) => break,
                Err(e) => return Err(format!("解析 PPTX XML ({}) 失败: {}", slide_name, e)),
                _ => {}
            }
            buf.clear();
        }

        let slide_text = slide_text.trim();
        if !slide_text.is_empty() {
            let slide_num = slide_name
                .trim_start_matches("ppt/slides/slide")
                .trim_end_matches(".xml");
            all_text.push_str(&format!("## Slide {}\n{}\n\n", slide_num, slide_text));
        }
    }

    Ok(all_text.trim().to_string())
}

// ═══════════════════════════════════════════════════════════════════════
// Critical import path (等价 Python try 块)
// ═══════════════════════════════════════════════════════════════════════

/// 执行解析 → 写 record → 写 metadata 的核心流程。
/// 成功返回 (record_path, parsed)，失败返回 (error_message, metadata_for_failure)。
async fn try_critical_import(
    src: &Path,
    m_dir: &Path,
    kb: &Path,
    m_id: &str,
    sha256_hex: &str,
    metadata: Value,
) -> Result<(PathBuf, Option<Value>), (String, Value)> {
    let parsed = match extract_parsed_md(src, m_dir).await {
        Ok(p) => p,
        Err(e) => return Err((e, metadata)),
    };

    let mut record = build_record(m_id, src, sha256_hex, "imported", None);
    if let Some(ref p) = parsed {
        record["parsed"] = p.clone();
    }
    if let Some(cp) = content_paths(src, parsed.as_ref()).as_object() {
        for (k, v) in cp {
            record[k.as_str()] = v.clone();
        }
    }
    let record_path = match save_record_json(m_dir, &record) {
        Ok(p) => p,
        Err(e) => return Err((e, metadata)),
    };

    let updated_meta = append_import_to_metadata(metadata, m_id, sha256_hex, src);
    if let Err(e) = save_metadata(kb, &updated_meta) {
        return Err((e, updated_meta));
    }

    // Sync to nodes.json (non-critical)
    let _ = sync_import_to_nodes(kb, m_id, src, sha256_hex);

    Ok((record_path, parsed))
}

// ═══════════════════════════════════════════════════════════════════════
// Single file import
// ═══════════════════════════════════════════════════════════════════════

async fn import_single_file(src_path: &Path, kb_root: &Path) -> Value {
    let src = match src_path.canonicalize() {
        Ok(p) => p,
        Err(e) => {
            return json!({
                "ok": false,
                "status": "failed",
                "file_name": src_path.file_name().map(|n| n.to_string_lossy()).unwrap_or_default(),
                "error": format!("无法解析路径: {}", e),
            });
        }
    };
    let kb = match kb_root.canonicalize() {
        Ok(p) => p,
        Err(_) => kb_root.to_path_buf(),
    };

    // Validate
    if let Err(e) = validate_source_file(&src) {
        return json!({
            "ok": false,
            "status": "failed",
            "file_name": src.file_name().map(|n| n.to_string_lossy()).unwrap_or_default(),
            "error": e,
        });
    }

    // Fingerprint
    let sha256_hex = match fingerprint_sha256(&src) {
        Ok(h) => h,
        Err(e) => {
            return json!({
                "ok": false,
                "status": "failed",
                "file_name": src.file_name().map(|n| n.to_string_lossy()).unwrap_or_default(),
                "error": e,
            });
        }
    };

    // Metadata
    let metadata = match load_metadata(&kb) {
        Ok(m) => m,
        Err(e) => {
            return json!({
                "ok": false,
                "status": "failed",
                "file_name": src.file_name().map(|n| n.to_string_lossy()).unwrap_or_default(),
                "error": e,
            });
        }
    };

    // Duplicate check
    if is_duplicate_by_fingerprint(&metadata, &sha256_hex) {
        return json!({
            "ok": true,
            "status": "duplicate",
            "reason": "file_already_imported",
            "sha256": sha256_hex,
            "input_file": src.to_string_lossy(),
            "file_name": src.file_name().map(|n| n.to_string_lossy()).unwrap_or_default(),
            "kb_root": kb.to_string_lossy(),
        });
    }

    let m_id = crate::core::ids::new_uuid();
    let m_dir = material_dir(&kb, &m_id);

    // Write intermediate "parsing" record (matching Python behavior)
    let needs_parsing = src
        .extension()
        .and_then(|e| e.to_str())
        .map_or(false, |e| matches!(e, "pdf" | "docx" | "pptx"));
    if needs_parsing {
        let parsing_record = build_record(&m_id, &src, &sha256_hex, "parsing", None);
        let _ = save_record_json(&m_dir, &parsing_record);
    }

    // ── 单点 try/except 等价逻辑 ──────────────────────────────────
    match try_critical_import(&src, &m_dir, &kb, &m_id, &sha256_hex, metadata).await {
        Ok((record_path, parsed)) => {
            // 成功：构建返回值
            let mut result = json!({
                "ok": true,
                "status": "imported",
                "m_id": m_id,
                "file_name": src.file_name().map(|n| n.to_string_lossy()).unwrap_or_default(),
                "record_path": record_path.to_string_lossy(),
                "sha256": sha256_hex,
                "kb_root": kb.to_string_lossy(),
            });
            if let Some(cp) = content_paths(&src, parsed.as_ref()).as_object() {
                for (k, v) in cp {
                    result[k.as_str()] = v.clone();
                }
            }
            if let Some(ref p) = parsed {
                result["parsed"] = p.clone();
            }
            result
        }
        Err((error_msg, meta_for_failure)) => {
            // 失败：写 failed record + failure metadata（等价 Python except 块）
            let rec = build_record(&m_id, &src, &sha256_hex, "failed", Some(&error_msg));
            let _ = save_record_json(&m_dir, &rec);
            let meta = append_failure_to_metadata(
                meta_for_failure, &m_id, Some(&sha256_hex), &error_msg, Some(&src),
            );
            let _ = save_metadata(&kb, &meta);
            json!({
                "ok": false,
                "status": "failed",
                "m_id": m_id,
                "file_name": src.file_name().map(|n| n.to_string_lossy()).unwrap_or_default(),
                "sha256": sha256_hex,
                "error": error_msg,
                "kb_root": kb.to_string_lossy(),
            })
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Tool trait implementation
// ═══════════════════════════════════════════════════════════════════════

#[async_trait]
impl Tool for ImportKnowledgeTool {
    fn name(&self) -> &str {
        "import_knowledge"
    }

    fn description(&self) -> &str {
        "将文件批量导入到指定知识库中。支持 PDF、DOCX、PPTX、MD、TXT 等格式。\
         PDF/DOCX/PPTX 会自动解析为 Markdown 文本。\
         自动基于 SHA256 指纹去重，避免重复导入同一文件。\
         会同步更新 knowledge_base 目录下的 metadata.json 和 view/nodes.json \
         供前端知识库面板展示。"
    }

    fn parameters(&self) -> &Value {
        &IMPORT_KNOWLEDGE_PARAMS
    }

    fn read_only(&self) -> bool {
        false
    }

    async fn execute(&self, params: Value) -> Result<String, String> {
        // ── 1. 解析参数 ────────────────────────────────────────
        let database_name = params
            .get("database_name")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Error: missing required parameter 'database_name'".to_string())?;

        let file_paths = params
            .get("file_paths")
            .and_then(|v| v.as_array())
            .ok_or_else(|| "Error: missing required parameter 'file_paths'".to_string())?;

        // ── 2. 查找知识库 ──────────────────────────────────────
        let databases = list_knowledge_bases(&self.agent_id);
        let kb = databases
            .iter()
            .find(|db| db.get("name").and_then(|n| n.as_str()) == Some(database_name))
            .ok_or_else(|| {
                let available: Vec<&str> = databases
                    .iter()
                    .filter_map(|db| db.get("name").and_then(|n| n.as_str()))
                    .collect();
                format!(
                    "知识库「{}」未找到。可用知识库：{:?}",
                    database_name, available
                )
            })?;

        let kb_id = kb
            .get("id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Error: KB record missing 'id'".to_string())?;
        let kb_root = get_agent_local_data_dir(&self.agent_id).join(kb_id);

        // ── 3. 逐个导入文件 ────────────────────────────────────
        let mut results: Vec<Value> = Vec::new();
        for file_path_val in file_paths {
            let file_path_str = file_path_val.as_str().unwrap_or("");
            let src = if Path::new(file_path_str).is_absolute() {
                PathBuf::from(file_path_str)
            } else {
                Path::new(&self.workspace).join(file_path_str)
            };
            let result = import_single_file(&src, &kb_root).await;
            results.push(result);
        }

        // ── 4. 汇总 ────────────────────────────────────────────
        let total = results.len();
        let imported = results
            .iter()
            .filter(|r| r.get("status").and_then(|v| v.as_str()) == Some("imported"))
            .count();
        let duplicates = results
            .iter()
            .filter(|r| r.get("status").and_then(|v| v.as_str()) == Some("duplicate"))
            .count();
        let failed = results
            .iter()
            .filter(|r| r.get("status").and_then(|v| v.as_str()) == Some("failed"))
            .count();

        let mut summary_lines = vec![format!(
            "导入知识库「{}」完成，共处理 {} 个文件",
            database_name, total
        )];
        if imported > 0 {
            summary_lines.push(format!("  ✅ 成功导入：{}", imported));
        }
        if duplicates > 0 {
            summary_lines.push(format!("  ⏭️  重复跳过：{}", duplicates));
        }
        if failed > 0 {
            summary_lines.push(format!("  ❌ 导入失败：{}", failed));
        }
        summary_lines.push(String::new());

        for r in &results {
            let fname = r
                .get("file_name")
                .and_then(|v| v.as_str())
                .unwrap_or("?");
            let st = r.get("status").and_then(|v| v.as_str()).unwrap_or("?");
            match st {
                "imported" => {
                    let cp = r
                        .get("parsed_path")
                        .or_else(|| r.get("source_path"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    summary_lines.push(format!("  ✅ {} → {}", fname, cp));
                }
                "duplicate" => {
                    summary_lines.push(format!("  ⏭️  {}（重复，已跳过）", fname));
                }
                "failed" => {
                    let err = r.get("error").and_then(|v| v.as_str()).unwrap_or("未知错误");
                    summary_lines.push(format!("  ❌ {}：{}", fname, err));
                }
                _ => {}
            }
        }

        let all_ok = results.iter().all(|r| r.get("ok").and_then(|v| v.as_bool()).unwrap_or(false));

        let output = json!({
            "ok": all_ok,
            "database_name": database_name,
            "kb_id": kb_id,
            "summary": {
                "total": total,
                "imported": imported,
                "duplicate": duplicates,
                "failed": failed,
            },
            "results": results,
            "text": summary_lines.join("\n"),
        });

        serde_json::to_string_pretty(&output)
            .map_err(|e| format!("Error: 序列化结果失败: {}", e))
    }
}
