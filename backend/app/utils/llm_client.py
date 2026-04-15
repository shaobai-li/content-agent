from typing import Any, AsyncGenerator, Dict, List, Optional
import os
from openai import OpenAI, AsyncOpenAI
from openai.types.chat import ChatCompletionMessage


_deepseek_client = OpenAI(
    api_key=os.getenv("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com"
)

_deepseek_async_client = AsyncOpenAI(
    api_key=os.getenv("DEEPSEEK_API_KEY"),
    base_url="https://api.deepseek.com"
)


def deepseek_chat(messages: List[Dict[str, Any]], model: str = "deepseek-chat") -> str:
    response = _deepseek_client.chat.completions.create(
        model=model,
        messages=messages,
    )
    return response.choices[0].message.content or ""


async def deepseek_chat_completion_message(
    messages: List[Dict[str, Any]],
    *,
    tools: Optional[List[Dict[str, Any]]] = None,
    model: str = "deepseek-chat",
) -> ChatCompletionMessage:
    """非流式单次补全；支持 tools，供带 tool loop 的 Agent 使用。"""
    kwargs: Dict[str, Any] = {"model": model, "messages": messages}
    if tools:
        kwargs["tools"] = tools
    response = await _deepseek_async_client.chat.completions.create(**kwargs)
    return response.choices[0].message


async def deepseek_chat_stream(
    messages: List[Dict[str, Any]], model: str = "deepseek-chat"
) -> AsyncGenerator[str, None]:
    """流式调用 DeepSeek，逐 token yield 文本内容"""
    stream = await _deepseek_async_client.chat.completions.create(
        model=model,
        messages=messages,
        stream=True,
    )
    async for chunk in stream:
        delta = chunk.choices[0].delta
        if delta and delta.content:
            yield delta.content
