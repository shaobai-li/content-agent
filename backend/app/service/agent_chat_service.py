from typing import Optional, Dict, Any

from loguru import logger
from app.service.messages_service import save_message
from app.service.sessions_service import save_session_if_new
from app.core.ids import new_uuid


def save_chat_session(agent_id: str, session_id: Optional[str], user_text: str, assistant_reply: str) -> str:
    """保存聊天会话，如果 session_id 为 None 则自动生成"""
    if not session_id:
        session_id = new_uuid()

    if user_text:
        save_session_if_new(agent_id, session_id, user_text)
        save_message(agent_id, session_id, "user", user_text)
        save_message(agent_id, session_id, "assistant", assistant_reply)
        logger.debug("chat session saved: {} / {}", agent_id, session_id)

    return session_id
