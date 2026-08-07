use axum::extract::{Extension, Path};
use axum::Json;
use serde::Deserialize;
use serde_json::Value;

use crate::agent::registry;
use crate::core::auth::UserContext;
use crate::core::config::{get_agent_base_dir, get_config};

pub fn router() -> axum::Router {
    axum::Router::new()
        .route("/api/agents", axum::routing::get(list_agents).post(create_agent))
        .route("/api/agents/:agent_id", axum::routing::delete(delete_agent))
}

async fn list_agents(Extension(ctx): Extension<UserContext>) -> Json<Value> {
    let mut agents = registry::list_agents().clone();

    // 追加当前用户的 custom agent
    for (agent_id, cfg) in &ctx.user_agents {
        if !agents.iter().any(|a| a.name == *agent_id) {
            agents.push(crate::agent::registry::AgentMeta {
                name: agent_id.clone(),
                title: cfg
                    .get("title")
                    .and_then(|v| v.as_str())
                    .unwrap_or(agent_id)
                    .to_string(),
                description: cfg
                    .get("description")
                    .and_then(|v| v.as_str())
                    .map(str::to_string),
                visible: true,
                locked: false,
                layout: None,
            });
        }
    }

    Json(serde_json::json!({ "agents": agents }))
}

#[derive(Deserialize)]
struct CreateAgentBody {
    title: String,
    description: Option<String>,
}

/// POST /api/agents — 创建自定义智能体
async fn create_agent(
    Extension(ctx): Extension<UserContext>,
    Json(body): Json<CreateAgentBody>,
) -> Json<Value> {
    let title = body.title.trim().to_string();
    if title.is_empty() {
        return Json(serde_json::json!({
            "ok": false, "error_code": "AGENT_NAME_REQUIRED", "error": "智能体名称不能为空"
        }));
    }
    if title.chars().count() > 20 {
        return Json(serde_json::json!({
            "ok": false, "error_code": "AGENT_NAME_TOO_LONG", "error": "智能体名称不能超过20个字符"
        }));
    }

    let description = body
        .description
        .as_deref()
        .map(str::trim)
        .unwrap_or("")
        .to_string();
    if description.chars().count() > 200 {
        return Json(serde_json::json!({
            "ok": false, "error_code": "AGENT_DESCRIPTION_TOO_LONG", "error": "智能体描述不能超过200个字符"
        }));
    }

    let user_id = match &ctx.user_id {
        Some(uid) => uid.clone(),
        None => {
            return Json(serde_json::json!({
                "ok": false, "error_code": "AGENT_NOT_LOGGED_IN", "error": "未登录用户无法创建智能体"
            }));
        }
    };

    // 生成 agent_id: a_ + UUID 前 8 位 hex
    let agent_id = format!("a_{}", &uuid::Uuid::new_v4().simple().to_string()[..8]);

    // 构造 SYSTEM.md 路径
    let system_path = get_agent_base_dir(&agent_id).join("SYSTEM.md");

    // 检查是否已存在
    if system_path.exists() {
        return Json(serde_json::json!({
            "ok": false, "error": format!("智能体 '{}' 已存在", agent_id)
        }));
    }

    // 写入 SYSTEM.md（frontmatter + body，使用 YAML 序列化防止注入）
    let mut meta = serde_json::Map::new();
    meta.insert("title".into(), serde_json::json!(title));
    meta.insert("name".into(), serde_json::json!(agent_id.clone()));
    if !description.is_empty() {
        meta.insert("description".into(), serde_json::json!(description));
    }
    let frontmatter = serde_yaml::to_string(&serde_json::Value::Object(meta))
        .expect("serialize static JSON to YAML cannot fail");
    let system_content = format!("---\n{}---\n", frontmatter);

    if let Some(parent) = system_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    if let Err(e) = std::fs::write(&system_path, &system_content) {
        return Json(serde_json::json!({
            "ok": false, "error": format!("写入智能体配置失败: {e}")
        }));
    }

    Json(serde_json::json!({
        "ok": true,
        "agent": {
            "name": agent_id,
            "title": title
        }
    }))
}

/// DELETE /api/agents/:agent_id — 删除自定义智能体
async fn delete_agent(
    Extension(ctx): Extension<UserContext>,
    Path(agent_id): Path<String>,
) -> Json<Value> {
    // 只允许删除 a_ 开头的自定义智能体
    if !agent_id.starts_with("a_") {
        return Json(serde_json::json!({
            "ok": false, "error": "只能删除自定义智能体"
        }));
    }

    // 不允许删除系统智能体
    if get_config().agents.contains_key(&agent_id) {
        return Json(serde_json::json!({
            "ok": false, "error": format!("智能体 '{}' 是系统智能体，不能删除", agent_id)
        }));
    }

    // 检查用户登录状态
    let _user_id = match &ctx.user_id {
        Some(uid) => uid.clone(),
        None => {
            return Json(serde_json::json!({
                "ok": false, "error": "未登录用户无法删除智能体"
            }));
        }
    };

    let system_path = get_agent_base_dir(&agent_id).join("SYSTEM.md");

    if !system_path.exists() {
        return Json(serde_json::json!({
            "ok": false, "error": format!("智能体 '{}' 不存在", agent_id)
        }));
    }

    if let Err(e) = std::fs::remove_file(&system_path) {
        return Json(serde_json::json!({
            "ok": false, "error": format!("删除智能体配置失败: {e}")
        }));
    }

    Json(serde_json::json!({ "ok": true }))
}

