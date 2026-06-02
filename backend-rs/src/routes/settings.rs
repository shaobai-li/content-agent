use std::collections::HashMap;

use axum::routing::{get, put};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::provider::factory::PROVIDERS;

pub fn router() -> Router {
    Router::new()
        .route("/api/settings/env", get(get_env_settings).put(update_env_settings))
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

/// GET /api/settings/env
async fn get_env_settings() -> Json<Value> {
    let mut settings = Vec::<Value>::new();

    for spec in PROVIDERS.iter() {
        let value = std::env::var(spec.env_key).ok();
        let masked = value.as_deref().map(mask_key);
        settings.push(json!({
            "key": spec.env_key,
            "name": spec.display_name,
            "value": masked,
            "configured": value.is_some(),
        }));
    }

    Json(json!({"env": settings}))
}

#[derive(Deserialize)]
struct UpdateEnvBody {
    #[serde(flatten)]
    updates: HashMap<String, String>,
}

/// PUT /api/settings/env
async fn update_env_settings(Json(body): Json<UpdateEnvBody>) -> Json<Value> {
    // 更新内存中的环境变量
    for (key, value) in &body.updates {
        if value.is_empty() {
            std::env::remove_var(key);
        } else {
            std::env::set_var(key, value);
        }
    }

    // 持久化到 .env 文件
    save_env_file(&body.updates);

    Json(json!({"ok": true}))
}

fn env_file_path() -> std::path::PathBuf {
    std::path::PathBuf::from(
        std::env::var("ENV_PATH").unwrap_or_else(|_| ".env".to_string()),
    )
}

fn load_env_file() -> HashMap<String, String> {
    let path = env_file_path();
    if !path.exists() {
        return HashMap::new();
    }
    let content = std::fs::read_to_string(path).unwrap_or_default();
    content
        .lines()
        .filter(|l| l.contains('=') && !l.starts_with('#'))
        .map(|l| {
            let mut parts = l.splitn(2, '=');
            let k = parts.next().unwrap().trim().to_string();
            let v = parts.next().unwrap_or("").trim().to_string();
            (k, v)
        })
        .collect()
}

/// 持久化环境变量更新到 .env 文件
fn save_env_file(updates: &HashMap<String, String>) {
    let mut current = load_env_file();
    for (k, v) in updates {
        if v.is_empty() {
            current.remove(k);
        } else {
            current.insert(k.clone(), v.clone());
        }
    }
    let content: String = current
        .iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join("\n")
        + "\n";
    std::fs::write(env_file_path(), content).ok();
}
