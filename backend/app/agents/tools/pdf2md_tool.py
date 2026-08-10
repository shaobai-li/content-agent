"""Pdf2md tool — 调用 pdf2md CLI 进行 PDF → Markdown 转换。

pdf2md 使用 PyMuPDF 进行布局感知的本地解析（标题层级、双栏排版、表格、图文分离），
本地文本不足时自动 fallback 到 MinerU OCR。
"""
from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import Any

from app.agents.tools.base import Tool, tool_parameters
from app.agents.tools.schema import BooleanSchema, StringSchema, tool_parameters_schema


@tool_parameters(
    tool_parameters_schema(
        input=StringSchema("PDF 文件的绝对路径"),
        output=StringSchema("输出 Markdown 文件路径"),
        no_ocr=BooleanSchema("禁用 MinerU OCR fallback，仅使用本地 PyMuPDF 解析"),
        force_ocr=BooleanSchema("跳过本地解析，强制使用 MinerU OCR"),
        required=["input", "output"],
    )
)
class Pdf2mdTool(Tool):
    """将 PDF 文件转换为 Markdown 文本。"""

    name = "pdf2md"
    description = (
        "将 PDF 文件转换为 Markdown 文本。"
        "使用 PyMuPDF 进行布局感知的本地解析，"
        "自动识别标题层级、双栏排版、表格和图文区域。"
        "当本地文本不足或扫描页过多时，可自动 fallback 到 MinerU OCR。"
        "输出为 UTF-8 编码的 Markdown 文件。"
    )

    @property
    def concurrency_safe(self) -> bool:
        return False

    async def execute(
        self,
        input: str,
        output: str,
        no_ocr: bool = False,
        force_ocr: bool = False,
        **kwargs: Any,
    ) -> str:
        cmd = [
            "pdf2md",
            "--input", input,
            "--output", output,
        ]
        if no_ocr:
            cmd.append("--no-ocr")
        if force_ocr:
            cmd.append("--force-ocr")

        env = os.environ.copy()
        env.setdefault("AGENT_WORKSPACE", os.environ.get("AGENT_WORKSPACE", ""))

        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=600,
            )
        except asyncio.TimeoutError:
            return "Error: pdf2md 转换超时（600 秒）"
        except OSError as e:
            return f"Error: 执行 pdf2md 失败: {e}"

        if process.returncode != 0:
            err_msg = stderr.decode("utf-8", errors="replace").strip()
            return f"Error: pdf2md 转换失败: {err_msg}"

        return stdout.decode("utf-8", errors="replace").strip()
