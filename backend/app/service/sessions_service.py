import json

from app.core.config import get_agent_sessions_path

def load_sessions_list(agent_id: str):
    sessions_path = get_agent_sessions_path(agent_id)
    if not sessions_path.exists():
        return []
    with open(sessions_path, "r", encoding="utf-8") as f:
        chats = json.load(f)
    return [
        {"session_id": c.get("session_id", ""), "title": c.get("title", ""), "content": c.get("content", "")}
        for c in chats
    ]
