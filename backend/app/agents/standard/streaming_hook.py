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
from app.utils.tool_hints import format_tool_hint


@dataclass
class TextEvent:
    """LLM text delta for ``chunk`` SSE events."""
    content: str


@dataclass
class ToolExecStart:
    """Tool execution started — carries concise hint instead of full arguments."""
    name: str
    call_id: str
    hint: str


@dataclass
class ToolExecEnd:
    """Tool execution finished — carries final status."""
    call_id: str
    status: str = "ok"  # "ok" | "error"
    error: str | None = None


@dataclass
class StreamSentinel:
    """Signals end of stream (sentinel, not serialised)."""
    pass


class StreamingHook(AgentHook):
    """Bridge AgentRunner hook events to typed queue objects.

    Only sends tool_hint (start/end) — no chunk streaming during execution.
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
        """Emit ``ToolExecStart`` with concise hint for each tool."""
        for tc in context.tool_calls:
            hint = format_tool_hint(tc.name, tc.arguments or {})
            await self._queue.put(ToolExecStart(
                name=tc.name,
                call_id=tc.id,
                hint=hint,
            ))

    async def after_iteration(self, context: AgentHookContext) -> None:
        """Emit ``ToolExecEnd`` for each completed tool with status."""
        if not context.tool_results:
            return
        events = context.tool_events or []
        for tc, event in zip(context.tool_calls, events):
            status = event.get("status", "ok") if isinstance(event, dict) else "ok"
            error = event.get("detail") if status == "error" else None
            await self._queue.put(ToolExecEnd(call_id=tc.id, status=status, error=error))
