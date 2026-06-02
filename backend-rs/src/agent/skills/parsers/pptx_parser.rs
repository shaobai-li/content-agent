use std::collections::HashMap;
use std::path::Path;

use super::{DocumentParser, ParsedDocument};

/// PPTX 解析器（基础版）
pub struct PptxParser;

impl DocumentParser for PptxParser {
    fn can_parse(&self, extension: &str) -> bool {
        extension == "pptx"
    }

    fn parse(&self, _file_path: &Path) -> Result<ParsedDocument, String> {
        // 基础版：需要 zip + quick-xml crate 来解析 OOXML
        // TODO: 使用 zip crate 解压，quick-xml 解析 ppt/slides/slide*.xml
        Err("PPTX parsing requires zip and quick-xml crates. Not yet implemented.".to_string())
    }
}
