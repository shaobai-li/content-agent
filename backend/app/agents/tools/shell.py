"""Shell execution tool — wraps the existing run_command implementation."""
from __future__ import annotations

from pathlib import Path
from typing import Any

from app.agents.tools.base import Tool, tool_parameters
from app.agents.tools.schema import StringSchema, tool_parameters_schema


@tool_parameters(
    tool_parameters_schema(
        command=StringSchema("要执行的 shell 命令"),
        cwd=StringSchema(
            "命令工作目录：workspace(默认) | skills",
            enum=["workspace", "skills"],
        ),
        skill_name=StringSchema("当 cwd=skills 时，指定技能目录名"),
        required=["command"],
    )
)
class RunCommandTool(Tool):
    """Execute shell commands in workspace or skills directory."""

    name = "run_command"
    description = (
        "执行 shell 命令（如 ls、python script.py）。"
        "可选 cwd: workspace|skills。"
        "当 cwd=skills 时需提供 skill_name。"
        "命令可使用环境变量 AGENT_WORKSPACE、AGENT_SKILLS。"
    )

    def __init__(self, workspace: Path):
        self._workspace = workspace

    @property
    def exclusive(self) -> bool:
        return True

    async def execute(
        self,
        command: str,
        cwd: str = "workspace",
        skill_name: str = "",
        **kwargs: Any,
    ) -> str:
        from app.agents.standard.tools import run_command as _run_command
        return _run_command(self._workspace, command, cwd, skill_name)
