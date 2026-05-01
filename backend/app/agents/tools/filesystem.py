"""File system tools — wraps the existing read_file / write_file implementations."""
from __future__ import annotations

from pathlib import Path
from typing import Any

from app.agents.tools.base import Tool, tool_parameters
from app.agents.tools.schema import StringSchema, tool_parameters_schema


@tool_parameters(
    tool_parameters_schema(
        path=StringSchema("相对于工作区根目录的文件路径"),
        required=["path"],
    )
)
class ReadFileTool(Tool):
    """Read text file content."""

    name = "read_file"
    description = "读取文本文件内容。path 为相对于工作区根目录的相对路径。"

    def __init__(self, workspace: Path):
        self._workspace = workspace

    @property
    def read_only(self) -> bool:
        return True

    async def execute(self, path: str, **kwargs: Any) -> str:
        from app.agents.standard.tools import read_file as _read_file
        return _read_file(self._workspace, path)


@tool_parameters(
    tool_parameters_schema(
        path=StringSchema("相对于工作区根目录的文件路径"),
        content=StringSchema("要写入的文本内容"),
        required=["path", "content"],
    )
)
class WriteFileTool(Tool):
    """Write text content to a file."""

    name = "write_file"
    description = "写入文本文件（按需创建父目录）。path 为相对于工作区根目录的相对路径。"

    def __init__(self, workspace: Path):
        self._workspace = workspace

    async def execute(self, path: str, content: str, **kwargs: Any) -> str:
        from app.agents.standard.tools import write_file as _write_file
        return _write_file(self._workspace, path, content)
