"""Agent tools — Tool subclasses and ToolRegistry factory."""
from __future__ import annotations

from pathlib import Path
from typing import Any

from app.agents.tools.base import Schema, Tool, tool_parameters
from app.agents.tools.filesystem import ReadFileTool, WriteFileTool
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
    "WebSearchTool",
    "WebFetchTool",
    "InvokeSkillTool",
    "create_tool_registry",
]


def create_tool_registry(workspace: Path, agent_id: str) -> ToolRegistry:
    """Create and populate a ToolRegistry with all standard tools."""
    registry = ToolRegistry()
    registry.register(RunCommandTool(workspace))
    registry.register(ReadFileTool(workspace))
    registry.register(WriteFileTool(workspace))
    registry.register(WebSearchTool())
    registry.register(WebFetchTool())
    registry.register(InvokeSkillTool(agent_id))
    return registry
