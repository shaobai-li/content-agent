use axum::routing::get;
use axum::{Json, Router};
use serde_json::{json, Value};

use crate::core::config::get_config;
use crate::provider::factory::PROVIDERS;

/// 非 LLM 的服务提供商，同样需要在 settings 页面配置 API key。
/// 格式： (provider_name, display_name, default_api_base)
const SERVICE_PROVIDERS: &[(&str, &str, &str)] = &[
    ("mineru", "MinerU", "https://mineru.net"),
];

pub fn router() -> Router {
    Router::new()
        .route("/api/settings/env", get(get_env_settings).put(update_env_settings))
        .route("/api/settings/models", get(get_models))
}

/// 掩码 API key：保留前3后4，中间用 *** 替代
fn mask_key(value: &str) -> String {
    if value.len() <= 7 {
        return "***".to_string();
    }
    let prefix = &value[..3];
    let suffix = &value[value.len() - 4..];
    format!("{}***{}", prefix, suffix)
}

/// 为一个 provider 构建 settings 条目（name / display_name / api_key / api_base / 掩码）。
fn build_provider_entry(
    name: &str,
    display_name: &str,
    default_base: &str,
    cfg: &Value,
) -> Value {
    let api_key = cfg
        .get("api_key")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let api_base = cfg
        .get("api_base")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let is_set = !api_key.is_empty();
    let masked = if is_set {
        mask_key(&api_key)
    } else {
        String::new()
    };
    let effective_api_base = if api_base.is_empty() {
        default_base.to_string()
    } else {
        api_base
    };

    json!({
        "provider": name,
        "display_name": display_name,
        "set": is_set,
        "masked": masked,
        "api_base": effective_api_base,
    })
}

/// 加载 per-user config.json
fn load_user_config(user_id: &str) -> Value {
    let cfg = get_config();
    let config_path = cfg
        .data_dir
        .join(format!("u_{}", user_id))
        .join("admin")
        .join("config.json");
    if config_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&config_path) {
            if let Ok(val) = serde_json::from_str::<Value>(&content) {
                return val;
            }
        }
    }
    json!({})
}

/// 保存 per-user config.json
fn save_user_config(user_id: &str, config: &Value) {
    let cfg = get_config();
    let config_path = cfg
        .data_dir
        .join(format!("u_{}", user_id))
        .join("admin")
        .join("config.json");
    if let Some(parent) = config_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    std::fs::write(&config_path, serde_json::to_string_pretty(config).unwrap_or_default()).ok();
}

/// GET /api/settings/env
async fn get_env_settings() -> Json<Value> {
    let user_id = crate::core::auth::get_current_user_id().unwrap_or_default();
    let user_config = load_user_config(&user_id);
    let providers_from_config = user_config
        .get("providers")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();
    let user_data_dir = user_config
        .get("user_data_dir")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let mut settings = Vec::<Value>::new();
    for spec in PROVIDERS.iter() {
        let cfg = providers_from_config.get(spec.name).cloned().unwrap_or_default();
        settings.push(build_provider_entry(
            spec.name,
            spec.display_name,
            spec.default_api_base,
            &cfg,
        ));
    }

    // ── 追加非 LLM 服务提供商 ──────────────────────────────────────────
    for (name, display_name, default_base) in SERVICE_PROVIDERS {
        let cfg = providers_from_config.get(*name).cloned().unwrap_or_default();
        settings.push(build_provider_entry(
            name,
            display_name,
            default_base,
            &cfg,
        ));
    }

    Json(json!({
        "providers": settings,
        "user_data_dir": user_data_dir,
    }))
}

