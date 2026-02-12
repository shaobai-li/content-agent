from fastapi import APIRouter, Form
from typing import Optional
from openai import OpenAI
import os
from app.service.sessions_service import load_sessions_list
from app.service.chat_service import build_chat_response

router = APIRouter()

client = OpenAI(
    api_key=os.getenv("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com"
)

SYSTEM_PROMPT = """你是一个专业的写作助手。你可以帮助用户进行文章写作、润色、改写、续写等。请用中文回复，保持友好和专业的语气。"""

@router.post("/chat")
async def chat(
    text: Optional[str] = Form(None),
    agent_id: str = Form("w")
):
    response = client.chat.completions.create(
        model="deepseek-chat",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": text}
        ],
    )
    
    reply = response.choices[0].message.content
    
    return build_chat_response(
        reply=reply,
        received={"text": text}
    )


@router.get("/sessions")
async def get_sessions():
    return load_sessions_list("w")