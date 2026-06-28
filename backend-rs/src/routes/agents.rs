use std::path::PathBuf;

use axum::extract::{Extension, Path};
use axum::Json;
use serde::Deserialize;
use serde_json::Value;

use crate::agent::registry;
use crate::core::auth::UserContext;
use crate::core::config::get_config;

pub fn router() -> axum::Router {
    axum::Router::new()
        .route("/api/agents", axum::routing::get(list_agents).post(create_agent))
        .route("/api/agents/:agent_id", axum::routing::delete(delete_agent))
}

async fn list_agents(Extension(ctx): Extension<UserContext>) -> Json<Value> {
    let mut agents = registry::list_agents().clone();

    // 追加当前用户的 custom agent
    for (agent_id, cfg) in &ctx.user_agents {
        if !agents.iter().any(|a| a.id == *agent_id) {
            agents.push(crate::agent::registry::AgentMeta {
                id: agent_id.clone(),
                name: cfg
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or(agent_id)
                    .to_string(),
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
    name: String,
}

/// POST /api/agents — 创建自定义智能体
async fn create_agent(
    Extension(ctx): Extension<UserContext>,
    Json(body): Json<CreateAgentBody>,
) -> Json<Value> {
    let name = body.name.trim().to_string();
    if name.is_empty() {
        return Json(serde_json::json!({
            "ok": false, "error": "智能体名称不能为空"
        }));
    }

    let user_id = match &ctx.user_id {
        Some(uid) => uid.clone(),
        None => {
            return Json(serde_json::json!({
                "ok": false, "error": "未登录用户无法创建智能体"
            }));
        }
    };

    // 生成 agent_id: a_ + UUID 前 8 位 hex
    let agent_id = format!("a_{}", &uuid::Uuid::new_v4().simple().to_string()[..8]);

    // 构造 agent YAML 路径
    let yaml_path = get_user_agent_path(&user_id, &agent_id);

    // 检查是否已存在
    if yaml_path.exists() {
        return Json(serde_json::json!({
            "ok": false, "error": format!("智能体 '{}' 已存在", agent_id)
        }));
    }

    // 写入 YAML
    let yaml_content = serde_yaml::to_string(&serde_json::json!({
        "name": name
    })).unwrap_or_default();

    if let Some(parent) = yaml_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    if let Err(e) = std::fs::write(&yaml_path, &yaml_content) {
        return Json(serde_json::json!({
            "ok": false, "error": format!("写入智能体配置失败: {e}")
        }));
    }

    Json(serde_json::json!({
        "ok": true,
        "agent": {
            "id": agent_id,
            "name": name
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

    let user_id = match &ctx.user_id {
        Some(uid) => uid.clone(),
        None => {
            return Json(serde_json::json!({
                "ok": false, "error": "未登录用户无法删除智能体"
            }));
        }
    };

    let yaml_path = get_user_agent_path(&user_id, &agent_id);

    if !yaml_path.exists() {
        return Json(serde_json::json!({
            "ok": false, "error": format!("智能体 '{}' 不存在", agent_id)
        }));
    }

    if let Err(e) = std::fs::remove_file(&yaml_path) {
        return Json(serde_json::json!({
            "ok": false, "error": format!("删除智能体配置失败: {e}")
        }));
    }

    Json(serde_json::json!({ "ok": true }))
}

/// 构造用户自定义智能体 YAML 路径
fn get_user_agent_path(user_id: &str, agent_id: &str) -> PathBuf {
    get_config()
        .data_dir
        .join(format!("u_{}", user_id))
        .join("agent")
        .join(format!("{}.yaml", agent_id))
}
