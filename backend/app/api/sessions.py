from fastapi import APIRouter, Query
from typing import Optional

from app.service.sessions_service import load_chats_list

router = APIRouter()


@router.get("/chats")
async def get_chats(agent_id: str = Query("w", description="Agent ID (w, nm, kb, c)")):
    """
    获取指定 Agent 的聊天列表
    
    Args:
        agent_id: Agent ID，默认为 "w" (写作助手)
    
    Returns:
        聊天列表，每项含 chat_id, title, content（仅展示历史记录，content 为空）
    """
    return load_chats_list(agent_id)
