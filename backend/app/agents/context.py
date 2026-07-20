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

    BOOTSTRAP_FILES = ["SOUL.md", "USER.md", "IDENTITY.md"]

    def __init__(self, workspace: Path, agent_id: str | None = None):
        self.workspace = workspace
        self.agent_id = agent_id

    # ------------------------------------------------------------------
    # System prompt
    # ------------------------------------------------------------------

    def build_system_prompt(self) -> str:
        """Build the full system prompt sent to the LLM.

        Composition (top-to-bottom):
          1. Skills XML catalog (``<skills>…</skills>``)
          2. Bootstrap files — ``SOUL.md`` / ``USER.md`` / ``IDENTITY.md``
          3. Base prompt — ``SYSTEM.md`` body (built-in or user override)
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
        prompt = guard.strip() if not head else f"{head}{guard}"
        print(f"\n{'='*80}\n【System Prompt】\n{'='*80}\n{prompt}\n{'='*80}\n", flush=True)
        return prompt

    @staticmethod
    def _extract_system_md_body(path: Path) -> str:
        """提取 SYSTEM.md 中 frontmatter 之后的 Markdown body。"""
        content = path.read_text(encoding="utf-8")
        if content.startswith("---"):
            parts = content.split("---", 2)
            if len(parts) >= 3:
                return parts[2].strip()
        return content.strip()

    def _resolve_base_prompt(self) -> str:
        """Return the base system prompt.

        只从 workspace 目录读取 SYSTEM.md（由 seed 机制保证文件存在）。
        """
        if self.agent_id:
            user_path = get_agent_base_dir(self.agent_id) / "SYSTEM.md"
            if user_path.is_file():
                body = self._extract_system_md_body(user_path)
                if body:
                    return body

        return ""

    def _load_bootstrap_files(self) -> str:
        """Load bootstrap files from agent root dir (SOUL.md, USER.md, IDENTITY.md)."""
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
        skills_dir = (ws / ".agent" / "skills").resolve()
        kb_line = self._build_kb_env_line()
        return (
            "\n\n你可以使用提供的工具。"
            "\nrun_command 默认 cwd=workspace；"
            "注意！调用技能中的脚本时，必须设置 cwd=skills，"
            "同时必须要提供 skill_name，目录为 .agent/skills/<skill_name>/。"
            "\n命令中可使用环境变量: AGENT_WORKSPACE / AGENT_SKILLS / AGENT_DEFAULT_KB。"
            f"\nAGENT_WORKSPACE={ws}"
            f"\nAGENT_SKILLS（skills 根目录）={skills_dir}"
            f"{kb_line}"
            "\n\n当用户要求「生成 HTML」「做个网页」「可视化看板」等需要渲染展示的内容时，"
            "请使用 generate_html 工具生成 HTML，生成结果会自动在 Canvas 面板中以可视化卡片展示。"
            "不要用 write_file 代替——generate_html 的展示效果更好。"
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
