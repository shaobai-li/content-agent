"""标准 Agent：多轮 tool loop + 流式输出最终回复。"""
from __future__ import annotations

import asyncio
import os
from datetime import datetime
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List

from loguru import logger

from app.agents.base_agent import BaseAgent
from app.core.config import get_agent_base_dir, get_agent_local_data_dir, get_agent_workspace_dir
from app.runtime.agent_turn_context import AgentTurnContext
from app.service.stream_service import (
    build_stream_chunk,
    build_stream_done,
)
from app.utils.context_utils import get_article_context_messages

from app.agents.tools import create_tool_registry

_PROMPTS_DIR = Path(__file__).parent / "prompts"

_MAX_TOOL_ROUNDS = 30


def _get_provider():
    """Get the shared OpenAI-compatible provider instance."""
    from app.providers.openai_compat_provider import OpenAICompatProvider
    from app.providers.registry import find_by_name

    return OpenAICompatProvider(
        api_key=os.getenv("DEEPSEEK_API_KEY"),
        spec=find_by_name("deepseek"),
    )


USER_SYSTEM_PROMPT_REL = Path("prompts") / "system_prompt.md"


def _current_datetime_prompt_line() -> str:
    now = datetime.now().astimezone()
    return f"当前本地时间（请以此为准处理所有与日期/时间相关的问题）：{now.strftime('%Y-%m-%d %H:%M:%S %z')}"


def _standard_agent_tool_guard(workspace: Path, agent_id: str) -> str:
    """发往 LLM 的 system 尾部：工具与工作目录说明。"""
    from app.service.knowledge_base_registry_service import list_knowledge_bases
    
    skills_dir = (workspace.resolve().parent / "skills").resolve()
    
    # 获取默认知识库路径
    databases = list_knowledge_bases(agent_id)
    if databases:
        first_kb = databases[0]
        kb_id = first_kb.get("id", "")
        default_kb_path = get_agent_local_data_dir(agent_id) / kb_id
        kb_env_line = f"\nAGENT_DEFAULT_KB（默认知识库路径）={default_kb_path.resolve()}"
    else:
        kb_env_line = "\nAGENT_DEFAULT_KB（默认知识库路径）=无"
    
    return (
        "\n\n你可以使用提供的工具。"
        "\nrun_command 默认 cwd=workspace；注意！调用技能中的脚本时，必须设置 cwd=skills，同时必须要提供 skill_name，目录为 agent_id/skills/<skill_name>/。"
        "\n命令中可使用环境变量: AGENT_WORKSPACE / AGENT_SKILLS / AGENT_DEFAULT_KB。"
        f"\nAGENT_WORKSPACE={workspace.resolve()}"
        f"\nAGENT_SKILLS（skills 根目录）={skills_dir}"
        f"{kb_env_line}"
    )


def build_standard_agent_system_prompt_for_llm(agent_id: str, workspace: Path) -> str:
    """
    标准 Agent 发往 LLM 的完整 system：技能 XML + 用户/默认正文 + 工具 guard + 当前时间。
    仅此一处拼装，避免分散在 skill_loader 与 loop 内。
    """
    from app.utils.skill_loader import discover_skills_xml_for_agent

    xml_block = discover_skills_xml_for_agent(agent_id).strip()
    base = resolve_standard_agent_base_system_prompt(agent_id).strip()
    guard = _standard_agent_tool_guard(workspace, agent_id)
    current_time = _current_datetime_prompt_line().strip()

    head_parts: List[str] = []
    if xml_block:
        head_parts.append(xml_block)
    if base:
        head_parts.append(base)
    if current_time:
        head_parts.append(current_time)
    head = "\n\n".join(head_parts)
    if not head:
        return guard.strip()
    return f"{head}{guard}"


def load_default_system_prompt() -> str:
    path = _PROMPTS_DIR / "system.md"
    return path.read_text(encoding="utf-8").strip()


def resolve_standard_agent_base_system_prompt(agent_id: str) -> str:
    """
    优先使用 agent 数据目录下 prompts/system_prompt.md（如 {DATA_DIR}/agents/agent_std/prompts/system_prompt.md）；
    若不存在或正文为空，则使用仓库内置 prompts/system.md。
    """
    try:
        user_path = get_agent_base_dir(agent_id) / USER_SYSTEM_PROMPT_REL
    except ValueError:
        return load_default_system_prompt()
    if not user_path.is_file():
        return load_default_system_prompt()
    text = user_path.read_text(encoding="utf-8").strip()
    if not text:
        return load_default_system_prompt()
    return text


