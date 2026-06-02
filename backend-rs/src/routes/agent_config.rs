use std::collections::HashSet;
use std::path::PathBuf;

use axum::extract::Path;
use axum::routing::{delete, get, post, put};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::Value;

use crate::core::config::get_agent_base_dir;
use crate::service::disabled_skills::DisabledSkills;
use crate::service::skill_loader::{discover_skills_for_agent, parse_skill_md};

const ALLOWED_PROMPT_FILES: &[&str] = &["AGENTS.md", "SOUL.md", "USER.md", "system_prompt.md"];

pub fn router() -> Router {
    Router::new()
        // Prompts
        .route("/api/agents/:agent_id/prompts", get(list_prompts))
        .route("/api/agents/:agent_id/prompts/:filename", put(save_prompt))
        // Skills
        .route("/api/agents/:agent_id/skills", get(list_skills))
        .route("/api/agents/:agent_id/skills/:skill_id/disable", put(toggle_skill_disable))
        .route("/api/agents/:agent_id/skills/upload", post(upload_skill))
        .route("/api/agents/:agent_id/skills/:skill_id", delete(delete_skill))
}

fn agent_prompts_dir(agent_id: &str) -> PathBuf {
    get_agent_base_dir(agent_id).join(".agent").join("prompts")
}

fn agent_skills_dir(agent_id: &str) -> PathBuf {
    get_agent_base_dir(agent_id).join(".agent").join("skills")
}

// ── Prompts ──────────────────────────────────────────────────────────

/// GET /api/agents/{agent_id}/prompts
async fn list_prompts(Path(agent_id): Path<String>) -> Json<Value> {
    let prompts_dir = agent_prompts_dir(&agent_id);
    let mut files = serde_json::json!({});

    for filename in ALLOWED_PROMPT_FILES {
        let path = prompts_dir.join(filename);
        let content = if path.exists() {
            std::fs::read_to_string(&path).unwrap_or_default()
        } else {
            String::new()
        };
        files[filename] = Value::String(content);
    }

    Json(serde_json::json!({ "files": files }))
}

#[derive(Deserialize)]
struct SavePromptBody {
    content: String,
}

/// PUT /api/agents/{agent_id}/prompts/{filename}
async fn save_prompt(
    Path((agent_id, filename)): Path<(String, String)>,
    Json(body): Json<SavePromptBody>,
) -> Json<Value> {
    if !ALLOWED_PROMPT_FILES.contains(&filename.as_str()) {
        return Json(serde_json::json!({
            "ok": false,
            "error": format!("Filename not allowed: {filename}. Allowed: {:?}", ALLOWED_PROMPT_FILES)
        }));
    }

    let prompts_dir = agent_prompts_dir(&agent_id);
    let path = prompts_dir.join(&filename);

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    match std::fs::write(&path, &body.content) {
        Ok(()) => Json(serde_json::json!({"ok": true})),
        Err(e) => Json(serde_json::json!({
            "ok": false,
            "error": format!("Failed to write file: {e}")
        })),
    }
}

// ── Skills ───────────────────────────────────────────────────────────

/// GET /api/agents/{agent_id}/skills
async fn list_skills(Path(agent_id): Path<String>) -> Json<Value> {
    let heads = discover_skills_for_agent(&agent_id);
    let disabled = DisabledSkills::load(&agent_id);

    let skills: Vec<Value> = heads
        .into_iter()
        .map(|h| {
            serde_json::json!({
                "id": h.skill_id,
                "name": h.name,
                "description": h.description,
                "source": h.source,
                "disabled": disabled.is_disabled(&h.skill_id),
            })
        })
        .collect();

    Json(serde_json::json!({ "skills": skills }))
}

#[derive(Deserialize)]
struct ToggleDisableBody {
    disabled: bool,
}

/// PUT /api/agents/{agent_id}/skills/{skill_id}/disable
async fn toggle_skill_disable(
    Path((agent_id, skill_id)): Path<(String, String)>,
    Json(body): Json<ToggleDisableBody>,
) -> Json<Value> {
    let mut disabled = DisabledSkills::load(&agent_id);
    disabled.set_disabled(&skill_id, body.disabled);
    disabled.save();
    Json(serde_json::json!({"ok": true}))
}

#[derive(Deserialize)]
struct UploadSkillBody {
    folder_name: String,
    files: std::collections::HashMap<String, String>,
}

/// POST /api/agents/{agent_id}/skills/upload
async fn upload_skill(
    Path(agent_id): Path<String>,
    Json(body): Json<UploadSkillBody>,
) -> Json<Value> {
    let folder_name = body.folder_name.trim().to_string();

    // 校验 folder_name
    if folder_name.is_empty() || folder_name.contains('/') || folder_name.contains('\\') || folder_name.contains("..") {
        return Json(serde_json::json!({
            "ok": false, "error": "Invalid folder_name"
        }));
    }

    // 校验 SKILL.md 是否存在且 frontmatter 正确
    let skill_md_content = match body.files.get("SKILL.md") {
        Some(c) => c,
        None => {
            return Json(serde_json::json!({
                "ok": false, "error": "SKILL.md is required"
            }));
        }
    };

    let meta = match parse_skill_md(skill_md_content) {
        Some(m) => m,
        None => {
            return Json(serde_json::json!({
                "ok": false, "error": "SKILL.md has invalid or missing YAML frontmatter"
            }));
        }
    };

    // 校验 name 与 folder_name 一致
    if meta.name != folder_name {
        return Json(serde_json::json!({
            "ok": false,
            "error": format!("SKILL.md name '{name}' does not match folder_name '{folder_name}'", name = meta.name)
        }));
    }

    // 写入文件
    let skill_dir = agent_skills_dir(&agent_id).join(&folder_name);
    if let Err(e) = std::fs::create_dir_all(&skill_dir) {
        return Json(serde_json::json!({
            "ok": false, "error": format!("Failed to create skill directory: {e}")
        }));
    }

    for (filepath, content) in &body.files {
        let target = skill_dir.join(filepath);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        if let Err(e) = std::fs::write(&target, content) {
            return Json(serde_json::json!({
                "ok": false, "error": format!("Failed to write {filepath}: {e}")
            }));
        }
    }

    Json(serde_json::json!({"ok": true}))
}

/// DELETE /api/agents/{agent_id}/skills/{skill_id}
async fn delete_skill(
    Path((agent_id, skill_id)): Path<(String, String)>,
) -> Json<Value> {
    // 只允许删除 user source 的 skill
    let heads = discover_skills_for_agent(&agent_id);
    let target = heads.into_iter().find(|h| h.skill_id == skill_id);

    match target {
        Some(h) if h.source == "user" => {
            // 删除 skill 目录
            let skill_dir = agent_skills_dir(&agent_id).join(&skill_id);
            if skill_dir.exists() {
                std::fs::remove_dir_all(&skill_dir).ok();
            }
            Json(serde_json::json!({"ok": true}))
        }
        Some(_) => Json(serde_json::json!({
            "ok": false,
            "error": format!("Cannot delete '{skill_id}': only user-sourced skills can be deleted")
        })),
        None => Json(serde_json::json!({
            "ok": false,
            "error": format!("Skill '{skill_id}' not found")
        })),
    }
}
