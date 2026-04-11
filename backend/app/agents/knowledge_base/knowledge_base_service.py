from typing import Dict, Any
from pathlib import Path
import json
from datetime import datetime, timezone

from app.core.config import get_agent_knowledge_base_path, get_agent_base_dir
from app.service.file_service import FileInfo
from .parsers import get_parser


def _utc_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _root_folder_node() -> Dict[str, Any]:
    now = _utc_iso()
    return {
        "id": "fld_root",
        "node_type": "folder",
        "name": "Root",
        "parent_id": None,
        "created_at": now,
        "updated_at": now,
    }


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
    except Exception:
        return None


def save_to_knowledge_base(file_info: FileInfo, agent_id: str = "kb"):
    """将文件信息追加为 nodes.json 中的 record 节点"""
    kb_path = get_agent_knowledge_base_path(agent_id)
    kb_path.parent.mkdir(parents=True, exist_ok=True)

    if kb_path.exists():
        with open(kb_path, "r", encoding="utf-8") as f:
            doc = json.load(f)
        if not isinstance(doc, dict):
            doc = {"kb_id": "kb_auto_generated", "version": 1, "nodes": []}
    else:
        doc = {"kb_id": "kb_auto_generated", "version": 1, "nodes": []}

    nodes = doc.setdefault("nodes", [])
    if not any(isinstance(n, dict) and n.get("id") == "fld_root" for n in nodes):
        nodes.insert(0, _root_folder_node())

    rid = file_info.record_id
    ext = Path(file_info.filename).suffix.lstrip(".").lower() or "unknown"
    now = _utc_iso()
    node = {
        "id": f"rec_{rid}",
        "node_type": "record",
        "record_id": rid,
        "name": file_info.filename,
        "parent_id": "fld_root",
        "file_ext": ext,
        "size_bytes": file_info.size,
        "status": "ready",
        "created_at": now,
        "updated_at": now,
        "cached_path": str(file_info.cached_path),
        "parsed_path": file_info.parsed_path,
        "content_type": file_info.content_type,
    }
    nodes.append(node)

    with open(kb_path, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
