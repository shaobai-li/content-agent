use std::collections::HashMap;

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
    let path = get_config().data_dir.join("users").join(user_id).join("agents.json");
    match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => HashMap::new(),
    }
}
