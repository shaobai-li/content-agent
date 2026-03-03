"""
知识库 Agent 的额外路由
提供知识库记录的查询和删除功能
"""
from fastapi import APIRouter
from app.service.records_service import get_all_records, delete_record

router = APIRouter()


@router.get("/records")
async def get_records():
    """获取所有知识库记录"""
    records = get_all_records("kb")
    return {"records": records}


@router.delete("/records/{record_id}")
async def delete_record(record_id: str):
    """删除指定的知识库记录"""
    return delete_record(record_id, "kb")
