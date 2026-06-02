"""Shell execution tool — async subprocess with safety guards."""
from __future__ import annotations

import asyncio
import os
import re
import shutil
import sys
from pathlib import Path
from typing import Any

from loguru import logger

from app.agents.tools.base import Tool, tool_parameters
from app.agents.tools.schema import IntegerSchema, StringSchema, tool_parameters_schema

_IS_WINDOWS = sys.platform == "win32"
_MAX_OUTPUT = 10_000
_MAX_TIMEOUT = 600

# Best-effort safety patterns for destructive commands
_DENY_PATTERNS = [
    r"\brm\s+-[rf]{1,2}\b",  # rm -r, rm -rf, rm -fr
    r"\bdel\s+/[fq]\b",  # del /f, del /q
    r"\brmdir\s+/s\b",  # rmdir /s
    r"(?:^|[;&|]\s*)format\b",  # format
    r"\b(mkfs|diskpart)\b",  # disk operations
    r"\bdd\s+if=",  # dd
    r">\s*/dev/sd",  # write to disk
    r"\b(shutdown|reboot|poweroff)\b",  # system power
    r":\(\)\s*\{.*\};\s*:",  # fork bomb
    # 写 nanobot/OmniAge 内部状态文件
    r">>?\s*\S*(?:history\.jsonl|\.dream_cursor)",
    r"\btee\b[^|;&<>]*(?:history\.jsonl|\.dream_cursor)",
    r"\b(?:cp|mv)\b(?:\s+[^\s|;&<>]+)+\s+\S*(?:history\.jsonl|\.dream_cursor)",
    r"\bdd\b[^|;&<>]*\bof=\S*(?:history\.jsonl|\.dream_cursor)",
    r"\bsed\s+-i[^|;&<>]*(?:history\.jsonl|\.dream_cursor)",
]

# Internal network address patterns
_INTERNAL_IP_PATTERNS = [
    r"(?:https?://)?127\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?",  # loopback
    r"(?:https?://)?10\.\d{1,3}\.\d{1,3}\.\d{1,3}(?::\d+)?",  # 10.x.x.x
    r"(?:https?://)?172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}(?::\d+)?",  # 172.16-31.x.x
    r"(?:https?://)?192\.168\.\d{1,3}\.\d{1,3}(?::\d+)?",  # 192.168.x.x
    r"(?:https?://)?169\.254\.\d{1,3}\.\d{1,3}(?::\d+)?",  # link-local
    r"(?:https?://)?0\.0\.0\.0(?::\d+)?",
    r"(?:https?://)?\[::1\](?::\d+)?",  # IPv6 loopback
    r"(?:https?://)?\[fc00:\]",  # IPv6 unique-local
    r"(?:https?://)?\[fe80:\]",  # IPv6 link-local
    r"(?:https?://)?\[fd",  # IPv6 unique-local (alternative)
    r"(?:https?://)?localhost(?::\d+)?",  # localhost
    r"(?:https?://)?(?:corp|intra|internal|private|company)\.",  # internal hostnames
]


def _resolve_run_cwd(workspace: Path, cwd_mode: str, skill_name: str = "") -> Path:
    """Resolve working directory with skills support."""
    ws = workspace.resolve()
    if cwd_mode == "skills":
        raw = (skill_name or "").strip()
        if not raw:
            raise ValueError("skill_name is required when cwd=skills")
        safe = Path(raw).name
        if safe in ("", ".", ".."):
            raise ValueError("invalid skill_name")

        # 优先：user skills（同名覆盖语义，与 discover_skills_for_agent 一致）
        user_root = (ws.parent / "skills").resolve()
        user_dir = (user_root / safe).resolve()
        if user_dir.is_relative_to(user_root) and user_dir.is_dir():
            return user_dir

        # 其次：bundled skills（复用 skill_loader 的路径解析）
        from app.utils.skill_loader import bundled_skills_dir

        bundled_dir = (bundled_skills_dir() / safe).resolve()
        if bundled_dir.is_dir():
            return bundled_dir

        # 都不存在 → 在 user skills 下创建（兼容原有行为）
        user_dir.parent.mkdir(parents=True, exist_ok=True)
        user_dir.mkdir(parents=True, exist_ok=True)
        return user_dir
    return ws


def _contains_internal_url(text: str) -> bool:
    """Check if text contains internal/private network URLs."""
    lower = text.lower()
    for pattern in _INTERNAL_IP_PATTERNS:
        if re.search(pattern, lower):
            return True
    return False


