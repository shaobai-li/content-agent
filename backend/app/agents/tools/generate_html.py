"""Tool: 调用大模型生成独立 HTML 页面。"""
from __future__ import annotations

import re
from typing import Any

from app.agents.tools.base import Tool
from app.providers.factory import create_provider

GENERATE_HTML_SYSTEM_PROMPT = """你是一个 HTML 生成专家。根据用户的描述生成一个完整的、可独立运行的 HTML 文件。
要求：
- 生成完整的 HTML 文档（<!DOCTYPE html> 开头）
- 所有 CSS 和 JavaScript 内联在单个文件中
- 使用现代化设计风格
- 确保页面自包含、可正常运行
- 不要添加任何外部依赖（CDN 引用除外）
- **仅输出纯 HTML 代码，不要用 ```html 或任何 markdown 代码块包裹，不要加额外解释**"""


def strip_markdown_code_block(content: str) -> str:
    """移除 LLM 输出中可能包裹的 markdown 代码块标记。

    处理 `` ```html\\n...\\n````, `` ```\\n...\\n```` 等常见格式。
    """
    return re.sub(r'^```.*?\n|```$', '', content.strip()).strip()


class GenerateHTMLTool(Tool):
    """根据用户描述生成独立 HTML 页面（含 CSS/JS）。

    Args:
        provider_name: 使用的 LLM provider 名称，默认 None（由 agent 调用方传入）。
        model: 使用的模型名称，默认 None（由 agent 调用方传入）。
    """

    def __init__(self, provider_name: str | None = None, model: str | None = None):
        self._provider_name = provider_name
        self._model = model

    @property
    def name(self) -> str:
        return "generate_html"

    @property
    def description(self) -> str:
        return "生成独立 HTML 页面并在 Canvas 面板中以可视化卡片展示。用于「生成HTML」「做网页」「可视化看板」等场景，勿用 write_file 替代。"

    @property
    def parameters(self) -> dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "描述要生成的 HTML 内容，例如「一个数据可视化看板，展示三个指标卡片和折线图」。注意：不要在此参数中包含完整的 HTML 代码，而是描述你想要生成的内容",
                },
                "style": {
                    "type": "string",
                    "enum": ["modern", "minimal", "dark"],
                    "default": "modern",
                    "description": "视觉风格",
                },
            },
            "required": ["prompt"],
        }

    @property
    def read_only(self) -> bool:
        return False

    async def execute(self, prompt: str, style: str = "modern") -> str:
        provider = create_provider(
            provider_name=self._provider_name,
            model=self._model,
        )
        style_instruction = {
            "modern": "使用现代简约风格，柔和配色，圆角卡片布局",
            "minimal": "使用极简风格，大量留白，黑白配色",
            "dark": "使用深色模式风格，深色背景搭配亮色文字",
        }
        user_message = f"{prompt}\n\n风格要求：{style_instruction.get(style, style_instruction['modern'])}"
        messages = [
            {"role": "system", "content": GENERATE_HTML_SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ]
        response = await provider.chat(
            messages=messages,
            tools=None,
            model=self._model or provider.default_model,
            temperature=0.3,
        )
        if response.finish_reason == "error":
            return f"Error: HTML generation failed - {response.content}"
        return strip_markdown_code_block(response.content or "")