def _history_llm_turns(history_messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """从持久化历史中提取 LLM 所需的完整多轮对话（包含 tool_calls 和 tool 消息）。"""
    out: List[Dict[str, Any]] = []
    for hm in history_messages:
        role = hm.get("role")
        content = hm.get("content")
        
        # user/assistant: 保留 content 和可选的 tool_calls
        if role in ("user", "assistant"):
            msg = {"role": role, "content": content}
            if "tool_calls" in hm:
                msg["tool_calls"] = hm["tool_calls"]
            out.append(msg)
        
        # tool: 保留 content 和 tool_call_id
        elif role == "tool":
            msg = {"role": "tool", "content": content or ""}
            if "tool_call_id" in hm:
                msg["tool_call_id"] = hm["tool_call_id"]
            out.append(msg)

    logger.debug("history_llm_turns: {} turns", len(out))
    for m in out:
        c = m.get("content", "")
        preview = c[:500] if isinstance(c, str) else str(c)[:500]
        truncated = "…" if isinstance(c, str) and len(c) > 500 else ""
        logger.debug("  {}: {}{}", m['role'], preview, truncated)
        if "tool_calls" in m:
            logger.debug("    └─ tool_calls: {} calls", len(m['tool_calls']))
        if "tool_call_id" in m:
            logger.debug("    └─ tool_call_id: {}", m['tool_call_id'])
    return out


class StandardAgent(BaseAgent):
    """带标准 tool-use loop；工具默认在 workspace，可切换到 skills 目录。"""

    def __init__(self, agent_id: str):
        super().__init__(agent_id=agent_id, system_prompt="")

    def get_system_prompt_for_llm(self) -> str:
        ws = get_agent_workspace_dir(self.agent_id)
        return build_standard_agent_system_prompt_for_llm(self.agent_id, ws)

    def get_config_dict(self) -> dict:
        return {
            "agent_id": self.agent_id,
            "system_prompt": resolve_standard_agent_base_system_prompt(self.agent_id),
        }

    def _workspace_dir(self) -> Path:
        return get_agent_workspace_dir(self.agent_id)

    def _build_loop_messages(self, ctx: AgentTurnContext, workspace: Path) -> List[Dict[str, Any]]:
        system_content = build_standard_agent_system_prompt_for_llm(self.agent_id, workspace)
        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": system_content},
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
        from app.core.ids import new_uuid
        from app.service.messages_service import save_message
        from app.service.sessions_service import save_session_if_new

        session_id = ctx.session_id or new_uuid()
        try:
            workspace = self._workspace_dir()
            registry = create_tool_registry(workspace, self.agent_id)
            messages = self._build_loop_messages(ctx, workspace)

            text_preview = (ctx.user_text or "")[:100]
            logger.info("handle_chat_stream: {} session={} text={}", ctx.agent_id, session_id, text_preview)

            # 确定 session_id 并保存用户消息
            if ctx.user_text:
                save_session_if_new(ctx.agent_id, session_id, ctx.user_text)
                save_message(ctx.agent_id, session_id, "user", ctx.user_text)

            from app.agents.runner import AgentRunner, AgentRunSpec
            from app.agents.standard.streaming_hook import StreamingHook

            provider = _get_provider()
            queue: asyncio.Queue = asyncio.Queue()
            hook = StreamingHook(queue)

            spec = AgentRunSpec(
                initial_messages=messages,
                tools=registry,
                model=provider.default_model,
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
                    await queue.put(None)

            runner_task = asyncio.create_task(run_and_signal())

            while True:
                line = await queue.get()
                if line is None:
                    break
                yield line

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
                    )
                elif role == "tool":
                    save_message(
                        ctx.agent_id, session_id, "tool", content,
                        tool_call_id=msg.get("tool_call_id"),
                    )
        except Exception:
            logger.exception("handle_chat_stream error")
            yield build_stream_chunk(f"出错了，请稍后重试")

        yield build_stream_done(session_id=session_id)
