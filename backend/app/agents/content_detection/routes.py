from fastapi import APIRouter, Form
from typing import Optional
from app.service.sessions_service import load_sessions_list
from app.service.chat_service import build_chat_response

router = APIRouter()

@router.get("/sessions")
async def get_sessions():
    """获取内容检测会话列表（历史聊天）"""
    return load_sessions_list("c")

@router.post("/chat")
async def chat(
    text: Optional[str] = Form(None),
    agent_id: str = Form("c")
):
    reply = f"内容检测 Agent 收到消息: {text}"
    
    return build_chat_response(
        reply=reply
    )