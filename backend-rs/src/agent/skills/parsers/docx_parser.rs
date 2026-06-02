use std::collections::HashMap;
use std::path::Path;

use super::{DocumentParser, ParsedDocument};

/// DOCX 解析器（基础版）
pub struct DocxParser;

impl DocumentParser for DocxParser {
    fn can_parse(&self, extension: &str) -> bool {
        extension == "docx"
    }

    fn parse(&self, _file_path: &Path) -> Result<ParsedDocument, String> {
        // 基础版：需要 zip + quick-xml crate 来解析 OOXML
        // TODO: 使用 zip crate 解压，quick-xml 解析 word/document.xml
        Err("DOCX parsing requires zip and quick-xml crates. Not yet implemented.".to_string())
    }
}
