"""标准 Agent：多轮 tool loop + 流式输出最终回复（与 temp/pi_agent.py 思路对齐）。"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, AsyncGenerator, Callable, Dict, List

from openai.types.chat import ChatCompletionMessage

from app.agents.base_agent import BaseAgent
from app.core.config import get_agent_base_dir, get_agent_workspace_dir
from app.runtime.agent_turn_context import AgentTurnContext
from app.service.agent_chat_service import save_chat_session
from app.service.stream_service import (
    build_box_chunk,
    build_box_end,
    build_box_start,
    build_stream_chunk,
    build_stream_done,
)
from app.utils.context_utils import get_article_context_messages
from app.utils.llm_client import deepseek_chat_stream
from app.utils.skill_loader import discover_skills_for_agent

from .tools import STANDARD_AGENT_TOOLS, make_tool_executor

_PROMPTS_DIR = Path(__file__).parent / "prompts"

_MAX_TOOL_ROUNDS = 20


USER_SYSTEM_PROMPT_REL = Path("prompts") / "system_prompt.md"


def _standard_agent_tool_guard(workspace: Path) -> str:
    """发往 LLM 的 system 尾部：工具与工作目录说明。"""
    skills_dir = (workspace.resolve().parent / "skills").resolve()
    return (
        "\n\n你可以使用提供的工具。"
        "\nrun_command 默认 cwd=workspace；注意！调用技能中的脚本时，必须设置 cwd=skills，同时必须要提供 skill_name，目录为 agent_id/skills/<skill_name>/。"
        "\n命令中可使用环境变量: AGENT_WORKSPACE / AGENT_SKILLS。"
        f"\nAGENT_WORKSPACE={workspace.resolve()}"
        f"\nAGENT_SKILLS（skills 根目录）={skills_dir}"
    )


def build_standard_agent_system_prompt_for_llm(agent_id: str, workspace: Path) -> str:
    """
    标准 Agent 发往 LLM 的完整 system：技能 XML + 用户/默认正文 + 工具 guard。
    仅此一处拼装，避免分散在 skill_loader 与 loop 内。
    """
    from app.utils.skill_loader import discover_skills_xml_for_agent

    xml_block = discover_skills_xml_for_agent(agent_id).strip()
    base = resolve_standard_agent_base_system_prompt(agent_id).strip()
    guard = _standard_agent_tool_guard(workspace)

    head_parts: List[str] = []
    if xml_block:
        head_parts.append(xml_block)
    if base:
        head_parts.append(base)
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


def _invoke_skill_name_description_block(agent_id: str, raw_args: str) -> str:
    """供 UI 展示：仅技能的 name 与 description。"""
    sid = ""
    try:
        sid = str((json.loads(raw_args or "{}") or {}).get("skill_id", "") or "").strip()
    except json.JSONDecodeError:
        sid = ""
    if not sid:
        return "name\n（未提供 skill_id）\n\ndescription\n—"
    for head in discover_skills_for_agent(agent_id):
        if head.skill_id == sid:
            return f"name : {head.name}\ndescription : {head.description}"
    return f"name\n（未找到技能 {sid!r}）\n\ndescription\n—"


async def _yield_box_call_then_result(
    title: str,
    icon: str,
    call_summary: str,
    run_tool: Callable[[], str],
    *,
    result_max_len: int = 4000,
    tool_name: str = "",
    raw_args: str = "{}",
    agent_id: str = "",
) -> AsyncGenerator[str, None]:
    """
    单次 box 会话（一对 box_start / box_end）：
    先流式推送调用说明（invoke_skill 时仅 name/description），再执行 run_tool()，再按需推送输出摘要。
    """
    step = 800
    is_invoke_skill = tool_name == "invoke_skill" and bool(agent_id)

    if is_invoke_skill:
        box_title = "技能加载 ..."
        pre_body = _invoke_skill_name_description_block(agent_id, raw_args)
        yield build_box_start(box_title, icon=icon)
        for i in range(0, len(pre_body), step):
            yield build_box_chunk(pre_body[i : i + step])
        run_tool()
    else:
        yield build_box_start(title, icon=icon)
        for i in range(0, len(call_summary), step):
            yield build_box_chunk(call_summary[i : i + step])
        yield build_box_chunk("\n\n")
        raw = run_tool()
        preview = raw if len(raw) <= result_max_len else raw[:result_max_len] + "\n…(truncated)"
        result_summary = f"工具输出:\n{preview}"
        for i in range(0, len(result_summary), step):
            yield build_box_chunk(result_summary[i : i + step])
    yield build_box_end()


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
        workspace = self._workspace_dir()
        execute_tool = make_tool_executor(workspace, self.agent_id)
        messages = self._build_loop_messages(ctx, workspace)
        final_reply_text = ""

        rounds = 0
        while rounds < _MAX_TOOL_ROUNDS:
            rounds += 1
            assistant_msg: ChatCompletionMessage | None = None
            async for part in deepseek_chat_stream(
                messages,
                tools=STANDARD_AGENT_TOOLS,
            ):
                if isinstance(part, str):
                    yield build_stream_chunk(part)
                else:
                    assistant_msg = part
            if assistant_msg is None:
                break
            messages.append(_assistant_message_as_dict(assistant_msg))

            if assistant_msg.tool_calls:
                for tc in assistant_msg.tool_calls:
                    name = tc.function.name
                    raw_args = tc.function.arguments or "{}"
                    try:
                        preview = json.dumps(json.loads(raw_args), ensure_ascii=False)[:600]
                    except json.JSONDecodeError:
                        preview = raw_args[:600]
                    # 同一 collapse：一对 box_start/end；先推送调用信息，再执行工具，再推送输出。
                    # tool_calls 在本轮流式结束后才完整，故「调用意图」无法早于本轮流结束展示。
                    call_summary = f"参数: {preview}"
                    result_box: list[str] = []

                    def _run_tool() -> str:
                        r = execute_tool(name, raw_args)
                        result_box.append(r)
                        return r

                    box_title = f"调用工具 {name} ..."
                    icon = {
                        "read_file": "tool-read",
                        "write_file": "tool-write",
                        "run_command": "tool-command",
                        "invoke_skill": "tool-skill",
                    }.get(name, "tool-command")
                    async for line in _yield_box_call_then_result(
                        box_title,
                        icon,
                        call_summary,
                        _run_tool,
                        tool_name=name,
                        raw_args=raw_args,
                        agent_id=self.agent_id,
                    ):
                        yield line
                    result = result_box[0]
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tc.id,
                            "content": result,
                        }
                    )
                continue

            final_reply_text = (assistant_msg.content or "").strip()
            break
        else:
            final_reply_text = "已达到工具调用轮数上限，请简化任务或分步提问。"
            yield build_stream_chunk(final_reply_text)

        session_id = save_chat_session(
            ctx.agent_id, ctx.session_id, ctx.user_text, final_reply_text
        )
        yield build_stream_done(session_id=session_id)
