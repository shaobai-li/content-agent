"""LLM provider abstraction module — adapted from nanobot."""

from __future__ import annotations

from app.providers.base import LLMProvider, LLMResponse

__all__ = [
    "LLMProvider",
    "LLMResponse",
    "OpenAICompatProvider",
]

from app.providers.openai_compat_provider import OpenAICompatProvider
