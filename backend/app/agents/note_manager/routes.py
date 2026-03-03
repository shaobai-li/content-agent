"""
笔记管理 Agent 的额外路由
提供笔记记录的查询功能
"""
from fastapi import APIRouter
from app.agents.knowledge_base.knowledge_base_service import get_all_records

router = APIRouter()


@router.get("/records")
async def get_records():
    """获取笔记管理记录"""
    records = get_all_records("nm")
    return {"records": records}
