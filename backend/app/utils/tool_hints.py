"""工具调用提示格式化 — 生成简洁的 tool_hint 摘要文本给前端显示。"""

from __future__ import annotations

import re
from typing import Any

# 注册格式：(key_args, is_path)
# is_path 表示参数是文件路径，需要缩写
_TOOL_FORMATS: dict[str, tuple[list[str], bool]] = {
    "run_command":  (["command"],                False),
    "read_file":    (["path", "file_path"],       True),
    "write_file":   (["path", "file_path"],       True),
    "edit_file":    (["file_path", "path"],       True),
    "list_dir":     (["path"],                    True),
    "web_search":   (["query"],                   False),
    "web_fetch":    (["url"],                     True),
    "invoke_skill": (["skill_id"],                False),
    "generate_html":(["prompt"],                  False),
}

# 匹配文件路径（包括含空格的引号路径）
_PATH_IN_CMD_RE = re.compile(
    r'"(?P<double>(?:[A-Za-z]:[/\\]|~/|/)[^"]+)"'
    r"|'(?P<single>(?:[A-Za-z]:[/\\]|~/|/)[^']+)'"
    r"|(?P<bare>(?:[A-Za-z]:[/\\]|~/|(?<=\s)/)[^\s;&|<>\"']+)"
)


def _get_first_str_arg(arguments: dict[str, Any], key_args: list[str]) -> str | None:
    """从 arguments 中按 key 优先级提取第一个字符串值。"""
    for key in key_args:
        val = arguments.get(key)
        if isinstance(val, str) and val:
            return val
    # 兜底：取第一个字符串参数
    for val in arguments.values():
        if isinstance(val, str) and val:
            return val
    return None


def _abbrev_path(path: str, max_len: int = 40) -> str:
    """缩写文件路径，保留 basename 和最近几级父目录。"""
    import os

    if not path:
        return path

    normalized = path.replace("\\", "/")
    home = os.path.expanduser("~").replace("\\", "/")
    if normalized.startswith(home + "/"):
        normalized = "~" + normalized[len(home):]
    elif normalized == home:
        normalized = "~"

    if len(normalized) <= max_len:
        return normalized

    parts = normalized.rstrip("/").split("/")
    if len(parts) <= 1:
        return normalized[:max_len - 1] + "…"

    basename = parts[-1]
    budget = max_len - len(basename) - 3
    kept: list[str] = []
    for seg in reversed(parts[:-1]):
        needed = len(seg) + 1
        if not kept and needed <= budget:
            kept.append(seg)
            budget -= needed
        elif kept:
            if needed <= budget:
                kept.append(seg)
                budget -= needed
            else:
                break
        else:
            break

    kept.reverse()
    if kept:
        return "…/" + "/".join(kept) + "/" + basename
    return "…/" + basename


def _abbrev_cmd(cmd: str, max_len: int = 40) -> str:
    """缩写 shell 命令，缩写路径并截断。"""
    def _replace_path(match: re.Match) -> str:
        if match.group("double"):
            return f'"{_abbrev_path(match.group("double"), max_len=25)}"'
        if match.group("single"):
            return f"'{_abbrev_path(match.group('single'), max_len=25)}'"
        return _abbrev_path(match.group("bare"), max_len=25)

    abbreviated = _PATH_IN_CMD_RE.sub(_replace_path, cmd)
    if len(abbreviated) <= max_len:
        return abbreviated
    return abbreviated[:max_len - 1] + "…"


def format_tool_hint(name: str, arguments: dict[str, Any]) -> str:
    """生成简洁的工具调用提示文本。

    格式：``{tool_name} ({abbreviated_param})``

    示例：
        run_command (python script.py)
        read_file (src/main.py)
        web_search (量子计算)
    """
    fmt = _TOOL_FORMATS.get(name)
    if fmt:
        key_args, is_path = fmt
        val = _get_first_str_arg(arguments, key_args)
        if val is not None:
            if is_path:
                val = _abbrev_path(val)
            return f"{name} ({val})"

    # 无注册格式的兜底：取第一个字符串参数
    for val in arguments.values():
        if isinstance(val, str) and val:
            if len(val) > 40:
                val = val[:39] + "…"
            return f"{name} ({val})"

    return name
