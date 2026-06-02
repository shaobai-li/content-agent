use std::collections::HashMap;
use std::path::Path;

use axum::body::Body;
use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use serde_json::Value;

use crate::core::config::get_config;

// 请求级用户 ID 存储（类似 Python ContextVar）。
// 由 auth_middleware 在请求入口设置，由 get_agent_base_dir() 消费以实现用户数据隔离。
tokio::task_local! {
    pub(crate) static CURRENT_USER_ID: String;
}

/// 返回当前请求的用户 ID（无 X-User-Id header 或非请求上下文中返回 None）
pub fn get_current_user_id() -> Option<String> {
    CURRENT_USER_ID.try_with(|id| id.clone()).ok()
}

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
///
/// 在 Axum 中间件层级设置 CURRENT_USER_ID task_local，
/// 使后续所有 get_agent_base_dir() 调用能感知当前用户。
pub async fn auth_middleware(
    mut req: axum::http::Request<Body>,
    next: axum::middleware::Next,
) -> axum::response::Response {
    let user_id = req
        .headers()
        .get("X-User-Id")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string())
        .unwrap_or_default();

    let user_agents = if user_id.is_empty() {
        HashMap::new()
    } else {
        load_user_agents(&user_id)
    };

    let ctx = UserContext {
        user_id: if user_id.is_empty() { None } else { Some(user_id.clone()) },
        user_agents,
    };
    req.extensions_mut().insert(ctx);

    if user_id.is_empty() {
        next.run(req).await
    } else {
        CURRENT_USER_ID.scope(user_id, next.run(req)).await
    }
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
        let ctx = UserContext::default();
        assert!(ctx.user_id.is_none());
        assert!(ctx.user_agents.is_empty());
    }

    #[tokio::test]
    async fn test_get_current_user_id_outside_scope() {
        // 在 scope 之外调用应返回 None
        assert!(get_current_user_id().is_none());
    }

    #[tokio::test]
    async fn test_get_current_user_id_inside_scope() {
        CURRENT_USER_ID.scope("test-user".to_string(), async {
            assert_eq!(get_current_user_id(), Some("test-user".to_string()));
        }).await;
    }
}
