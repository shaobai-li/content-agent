from fastapi import APIRouter, Form
from typing import Optional
from app.service.sessions_service import load_sessions_list
from app.service.chat_service import build_chat_response, deepseek_chat

router = APIRouter()

SYSTEM_PROMPT = """你是一个专业的写作助手。你可以帮助用户进行文章写作、润色、改写、续写等。请用中文回复，保持友好和专业的语气。"""

@router.post("/chat")
async def chat(
    text: Optional[str] = Form(None),
    agent_id: str = Form("w")
):
    reply = deepseek_chat(
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": text or ""}
        ],
    )
    
    return build_chat_response(
        reply=reply,
        received={"text": text}
    )


@router.get("/sessions")
async def get_sessions():
    return load_sessions_list("w")