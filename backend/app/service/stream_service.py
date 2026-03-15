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
