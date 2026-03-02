from fastapi import APIRouter, Form
from typing import Optional
from app.service.sessions_service import save_session_if_new
from app.service.messages_service import load_messages, save_message
from app.service.chat_service import deepseek_chat, build_chat_response
from .agent import agent

router = APIRouter()


@router.post("/chat")
async def chat(
    text: Optional[str] = Form(None),
    agent_id: str = Form("w"),
    session_id: Optional[str] = Form(None)
):
    history = load_messages("w", session_id) if session_id else []

    messages = [{"role": "system", "content": agent.system_prompt}]
    messages.extend(history)
    if text:
        messages.append({"role": "user", "content": text})

    reply = deepseek_chat(messages=messages)

    if session_id and text:
        save_session_if_new("w", session_id, text)
        save_message("w", session_id, "user", text)
        save_message("w", session_id, "assistant", reply)

    return build_chat_response(reply=reply, received={"text": text})
