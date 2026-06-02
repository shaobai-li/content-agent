"""Global settings API: env vars (API keys) and DATA_DIR management."""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import APIRouter, Body, HTTPException
from app.core.config import ENV_PATH
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
    return {"providers": result, "data_dir": os.environ.get("DATA_DIR", "")}


@router.put("/env")
async def update_env_settings(payload: dict = Body(...)):
    """Update env vars and DATA_DIR.

    - Provider API keys: key is env_key name, value is the key.
    - DATA_DIR: key is "DATA_DIR", value is an absolute path.

    Empty string removes the entry. Non-empty sets it.
    Both os.environ and .env file are updated so the change survives restart.

    When DATA_DIR is provided and non-empty, the path is validated to exist
    on disk before saving.

    Example:
        { "DEEPSEEK_API_KEY": "sk-xxx", "DATA_DIR": "D:/data" }
    """
    # Validate DATA_DIR first (if present and non-empty)
    data_dir_val = payload.get("DATA_DIR")
    if isinstance(data_dir_val, str) and data_dir_val.strip():
        p = Path(data_dir_val.strip())
        if not p.exists():
            raise HTTPException(status_code=400, detail=f"路径不存在: {data_dir_val}")
        if not p.is_dir():
            raise HTTPException(status_code=400, detail=f"路径不是目录: {data_dir_val}")

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
