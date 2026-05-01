"""Web tools — wraps the existing web_search / web_fetch implementations."""
from __future__ import annotations

from typing import Any

from app.agents.tools.base import Tool, tool_parameters
from app.agents.tools.schema import IntegerSchema, StringSchema, tool_parameters_schema


@tool_parameters(
    tool_parameters_schema(
        query=StringSchema("搜索关键词"),
        count=IntegerSchema(5, description="返回结果数（1-10，默认 5）", minimum=1, maximum=10),
        required=["query"],
    )
)
class WebSearchTool(Tool):
    """Search the web using DuckDuckGo."""

    name = "web_search"
    description = "使用 DuckDuckGo 搜索网页，返回标题、链接和摘要。"

    @property
    def read_only(self) -> bool:
        return True

    async def execute(self, query: str, count: int = 5, **kwargs: Any) -> str:
        from app.agents.standard.tools import web_search as _web_search
        return _web_search(query, count)


@tool_parameters(
    tool_parameters_schema(
        url=StringSchema("待抓取 URL（仅 http/https）"),
        extractMode={
            "type": "string",
            "enum": ["markdown", "text"],
            "default": "markdown",
        },
        maxChars=IntegerSchema(50000, description="最大返回字符数", minimum=100),
        required=["url"],
    )
)
class WebFetchTool(Tool):
    """Fetch URL content with markdown/text extraction."""

    name = "web_fetch"
    description = "抓取 URL 内容，支持 markdown/text 提取。"

    @property
    def read_only(self) -> bool:
        return True

    async def execute(
        self,
        url: str,
        extractMode: str = "markdown",
        maxChars: int = 50000,
        **kwargs: Any,
    ) -> str:
        from app.agents.standard.tools import web_fetch as _web_fetch
        return _web_fetch(url, extractMode, maxChars)
