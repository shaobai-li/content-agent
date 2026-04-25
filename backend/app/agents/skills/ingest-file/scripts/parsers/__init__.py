from __future__ import annotations

from pathlib import Path

from .base import DocumentParser
from .docx_parser import DocxParser
from .pdf_parser import PdfParser
from .pptx_parser import PptxParser

_PARSER_BY_SUFFIX: dict[str, type[DocumentParser]] = {
    ".docx": DocxParser,
    ".pdf": PdfParser,
    ".pptx": PptxParser,
}


def get_parser_for_suffix(suffix: str) -> DocumentParser | None:
    parser_cls = _PARSER_BY_SUFFIX.get(suffix.lower())
    if not parser_cls:
        return None
    return parser_cls()


def get_parser_for_path(path: Path) -> DocumentParser | None:
    return get_parser_for_suffix(path.suffix)
