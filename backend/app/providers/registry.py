"""
Provider Registry — single source of truth for LLM provider metadata.

Adding a new provider:
  1. Add a ProviderSpec to PROVIDERS below.
  2. Add a field to ProvidersConfig in config/schema.php.
  Done. Env vars, config matching, status display all derive from here.

Order matters — it controls match priority and fallback. Gateways first.
Every entry writes out all fields so you can copy-paste as a template.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from pydantic.alias_generators import to_snake


@dataclass(frozen=True)
class ModelSpec:
    """One model under a provider. Lightweight — extend as needed."""

    name: str  # e.g. "deepseek-chat"
    display_name: str  # e.g. "DeepSeek Chat"


@dataclass(frozen=True)
class ProviderSpec:
    """One LLM provider's metadata. See PROVIDERS below for real examples.

    Placeholders in env_extras values:
      {api_key}  — the user's API key
      {api_base} — api_base from config, or this spec's default_api_base
    """

    # identity
    name: str  # config field name, e.g. "dashscope"
    keywords: tuple[str, ...]  # model-name keywords for matching (lowercase)
    env_key: str  # env var for API key, e.g. "DASHSCOPE_API_KEY"
    display_name: str = ""  # shown in `nanobot status`

    # which provider implementation to use
    # "openai_compat" | "anthropic" | "azure_openai" | "openai_codex" | "github_copilot"
    backend: str = "openai_compat"

    # extra env vars, e.g. (("ZHIPUAI_API_KEY", "{api_key}"),)
    env_extras: tuple[tuple[str, str], ...] = ()

    # gateway / local detection
    is_gateway: bool = False  # routes any model (OpenRouter, AiHubMix)
    is_local: bool = False  # local deployment (vLLM, Ollama)
    detect_by_key_prefix: str = ""  # match api_key prefix, e.g. "sk-or-"
    detect_by_base_keyword: str = ""  # match substring in api_base URL
    default_api_base: str = ""  # OpenAI-compatible base URL for this provider

    # gateway behavior
    strip_model_prefix: bool = False  # strip "provider/" before sending to gateway
    supports_max_completion_tokens: bool = False

    # per-model param overrides, e.g. (("kimi-k2.5", {"temperature": 1.0}),)
    model_overrides: tuple[tuple[str, dict[str, Any]], ...] = ()

    # OAuth-based providers (e.g., OpenAI Codex) don't use API keys
    is_oauth: bool = False

    # Direct providers skip API-key validation (user supplies everything)
    is_direct: bool = False

    # Provider supports cache_control on content blocks (e.g. Anthropic prompt caching)
    supports_prompt_caching: bool = False

    # How to inject the thinking on/off toggle into extra_body.
    # ""              — no extra_body needed (default)
    # "thinking_type" — {"thinking": {"type": "enabled"/"disabled"}}
    #                   (DeepSeek, VolcEngine, BytePlus)
    # "enable_thinking" — {"enable_thinking": true/false}  (DashScope)
    # "reasoning_split" — {"reasoning_split": true/false}  (MiniMax)
    thinking_style: str = ""

    # registered models for this provider; empty = provider not exposed in model picker
    models: tuple[ModelSpec, ...] = ()

    @property
    def label(self) -> str:
        return self.display_name or self.name.title()


# ---------------------------------------------------------------------------
# PROVIDERS — the registry. Order = priority. Copy any entry as template.
# ---------------------------------------------------------------------------

PROVIDERS: tuple[ProviderSpec, ...] = (
    # DeepSeek: OpenAI-compatible at api.deepseek.com
    ProviderSpec(
        name="deepseek",
        keywords=("deepseek",),
        env_key="DEEPSEEK_API_KEY",
        display_name="DeepSeek",
        backend="openai_compat",
        default_api_base="https://api.deepseek.com",
        thinking_style="thinking_type",
        models=(
            ModelSpec("deepseek-chat", "DeepSeek Chat"),
            ModelSpec("deepseek-reasoner", "DeepSeek Reasoner"),
        ),
    ),
    # OpenAI: standard OpenAI API
    ProviderSpec(
        name="openai",
        keywords=("openai", "gpt"),
        env_key="OPENAI_API_KEY",
        display_name="OpenAI",
        backend="openai_compat",
        default_api_base="https://api.openai.com/v1",
        supports_max_completion_tokens=True,
        models=(ModelSpec("gpt-4o", "GPT-4o"),),
    ),
    # Moonshot (Kimi): OpenAI-compatible at api.moonshot.cn
    ProviderSpec(
        name="moonshot",
        keywords=("moonshot", "kimi"),
        env_key="MOONSHOT_API_KEY",
        display_name="Moonshot",
        backend="openai_compat",
        default_api_base="https://api.moonshot.cn/v1",
        thinking_style="thinking_type",
        supports_max_completion_tokens=True,
        model_overrides=(
            ("kimi-k2.5", {"temperature": 1.0}),
            ("kimi-k2.6", {"temperature": 1.0}),
        ),
        models=(ModelSpec("kimi-k2.5", "Kimi K2.5"),),
    ),
    # Zhipu (智谱 GLM): OpenAI-compatible at open.bigmodel.cn
    ProviderSpec(
        name="zhipu",
        keywords=("zhipu", "glm"),
        env_key="ZHIPU_API_KEY",
        display_name="GLM",
        backend="openai_compat",
        default_api_base="https://open.bigmodel.cn/api/paas/v4",
        models=(ModelSpec("GLM-Z1-Air", "GLM-Z1-Air"),),
    ),
    # MiniMax (海螺 AI): OpenAI-compatible at api.minimaxi.com
    ProviderSpec(
        name="minimax",
        keywords=("minimax", "hailuo"),
        env_key="MINIMAX_API_KEY",
        display_name="MiniMax",
        backend="openai_compat",
        default_api_base="https://api.minimaxi.com/v1",
        models=(ModelSpec("MiniMax-M2.5", "MiniMax M2.5"),),
    ),
)


# ---------------------------------------------------------------------------
# Lookup helpers
# ---------------------------------------------------------------------------


def find_by_name(name: str) -> ProviderSpec | None:
    """Find a provider spec by config field name, e.g. "deepseek"."""
    normalized = to_snake(name.replace("-", "_"))
    for spec in PROVIDERS:
        if spec.name == normalized:
            return spec
    return None
