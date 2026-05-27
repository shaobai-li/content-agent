"""Global settings API: env vars (API keys) management."""

from __future__ import annotations

import os

from fastapi import APIRouter, Body
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
    return {"providers": result}


@router.put("/env")
async def update_env_settings(payload: dict = Body(...)):
    """Update env vars. Keys are env_key names, values are API keys.

    Empty string removes the env var. Non-empty sets it.
    Both os.environ and .env file are updated so the change survives restart.

    Example:
        { "DEEPSEEK_API_KEY": "sk-xxx", "OPENAI_API_KEY": "" }
    """
    updates: dict[str, str | None] = {}
    for key, value in payload.items():
        if not isinstance(value, str):
            continue
        updates[key] = value if value else None
        if value:
            os.environ[key] = value
        else:
            os.environ.pop(key, None)

    _save_env_file(updates)
    return {"ok": True}
