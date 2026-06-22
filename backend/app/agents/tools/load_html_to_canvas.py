"""Tool: 加载本地 HTML 文件并在 Canvas 面板中展示。"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from app.agents.tools.base import Tool
from app.agents.tools.filesystem import _resolve_path

# 推送到 Canvas 的 HTML 内容大小上限（字符数）
MAX_HTML_SIZE = 200_000


class LoadHTMLToCanvasTool(Tool):
    """加载本地 HTML 文件并在 Canvas 面板中以可视化卡片展示。

    Args:
        workspace: Agent workspace 目录，用于解析相对路径。
    """

    def __init__(self, workspace: Path | None = None):
        self._workspace = workspace

    @property
    def name(self) -> str:
        return "load_html_to_canvas"

    @property
    def description(self) -> str:
        return "加载本地 HTML 文件并在 Canvas 面板中以可视化卡片展示。"

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "HTML 文件路径，相对于 workspace 目录",
                },
            },
            "required": ["path"],
        }

    @property
    def read_only(self) -> bool:
        return True

    async def execute(self, path: str) -> str:
        # 解析路径（限制在 workspace 内）
        try:
            resolved = _resolve_path(path, self._workspace, self._workspace)
        except PermissionError:
            return f"Error: Path '{path}' is outside the allowed workspace directory"

        if not resolved.exists():
            return f"Error: File not found at '{resolved}'"

        if not resolved.is_file():
            return f"Error: '{resolved}' is not a file"

        # 检查文件大小
        file_size = resolved.stat().st_size
        if file_size > MAX_HTML_SIZE:
            return (
                f"Error: File size ({file_size} bytes) exceeds "
                f"the maximum allowed size ({MAX_HTML_SIZE} bytes)"
            )

        # 读取文件
        try:
            html = resolved.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            return f"Error: File '{path}' is not a valid UTF-8 text file"
        except Exception as e:
            return f"Error: Failed to read file '{path}': {e}"

        return html
