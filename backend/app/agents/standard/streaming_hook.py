"""Bridge AgentRunner hook events to SSE protocol via asyncio.Queue."""
from __future__ import annotations

import asyncio
from typing import Any

from app.agents.hook import AgentHook, AgentHookContext
from app.service.stream_service import (
    build_box_chunk,
    build_box_end,
    build_box_start,
    build_stream_chunk,
)

_STEP = 800

_TOOL_ICONS: dict[str, str] = {
    "read_file": "tool-read",
    "write_file": "tool-write",
    "run_command": "tool-command",
    "web_search": "tool-search",
    "web_fetch": "tool-read",
    "invoke_skill": "tool-skill",
}


class StreamingHook(AgentHook):
    """Bridge AgentRunner hook events to SSE protocol.

    Hook callbacks put SSE lines into an ``asyncio.Queue``. The consumer
    (``handle_chat_stream``) reads from the queue and yields each line.

    Sentinel (``None``) is placed by the runner wrapper, not by this hook.
    """

    def __init__(self, queue: asyncio.Queue) -> None:
        super().__init__()
        self._queue = queue

    def wants_streaming(self) -> bool:
        return True

    async def on_stream(self, context: AgentHookContext, delta: str) -> None:
        """Forward LLM text deltas as ``chunk`` SSE events."""
        await self._queue.put(build_stream_chunk(delta))

    async def before_execute_tools(self, context: AgentHookContext) -> None:
        """Emit ``box_start`` for each tool about to execute."""
        for tc in context.tool_calls:
            icon = _TOOL_ICONS.get(tc.name, "tool-command")
            await self._queue.put(build_box_start(f"调用工具 {tc.name} ...", icon=icon))

    async def after_iteration(self, context: AgentHookContext) -> None:
        """Emit ``box_chunk`` + ``box_end`` for completed tool results."""
        if not context.tool_results:
            return
        for tc, result in zip(context.tool_calls, context.tool_results):
            content = str(result) if result is not None else ""
            if content:
                for i in range(0, len(content), _STEP):
                    await self._queue.put(build_box_chunk(content[i:i + _STEP]))
            await self._queue.put(build_box_end())
