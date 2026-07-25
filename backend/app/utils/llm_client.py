from __future__ import annotations

import os
from typing import Any, AsyncGenerator, Dict, List, Optional, Union

from loguru import logger
from openai import OpenAI, AsyncOpenAI
from openai.types.chat import ChatCompletionMessage
from openai.types.chat.chat_completion_message_tool_call import (
    ChatCompletionMessageToolCall,
    Function,
)

_deepseek_client: OpenAI | None = None
_deepseek_async_client: AsyncOpenAI | None = None


def _get_sync_client() -> OpenAI:
    global _deepseek_client
    if _deepseek_client is None:
        _deepseek_client = OpenAI(
            api_key=os.getenv("DEEPSEEK_API_KEY") or "",
            base_url="https://api.deepseek.com",
        )
    return _deepseek_client


def _get_async_client() -> AsyncOpenAI:
    global _deepseek_async_client
    if _deepseek_async_client is None:
        _deepseek_async_client = AsyncOpenAI(
            api_key=os.getenv("DEEPSEEK_API_KEY") or "",
            base_url="https://api.deepseek.com",
        )
    return _deepseek_async_client

# 避免 tool 多轮中对同一条 system 重复刷满屏日志
_last_logged_system_prompt: Optional[str] = None
# 同上：多轮 tool 调用时 messages 仍包含同一轮 user，避免重复打印
_last_logged_user_message: Optional[str] = None


def _log_system_prompt_sent_to_llm(messages: List[Dict[str, Any]]) -> None:
    """记录发往 LLM 的完整 system 内容（与 API messages[0] 一致）。"""
    global _last_logged_system_prompt
    if not messages:
        return
    m0 = messages[0]
    if m0.get("role") != "system":
        return
    content = m0.get("content")
    if not isinstance(content, str):
        return
    if content == _last_logged_system_prompt:
        return
    _last_logged_system_prompt = content
    logger.debug("system prompt sent to LLM: full_len={}\n{}\n---", len(content), content)


def _log_last_user_message_sent_to_llm(messages: List[Dict[str, Any]]) -> None:
    """记录发往 LLM 的最后一条 string 类型 user 内容（通常为本轮用户输入，含 mention/附件块）。"""
    global _last_logged_user_message
    last: Optional[str] = None
    user_str_count = 0
    for m in messages:
        if m.get("role") != "user":
            continue
        c = m.get("content")
        if isinstance(c, str):
            user_str_count += 1
            last = c
    if last is None:
        return
    if last == _last_logged_user_message:
        return
    _last_logged_user_message = last
    extra = f" user_role_str_msgs={user_str_count}" if user_str_count > 1 else ""
    logger.debug("user message sent to LLM: full_len={}{}\n{}\n---", len(last), extra, last)


def deepseek_chat(messages: List[Dict[str, Any]], model: str = "deepseek-v4-flash") -> str:
    """同步、无 tools：底层统一走流式接口，聚合为完整正文。"""
    _log_system_prompt_sent_to_llm(messages)
    _log_last_user_message_sent_to_llm(messages)
    stream = _get_sync_client().chat.completions.create(
        model=model,
        messages=messages,
        stream=True,
    )
    parts: List[str] = []
    for chunk in stream:
        delta = chunk.choices[0].delta
        if delta and delta.content:
            parts.append(delta.content)
    return "".join(parts)


def _assistant_message_from_stream_parts(
    accumulated_content: str,
    tool_parts: Dict[int, Dict[str, str]],
) -> ChatCompletionMessage:
    tool_calls: Optional[List[ChatCompletionMessageToolCall]] = None
    if tool_parts:
        tool_calls = []
        for idx in sorted(tool_parts.keys()):
            p = tool_parts[idx]
            tool_calls.append(
                ChatCompletionMessageToolCall(
                    id=p.get("id") or "",
                    type="function",
                    function=Function(
                        name=p.get("name") or "",
                        arguments=p.get("arguments") or "{}",
                    ),
                )
            )
    content_val: Optional[str] = accumulated_content if accumulated_content else None
    return ChatCompletionMessage(
        role="assistant",
        content=content_val,
        tool_calls=tool_calls,
    )


async def deepseek_chat_stream(
    messages: List[Dict[str, Any]],
    *,
    model: str = "deepseek-v4-flash",
    tools: Optional[List[Dict[str, Any]]] = None,
) -> AsyncGenerator[Union[str, ChatCompletionMessage], None]:
    """
    流式调用 DeepSeek（默认路径）。

    - 未传 tools：仅 yield 文本增量（str），与旧版纯流式一致。
    - 传入 tools：先 yield 本助手轮次的正文增量（str），最后 yield 一条 ChatCompletionMessage
      （含合并后的 tool_calls），供 tool loop 写入 history。
    """
    kwargs: Dict[str, Any] = {"model": model, "messages": messages, "stream": True}
    if tools:
        kwargs["tools"] = tools

    _log_system_prompt_sent_to_llm(messages)
    _log_last_user_message_sent_to_llm(messages)
    stream = await _get_async_client().chat.completions.create(**kwargs)

    if not tools:
        async for chunk in stream:
            delta = chunk.choices[0].delta
            if delta and delta.content:
                yield delta.content
        return

    accumulated_content = ""
    tool_parts: Dict[int, Dict[str, str]] = {}

    async for chunk in stream:
        delta = chunk.choices[0].delta
        if not delta:
            continue
        if delta.content:
            accumulated_content += delta.content
            yield delta.content
        if delta.tool_calls:
            for tc in delta.tool_calls:
                idx = tc.index
                if idx not in tool_parts:
                    tool_parts[idx] = {"id": "", "name": "", "arguments": ""}
                if tc.id:
                    tool_parts[idx]["id"] = tc.id
                if tc.function:
                    if tc.function.name:
                        tool_parts[idx]["name"] += tc.function.name
                    if tc.function.arguments:
                        tool_parts[idx]["arguments"] += tc.function.arguments

    yield _assistant_message_from_stream_parts(accumulated_content, tool_parts)
