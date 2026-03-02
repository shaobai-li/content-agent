from fastapi import APIRouter, Form
from typing import Optional
from app.service.sessions_service import load_sessions_list
from app.service.chat_service import build_chat_response
from .agent import agent

router = APIRouter()


@router.post("/chat")
async def chat(
    text: Optional[str] = Form(None),
    agent_id: str = Form("w")
):
    reply = agent.chat(text or "")
    return build_chat_response(reply=reply, received={"text": text})


@router.get("/sessions")
async def get_sessions():
    return load_sessions_list("w")
