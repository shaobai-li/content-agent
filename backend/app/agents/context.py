"""Context builder for assembling agent prompts."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any

from app.core.config import get_agent_base_dir, get_agent_local_data_dir
from app.utils.skill_loader import discover_skills_xml_for_agent


class ContextBuilder:
    """Builds the context (system prompt + messages) for the agent.

    Organizes prompt assembly into two phases:
      1. build_system_prompt()  — skills XML + base prompt + time + tool guard
      2. build_messages()       — system + history + reference articles + user message
    """

    BOOTSTRAP_FILES = ["AGENTS.md", "SOUL.md", "USER.md", "IDENTITY.md"]

    def __init__(self, workspace: Path, agent_id: str | None = None):
        self.workspace = workspace
        self.agent_id = agent_id
        self._prompts_dir = Path(__file__).resolve().parent / "standard" / "prompts"

    # ------------------------------------------------------------------
    # System prompt
    # ------------------------------------------------------------------

    def build_system_prompt(self) -> str:
        """Build the full system prompt sent to the LLM.

        Composition (top-to-bottom):
          1. Skills XML catalog (``<skills>…</skills>``)
          2. Bootstrap files — ``AGENTS.md`` / ``SOUL.md`` / ``USER.md`` / ``IDENTITY.md``
          3. Base prompt — user override ``system_prompt.md`` or built-in ``system.md``
          4. Current local datetime
          5. Tool guard — workspace / skills / KB environment variables
        """
        parts: list[str] = []

        if self.agent_id:
            xml = discover_skills_xml_for_agent(self.agent_id).strip()
            if xml:
                parts.append(xml)

        bootstrap = self._load_bootstrap_files()
        if bootstrap:
            parts.append(bootstrap)

        base = self._resolve_base_prompt()
        if base:
            parts.append(base)

        parts.append(self._current_datetime())

        head = "\n\n".join(parts)
        guard = self._build_tool_guard()
        if not head:
            return guard.strip()
        return f"{head}{guard}"

    def _resolve_base_prompt(self) -> str:
        """Return the base system prompt.

        Priority:
          1. Agent data dir ``prompts/system_prompt.md`` (user override)
          2. Built-in ``standard/prompts/system.md``
        """
        if self.agent_id:
            user_path = get_agent_base_dir(self.agent_id) / "prompts" / "system_prompt.md"
            if user_path.is_file():
                text = user_path.read_text(encoding="utf-8").strip()
                if text:
                    return text
        path = self._prompts_dir / "system.md"
        return path.read_text(encoding="utf-8").strip()

    def _load_bootstrap_files(self) -> str:
        """Load bootstrap files from workspace (AGENTS.md, SOUL.md, USER.md, IDENTITY.md)."""
        parts = []
        for filename in self.BOOTSTRAP_FILES:
            file_path = self.workspace / filename
            if file_path.exists():
                content = file_path.read_text(encoding="utf-8").strip()
                if content:
                    parts.append(f"## {filename}\n\n{content}")
        return "\n\n".join(parts) if parts else ""

    @staticmethod
    def _current_datetime() -> str:
        now = datetime.now().astimezone()
        return (
            f"当前本地时间（请以此为准处理所有与日期/时间相关的问题）："
            f"{now.strftime('%Y-%m-%d %H:%M:%S %z')}"
        )

    def _build_tool_guard(self) -> str:
        """Tool & directory guard appended to the system prompt tail."""
        ws = self.workspace.resolve()
        skills_dir = (ws.parent / "skills").resolve()
        kb_line = self._build_kb_env_line()
        return (
            "\n\n你可以使用提供的工具。"
            "\nrun_command 默认 cwd=workspace；"
            "注意！调用技能中的脚本时，必须设置 cwd=skills，"
            "同时必须要提供 skill_name，目录为 agent_id/skills/<skill_name>/。"
            "\n命令中可使用环境变量: AGENT_WORKSPACE / AGENT_SKILLS / AGENT_DEFAULT_KB。"
            f"\nAGENT_WORKSPACE={ws}"
            f"\nAGENT_SKILLS（skills 根目录）={skills_dir}"
            f"{kb_line}"
        )

    def resolve_base_prompt(self) -> str:
        """Public alias of :meth:`_resolve_base_prompt`.

        Used by callers that need only the base prompt text
        (e.g. ``get_config_dict``).
        """
        return self._resolve_base_prompt()

    def build_messages(
        self,
        history: list[dict[str, Any]],
        current_message: str,
        mentions: list[dict] | None = None,
    ) -> list[dict[str, Any]]:
        """Build the complete message list for an LLM call.

        Order:
          1. System prompt  (via :meth:`build_system_prompt`)
          2. History        (user / assistant / tool multi-turn)
          3. References     (mention articles expanded to ``user`` messages)
          4. User message   (the current turn text)
        """
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": self.build_system_prompt()},
        ]
        messages.extend(history)

        if mentions:
            refs = self._build_reference_messages(mentions)
            if refs:
                if messages[-1].get("role") == refs[0].get("role"):
                    last = dict(messages[-1])
                    last["content"] = self._merge_message_content(
                        last.get("content"), refs[0].get("content"),
                    )
                    messages[-1] = last
                    messages.extend(refs[1:])
                else:
                    messages.extend(refs)

        if current_message:
            messages.append({"role": "user", "content": current_message})
        return messages

    @staticmethod
    def _merge_message_content(left: Any, right: Any) -> str | list[dict[str, Any]]:
        if isinstance(left, str) and isinstance(right, str):
            return f"{left}\n\n{right}" if left else right

        def _to_blocks(value: Any) -> list[dict[str, Any]]:
            if isinstance(value, list):
                return [
                    item if isinstance(item, dict) else {"type": "text", "text": str(item)}
                    for item in value
                ]
            if value is None:
                return []
            return [{"type": "text", "text": str(value)}]

        return _to_blocks(left) + _to_blocks(right)

    def _build_reference_messages(self, mentions: list[dict]) -> list[dict[str, Any]]:
        """Expand mention article paths into ``user`` messages."""
        result: list[dict[str, Any]] = []
        for mention in mentions:
            path_str = mention.get("parsed_path")
            if not path_str:
                continue
            path = Path(path_str)
            if not path.exists():
                continue
            try:
                content = path.read_text(encoding="utf-8")
            except Exception:
                continue
            name = mention.get("name", "未命名文章")
            result.append({
                "role": "user",
                "content": f"# 参考文章: {name}\n\n{content}",
            })
        return result

    def _build_kb_env_line(self) -> str:
        """Build the ``AGENT_DEFAULT_KB`` environment variable line."""
        if not self.agent_id:
            return "\nAGENT_DEFAULT_KB（默认知识库路径）=无"
        from app.service.knowledge_base_registry_service import list_knowledge_bases

        databases = list_knowledge_bases(self.agent_id)
        if not databases:
            return "\nAGENT_DEFAULT_KB（默认知识库路径）=无"
        first = databases[0]
        kb_id = first.get("id", "")
        kb_path = get_agent_local_data_dir(self.agent_id) / kb_id
        return f"\nAGENT_DEFAULT_KB（默认知识库路径）={kb_path.resolve()}"
