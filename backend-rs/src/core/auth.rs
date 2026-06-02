use std::collections::HashMap;
use std::path::Path;

use axum::body::Body;
use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use serde_json::Value;

use crate::core::config::get_config;

/// 当前请求的用户上下文
#[derive(Debug, Clone, Default)]
pub struct UserContext {
    pub user_id: Option<String>,
    /// 当前用户的 custom agent 列表
    pub user_agents: HashMap<String, Value>,
}

/// Axum 扩展 — 从请求中提取用户上下文
#[axum::async_trait]
impl<S> FromRequestParts<S> for UserContext
where
    S: Send + Sync,
{
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        Ok(parts
            .extensions
            .get::<UserContext>()
            .cloned()
            .unwrap_or_default())
    }
}

/// 设置用户上下文的中间件 — 从 X-User-Id header 读取用户标识
pub async fn auth_middleware(
    mut req: axum::http::Request<Body>,
    next: axum::middleware::Next,
) -> axum::response::Response {
    let user_id = req
        .headers()
        .get("X-User-Id")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let user_agents = if let Some(ref uid) = user_id {
        load_user_agents(uid)
    } else {
        HashMap::new()
    };

    let ctx = UserContext {
        user_id,
        user_agents,
    };
    req.extensions_mut().insert(ctx);
    next.run(req).await
}

/// 从 data_dir/users/{user_id}/agents.json 加载 custom agent
fn load_user_agents(user_id: &str) -> HashMap<String, Value> {
    load_user_agents_from(&get_config().data_dir, user_id)
}

/// 内部实现：从指定根目录加载，方便测试
fn load_user_agents_from(base_dir: &Path, user_id: &str) -> HashMap<String, Value> {
    let path = base_dir.join("users").join(user_id).join("agents.json");
    match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => HashMap::new(),
    }
}

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn setup_dir() -> TempDir {
        TempDir::new().unwrap()
    }

    #[test]
    fn test_load_user_agents_file_exists() {
        let tmp = setup_dir();
        let user_id = "test-user";
        let agents_dir = tmp.path().join("users").join(user_id);
        fs::create_dir_all(&agents_dir).unwrap();

        let agents_json = serde_json::json!({
            "my-agent": {"name": "My Custom Agent"},
            "helper": {"name": "Helper Bot"}
        });
        fs::write(agents_dir.join("agents.json"), agents_json.to_string()).unwrap();

        let result = load_user_agents_from(tmp.path(), user_id);
        assert_eq!(result.len(), 2);
        assert_eq!(
            result["my-agent"]["name"].as_str().unwrap(),
            "My Custom Agent"
        );
        assert_eq!(
            result["helper"]["name"].as_str().unwrap(),
            "Helper Bot"
        );
    }

    #[test]
    fn test_load_user_agents_file_not_exists() {
        let tmp = setup_dir();
        let result = load_user_agents_from(tmp.path(), "nonexistent");
        assert!(result.is_empty());
    }

    #[test]
    fn test_load_user_agents_invalid_json() {
        let tmp = setup_dir();
        let user_id = "test-user";
        let agents_dir = tmp.path().join("users").join(user_id);
        fs::create_dir_all(&agents_dir).unwrap();
        fs::write(agents_dir.join("agents.json"), "not valid json").unwrap();

        let result = load_user_agents_from(tmp.path(), user_id);
        assert!(result.is_empty());
    }

    #[test]
    fn test_load_user_agents_empty_json() {
        let tmp = setup_dir();
        let user_id = "test-user";
        let agents_dir = tmp.path().join("users").join(user_id);
        fs::create_dir_all(&agents_dir).unwrap();
        fs::write(agents_dir.join("agents.json"), "{}").unwrap();

        let result = load_user_agents_from(tmp.path(), user_id);
        assert!(result.is_empty());
    }

    #[test]
    fn test_user_context_default_is_empty() {
        // 验证 UserContext::default() 返回空上下文
        let ctx = UserContext::default();
        assert!(ctx.user_id.is_none());
        assert!(ctx.user_agents.is_empty());
    }
}
