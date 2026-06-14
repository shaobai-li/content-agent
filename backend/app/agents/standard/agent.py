"""标准 Agent：多轮 tool loop + 流式输出最终回复。"""
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List

from loguru import logger

from app.agents.base_agent import BaseAgent
from app.core.config import get_agent_workspace_dir
from app.runtime.agent_turn_context import AgentTurnContext
from app.service.stream_service import (
    build_stream_chunk,
    build_stream_done,
)
from app.agents.context import ContextBuilder
from app.agents.tools import create_tool_registry

_MAX_TOOL_ROUNDS = 30


def _get_provider(provider_name: str | None = None, model: str | None = None):
    """Create an LLM provider based on provider name and model.

    Args:
        provider_name: Provider name, e.g. "deepseek", "openai", "moonshot".
                       Defaults to "deepseek" when None.
        model: Model name, e.g. "deepseek-chat", "gpt-4o", "kimi-k2.5".
               Uses provider default when None.
    """
    from app.providers.factory import create_provider

    return create_provider(
        provider_name=provider_name or "deepseek",
        model=model,
    )


_LLM_KEEP_KEYS = ("tool_calls", "tool_call_id", "name", "reasoning_content")


def _history_llm_turns(history_messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """从持久化历史中提取 LLM 所需的完整多轮对话。

    只保留 LLM 需要的字段，丢弃 ``message_id`` / ``created_at`` 等元数据。
    保留的字段与 nanobot ``get_history()`` 对齐：
    ``role``, ``content``, ``tool_calls``, ``tool_call_id``, ``name``, ``reasoning_content``。
    """
    out: List[Dict[str, Any]] = []
    for hm in history_messages:
        role = hm.get("role")
        content = hm.get("content")
        if role == "tool":
            content = content or ""
        msg: Dict[str, Any] = {"role": role, "content": content}
        for key in _LLM_KEEP_KEYS:
            if key in hm:
                msg[key] = hm[key]
        out.append(msg)

    logger.debug("history_llm_turns: {} turns", len(out))
    for m in out:
        c = m.get("content", "")
        preview = c[:500] if isinstance(c, str) else str(c)[:500]
        truncated = "…" if isinstance(c, str) and len(c) > 500 else ""
        logger.debug("  {}: {}{}", m['role'], preview, truncated)
        for key in _LLM_KEEP_KEYS:
            if key in m:
                logger.debug("    └─ {}: {}", key, m[key])
    return out


class StandardAgent(BaseAgent):
    """带标准 tool-use loop；工具默认在 workspace，可切换到 skills 目录。"""

    def __init__(self, agent_id: str):
        super().__init__(agent_id=agent_id, system_prompt="")

    def get_system_prompt_for_llm(self) -> str:
        ws = get_agent_workspace_dir(self.agent_id)
        return ContextBuilder(ws, self.agent_id).build_system_prompt()

    def get_config_dict(self) -> dict:
        ws = get_agent_workspace_dir(self.agent_id)
        return {
            "agent_id": self.agent_id,
            "system_prompt": ContextBuilder(ws, self.agent_id).resolve_base_prompt(),
        }

    def _workspace_dir(self) -> Path:
        return get_agent_workspace_dir(self.agent_id)

    def _build_loop_messages(self, ctx: AgentTurnContext, workspace: Path) -> List[Dict[str, Any]]:
        builder = ContextBuilder(workspace, self.agent_id)
        return builder.build_messages(
            history=_history_llm_turns(ctx.history_messages),
            current_message=ctx.user_text,
            mentions=ctx.mentions,
        )

    async def handle_chat_stream(
        self,
        ctx: AgentTurnContext,
    ) -> AsyncGenerator[str, None]:
        from app.core.ids import new_uuid
        from app.service.messages_service import save_message
        from app.service.sessions_service import save_session_if_new

        session_id = ctx.session_id or new_uuid()
        try:
            workspace = self._workspace_dir()
            registry = create_tool_registry(
                workspace, self.agent_id,
                provider_name=ctx.provider,
                model=ctx.model,
            )
            messages = self._build_loop_messages(ctx, workspace)

            text_preview = (ctx.user_text or "")[:100]
            logger.info("handle_chat_stream: {} session={} text={}", ctx.agent_id, session_id, text_preview)

            # 确定 session_id 并保存用户消息
            if ctx.user_text:
                save_session_if_new(ctx.agent_id, session_id, ctx.user_text)
                save_message(ctx.agent_id, session_id, "user", ctx.user_text)

            from app.agents.runner import AgentRunner, AgentRunSpec
            from app.agents.standard.streaming_hook import (
                StreamingHook, TextEvent, ToolExecStart, ToolExecChunk, ToolExecEnd,
                StreamSentinel,
            )
            from app.service.stream_service import (
                build_tool_exec_start, build_tool_exec_chunk, build_tool_exec_end,
                build_canvas_card,
            )

            provider = _get_provider(provider_name=ctx.provider, model=ctx.model)
            queue: asyncio.Queue = asyncio.Queue()
            hook = StreamingHook(queue)

            spec = AgentRunSpec(
                initial_messages=messages,
                tools=registry,
                model=ctx.model or provider.default_model,
                max_iterations=_MAX_TOOL_ROUNDS,
                max_tool_result_chars=100000,
                max_tokens=provider.generation.max_tokens,
                temperature=provider.generation.temperature,
                hook=hook,
                session_key=session_id,
                context_window_tokens=65536,
            )

            runner = AgentRunner(provider)

            async def run_and_signal():
                try:
                    return await runner.run(spec)
                finally:
                    await queue.put(StreamSentinel())

            runner_task = asyncio.create_task(run_and_signal())

            collected_tool_outputs: dict[str, str] = {}
            tool_name_map: dict[str, str] = {}

            while True:
                msg = await queue.get()
                if isinstance(msg, StreamSentinel):
                    break
                elif isinstance(msg, TextEvent):
                    yield build_stream_chunk(msg.content)
                elif isinstance(msg, ToolExecStart):
                    tool_name_map[msg.call_id] = msg.name
                    yield build_tool_exec_start(
                        name=msg.name, call_id=msg.call_id, arguments=msg.arguments,
                    )
                elif isinstance(msg, ToolExecChunk):
                    if msg.call_id not in collected_tool_outputs:
                        collected_tool_outputs[msg.call_id] = ""
                    collected_tool_outputs[msg.call_id] += msg.content
                    yield build_tool_exec_chunk(call_id=msg.call_id, content=msg.content)
                elif isinstance(msg, ToolExecEnd):
                    yield build_tool_exec_end(call_id=msg.call_id)
                    # 检测 generate_html 工具完成，自动推送到 Canvas
                    tool_name = tool_name_map.get(msg.call_id, "")
                    if tool_name == "generate_html":
                        html_content = collected_tool_outputs.get(msg.call_id, "")
                        if html_content.strip():
                            yield build_canvas_card(
                                content=html_content,
                                card_type="html",
                                title="HTML 生成结果",
                            )
                    # 清理已完成工具调用，防止内存泄漏
                    collected_tool_outputs.pop(msg.call_id, None)
                    tool_name_map.pop(msg.call_id, None)

            result = await runner_task

            # 兜底流式输出：AgentRunner 内部产生的终端消息（max_iterations / error / empty）
            # 未经过 StreamingHook 流式输出，需要在此补充
            if result.final_content and result.stop_reason in (
                "max_iterations", "empty_final_response", "tool_error", "error",
            ):
                yield build_stream_chunk(result.final_content)

            # 保存本次运行产生的所有新消息
            initial_len = len(messages)
            for msg in result.messages[initial_len:]:
                role = msg.get("role")
                content = msg.get("content", "") or ""
                if role == "assistant":
                    save_message(
                        ctx.agent_id, session_id, "assistant", content,
                        tool_calls=msg.get("tool_calls"),
                        reasoning_content=msg.get("reasoning_content"),
                    )
                elif role == "tool":
                    save_message(
                        ctx.agent_id, session_id, "tool", content,
                        tool_call_id=msg.get("tool_call_id"),
                        name=msg.get("name"),
                    )
        except Exception:
            logger.exception("handle_chat_stream error")
            yield build_stream_chunk(f"出错了，请稍后重试")

        yield build_stream_done(session_id=session_id)
