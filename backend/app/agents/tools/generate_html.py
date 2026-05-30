"""Tool: 调用大模型生成独立 HTML 页面。"""
from __future__ import annotations

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


class GenerateHTMLTool(Tool):
    """根据用户描述生成独立 HTML 页面（含 CSS/JS）。"""

    def __init__(self, provider_name: str = "deepseek", model: str | None = None):
        self._provider_name = provider_name
        self._model = model

    @property
    def name(self) -> str:
        return "generate_html"

    @property
    def description(self) -> str:
        return "生成一个完整的独立 HTML 页面（含内联 CSS/JS），并在 Canvas 面板中以可视化卡片展示。结果会自动在 Canvas 中以缩略图呈现，支持展开为全尺寸交互视图。用户要求「生成/创建一个HTML页面」「展示可视化效果」「做个网页」等场景请使用此工具，而非 write_file。"

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
        content = response.content or ""
        # 安全移除可能的 markdown 代码块包裹
        content = content.strip()
        if content.startswith("```"):
            # 去掉开头的 ```html、``` 等
            first_newline = content.find("\n")
            if first_newline != -1:
                content = content[first_newline + 1:]
            if content.endswith("```"):
                content = content[:-3].strip()
        return content
