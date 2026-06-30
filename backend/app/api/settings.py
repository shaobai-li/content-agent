"""Global settings API: env vars (API keys) and per-user user_data_dir management."""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import APIRouter, Body, HTTPException
from app.core.auth import get_current_user_id
from app.core.config import ENV_PATH, _load_user_config, _save_user_config
from app.providers.registry import PROVIDERS

router = APIRouter(prefix="/api/settings", tags=["settings"])


def _mask_key(key: str) -> str:
    if len(key) <= 8:
        return key[:3] + "..." + key[-4:] if len(key) > 4 else "****"
    return key[:3] + "..." + key[-4:]


def _load_env_file() -> dict[str, str]:
    if not ENV_PATH.exists():
        return {}
    result: dict[str, str] = {}
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            k, v = line.split("=", 1)
            result[k.strip()] = v.strip().strip('"').strip("'")
    return result


def _save_env_file(updates: dict[str, str | None]) -> None:
    current = _load_env_file()
    for k, v in updates.items():
        if v:
            current[k] = v
        else:
            current.pop(k, None)
    lines = [f"{k}={v}" for k, v in current.items()]
    ENV_PATH.parent.mkdir(parents=True, exist_ok=True)
    ENV_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


@router.get("/env")
async def get_env_settings():
    """Return all provider env vars with masked values.

    Derives the provider list dynamically from the provider registry,
    so adding a new provider automatically appears here.

    Returns per-user user_data_dir from config.json.
    """
    result = []
    for spec in PROVIDERS:
        if not spec.env_key:
            continue
        value = os.environ.get(spec.env_key, "")
        result.append({
            "provider": spec.name,
            "display_name": spec.display_name or spec.name.title(),
            "env_key": spec.env_key,
            "set": bool(value),
            "masked": _mask_key(value) if value else "",
        })

    user_config = _load_user_config(get_current_user_id())
    user_data_dir = (user_config.get("user_data_dir") or "").strip()

    return {"providers": result, "user_data_dir": user_data_dir}


@router.put("/env")
async def update_env_settings(payload: dict = Body(...)):
    """Update env vars and per-user user_data_dir.

    - Provider API keys: key is env_key name, value is the key.
    - user_data_dir: key is "user_data_dir", value is an absolute path.

    Empty string removes the entry. Non-empty sets it.
    Both os.environ and .env file are updated so the change survives restart.

    When user_data_dir is provided and non-empty, the path is validated to exist
    on disk before saving. The value is written to data/u_{user_id}/admin/config.json.

    Example:
        { "DEEPSEEK_API_KEY": "sk-xxx", "user_data_dir": "D:/my_agent_data" }
    """
    user_id = get_current_user_id()

    # Handle user_data_dir — write to per-user config.json
    user_data_dir_val = payload.pop("user_data_dir", None)
    if user_data_dir_val is not None:
        if isinstance(user_data_dir_val, str) and user_data_dir_val.strip():
            p = Path(user_data_dir_val.strip())
            if not p.is_absolute():
                raise HTTPException(status_code=400, detail=f"请输入绝对路径: {user_data_dir_val}")
            if not p.exists():
                raise HTTPException(status_code=400, detail=f"路径不存在: {user_data_dir_val}")
            if not p.is_dir():
                raise HTTPException(status_code=400, detail=f"路径不是目录: {user_data_dir_val}")
            _save_user_config(user_id, {"user_data_dir": user_data_dir_val.strip()})
        else:
            _save_user_config(user_id, {"user_data_dir": ""})

    updates: dict[str, str | None] = {}
    for key, value in payload.items():
        if not isinstance(value, str):
            continue
        v = value.strip()
        updates[key] = v if v else None
        if v:
            os.environ[key] = v
        else:
            os.environ.pop(key, None)

    _save_env_file(updates)
    return {"ok": True}
