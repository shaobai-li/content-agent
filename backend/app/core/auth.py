"""FastAPI 依赖：从 X-User-Id header 提取 user_id，加载用户自定义 agent。"""

from __future__ import annotations

from contextvars import ContextVar
from pathlib import Path
from typing import Any, Dict

from fastapi import HTTPException, Request

from app.core.config import DEFAULT_DATA_DIR, _load_user_config, parse_system_md_frontmatter

_user_id_var: ContextVar[str] = ContextVar("user_id")
_user_agents_var: ContextVar[Dict[str, Dict[str, Any]]] = ContextVar("user_agents")


def get_current_user_id() -> str:
    """返回当前请求的 user_id（必须在 require_user_id 之后的请求上下文中调用）。"""
    return _user_id_var.get()


def _load_user_agent_configs(user_id: str) -> Dict[str, Dict[str, Any]]:
    """扫描用户数据目录下的 SYSTEM.md，目录名即 agent_id。

    数据根目录根据 user_data_dir 设置决定：
    - 设置了 user_data_dir → {user_data_dir}/u_{user_id}/
    - 未设置 → DEFAULT_DATA_DIR/u_{user_id}/
    """
    user_config = _load_user_config(user_id)
    user_data_dir = (user_config.get("user_data_dir") or "").strip()
    data_root = Path(user_data_dir).resolve() if user_data_dir else DEFAULT_DATA_DIR

    # 检测并迁移旧格式数据（{user_data_dir}/<agent_id>/ → {user_data_dir}/u_{user_id}/<agent_id>/）
    from app.core.config import _check_and_migrate_old_user_data_dir_format
    _check_and_migrate_old_user_data_dir_format(user_id, user_data_dir)

    user_dir = data_root / f"u_{user_id}"
    result: Dict[str, Dict[str, Any]] = {}
    if not user_dir.is_dir():
        return result
    for entry in sorted(user_dir.iterdir()):
        if not entry.is_dir():
            continue
        system_md = entry / "SYSTEM.md"
        if not system_md.is_file():
            continue
        agent_id = entry.name
        meta = parse_system_md_frontmatter(system_md)
        if not isinstance(meta, dict):
            continue
        meta.pop("agent_id", None)
        meta["name"] = agent_id      # name 恒等于目录名（以文件名为准）
        result[agent_id] = meta
    return result


async def require_user_id(request: Request) -> None:
    """FastAPI 依赖：从 X-User-Id header 提取 user_id，加载该用户的自定义 agent。

    无 header → 401。
    成功后 user_id 和该用户的自定义 agent 配置写入 contextvar。
    """
    user_id = request.headers.get("X-User-Id", "").strip()
    if not user_id:
        raise HTTPException(status_code=401, detail="缺少 X-User-Id header")
    _user_id_var.set(user_id)

    # 加载该用户的自定义 agent（系统 agent 已在 config.py 模块级加载）
    user_agents = _load_user_agent_configs(user_id)
    _user_agents_var.set(user_agents)

    # 认证通过后立即 seed 所有 agent workspace，确保 SYSTEM.md 等 prompt 文件已就绪
    from app.core.config import seed_user_agent_workspaces
    seed_user_agent_workspaces(list(user_agents.keys()))
