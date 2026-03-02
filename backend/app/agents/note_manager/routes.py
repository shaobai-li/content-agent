"""
笔记管理 Agent 的额外路由
提供笔记记录的查询功能
"""
from fastapi import APIRouter
from app.core.config import DATA_DIR
import json

router = APIRouter()


@router.get("/records")
async def get_records():
    """获取笔记管理记录"""
    records = []
    records_path = DATA_DIR / "records.jsonl"
    if records_path.exists():
        with open(records_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    records.append(json.loads(line))
    return {"records": records}
