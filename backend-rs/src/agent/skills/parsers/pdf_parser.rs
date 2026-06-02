use std::collections::HashMap;
use std::path::Path;

use super::{DocumentParser, ParsedDocument};

/// Text/Markdown 文件解析
pub struct TextParser;

impl DocumentParser for TextParser {
    fn can_parse(&self, extension: &str) -> bool {
        matches!(extension, "md" | "markdown" | "txt")
    }

    fn parse(&self, file_path: &Path) -> Result<ParsedDocument, String> {
        let content = std::fs::read_to_string(file_path)
            .map_err(|e| format!("Failed to read file: {e}"))?;
        let title = crate::service::article_parser::extract_title(&content);
        let mut metadata = HashMap::new();
        metadata.insert("format".to_string(), "text".to_string());
        Ok(ParsedDocument {
            title,
            content,
            metadata,
        })
    }
}

/// PDF 解析器（基础版：直接文本提取）
pub struct PdfParser;

impl DocumentParser for PdfParser {
    fn can_parse(&self, extension: &str) -> bool {
        extension == "pdf"
    }

    fn parse(&self, _file_path: &Path) -> Result<ParsedDocument, String> {
        // 基础版：仅返回提示信息
        // 后续可使用 pdf-extract 或 lopdf crate 增强
        Err("PDF parsing requires pdf-extract crate. Basic text extraction not yet implemented.".to_string())
    }
}
