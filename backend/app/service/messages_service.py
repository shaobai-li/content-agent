import json

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

    if session_id not in all_messages:
        all_messages[session_id] = []

    all_messages[session_id].append({"id": new_uuid(), "role": role, "content": content})

    messages_path.parent.mkdir(parents=True, exist_ok=True)
    with open(messages_path, "w", encoding="utf-8") as f:
        json.dump(all_messages, f, ensure_ascii=False, indent=2)
