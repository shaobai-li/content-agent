import json
from datetime import datetime, timezone

from app.core.config import get_agent_messages_path
from app.core.ids import new_uuid


def load_messages(agent_id: str, session_id: str) -> list:
    """加载指定会话的全部消息记录"""
    messages_path = get_agent_messages_path(agent_id)
    if not messages_path.exists():
        return []
    with open(messages_path, "r", encoding="utf-8") as f:
        all_messages = json.load(f)
    return all_messages.get(session_id, [])


def save_message(agent_id: str, session_id: str, role: str, content: str):
    """向指定会话追加一条消息"""
    messages_path = get_agent_messages_path(agent_id)

    if messages_path.exists():
        with open(messages_path, "r", encoding="utf-8") as f:
            all_messages = json.load(f)
    else:
        all_messages = {}

    message = {
        "message_id": new_uuid(),
        "session_id": session_id,
        "role": role,
        "content": content,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    all_messages.append(message)

    messages_path.parent.mkdir(parents=True, exist_ok=True)
    with open(messages_path, "w", encoding="utf-8") as f:
        json.dump(all_messages, f, ensure_ascii=False, indent=2)



def delete_session_messages(agent_id: str, session_id: str) -> bool:
    messages_path = get_agent_messages_path(agent_id)
    if not messages_path.exists():
        return True

    with open(messages_path, "r", encoding="utf-8") as f:
        all_messages = json.load(f)

    all_messages = [m for m in all_messages if m.get("session_id") != session_id]
    with open(messages_path, "w", encoding="utf-8") as f:
        json.dump(all_messages, f, ensure_ascii=False, indent=2)
    return True