import json
from datetime import datetime, timezone

from loguru import logger
from app.core.config import get_agent_session_messages_path
from app.core.ids import new_uuid


def load_messages(agent_id: str, session_id: str) -> list:
    """加载指定会话的全部消息记录"""
    path = get_agent_session_messages_path(agent_id, session_id)
    if not path.exists():
        return []
    return _read_jsonl(path)


def _read_jsonl(path) -> list:
    lines = path.read_text(encoding="utf-8").strip().splitlines()
    return [json.loads(line) for line in lines if line.strip()]


def save_message(agent_id: str, session_id: str, role: str, content: str, tool_calls=None, tool_call_id=None):
    """向指定会话追加一条消息（append 写入 .jsonl）"""
    path = get_agent_session_messages_path(agent_id, session_id)
    path.parent.mkdir(parents=True, exist_ok=True)

    msg = {
        "message_id": new_uuid(),
        "role": role,
        "content": content,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if tool_calls is not None:
        msg["tool_calls"] = tool_calls
    if tool_call_id is not None:
        msg["tool_call_id"] = tool_call_id

    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(msg, ensure_ascii=False) + "\n")

    logger.debug("saved message: {} / {} role={} msg_id={}", agent_id, session_id, role, msg["message_id"])


def delete_session_messages(agent_id: str, session_id: str) -> bool:
    """删除指定会话的全部消息记录"""
    path = get_agent_session_messages_path(agent_id, session_id)
    if path.exists():
        path.unlink()
        logger.debug("deleted session messages: {} / {}", agent_id, session_id)
    return True
