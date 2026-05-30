"""Bridge AgentRunner hook events to typed queue objects.

Hook callbacks put typed dataclass instances into an ``asyncio.Queue``.
The consumer (``handle_chat_stream``) reads from the queue, dispatches
by type, and serialises each event to the SSE wire format.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

from app.agents.hook import AgentHook, AgentHookContext

_STEP = 800


@dataclass
class TextEvent:
    """LLM text delta for ``chunk`` SSE events."""
    content: str


@dataclass
class ToolExecStart:
    """Tool execution started."""
    name: str
    call_id: str
    arguments: Any


@dataclass
class ToolExecChunk:
    """Partial tool result content."""
    call_id: str
    content: str


@dataclass
class ToolExecEnd:
    """Tool execution finished."""
    call_id: str


@dataclass
class StreamSentinel:
    """Signals end of stream (sentinel, not serialised)."""
    pass


class StreamingHook(AgentHook):
    """Bridge AgentRunner hook events to typed queue objects.

    Hook callbacks put typed dataclass instances into an ``asyncio.Queue``.
    The consumer (``handle_chat_stream``) reads from the queue, dispatches
    by type, and serialises each event to the SSE wire format.
    """

    def __init__(self, queue: asyncio.Queue) -> None:
        super().__init__()
        self._queue = queue

    def wants_streaming(self) -> bool:
        return True

    async def on_stream(self, context: AgentHookContext, delta: str) -> None:
        """Forward LLM text deltas as ``TextEvent``."""
        await self._queue.put(TextEvent(content=delta))

    async def before_execute_tools(self, context: AgentHookContext) -> None:
        """Emit ``ToolExecStart`` for each tool about to execute."""
        for tc in context.tool_calls:
            await self._queue.put(ToolExecStart(
                name=tc.name,
                call_id=tc.id,
                arguments=tc.arguments,
            ))

    async def after_iteration(self, context: AgentHookContext) -> None:
        """Emit ``ToolExecChunk`` + ``ToolExecEnd`` for completed tool results."""
        if not context.tool_results:
            return
        for tc, result in zip(context.tool_calls, context.tool_results):
            content = str(result) if result is not None else ""
            if content:
                for i in range(0, len(content), _STEP):
                    await self._queue.put(ToolExecChunk(
                        call_id=tc.id,
                        content=content[i:i + _STEP],
                    ))
            await self._queue.put(ToolExecEnd(call_id=tc.id))
