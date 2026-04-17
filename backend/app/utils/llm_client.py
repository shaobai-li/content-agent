from __future__ import annotations

import os
from typing import Any, AsyncGenerator, Dict, List, Optional, Union

from openai import OpenAI, AsyncOpenAI
from openai.types.chat import ChatCompletionMessage
from openai.types.chat.chat_completion_message_tool_call import (
    ChatCompletionMessageToolCall,
    Function,
)

_deepseek_client = OpenAI(
    api_key=os.getenv("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com",
)

_deepseek_async_client = AsyncOpenAI(
    api_key=os.getenv("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com",
)


def deepseek_chat(messages: List[Dict[str, Any]], model: str = "deepseek-chat") -> str:
    """同步、无 tools：底层统一走流式接口，聚合为完整正文。"""
    stream = _deepseek_client.chat.completions.create(
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
    model: str = "deepseek-chat",
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

    stream = await _deepseek_async_client.chat.completions.create(**kwargs)

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
