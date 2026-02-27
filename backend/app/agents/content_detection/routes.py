from fastapi import APIRouter, Form
from typing import Optional
from app.service.sessions_service import load_sessions_list
from app.service.chat_service import build_chat_response, deepseek_chat

router = APIRouter()
SYSTEM_PROMPT = """你是一个专业的内容检测助手。你可以帮助用户识别文本中的风险内容、敏感表达和潜在违规点，并给出清晰可执行的修改建议。请用中文回复，语气专业且客观。"""

@router.get("/sessions")
async def get_sessions():
    """获取内容检测会话列表（历史聊天）"""
    return load_sessions_list("c")

@router.post("/chat")
async def chat(
    text: Optional[str] = Form(None),
    agent_id: str = Form("c")
):
    reply = deepseek_chat(
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": text or ""}
        ],
    )
    
    return build_chat_response(
        reply=reply
    )