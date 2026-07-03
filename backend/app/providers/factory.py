"""Provider factory — create LLM provider instances by name."""

from __future__ import annotations

from app.providers.openai_compat_provider import OpenAICompatProvider


def create_provider(
    provider_name: str,
    api_key: str | None = None,
    api_base: str | None = None,
    model: str | None = None,
) -> OpenAICompatProvider:
    """Create an LLM provider instance by provider name.

    Args:
        provider_name: Provider name matching a ProviderSpec in the registry,
                       e.g. "deepseek", "openai", "moonshot".
        api_key: Optional API key override. Falls back to the env var specified
                 in the matching ProviderSpec.env_key.
        api_base: Optional API base URL override. Falls back to the ProviderSpec's
                  default_api_base.
        model: Default model name for this provider instance.

    Returns:
        An initialized OpenAICompatProvider.
    """
    from app.providers.registry import find_by_name

    spec = find_by_name(provider_name)
    if spec is None:
        raise ValueError(f"Unknown provider: {provider_name!r}")

    effective_api_key = api_key  # 仅从参数读取，不再从 .env 回退
    effective_api_base = api_base or spec.default_api_base or None
    default_model = model or _default_model_for(provider_name)

    return OpenAICompatProvider(
        api_key=effective_api_key,
        api_base=effective_api_base,
        default_model=default_model,
        spec=spec,
    )


def _default_model_for(provider_name: str) -> str:
    """Return a sensible default model for the given provider."""
    defaults = {
        "deepseek": "deepseek-chat",
        "openai": "gpt-4o",
        "moonshot": "kimi-k2.5",
        "zhipu": "GLM-Z1-Air",
        "minimax": "MiniMax-M2.5",
    }
    return defaults.get(provider_name, f"{provider_name}-chat")
