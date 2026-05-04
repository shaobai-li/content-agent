"""
流式响应协议序列化 — SSE (Server-Sent Events) 格式

协议约定（SSE event + data 行，双换行分隔）：
  chunk:           event: chunk\ndata: {"content": "..."}\n\n
  done:            event: done\ndata: {"session_id": "...", ...}\n\n
  tool_exec_start: event: tool_exec_start\ndata: {"name":"...","call_id":"...","arguments":{...}}\n\n
  tool_exec_chunk: event: tool_exec_chunk\ndata: {"call_id":"...","content":"..."}\n\n
  tool_exec_end:   event: tool_exec_end\ndata: {"call_id":"..."}\n\n
"""
import json
from typing import Any, AsyncGenerator, Dict, Optional

from app.service.chat_service import build_chat_response


def build_stream_chunk(content: str) -> str:
    return f"event: chunk\ndata: {json.dumps({'content': content})}\n\n"


def build_stream_done(session_id: str, extra: Optional[Dict[str, Any]] = None) -> str:
    data: Dict[str, Any] = {"session_id": session_id}
    if extra:
        data.update(extra)
    return f"event: done\ndata: {json.dumps(data)}\n\n"


def build_tool_exec_start(name: str, call_id: str, arguments: Any) -> str:
    return f"event: tool_exec_start\ndata: {json.dumps({'name': name, 'call_id': call_id, 'arguments': arguments})}\n\n"


def build_tool_exec_chunk(call_id: str, content: str) -> str:
    return f"event: tool_exec_chunk\ndata: {json.dumps({'call_id': call_id, 'content': content})}\n\n"


def build_tool_exec_end(call_id: str) -> str:
    return f"event: tool_exec_end\ndata: {json.dumps({'call_id': call_id})}\n\n"


async def aggregate_stream_to_chat_response(
    stream: AsyncGenerator[str, None],
) -> Dict[str, Any]:
    """消费 Agent 流式输出，拼成与旧 /chat JSON 一致的结构（reply、session_id 及 done 中的 extra）。"""
    reply_parts: list[str] = []
    buffer = ""
    last_done: Optional[Dict[str, Any]] = None

    async for piece in stream:
        buffer += piece
        while "\n\n" in buffer:
            block, buffer = buffer.split("\n\n", 1)
            block = block.strip()
            if not block:
                continue
            # Parse SSE block
            ev = ""
            data_str = ""
            for line in block.split("\n"):
                if line.startswith("event: "):
                    ev = line[7:].strip()
                elif line.startswith("data: "):
                    data_str = line[6:].strip()
            if not data_str:
                continue
            try:
                data = json.loads(data_str)
            except json.JSONDecodeError:
                continue
            if ev in ("chunk", "response_chunk"):
                reply_parts.append(data.get("content", ""))
            elif ev == "done":
                last_done = data

    reply = "".join(reply_parts)
    if last_done:
        session_id = last_done.get("session_id", "")
        extra = {k: v for k, v in last_done.items() if k != "session_id"}
        return build_chat_response(reply=reply, session_id=session_id, **extra)
    return build_chat_response(reply=reply, session_id="")