@tool_parameters(
    tool_parameters_schema(
        command=StringSchema("要执行的 shell 命令"),
        cwd=StringSchema(
            "命令工作目录：workspace(默认) | skills",
            enum=["workspace", "skills"],
        ),
        skill_name=StringSchema("当 cwd=skills 时，指定技能目录名"),
        timeout=IntegerSchema(description="超时时间（秒），最长 600 秒", maximum=_MAX_TIMEOUT),
        required=["command"],
    )
)
class RunCommandTool(Tool):
    """Execute shell commands in workspace or skills directory."""

    name = "run_command"
    description = (
        "执行 shell 命令（如 ls、python script.py）。"
        "可选 cwd: workspace|skills。"
        "当 cwd=skills 时需提供 skill_name。"
        "命令可使用环境变量 AGENT_WORKSPACE、AGENT_SKILLS。"
    )

    def __init__(
        self,
        workspace: Path,
        timeout: int = 60,
        deny_patterns: list[str] | None = None,
        allow_patterns: list[str] | None = None,
        restrict_to_workspace: bool = True,
        sandbox: str = "",
        path_append: str = "",
        allowed_env_keys: list[str] | None = None,
    ):
        self._workspace = workspace
        self._timeout = min(timeout, _MAX_TIMEOUT)
        self._deny_patterns = deny_patterns if deny_patterns is not None else _DENY_PATTERNS
        self._allow_patterns = allow_patterns
        self._restrict_to_workspace = restrict_to_workspace
        self._sandbox = sandbox
        self._path_append = path_append
        self._allowed_env_keys = allowed_env_keys

    @property
    def exclusive(self) -> bool:
        return True

    async def execute(
        self,
        command: str,
        cwd: str = "workspace",
        skill_name: str = "",
        timeout: int = 0,
        **kwargs: Any,
    ) -> str:
        # cwd 参数兼容：支持 LLM 传入的 working_dir 格式
        cwd_mode = (cwd or "workspace").strip().lower()

        # 解析工作目录
        try:
            run_cwd = _resolve_run_cwd(
                self._workspace,
                cwd_mode,
                skill_name,
            )
        except ValueError as e:
            return f"Error: {e}"

        # restrict_to_workspace：校验 LLM 传入的 cwd 在 workspace 内
        if self._restrict_to_workspace and cwd_mode not in ("workspace", "skills"):
            ws = self._workspace.resolve()
            candidate = Path(cwd_mode).resolve()
            if not self._is_path_allowed(candidate, ws):
                return f"Error: working_dir '{cwd}' is outside the allowed workspace"

        # 安全守卫
        guard_error = self._guard_command(command)
        if guard_error:
            return guard_error

        # sandbox 包装
        effective_command = command
        if self._sandbox:
            if _IS_WINDOWS:
                logger.warning("Sandbox is not supported on Windows, skipping")
            else:
                try:
                    from app.agents.tools.sandbox import wrap_command

                    effective_command = wrap_command(
                        self._sandbox, command, self._workspace, run_cwd
                    )
                except ImportError:
                    logger.warning("sandbox module not available, skipping")
                except Exception as e:
                    return f"Error applying sandbox: {e}"

        # path_append
        extra_path = self._path_append

        # 构建最小环境
        env = self._build_env(
            run_cwd,
            use_skills_cwd=cwd_mode == "skills",
            extra_path=extra_path,
        )

        # 执行超时
        effective_timeout = self._timeout
        if timeout and timeout > 0:
            effective_timeout = min(timeout, _MAX_TIMEOUT)

        # 执行
        try:
            process = await self._spawn(effective_command, str(run_cwd), env)
            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(),
                    timeout=effective_timeout,
                )
            except asyncio.TimeoutError:
                await self._kill_process(process)
                return f"Error: Command timed out after {effective_timeout} seconds"
            except asyncio.CancelledError:
                await self._kill_process(process)
                raise

            # 构建输出
            output_parts: list[str] = []
            if stdout:
                output_parts.append(stdout.decode("utf-8", errors="replace"))
            if stderr:
                stderr_text = stderr.decode("utf-8", errors="replace")
                if stderr_text.strip():
                    output_parts.append(f"[stderr]\n{stderr_text}")
            output_parts.append(f"\nExit code: {process.returncode}")

            result = "\n".join(output_parts) if output_parts else "(no output)"

            # 截断过长输出
            if len(result) > _MAX_OUTPUT:
                half = _MAX_OUTPUT // 2
                result = (
                    result[:half]
                    + f"\n... ({len(result) - _MAX_OUTPUT:,} chars truncated) ...\n"
                    + result[-half:]
                )

            return result
        except Exception as e:
            return f"Error executing command: {e}"

    def _build_env(
        self,
        cwd: Path,
        use_skills_cwd: bool = False,
        extra_path: str = "",
    ) -> dict[str, str]:
        """
        最小权限环境变量。
        仅继承必需的变量，不暴露全部 os.environ。
        """
        ws = self._workspace.resolve()
        skills_dir = str(ws.parent / "skills")

        if use_skills_cwd:
            agent_skills = str(cwd.resolve())
        else:
            agent_skills = skills_dir

        if _IS_WINDOWS:
            sr = os.environ.get("SYSTEMROOT", r"C:\Windows")
            env = {
                "SYSTEMROOT": sr,
                "COMSPEC": os.environ.get("COMSPEC", f"{sr}\\system32\\cmd.exe"),
                "USERPROFILE": os.environ.get("USERPROFILE", ""),
                "HOMEDRIVE": os.environ.get("HOMEDRIVE", "C:"),
                "HOMEPATH": os.environ.get("HOMEPATH", "\\"),
                "TEMP": os.environ.get("TEMP", f"{sr}\\Temp"),
                "TMP": os.environ.get("TMP", f"{sr}\\Temp"),
                "APPDATA": os.environ.get("APPDATA", ""),
                "LOCALAPPDATA": os.environ.get("LOCALAPPDATA", ""),
                "ProgramData": os.environ.get("ProgramData", ""),
                "ProgramFiles": os.environ.get("ProgramFiles", ""),
                "PATHEXT": os.environ.get("PATHEXT", ".COM;.EXE;.BAT;.CMD"),
                "PATH": os.environ.get("PATH", f"{sr}\\system32;{sr}"),
            }
            if extra_path:
                env["PATH"] = f"{extra_path};{env['PATH']}"
        else:
            bash = shutil.which("bash") or "/bin/bash"
            env = {
                "HOME": os.environ.get("HOME", "/tmp"),
                "LANG": os.environ.get("LANG", "C.UTF-8"),
                "TERM": os.environ.get("TERM", "dumb"),
                "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
            }
            if extra_path:
                env["PATH"] = f"{extra_path}:{env['PATH']}"

        env["AGENT_WORKSPACE"] = str(ws)
        env["AGENT_SKILLS"] = agent_skills

        # 注入 allowed_env_keys（不覆盖 _build_env 已显式设置的变量）
        if self._allowed_env_keys:
            for key in self._allowed_env_keys:
                if key not in env and key in os.environ:
                    env[key] = os.environ[key]

        return env

    @staticmethod
    async def _spawn(
        command: str, cwd: str, env: dict[str, str],
    ) -> asyncio.subprocess.Process:
        """Launch command in a platform-appropriate shell."""
        if _IS_WINDOWS:
            comspec = env.get("COMSPEC", os.environ.get("COMSPEC", "cmd.exe"))
            return await asyncio.create_subprocess_exec(
                comspec, "/c", command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=cwd,
                env=env,
            )
        bash = shutil.which("bash") or "/bin/bash"
        return await asyncio.create_subprocess_exec(
            bash, "-l", "-c", command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=cwd,
            env=env,
        )

    @staticmethod
    async def _kill_process(process: asyncio.subprocess.Process) -> None:
        """Kill and reap the process."""
        process.kill()
        try:
            await asyncio.wait_for(process.wait(), timeout=5.0)
        except asyncio.TimeoutError:
            pass
        finally:
            if not _IS_WINDOWS:
                try:
                    os.waitpid(process.pid, os.WNOHANG)
                except (ProcessLookupError, ChildProcessError):
                    pass

    def _guard_command(self, command: str) -> str | None:
        """Best-effort safety guard for destructive commands."""
        lower = command.strip().lower()

        # allow_patterns 白名单：如果设置了，命令必须匹配至少一个模式
        if self._allow_patterns:
            if not any(re.search(p, lower) for p in self._allow_patterns):
                return (
                    "Error: Command blocked by safety guard "
                    "(does not match any allowed pattern)"
                )

        # deny_patterns 黑名单
        for pattern in self._deny_patterns:
            if re.search(pattern, lower):
                return (
                    "Error: Command blocked by safety guard "
                    "(dangerous pattern detected)"
                )

        # restrict_to_workspace：路径遍历检查
        if self._restrict_to_workspace:
            # 检查路径遍历
            if re.search(r"\.\.[\\/]", lower):
                return (
                    "Error: Command blocked by safety guard "
                    "(path traversal detected)"
                )

            # 提取命令中的绝对路径，检查是否在 workspace 或 media 目录内
            ws = self._workspace.resolve()
            media_dir = ws / "media"
            abs_paths = re.findall(r'(?:^|\s)([a-zA-Z]:[\\/][^\s|;&<>"\']+)', lower)
            abs_paths += re.findall(r'(?:^|\s)(/[^\s|;&<>"\']+)', lower)
            for p in abs_paths:
                try:
                    resolved = Path(p).resolve()
                    if resolved.exists() and not (
                        resolved.is_relative_to(ws) or resolved.is_relative_to(media_dir)
                    ):
                        return (
                            "Error: Command blocked by safety guard "
                            f"(access to path outside workspace: {p})"
                        )
                except (OSError, ValueError):
                    pass

        # 内网 URL 检测
        if _contains_internal_url(lower):
            return (
                "Error: Command blocked by safety guard "
                "(internal network URL detected)"
            )

        return None

    @staticmethod
    def _is_path_allowed(candidate: Path, workspace: Path) -> bool:
        """Check if a candidate path is within the allowed workspace."""
        try:
            return candidate.is_relative_to(workspace) or candidate.is_relative_to(
                workspace / "media"
            )
        except (OSError, ValueError):
            return False
