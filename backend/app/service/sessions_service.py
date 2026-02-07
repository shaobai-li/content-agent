import json

from app.core.config import get_agent_sessions_path


def load_chats_list(agent_id: str):
    sessions_path = get_agent_sessions_path(agent_id)
    if not sessions_path.exists():
        return []
    with open(sessions_path, "r", encoding="utf-8") as f:
        chats = json.load(f)
    return [
        {"chat_id": c.get("chat_id", ""), "title": c.get("title", ""), "content": ""}
        for c in chats
    ]
