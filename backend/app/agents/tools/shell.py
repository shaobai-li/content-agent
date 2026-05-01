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
from app.agents.tools.schema import StringSchema, tool_parameters_schema

_IS_WINDOWS = sys.platform == "win32"
_MAX_OUTPUT = 10_000

# Best-effort safety patterns for destructive commands
_DENY_PATTERNS = [
    r"\brm\s+-[rf]{1,2}\b",         # rm -r, rm -rf, rm -fr
    r"\bdel\s+/[fq]\b",             # del /f, del /q
    r"\brmdir\s+/s\b",              # rmdir /s
    r"(?:^|[;&|]\s*)format\b",      # format
    r"\b(mkfs|diskpart)\b",         # disk operations
    r"\bdd\s+if=",                  # dd
    r">\s*/dev/sd",                 # write to disk
    r"\b(shutdown|reboot|poweroff)\b",  # system power
    r":\(\)\s*\{.*\};\s*:",         # fork bomb
]


@tool_parameters(
    tool_parameters_schema(
        command=StringSchema("要执行的 shell 命令"),
        cwd=StringSchema(
            "命令工作目录：workspace(默认) | skills",
            enum=["workspace", "skills"],
        ),
        skill_name=StringSchema("当 cwd=skills 时，指定技能目录名"),
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

    def __init__(self, workspace: Path, timeout: int = 60):
        self._workspace = workspace
        self._timeout = timeout

    @property
    def exclusive(self) -> bool:
        return True

    async def execute(
        self,
        command: str,
        cwd: str = "workspace",
        skill_name: str = "",
        **kwargs: Any,
    ) -> str:
        # Resolve working directory with skills support
        try:
            from app.agents.standard.tools import _resolve_run_cwd
            run_cwd = _resolve_run_cwd(
                self._workspace,
                (cwd or "workspace").strip().lower(),
                skill_name,
            )
        except ValueError as e:
            return f"Error: {e}"

        # Safety guard
        guard_error = self._guard_command(command)
        if guard_error:
            return guard_error

        # Build minimal environment
        cwd_mode_normalized = (cwd or "workspace").strip().lower()
        env = self._build_env(run_cwd, use_skills_cwd=cwd_mode_normalized == "skills")

        # Execute async
        try:
            process = await self._spawn(command, str(run_cwd), env)
            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(),
                    timeout=self._timeout,
                )
            except asyncio.TimeoutError:
                await self._kill_process(process)
                return f"Error: Command timed out after {self._timeout} seconds"
            except asyncio.CancelledError:
                await self._kill_process(process)
                raise

            # Build output
            output_parts: list[str] = []
            if stdout:
                output_parts.append(stdout.decode("utf-8", errors="replace"))
            if stderr:
                stderr_text = stderr.decode("utf-8", errors="replace")
                if stderr_text.strip():
                    output_parts.append(f"[stderr]\n{stderr_text}")
            output_parts.append(f"\nExit code: {process.returncode}")

            result = "\n".join(output_parts) if output_parts else "(no output)"

            # Truncate if too long
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

    def _build_env(self, cwd: Path, use_skills_cwd: bool = False) -> dict[str, str]:
        """Minimal secure environment with content-agent specific vars."""
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
                "PATHEXT": os.environ.get("PATHEXT", ".COM;.EXE;.BAT;.CMD"),
                "PATH": os.environ.get("PATH", f"{sr}\\system32;{sr}"),
            }
        else:
            bash = shutil.which("bash") or "/bin/bash"
            env = {
                "HOME": os.environ.get("HOME", "/tmp"),
                "LANG": os.environ.get("LANG", "C.UTF-8"),
                "TERM": os.environ.get("TERM", "dumb"),
                "PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"),
            }

        env["AGENT_WORKSPACE"] = str(ws)
        env["AGENT_SKILLS"] = agent_skills
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
            bash, "-c", command,
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

    @staticmethod
    def _guard_command(command: str) -> str | None:
        """Best-effort safety guard for destructive commands."""
        lower = command.strip().lower()
        for pattern in _DENY_PATTERNS:
            if re.search(pattern, lower):
                return "Error: Command blocked by safety guard (dangerous pattern detected)"
        return None
