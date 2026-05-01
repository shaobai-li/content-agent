"""Skill invocation tool — wraps invoke_skill service."""
from __future__ import annotations

from typing import Any

from app.agents.tools.base import Tool, tool_parameters
from app.agents.tools.schema import StringSchema, tool_parameters_schema


@tool_parameters(
    tool_parameters_schema(
        skill_id=StringSchema("技能 id，与 <skill id=\"...\"> 相同"),
        required=["skill_id"],
    )
)
class InvokeSkillTool(Tool):
    """Load a skill's full SKILL.md content."""

    name = "invoke_skill"
    description = (
        "加载某个 skill 的完整 SKILL.md 全文（含 YAML 头）。"
        "skill_id 须与系统提示词最前 <skills> 目录中某 <skill> 的 id 属性一致；"
        "仅可加载当前 Agent 已列出的 skill。"
    )

    def __init__(self, agent_id: str):
        self._agent_id = agent_id

    async def execute(self, skill_id: str, **kwargs: Any) -> str:
        from app.service.skill_service import invoke_skill as _invoke_skill
        return _invoke_skill(self._agent_id, skill_id)
