"""Global settings API: per-user provider config and user_data_dir management."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml
from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel
from app.core.auth import get_current_user_id
from app.core.config import DEFAULT_DATA_DIR, _load_user_config, _save_user_config
from app.providers.registry import PROVIDERS

router = APIRouter(prefix="/api/settings", tags=["settings"])


def _mask_key(key: str) -> str:
    if len(key) <= 8:
        return key[:3] + "..." + key[-4:] if len(key) > 4 else "****"
    return key[:3] + "..." + key[-4:]


@router.get("/env")
async def get_env_settings():
    """Return all provider configs with masked api keys.

    Reads from per-user config.json (providers field).
    """
    user_config = _load_user_config(get_current_user_id())
    providers_from_config = user_config.get("providers") or {}
    user_data_dir = (user_config.get("user_data_dir") or "").strip()

    result = []
    for spec in PROVIDERS:
        if not spec.env_key:
            continue
        cfg = providers_from_config.get(spec.name) or {}
        api_key = (cfg.get("api_key") or "").strip()
        api_base = (cfg.get("api_base") or "").strip()
        result.append({
            "provider": spec.name,
            "display_name": spec.display_name or spec.name.title(),
            "set": bool(api_key),
            "masked": _mask_key(api_key) if api_key else "",
            "api_base": api_base or spec.default_api_base or "",
        })

    return {"providers": result, "user_data_dir": user_data_dir}


@router.put("/env")
async def update_env_settings(payload: dict = Body(...)):
    """Update per-user provider configs and user_data_dir.

    - Provider configs: key is "providers", value is { name: { api_key, api_base } }
    - user_data_dir: key is "user_data_dir", value is an absolute path.

    All written to data/u_{user_id}/admin/config.json.
    """
    user_id = get_current_user_id()
    existing = _load_user_config(user_id)

    # Handle user_data_dir
    user_data_dir_val = payload.pop("user_data_dir", None)
    if user_data_dir_val is not None:
        v = user_data_dir_val.strip() if isinstance(user_data_dir_val, str) else ""
        if v:
            p = Path(v)
            if not p.is_absolute():
                raise HTTPException(status_code=400, detail=f"请输入绝对路径: {v}")
            if not p.exists():
                raise HTTPException(status_code=400, detail=f"路径不存在: {v}")
            if not p.is_dir():
                raise HTTPException(status_code=400, detail=f"路径不是目录: {v}")
        existing["user_data_dir"] = v

    # Handle providers — merge with existing
    providers_val = payload.pop("providers", None)
    if providers_val is not None and isinstance(providers_val, dict):
        merged_providers = dict(existing.get("providers") or {})
        for name, cfg in providers_val.items():
            if not isinstance(cfg, dict):
                continue
            merged_cfg = dict(merged_providers.get(name) or {})
            if "api_key" in cfg:
                merged_cfg["api_key"] = cfg["api_key"]
            if "api_base" in cfg:
                merged_cfg["api_base"] = cfg["api_base"]
            if merged_cfg.get("api_key"):
                merged_providers[name] = merged_cfg
            else:
                merged_providers.pop(name, None)
        existing["providers"] = merged_providers

    _save_user_config(user_id, existing)
    return {"ok": True}


@router.get("/models")
async def get_models():
    """Return all available models grouped by provider, with configured status.

    Reads model metadata from the provider registry (ProviderSpec.models)
    and merges with per-user config.json to mark which providers have API keys.
    """
    user_config = _load_user_config(get_current_user_id())
    providers_cfg = user_config.get("providers") or {}

    result: list[dict] = []
    for spec in PROVIDERS:
        if not spec.models:
            continue
        has_key = bool((providers_cfg.get(spec.name) or {}).get("api_key"))
        for m in spec.models:
            result.append({
                "provider": spec.name,
                "provider_label": spec.display_name or spec.name.title(),
                "model": m.name,
                "label": m.display_name,
                "configured": has_key,
            })

    return {"models": result}


# ── MCP 服务器配置读写 ──────────────────────────────────────────────


class _McpServerConfig(BaseModel):
    """单个 MCP 服务器配置项的校验模型。"""
    transport: str | None = None
    command: str | None = None
    args: list[str] | None = None
    env: dict[str, str] | None = None
    url: str | None = None
    headers: dict[str, str] | None = None
    enabled_tools: list[str] | None = None
    tool_timeout: int | None = None


class _McpSettingsPayload(BaseModel):
    """PUT /api/settings/mcp 请求体校验模型。"""
    servers: dict[str, _McpServerConfig]


def _load_user_mcp(user_id: str) -> dict:
    """读取用户的 mcp.yaml，不存在返回空 dict。"""
    path = DEFAULT_DATA_DIR / f"u_{user_id}" / "mcp.yaml"
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                return yaml.safe_load(f) or {}
        except Exception:
            pass
    return {}


def _save_user_mcp(user_id: str, config: dict) -> None:
    """保存用户 mcp.yaml。"""
    path = DEFAULT_DATA_DIR / f"u_{user_id}" / "mcp.yaml"
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        yaml.safe_dump(config, f, allow_unicode=True, default_flow_style=False)


@router.get("/mcp")
async def get_mcp_settings():
    """返回用户的 MCP 服务器配置（server_name → config dict）。"""
    user_id = get_current_user_id()
    return {"servers": _load_user_mcp(user_id)}


@router.put("/mcp")
async def update_mcp_settings(payload: _McpSettingsPayload):
    """保存用户的 MCP 服务器配置。

    请求体：{ "servers": { "time": { "command": "python", ... }, ... } }
    """
    user_id = get_current_user_id()
    raw = {}
    for name, cfg in payload.servers.items():
        raw[name] = cfg.model_dump(exclude_none=True)
    _save_user_mcp(user_id, raw)
    return {"ok": True}
