"""标准 Agent：多轮 tool loop + 流式输出最终回复（与 temp/pi_agent.py 思路对齐）。"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List

from openai.types.chat import ChatCompletionMessage

from app.agents.base_agent import BaseAgent
from app.core.config import get_agent_base_dir
from app.runtime.agent_turn_context import AgentTurnContext
from app.service.agent_chat_service import save_chat_session
from app.service.stream_service import (
    build_stream_chunk,
    build_stream_done,
    build_thinking_chunk,
    build_thinking_end,
    build_thinking_start,
)
from app.utils.context_utils import get_article_context_messages
from app.utils.llm_client import deepseek_chat_completion_message

from .tools import STANDARD_AGENT_TOOLS, make_tool_executor

_PROMPTS_DIR = Path(__file__).parent / "prompts"

_MAX_TOOL_ROUNDS = 20
_FINAL_CHUNK_SIZE = 120


def load_default_system_prompt() -> str:
    path = _PROMPTS_DIR / "system.md"
    return path.read_text(encoding="utf-8").strip()


def _assistant_message_as_dict(msg: ChatCompletionMessage) -> Dict[str, Any]:
    entry: Dict[str, Any] = {"role": "assistant"}
    if msg.content is not None:
        entry["content"] = msg.content
    if msg.tool_calls:
        entry["tool_calls"] = [
            {
                "id": tc.id,
                "type": getattr(tc, "type", None) or "function",
                "function": {
                    "name": tc.function.name,
                    "arguments": tc.function.arguments or "{}",
                },
            }
            for tc in msg.tool_calls
        ]
    if "content" not in entry:
        entry["content"] = None
    return entry


def _history_llm_turns(history_messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for hm in history_messages:
        role = hm.get("role")
        content = hm.get("content")
        if role in ("user", "assistant") and isinstance(content, str):
            out.append({"role": role, "content": content})
    return out


async def _yield_thinking_text(text: str) -> AsyncGenerator[str, None]:
    yield build_thinking_start()
    step = 800
    for i in range(0, len(text), step):
        yield build_thinking_chunk(text[i : i + step])
    yield build_thinking_end()


class StandardAgent(BaseAgent):
    """带标准 tool-use loop；工具仅作用于该 agent 数据目录下的 `workspace` 子目录。"""

    def __init__(self, agent_id: str, system_prompt: str):
        super().__init__(agent_id=agent_id, system_prompt=system_prompt)

    def _workspace_dir(self) -> Path:
        root = get_agent_base_dir(self.agent_id)
        ws = root / "workspace"
        ws.mkdir(parents=True, exist_ok=True)
        return ws

    def _build_loop_messages(self, ctx: AgentTurnContext, workspace: Path) -> List[Dict[str, Any]]:
        guard = (
            f"\n\n你可以使用提供的工具。所有文件路径与 shell 中的相对路径均相对于工作区根目录。"
            f"\n工作区绝对路径: {workspace.resolve()}\n禁止访问工作区外的路径。"
        )
        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": self.system_prompt + guard},
        ]
        messages.extend(_history_llm_turns(ctx.history_messages))
        messages.extend(get_article_context_messages(ctx.mentions))
        if ctx.user_text:
            messages.append({"role": "user", "content": ctx.user_text})
        return messages

    async def handle_chat_stream(
        self,
        ctx: AgentTurnContext,
    ) -> AsyncGenerator[str, None]:
        workspace = self._workspace_dir()
        execute_tool = make_tool_executor(workspace)
        messages = self._build_loop_messages(ctx, workspace)
        final_reply_text = ""

        rounds = 0
        while rounds < _MAX_TOOL_ROUNDS:
            rounds += 1
            assistant_msg = await deepseek_chat_completion_message(
                messages,
                tools=STANDARD_AGENT_TOOLS,
            )
            messages.append(_assistant_message_as_dict(assistant_msg))

            if assistant_msg.tool_calls:
                for tc in assistant_msg.tool_calls:
                    name = tc.function.name
                    raw_args = tc.function.arguments or "{}"
                    try:
                        preview = json.dumps(json.loads(raw_args), ensure_ascii=False)[:600]
                    except json.JSONDecodeError:
                        preview = raw_args[:600]
                    result = execute_tool(name, raw_args)
                    result_preview = result if len(result) <= 4000 else result[:4000] + "\n…(truncated)"
                    log = f"调用工具 `{name}`\n参数: {preview}\n\n输出:\n{result_preview}"
                    async for line in _yield_thinking_text(log):
                        yield line
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tc.id,
                            "content": result,
                        }
                    )
                continue

            final = (assistant_msg.content or "").strip()
            final_reply_text = final
            for i in range(0, len(final), _FINAL_CHUNK_SIZE):
                yield build_stream_chunk(final[i : i + _FINAL_CHUNK_SIZE])
            break
        else:
            final_reply_text = "已达到工具调用轮数上限，请简化任务或分步提问。"
            yield build_stream_chunk(final_reply_text)

        session_id = save_chat_session(
            ctx.agent_id, ctx.session_id, ctx.user_text, final_reply_text
        )
        yield build_stream_done(session_id=session_id)
