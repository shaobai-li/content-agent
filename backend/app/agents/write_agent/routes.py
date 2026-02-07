from fastapi import APIRouter
from pydantic import BaseModel
from app.service.sessions_service import load_sessions_list

router = APIRouter()

class ChatRequest(BaseModel):
    content: str
    agent_id: str = "w"

@router.post("/chat")
async def chat(request: ChatRequest):
    # TODO: 实现写作助手 agent 逻辑
    return {"reply": f"写作助手 Agent 收到消息: {request.content}"}

@router.get("/sessions")
async def get_sessions():
    return load_sessions_list("w")