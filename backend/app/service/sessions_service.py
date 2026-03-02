import json

from app.core.config import get_agent_sessions_path

TITLE_MAX_LENGTH = 30

def load_sessions(agent_id: str):
    sessions_path = get_agent_sessions_path(agent_id)
    if not sessions_path.exists():
        return []
    with open(sessions_path, "r", encoding="utf-8") as f:
        chats = json.load(f)
    return [
        {"session_id": c.get("session_id", ""), "title": c.get("title", ""), "content": c.get("content", "")}
        for c in chats
    ]


def save_session_if_new(agent_id: str, session_id: str, first_message: str):
    """
    若 session_id 尚未存在，则将其作为新会话追加到 sessions.json。
    title 取用户第一条消息截断后的文本。
    """
    sessions_path = get_agent_sessions_path(agent_id)

    print("in save_session_if_new", sessions_path)
    if sessions_path.exists():
        with open(sessions_path, "r", encoding="utf-8") as f:
            sessions = json.load(f)
    else:
        sessions = []

    # 已存在则不重复写入
    if any(s.get("session_id") == session_id for s in sessions):
        return

    title = first_message.strip()
    if len(title) > TITLE_MAX_LENGTH:
        title = title[:TITLE_MAX_LENGTH] + "…"

    sessions.insert(0, {
        "session_id": session_id,
        "title": title,
        "content": title,
    })

    sessions_path.parent.mkdir(parents=True, exist_ok=True)
    with open(sessions_path, "w", encoding="utf-8") as f:
        json.dump(sessions, f, ensure_ascii=False, indent=2)
