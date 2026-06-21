"""知识库相关 API 路由。"""
from pathlib import Path

from fastapi import APIRouter
from loguru import logger

from app.core.config import get_agent_local_data_dir

router = APIRouter(prefix="/api/agents/{agent_id}", tags=["knowledge-base"])


@router.get("/kb/{kb_id}/records/{record_id}/content")
async def get_record_content(agent_id: str, kb_id: str, record_id: str):
    """获取知识库中指定记录的文件内容。

    先读取 record.json 获取 parsed_path 或 source_path，
    然后读取对应文件内容返回。
    """
    kb_root = get_agent_local_data_dir(agent_id) / kb_id
    raw_dir = kb_root / "raw" / f"m_{record_id}"

    if not raw_dir.is_dir():
        logger.warning("record raw dir not found: agent={} kb={} record={}", agent_id, kb_id, record_id)
        return {"error": "记录不存在", "record_id": record_id}, 404

    # 读取 record.json
    record_path = raw_dir / "record.json"
    if not record_path.exists():
        logger.warning("record.json not found: {}", record_path)
        return {"error": "记录数据不存在", "record_id": record_id}, 404

    try:
        import json
        record = json.loads(record_path.read_text(encoding="utf-8"))
    except Exception as e:
        logger.error("读取 record.json 失败: {}", e)
        return {"error": "读取记录数据失败", "record_id": record_id}, 500

    if not isinstance(record, dict):
        return {"error": "记录数据格式错误", "record_id": record_id}, 500

    # 确定要读取的文件路径：parsed_path 优先，其次 source_path
    content_path_str = record.get("parsed_path") or record.get("source_path") or ""
    if not content_path_str:
        return {"error": "记录缺少文件路径", "record_id": record_id}, 404

    content_path = Path(content_path_str)
    if not content_path.is_absolute():
        content_path = (kb_root / content_path_str).resolve()

    if not content_path.exists():
        logger.warning("content file not found: {}", content_path)
        return {"error": "文件不存在", "record_id": record_id}, 404

    try:
        content = content_path.read_text(encoding="utf-8")
    except Exception as e:
        logger.error("读取文件内容失败: {}", e)
        return {"error": "读取文件内容失败", "record_id": record_id}, 500

    file_name = record.get("source", {}).get("name", content_path.name)
    has_parsed = bool(record.get("parsed_path"))

    return {
        "record_id": record_id,
        "file_name": file_name,
        "content": content,
        "content_type": "parsed" if has_parsed else "source",
    }
