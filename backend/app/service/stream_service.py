"""
流式响应协议序列化
单一职责：把业务数据转换成行级 JSON 字符串，供 StreamingResponse 使用

协议约定：
  chunk: {"event": "chunk", "data": {"content": "..."}}
  done:  {"event": "done",  "data": {"session_id": "...", ...extra}}
  thinking_start: {"event": "thinking_start", "data": {}}
"""
import json
from typing import Any, Dict, Optional


def build_stream_chunk(content: str) -> str:
    return json.dumps({"event": "chunk", "data": {"content": content}}) + "\n"


def build_stream_done(session_id: str, extra: Optional[Dict[str, Any]] = None) -> str:
    data: Dict[str, Any] = {"session_id": session_id}
    if extra:
        data.update(extra)
    return json.dumps({"event": "done", "data": data}) + "\n"


def build_thinking_start() -> str:
    return json.dumps({"event": "thinking_start", "data": {}}) + "\n"
