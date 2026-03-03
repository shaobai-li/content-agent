from typing import List, Dict, Any
from pathlib import Path
import json

from app.core.config import get_agent_knowledge_base_path, get_agent_base_dir
from app.service.file_service import FileInfo
from app.service.records_service import get_all_records, delete_record
from .parsers import get_parser


async def process_and_parse(file_path: Path, filename: str, content_type: str, agent_id: str) -> str:
    """
    处理附件：对支持的文档格式进行解析
    - PDF/DOCX/PPTX: 解析为Markdown
    - 其他格式: 仅保存
    
    返回解析后的 MD 文件路径（字符串），如果不支持解析则返回 None
    """
    parser = get_parser(content_type)
    
    if not parser:
        return None
    
    try:
        output_dir = get_agent_base_dir(agent_id) / "parsed"
        md_path = await parser.parse(file_path, output_dir)
        return str(md_path)
    except Exception as e:
        return None


def save_to_knowledge_base(file_info: FileInfo, agent_id: str = "kb"):
    """将文件信息追加到知识库 jsonl 文件"""
    kb_path = get_agent_knowledge_base_path(agent_id)
    kb_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(kb_path, "a", encoding="utf-8") as f:
        f.write("\n")
        json.dump(file_info.to_kb_format(), f, ensure_ascii=False)
