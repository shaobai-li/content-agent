use std::collections::HashMap;
use std::path::{Path, PathBuf};

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

/// 在指定用户上下文中执行异步操作（Tauri invoke 等非 HTTP 入口使用）
pub async fn with_user_context<F, T>(user_id: String, f: F) -> T
where
    F: std::future::Future<Output = T>,
{
    CURRENT_USER_ID.scope(user_id, f).await
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

    let agent_ids: Vec<String> = user_agents.keys().cloned().collect();

    let ctx = UserContext {
        user_id: if user_id.is_empty() { None } else { Some(user_id.clone()) },
        user_agents,
    };
    req.extensions_mut().insert(ctx);

    if user_id.is_empty() {
        next.run(req).await
    } else {
        CURRENT_USER_ID.scope(user_id, async move {
            // 认证通过后立即 seed 所有 agent workspace
            crate::core::config::seed_user_agent_workspaces(&agent_ids);

            next.run(req).await
        }).await
    }
}

/// 从 user_data_dir/u_{user_id}/*/SYSTEM.md 加载 custom agent（与 Python 后端一致）。
fn load_user_agents(user_id: &str) -> HashMap<String, Value> {
    let cfg = get_config();
    let data_dir = &cfg.data_dir;

    // 获取 user_data_dir（用于旧格式迁移和计算有效根目录）
    let user_data_dir = get_user_data_dir(user_id, data_dir);

    // 检测并迁移旧格式数据
    if let Some(ref udd) = user_data_dir {
        crate::core::config::check_and_migrate_old_user_data_dir_format(user_id, udd);
    }

    let effective_root = match &user_data_dir {
        Some(udd) => PathBuf::from(udd),
        None => data_dir.clone(),
    };
    load_user_agents_from(&effective_root, user_id)
}

/// 从 config.json 读取 user_data_dir（与 get_effective_user_data_root 逻辑一致，返回 Option）。
fn get_user_data_dir(user_id: &str, data_dir: &Path) -> Option<String> {
    let config_path = data_dir.join(format!("u_{}", user_id)).join("admin").join("config.json");
    if let Ok(content) = std::fs::read_to_string(&config_path) {
        if let Ok(cfg) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(udd) = cfg.get("user_data_dir").and_then(|v| v.as_str()) {
                let trimmed = udd.trim().to_string();
                if !trimmed.is_empty() {
                    return Some(trimmed);
                }
            }
        }
    }
    None
}

/// 内部实现：扫描指定用户目录下的 SYSTEM.md 文件，目录名即 agent_id。
fn load_user_agents_from(base_dir: &Path, user_id: &str) -> HashMap<String, Value> {
    let user_dir = base_dir.join(format!("u_{}", user_id));
    let mut result = HashMap::new();

    if !user_dir.is_dir() {
        return result;
    }

    let mut entries: Vec<_> = match std::fs::read_dir(&user_dir) {
        Ok(entries) => entries
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_dir())
            .collect(),
        Err(_) => return result,
    };
    entries.sort_by_key(|e| e.file_name());

    for entry in entries {
        let system_md = entry.path().join("SYSTEM.md");
        if !system_md.is_file() {
            continue;
        }
        let agent_id = entry.file_name().to_string_lossy().to_string();

        if let Ok(content) = std::fs::read_to_string(&system_md) {
            if let Some(frontmatter) = crate::core::config::extract_yaml_frontmatter(&content) {
                if let Ok(mut cfg) = serde_yaml::from_str::<Value>(frontmatter) {
                    if cfg.is_object() {
                        if cfg.get("title").is_none() {
                            cfg["title"] =
                                Value::String(crate::core::config::DEFAULT_AGENT_TITLE.to_string());
                        }
                        result.insert(agent_id, cfg);
                    }
                }
            }
        }
    }

    result
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

        // 写入两个 SYSTEM.md 文件
        let agent1_dir = tmp.path().join("u_test-user").join("my-agent");
        fs::create_dir_all(&agent1_dir).unwrap();
        fs::write(
            agent1_dir.join("SYSTEM.md"),
            "---\nname: My Custom Agent\nskills:\n  - ingest-file\n---\n\nbody",
        ).unwrap();

        let agent2_dir = tmp.path().join("u_test-user").join("helper");
        fs::create_dir_all(&agent2_dir).unwrap();
        fs::write(
            agent2_dir.join("SYSTEM.md"),
            "---\nname: Helper Bot\nlocked: false\n---\n",
        ).unwrap();

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
    fn test_load_user_agents_default_title_when_missing() {
        let tmp = setup_dir();
        let user_id = "test-user";

        let agent_dir = tmp.path().join("u_test-user").join("legacy-agent");
        fs::create_dir_all(&agent_dir).unwrap();
        // 旧格式：frontmatter 无 title 字段
        fs::write(agent_dir.join("SYSTEM.md"), "---\nname: 旧显示名\n---\n\nbody").unwrap();

        let result = load_user_agents_from(tmp.path(), user_id);
        assert_eq!(
            result["legacy-agent"]["title"].as_str().unwrap(),
            "未命名智能体"
        );
    }

    #[test]
    fn test_load_user_agents_file_not_exists() {
        let tmp = setup_dir();
        let result = load_user_agents_from(tmp.path(), "nonexistent");
        assert!(result.is_empty());
    }

    #[test]
    fn test_load_user_agents_invalid_frontmatter() {
        let tmp = setup_dir();
        let user_id = "test-user";
        let agent_dir = tmp.path().join("u_test-user").join("bad-agent");
        fs::create_dir_all(&agent_dir).unwrap();
        fs::write(agent_dir.join("SYSTEM.md"), "plain text without frontmatter").unwrap();

        let result = load_user_agents_from(tmp.path(), user_id);
        assert!(result.is_empty());
    }

    #[test]
    fn test_load_user_agents_empty_dir() {
        let tmp = setup_dir();
        let user_id = "test-user";
        let user_dir = tmp.path().join("u_test-user");
        fs::create_dir_all(&user_dir).unwrap();

        let result = load_user_agents_from(tmp.path(), user_id);
        assert!(result.is_empty());
    }

    #[test]
    fn test_load_user_agents_ignores_non_dir() {
        let tmp = setup_dir();
        let user_id = "test-user";
        let user_dir = tmp.path().join("u_test-user");
        fs::create_dir_all(&user_dir).unwrap();
        // 写入文件（非目录）应被忽略
        fs::write(user_dir.join("readme.txt"), "hello").unwrap();

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

    #[tokio::test]
    async fn test_with_user_context_sets_user_id() {
        let result = with_user_context("alice".to_string(), async {
            get_current_user_id()
        }).await;
        assert_eq!(result, Some("alice".to_string()));
    }

    #[tokio::test]
    async fn test_with_user_context_returns_value() {
        let answer = with_user_context("bob".to_string(), async {
            42
        }).await;
        assert_eq!(answer, 42);
    }
}
