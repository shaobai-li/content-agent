from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

class ChatRequest(BaseModel):
    content: str
    agent_id: str = "w"

@router.post("/chat")
async def chat(request: ChatRequest):
    """写作助手 Agent 聊天接口"""
    # TODO: 实现写作助手 agent 逻辑
    return {"reply": f"写作助手 Agent 收到消息: {request.content}"}

