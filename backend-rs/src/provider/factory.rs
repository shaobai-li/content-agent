use once_cell::sync::Lazy;

use crate::provider::openai_compat::{OpenAICompatProvider, ProviderConfig};

/// 内置 provider 规格定义
pub struct ProviderSpec {
    pub name: &'static str,
    pub display_name: &'static str,
    pub env_key: &'static str,
    pub default_api_base: &'static str,
    pub default_model: &'static str,
}

/// 内置 provider 列表，对应 Python `app/providers/registry.py` 的 PROVIDERS
pub static PROVIDERS: Lazy<Vec<ProviderSpec>> = Lazy::new(|| {
    vec![
        ProviderSpec {
            name: "deepseek",
            display_name: "DeepSeek",
            env_key: "DEEPSEEK_API_KEY",
            default_api_base: "https://api.deepseek.com",
            default_model: "deepseek-chat",
        },
        ProviderSpec {
            name: "openai",
            display_name: "OpenAI",
            env_key: "OPENAI_API_KEY",
            default_api_base: "https://api.openai.com",
            default_model: "gpt-4o",
        },
        ProviderSpec {
            name: "moonshot",
            display_name: "Moonshot",
            env_key: "MOONSHOT_API_KEY",
            default_api_base: "https://api.moonshot.cn",
            default_model: "kimi-k2.5",
        },
    ]
});

/// 按名称查找 provider 规格
pub fn find_provider_spec(name: &str) -> Option<&'static ProviderSpec> {
    PROVIDERS.iter().find(|s| s.name == name)
}

/// 返回 provider 的默认模型名
pub fn default_model_for(provider_name: &str) -> &'static str {
    find_provider_spec(provider_name)
        .map(|s| s.default_model)
        .unwrap_or("deepseek-chat")
}

/// 从 provider 名称创建 OpenAICompatProvider 实例
///
/// 参数优先级：显式参数 > 环境变量 > ProviderSpec 默认值。
pub fn create_provider(
    provider_name: &str,
    api_key: Option<String>,
    api_base: Option<String>,
    model: Option<String>,
) -> Result<OpenAICompatProvider, String> {
    let spec = find_provider_spec(provider_name)
        .ok_or_else(|| format!("Unknown provider: {provider_name}"))?;

    // 确定 api_key：参数 → 环境变量
    let resolved_key = api_key
        .filter(|k| !k.is_empty())
        .or_else(|| std::env::var(spec.env_key).ok())
        .filter(|k| !k.is_empty())
        .ok_or_else(|| {
            format!(
                "API key not found for provider '{provider_name}'. \
                 Set {} environment variable or pass api_key parameter.",
                spec.env_key
            )
        })?;

    // 确定 api_base：参数 → spec 默认值
    let resolved_base = api_base
        .filter(|b| !b.is_empty())
        .unwrap_or_else(|| spec.default_api_base.to_string());

    // 确定 model：参数 → spec 默认值
    let resolved_model = model
        .filter(|m| !m.is_empty())
        .unwrap_or_else(|| spec.default_model.to_string());

    // 构建 ProviderConfig
    let provider_config = ProviderConfig {
        name: spec.name.to_string(),
        default_api_base: resolved_base.clone(),
        ..ProviderConfig::default()
    };

    Ok(OpenAICompatProvider::new(
        Some(resolved_key),
        Some(resolved_base),
        Some(resolved_model),
        None,
        Some(provider_config),
    ))
}

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_model_for_known() {
        assert_eq!(default_model_for("deepseek"), "deepseek-chat");
        assert_eq!(default_model_for("openai"), "gpt-4o");
        assert_eq!(default_model_for("moonshot"), "kimi-k2.5");
    }

    #[test]
    fn test_default_model_for_unknown() {
        // 未知 provider 返回 deepseek-chat 作为兜底
        assert_eq!(default_model_for("nonexistent"), "deepseek-chat");
    }

    #[test]
    fn test_find_provider_spec_deepseek() {
        let spec = find_provider_spec("deepseek").expect("deepseek should exist");
        assert_eq!(spec.name, "deepseek");
        assert_eq!(spec.env_key, "DEEPSEEK_API_KEY");
        assert_eq!(spec.default_api_base, "https://api.deepseek.com");
    }

    #[test]
    fn test_find_provider_spec_unknown() {
        assert!(find_provider_spec("unknown").is_none());
    }

    #[test]
    fn test_create_provider_missing_api_key() {
        // 确保已知 provider 在没有 API key 时返回错误（而不是 panic）
        let result = create_provider("deepseek", None, None, None);
        assert!(result.is_err());
        match result {
            Err(msg) => {
                assert!(msg.contains("API key"));
                assert!(msg.contains("DEEPSEEK_API_KEY"));
            }
            Ok(_) => panic!("expected error"),
        }
    }

    #[test]
    fn test_create_provider_unknown() {
        let result = create_provider("nonexistent", Some("key".into()), None, None);
        match result {
            Err(msg) => assert!(msg.contains("Unknown provider")),
            Ok(_) => panic!("expected error"),
        }
    }

    #[test]
    fn test_providers_list_contains_expected() {
        let names: Vec<&str> = PROVIDERS.iter().map(|s| s.name).collect();
        assert!(names.contains(&"deepseek"));
        assert!(names.contains(&"openai"));
        assert!(names.contains(&"moonshot"));
    }
}
