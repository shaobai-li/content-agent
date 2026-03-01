from typing import List, Dict, Any
from pathlib import Path
import json

from app.core.config import get_agent_knowledge_base_path, get_agent_base_dir
from app.service.file_service import FileInfo
from .parsers import get_parser


async def process_and_parse(file_path: Path, filename: str, content_type: str) -> str:
    """
    处理附件：对支持的文档格式进行解析
    - PDF/DOCX/PPTX: 解析为Markdown
    - 其他格式: 仅保存
    """
    parser = get_parser(content_type)
    
    if not parser:
        return f"文件 {filename} 已保存（不支持解析该格式）"
    
    try:
        output_dir = get_agent_base_dir("kb") / "parsed"
        md_path = await parser.parse(file_path, output_dir)
        return f"文件 {filename} 已解析为 Markdown: {md_path.name}"
    except Exception as e:
        return f"文件 {filename} 解析失败: {str(e)}"


def save_to_knowledge_base(file_info: FileInfo, agent_id: str = "kb"):
    """将文件信息追加到知识库 jsonl 文件"""
    kb_path = get_agent_knowledge_base_path(agent_id)
    kb_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(kb_path, "a", encoding="utf-8") as f:
        f.write("\n")
        json.dump(file_info.to_kb_format(), f, ensure_ascii=False)


def get_all_records(agent_id: str = "kb") -> List[Dict[str, Any]]:
    """获取知识库所有记录"""
    records = []
    kb_path = get_agent_knowledge_base_path(agent_id)
    if kb_path.exists():
        with open(kb_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    records.append(json.loads(line))
    return records


def delete_record(record_id: str, agent_id: str = "kb") -> Dict[str, Any]:
    """根据 record_id 删除知识库记录"""
    kb_path = get_agent_knowledge_base_path(agent_id)
    if not kb_path.exists():
        return {"success": False, "message": "知识库文件不存在"}

    remaining = []
    found = False
    with open(kb_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            record = json.loads(line)
            if record.get("record_id") == record_id:
                found = True
            else:
                remaining.append(record)

    if not found:
        return {"success": False, "message": f"记录 {record_id} 不存在"}

    with open(kb_path, "w", encoding="utf-8") as f:
        for record in remaining:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

    return {"success": True, "message": f"记录 {record_id} 已删除"}
