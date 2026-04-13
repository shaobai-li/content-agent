"""
流式响应协议序列化
单一职责：把业务数据转换成行级 JSON 字符串，供 StreamingResponse 使用

协议约定：
  chunk: {"event": "chunk", "data": {"content": "..."}}
  done:  {"event": "done",  "data": {"session_id": "...", ...extra}}
  thinking_start: {"event": "thinking_start", "data": {}}
  thinking_chunk: {"event": "thinking_chunk", "data": {"content": "..."}}
  thinking_end: {"event": "thinking_end", "data": {}}
  plan_start: {"event": "plan_start", "data": {}}
  plan_item: {"event": "plan_item", "data": {"step": "...", "index": 1}}
  plan_end: {"event": "plan_end", "data": {}}
"""
import json
from typing import Any, AsyncGenerator, Dict, Optional

from app.service.chat_service import build_chat_response


def build_stream_chunk(content: str) -> str:
    return json.dumps({"event": "chunk", "data": {"content": content}}) + "\n"


def build_stream_done(session_id: str, extra: Optional[Dict[str, Any]] = None) -> str:
    data: Dict[str, Any] = {"session_id": session_id}
    if extra:
        data.update(extra)
    return json.dumps({"event": "done", "data": data}) + "\n"


def build_thinking_start() -> str:
    return json.dumps({"event": "thinking_start", "data": {}}) + "\n"


def build_thinking_chunk(content: str) -> str:
    return json.dumps({"event": "thinking_chunk", "data": {"content": content}}) + "\n"


def build_thinking_end() -> str:
    return json.dumps({"event": "thinking_end", "data": {}}) + "\n"


def build_plan_start() -> str:
    return json.dumps({"event": "plan_start", "data": {}}) + "\n"


def build_plan_item(step: str, index: int) -> str:
    return json.dumps({"event": "plan_item", "data": {"step": step, "index": index}}) + "\n"


def build_plan_end() -> str:
    return json.dumps({"event": "plan_end", "data": {}}) + "\n"


async def aggregate_stream_to_chat_response(
    stream: AsyncGenerator[str, None],
) -> Dict[str, Any]:
    """消费 Agent 流式输出，拼成与旧 /chat JSON 一致的结构（reply、session_id 及 done 中的 extra）。"""
    reply_parts: list[str] = []
    buffer = ""
    last_done: Optional[Dict[str, Any]] = None

    async for piece in stream:
        buffer += piece
        while "\n" in buffer:
            line, buffer = buffer.split("\n", 1)
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            ev = obj.get("event")
            data = obj.get("data") or {}
            if ev == "chunk":
                reply_parts.append(data.get("content", ""))
            elif ev == "response_chunk":
                reply_parts.append(data.get("content", ""))
            elif ev == "done":
                last_done = data

    reply = "".join(reply_parts)
    if last_done:
        session_id = last_done.get("session_id", "")
        extra = {k: v for k, v in last_done.items() if k != "session_id"}
        return build_chat_response(reply=reply, session_id=session_id, **extra)
    return build_chat_response(reply=reply, session_id="")
