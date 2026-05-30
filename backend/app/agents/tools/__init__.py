"""Agent tools — Tool subclasses and ToolRegistry factory."""
from __future__ import annotations

from pathlib import Path
from typing import Any

from app.agents.tools.base import Schema, Tool, tool_parameters
from app.agents.tools.filesystem import EditFileTool, ListDirTool, ReadFileTool, WriteFileTool
from app.agents.tools.generate_html import GenerateHTMLTool
from app.agents.tools.registry import ToolRegistry
from app.agents.tools.schema import (
    ArraySchema,
    BooleanSchema,
    IntegerSchema,
    NumberSchema,
    ObjectSchema,
    StringSchema,
    tool_parameters_schema,
)
from app.agents.tools.shell import RunCommandTool
from app.agents.tools.skill import InvokeSkillTool
from app.agents.tools.web import WebFetchTool, WebSearchTool

__all__ = [
    "Schema",
    "ArraySchema",
    "BooleanSchema",
    "IntegerSchema",
    "NumberSchema",
    "ObjectSchema",
    "StringSchema",
    "Tool",
    "ToolRegistry",
    "tool_parameters",
    "tool_parameters_schema",
    "RunCommandTool",
    "ReadFileTool",
    "WriteFileTool",
    "EditFileTool",
    "ListDirTool",
    "WebSearchTool",
    "WebFetchTool",
    "InvokeSkillTool",
    "GenerateHTMLTool",
    "create_tool_registry",
]


def create_tool_registry(
    workspace: Path,
    agent_id: str,
    provider_name: str | None = None,
    model: str | None = None,
) -> ToolRegistry:
    """Create and populate a ToolRegistry with all standard tools.

    Args:
        workspace: Agent workspace directory.
        agent_id: Agent identifier.
        provider_name: LLM provider name, inherited from agent context
                       (used by tools that call LLM internally).
        model: Model name, inherited from agent context.
    """
    registry = ToolRegistry()
    registry.register(RunCommandTool(
        workspace,
        restrict_to_workspace=True,
        allowed_env_keys=["PATH", "HOME"],
    ))
    registry.register(ReadFileTool(workspace))
    registry.register(WriteFileTool(workspace))
    registry.register(EditFileTool(workspace))
    registry.register(ListDirTool(workspace))
    registry.register(WebSearchTool())
    registry.register(WebFetchTool())
    registry.register(InvokeSkillTool(agent_id))
    registry.register(GenerateHTMLTool(provider_name=provider_name, model=model))
    return registry
