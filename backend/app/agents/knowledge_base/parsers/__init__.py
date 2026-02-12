from typing import Optional
from .pdf_parser import PDFParser
from .docx_parser import DocxParser
from .pptx_parser import PptxParser
from .base import DocumentParser

def get_parser(content_type: str) -> Optional[DocumentParser]:
    mapping = {
        "application/pdf": PDFParser(),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": DocxParser(),
        "application/vnd.openxmlformats-officedocument.presentationml.presentation": PptxParser(),
    }
    return mapping.get(content_type)