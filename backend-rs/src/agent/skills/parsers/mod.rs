use std::collections::HashMap;
use std::path::Path;

pub mod pdf_parser;
pub mod docx_parser;
pub mod pptx_parser;

/// 统一的文档解析接口
pub trait DocumentParser: Send + Sync {
    fn can_parse(&self, extension: &str) -> bool;
    fn parse(&self, file_path: &Path) -> Result<ParsedDocument, String>;
}

#[derive(Debug)]
pub struct ParsedDocument {
    pub title: Option<String>,
    pub content: String,
    pub metadata: HashMap<String, String>,
}

/// 根据文件扩展名选择解析器
pub fn select_parser(extension: &str) -> Option<Box<dyn DocumentParser>> {
    match extension {
        "md" | "markdown" | "txt" => Some(Box::new(pdf_parser::TextParser)), // fallback: text
        "pdf" => Some(Box::new(pdf_parser::PdfParser)),
        "docx" => Some(Box::new(docx_parser::DocxParser)),
        "pptx" => Some(Box::new(pptx_parser::PptxParser)),
        _ => None,
    }
}

/// 解析文件内容
pub fn parse_file(file_path: &Path) -> Result<ParsedDocument, String> {
    let ext = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let parser = select_parser(&ext)
        .ok_or_else(|| format!("Unsupported file format: .{ext}"))?;
    parser.parse(file_path)
}
