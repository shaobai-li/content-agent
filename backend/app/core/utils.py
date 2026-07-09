"""Shared utility functions for core modules."""
from __future__ import annotations

from typing import Any


def cfg_get(cfg: Any, key: str, default: Any = None) -> Any:
    """读取配置值，兼容 dict 和 object 两种格式。

    Handles both dict-like (``cfg.get(key, default)``) and attribute-like
    (``getattr(cfg, key, default)``) config sources.
    """
    if isinstance(cfg, dict):
        return cfg.get(key, default)
    return getattr(cfg, key, default)
