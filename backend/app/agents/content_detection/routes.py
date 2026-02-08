from fastapi import APIRouter
from pydantic import BaseModel
from app.service.sessions_service import load_sessions_list

router = APIRouter()

class ChatRequest(BaseModel):
    content: str
    agent_id: str = "c"

@router.get("/sessions")
async def get_sessions():
    """获取内容检测会话列表（历史聊天）"""
    return load_sessions_list("c")

@router.post("/chat")
async def chat(request: ChatRequest):
    """内容检测 Agent 聊天接口"""
    # TODO: 实现内容检测 agent 逻辑
    return {"reply": f"内容检测 Agent 收到消息: {request.content}"}