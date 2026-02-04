from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

class ChatRequest(BaseModel):
    content: str
    agent_id: str = "c"

@router.post("/chat")
async def chat(request: ChatRequest):
    """内容检测 Agent 聊天接口"""
    # TODO: 实现内容检测 agent 逻辑
    return {"reply": f"内容检测 Agent 收到消息: {request.content}"}

