from typing import Optional, Dict, Any

from app.service.messages_service import load_messages, save_message
from app.service.sessions_service import save_session_if_new
from app.service.chat_service import deepseek_chat, build_chat_response
from app.core.ids import new_uuid


def save_chat_session(agent_id: str, session_id: Optional[str], user_text: str, assistant_reply: str) -> str:
    """保存聊天会话，如果 session_id 为 None 则自动生成"""
    if not session_id:
        session_id = new_uuid()
    
    if user_text:
        save_session_if_new(agent_id, session_id, user_text)
        save_message(agent_id, session_id, "user", user_text)
        save_message(agent_id, session_id, "assistant", assistant_reply)
    
    return session_id


async def standard_chat(
    agent_id: str,
    system_prompt: str,
    text: Optional[str] = None,
    session_id: Optional[str] = None,
    extra_response: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    history = load_messages(agent_id, session_id) if session_id else []
    
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(history)
    if text:
        messages.append({"role": "user", "content": text})
    
    reply = deepseek_chat(messages=messages)
    session_id = save_chat_session(agent_id, session_id, text, reply)
    
    response = {"reply": reply, "session_id": session_id}
    if extra_response:
        response.update(extra_response)
    
    return build_chat_response(**response)
