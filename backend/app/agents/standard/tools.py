"""标准 Agent 可调用的沙箱工具（路径相对于 agent 工作区根目录）。"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any, Callable, Dict, List

from app.service.skill_service import invoke_skill as invoke_skill_service

# OpenAI / DeepSeek chat.completions 的 tools 定义（与 temp/pi_agent.py 对齐）
STANDARD_AGENT_TOOLS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "run_command",
            "description": "在工作区内执行 shell 命令（如 ls、python script.py）。相对路径相对于工作区根目录。",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "要执行的 shell 命令。"}
                },
                "required": ["command"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "读取文本文件内容。path 为相对于工作区根目录的相对路径。",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "写入文本文件（按需创建父目录）。path 为相对于工作区根目录的相对路径。",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "content": {"type": "string"},
                },
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "invoke_skill",
            "description": (
                "加载某个 skill 的完整 SKILL.md 全文（含 YAML 头）。"
                "skill_id 须与系统提示词最前 <skills> 目录中某 <skill> 的 id 属性一致；"
                "仅可加载当前 Agent 已列出的 skill。"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "skill_id": {
                        "type": "string",
                        "description": "技能 id，与 <skill id=\"...\"> 相同。",
                    }
                },
                "required": ["skill_id"],
            },
        },
    },
]


def _resolve_under_workspace(workspace: Path, rel_path: str) -> Path:
    root = workspace.resolve()
    full = (root / rel_path).resolve()
    if not full.is_relative_to(root):
        raise ValueError("Path outside workspace not allowed")
    return full


def read_file(workspace: Path, path: str) -> str:
    file_path = _resolve_under_workspace(workspace, path)
    if not file_path.exists():
        return f"Error: File {path} does not exist"
    try:
        return file_path.read_text(encoding="utf-8")
    except OSError as e:
        return f"Error reading file: {e}"


def write_file(workspace: Path, path: str, content: str) -> str:
    file_path = _resolve_under_workspace(workspace, path)
    try:
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(content, encoding="utf-8")
        return f"Successfully wrote to {path}"
    except OSError as e:
        return f"Error writing file: {e}"


def run_command(workspace: Path, command: str) -> str:
    try:
        result = subprocess.run(
            command,
            shell=True,
            cwd=str(workspace.resolve()),
            capture_output=True,
            text=True,
            timeout=30,
        )
        output = result.stdout or ""
        if result.stderr:
            output += f"\n[stderr]\n{result.stderr}"
        if not output.strip():
            return "Command executed successfully (no output)."
        return output
    except subprocess.TimeoutExpired:
        return "Error: Command timed out after 30 seconds."
    except OSError as e:
        return f"Error: {e}"


def make_tool_executor(workspace: Path, agent_id: str) -> Callable[[str, str], str]:
    """返回 (name, arguments_json) -> result_str，供 agent loop 调用。"""

    def execute(name: str, arguments: str) -> str:
        try:
            args = json.loads(arguments or "{}")
        except json.JSONDecodeError as e:
            return f"Error: invalid tool arguments JSON: {e}"
        if name == "read_file":
            return read_file(workspace, str(args.get("path", "")))
        if name == "write_file":
            return write_file(workspace, str(args.get("path", "")), str(args.get("content", "")))
        if name == "run_command":
            return run_command(workspace, str(args.get("command", "")))
        if name == "invoke_skill":
            return invoke_skill_service(agent_id, str(args.get("skill_id", "")))
        return f"Error: unknown tool {name!r}"

    return execute