/// GET /api/settings/models
///
/// 返回所有注册了模型的 provider 的模型列表，含 configured 状态。
/// 逻辑与 Python `settings.py:get_models()` 一致。
async fn get_models() -> Json<Value> {
    let user_id = crate::core::auth::get_current_user_id().unwrap_or_default();
    let user_config = load_user_config(&user_id);
    let providers_cfg = user_config
        .get("providers")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();

    let mut models: Vec<Value> = Vec::new();
    for spec in PROVIDERS.iter() {
        if spec.models.is_empty() {
            continue;
        }
        let has_key = providers_cfg
            .get(spec.name)
            .and_then(|v| v.get("api_key"))
            .and_then(|v| v.as_str())
            .map(|s| !s.is_empty())
            .unwrap_or(false);
        // 与 Python `spec.display_name or spec.name.title()` 语义一致
        let provider_label: &str = if !spec.display_name.is_empty() {
            spec.display_name
        } else {
            spec.name
        };
        for m in spec.models {
            models.push(json!({
                "provider": spec.name,
                "provider_label": provider_label,
                "model": m.name,
                "label": m.display_name,
                "configured": has_key,
            }));
        }
    }

    Json(json!({ "models": models }))
}

/// PUT /api/settings/env
async fn update_env_settings(Json(body): Json<Value>) -> Json<Value> {
    let user_id = crate::core::auth::get_current_user_id().unwrap_or_default();
    let mut existing = load_user_config(&user_id);

    // Handle user_data_dir
    if let Some(user_data_dir_val) = body.get("user_data_dir") {
        if let Some(v) = user_data_dir_val.as_str() {
            existing["user_data_dir"] = json!(v.to_string());
        } else {
            existing["user_data_dir"] = json!("");
        }
    }

    // Handle providers — merge with existing
    if let Some(providers_val) = body.get("providers").and_then(|v| v.as_object()) {
        let mut merged = existing
            .get("providers")
            .and_then(|v| v.as_object())
            .map(|m| m.clone())
            .unwrap_or_default();

        for (name, cfg) in providers_val {
            if let Some(cfg_obj) = cfg.as_object() {
                let mut entry = merged
                    .get(name)
                    .and_then(|v| v.as_object())
                    .cloned()
                    .unwrap_or_default();

                if let Some(ak) = cfg_obj.get("api_key").and_then(|v| v.as_str()) {
                    entry.insert("api_key".to_string(), json!(ak));
                }
                if let Some(ab) = cfg_obj.get("api_base").and_then(|v| v.as_str()) {
                    entry.insert("api_base".to_string(), json!(ab));
                }

                // 如果有 api_key 则保留，否则移除
                if entry.get("api_key").and_then(|v| v.as_str()).unwrap_or("").is_empty() {
                    merged.remove(name);
                } else {
                    merged.insert(name.clone(), json!(entry));
                }
            }
        }

        existing["providers"] = json!(merged);
    }

    save_user_config(&user_id, &existing);
    Json(json!({"ok": true}))
}

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_provider_entry_not_configured() {
        let entry = build_provider_entry("test_provider", "Test Provider", "https://default.com", &Value::Null);
        assert_eq!(entry["provider"], "test_provider");
        assert_eq!(entry["display_name"], "Test Provider");
        assert_eq!(entry["set"], false);
        assert_eq!(entry["masked"], "");
        assert_eq!(entry["api_base"], "https://default.com");
    }

    #[test]
    fn test_build_provider_entry_with_api_key() {
        let cfg = json!({ "api_key": "sk-abc12345xyz" });
        let entry = build_provider_entry("mineru", "MinerU", "https://mineru.net", &cfg);
        assert_eq!(entry["provider"], "mineru");
        assert_eq!(entry["display_name"], "MinerU");
        assert_eq!(entry["set"], true);
        // 前3后4 + ***
        assert_eq!(entry["masked"], "sk-***5xyz");
        // 未设 api_base → 使用默认值
        assert_eq!(entry["api_base"], "https://mineru.net");
    }

    #[test]
    fn test_build_provider_entry_with_custom_api_base() {
        let cfg = json!({ "api_key": "sk-abc12345xyz", "api_base": "https://custom.example.com" });
        let entry = build_provider_entry("mineru", "MinerU", "https://mineru.net", &cfg);
        assert_eq!(entry["api_base"], "https://custom.example.com");
    }

    #[test]
    fn test_build_provider_entry_short_key() {
        let cfg = json!({ "api_key": "short" });
        let entry = build_provider_entry("p", "P", "https://p.com", &cfg);
        assert_eq!(entry["set"], true);
        assert_eq!(entry["masked"], "***");
    }
}
