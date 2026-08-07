use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tracing::warn;

static CONFIG: OnceLock<AppConfig> = OnceLock::new();
static CONFIG_DIR: OnceLock<PathBuf> = OnceLock::new();

/// SYSTEM.md frontmatter 未声明 title 时的默认显示名
pub const DEFAULT_AGENT_TITLE: &str = "未命名智能体";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentLayout {
    pub left: Vec<String>,
    pub default_left: String,
    pub right: Vec<String>,
    pub default_right: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub name: Option<String>,
    pub title: Option<String>,
    pub locked: Option<bool>,
    pub skills: Option<Vec<String>>,
    pub layout: Option<AgentLayout>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VisibilityConfig {
    #[serde(default = "default_visible")]
    pub default_visible: bool,
    #[serde(default)]
    pub overrides: HashMap<String, bool>,
}

fn default_visible() -> bool {
    true
}

impl Default for VisibilityConfig {
    fn default() -> Self {
        Self {
            default_visible: true,
            overrides: HashMap::new(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub data_dir: PathBuf,
    pub agents: HashMap<String, AgentConfig>,
    pub visibility: VisibilityConfig,
}

/// 定位项目根目录（content-agent/）
fn find_omniage_root() -> PathBuf {
    // 1. 环境变量 OMNIAGE_ROOT 优先（Tauri 生产环境会设这个）
    if let Ok(root) = std::env::var("OMNIAGE_ROOT") {
        return PathBuf::from(root);
    }
    // 2. 从 exe 或 CWD 向上找 .env 作为项目根标记
    let start = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());
    let mut p = Some(start.as_path());
    while let Some(dir) = p {
        if dir.join(".env").exists() {
            return dir.to_path_buf();
        }
        p = dir.parent();
    }
    start
}

fn load_agent_configs(config_dir: &Path) -> HashMap<String, AgentConfig> {
    let agents_dir = config_dir.join("agents");
    let mut agents = HashMap::new();

    if !agents_dir.is_dir() {
        return agents;
    }

    let mut entries: Vec<_> = match std::fs::read_dir(&agents_dir) {
        Ok(entries) => entries
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_dir())
            .collect(),
        Err(_) => return agents,
    };
    entries.sort_by_key(|e| e.file_name());

    for entry in &entries {
        let system_md = entry.path().join("SYSTEM.md");
        if !system_md.is_file() {
            continue;
        }
        let agent_id = entry.file_name().to_string_lossy().to_string();

        if let Ok(content) = std::fs::read_to_string(&system_md) {
            if let Some(frontmatter) = extract_yaml_frontmatter(&content) {
                if let Ok(mut cfg) = serde_yaml::from_str::<AgentConfig>(frontmatter) {
                    if cfg.title.is_none() {
                        cfg.title = Some(DEFAULT_AGENT_TITLE.to_string());
                    }
                    cfg.name = Some(agent_id.clone()); // name 恒等于目录名（以文件名为准）
                    agents.insert(agent_id, cfg);
                }
            }
        }
    }

    agents
}

/// 提取 YAML frontmatter（`---` 之间的内容）。
pub(crate) fn extract_yaml_frontmatter(content: &str) -> Option<&str> {
    let trimmed = content.trim();
    if !trimmed.starts_with("---") {
        return None;
    }
    let without_start = &trimmed[3..];
    let end = without_start.find("\n---")?;
    Some(&without_start[..end])
}

pub fn init_config() {
    let root = find_omniage_root();
    let config_dir = root.join("config");
    CONFIG_DIR.set(config_dir.clone()).ok();

    // data_dir 固定为 OMNIAGE_ROOT/data，不从环境变量读取
    let data_dir = root.join("data");
    let data_dir = data_dir.canonicalize().unwrap_or(data_dir);
    // Windows: canonicalize() 会添加 \\?\ 前缀，去掉它以得到整洁路径
    let data_dir = crate::utils::helpers::normalize_path(data_dir);

    let agents = load_agent_configs(&config_dir);

    let visibility = load_visibility_yaml(&config_dir);

    let config = AppConfig { data_dir, agents, visibility };
    CONFIG.set(config).ok();
}

fn load_visibility_yaml(config_dir: &Path) -> VisibilityConfig {
    let path = config_dir.join("visibility.yaml");
    match std::fs::read_to_string(&path) {
        Ok(content) => serde_yaml::from_str(&content).unwrap_or_default(),
        Err(_) => VisibilityConfig::default(),
    }
}

pub fn get_config() -> &'static AppConfig {
    CONFIG.get().expect("config not initialized, call init_config() first")
}

pub fn get_config_dir() -> &'static Path {
    CONFIG_DIR.get().expect("config not initialized, call init_config() first").as_path()
}

pub fn get_agent_config(agent_id: &str) -> Option<&'static AgentConfig> {
    get_config().agents.get(agent_id)
}

/// 获取合并了用户配置的 AgentConfig。
/// 优先级：用户配置 > 内置配置。无用户上下文时等价于 get_agent_config()。
pub fn get_agent_user_config(agent_id: &str) -> Option<AgentConfig> {
    let cfg = get_config();
    let base = cfg.agents.get(agent_id).cloned();

    // 有用户上下文时尝试从用户目录加载 SYSTEM.md 配置
    if crate::core::auth::get_current_user_id().is_some() {
        let user_system = get_agent_base_dir(agent_id).join("SYSTEM.md");

        if user_system.exists() {
            if let Ok(content) = std::fs::read_to_string(&user_system) {
                if let Some(frontmatter) = extract_yaml_frontmatter(&content) {
                    if let Ok(mut user_cfg) = serde_yaml::from_str::<AgentConfig>(frontmatter) {
                        user_cfg.name = Some(agent_id.to_string()); // name 恒等于目录名（以文件名为准）
                        return Some(merge_agent_configs(base, user_cfg));
                    }
                }
            }
        }
    }

    base
}

/// 合并两个 AgentConfig，user 字段优先于 base。
fn merge_agent_configs(base: Option<AgentConfig>, user: AgentConfig) -> AgentConfig {
    let base = match base {
        Some(b) => b,
        None => return user,
    };
    AgentConfig {
        name: user.name.or(base.name),
        title: user.title.or(base.title),
        locked: user.locked.or(base.locked),
        skills: user.skills.or(base.skills),
        layout: user.layout.or(base.layout),
        extra: {
            let mut merged = base.extra.clone();
            for (k, v) in user.extra {
                merged.insert(k, v);
            }
            merged
        },
    }
}

/// 内部函数：按指定 user_id 解析 agent base dir（不依赖 auth 上下文）
fn get_agent_base_dir_for(agent_id: &str, user_id: &str) -> PathBuf {
    let cfg = get_config();
    resolve_agent_base_dir_for(agent_id, user_id, &cfg.data_dir)
}

/// get_agent_base_dir_for 的核心路径解析逻辑（支持显式 user_data_dir，不依赖 config.json 当前值）。
fn resolve_agent_base_dir_with_udd(agent_id: &str, user_id: &str, user_data_dir: &str, data_dir: &Path) -> PathBuf {
    let default_base = data_dir.join(format!("u_{}", user_id));

    // 管理员 workspace 永远在 data/u_{user_id}/admin/
    if agent_id == "admin" {
        return default_base.join("admin");
    }

    let trimmed = user_data_dir.trim();
    if !trimmed.is_empty() {
        PathBuf::from(trimmed).join(format!("u_{}", user_id)).join(agent_id)
    } else {
        default_base.join(agent_id)
    }
}

/// get_agent_base_dir_for 的核心路径解析逻辑（从 config.json 读取 user_data_dir，便于测试）。
fn resolve_agent_base_dir_for(agent_id: &str, user_id: &str, data_dir: &Path) -> PathBuf {
    let default_base = data_dir.join(format!("u_{}", user_id));

    if agent_id == "admin" {
        return default_base.join("admin");
    }

    // 读取用户配置 config.json 中的 user_data_dir
    let config_path = default_base.join("admin").join("config.json");
    if let Ok(content) = std::fs::read_to_string(&config_path) {
        if let Ok(user_config) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(user_data_dir) = user_config.get("user_data_dir").and_then(|v| v.as_str()) {
                return resolve_agent_base_dir_with_udd(agent_id, user_id, user_data_dir, data_dir);
            }
        }
    }

    default_base.join(agent_id)
}

pub fn get_agent_base_dir(agent_id: &str) -> PathBuf {
    let user_id = crate::core::auth::get_current_user_id().unwrap_or_default();
    get_agent_base_dir_for(agent_id, &user_id)
}

/// 惰性播种：如果 workspace 缺少 SYSTEM.md（新用户或新 agent），从内置配置补齐。
fn ensure_agent_seeded(workspace: &Path, agent_id: &str) {
    let config_dir = get_config_dir();
    seed_workspace_from(workspace, agent_id, config_dir);
}

/// ensure_agent_seeded 的核心文件复制逻辑（依赖通过参数注入，便于测试）。
fn seed_workspace_from(workspace: &Path, agent_id: &str, config_dir: &Path) {
    // 模板来源规则：
    //   - admin → config/agents/admin/
    //   - 其他所有 agent（std、用户自定义等）→ config/agents/std/
    let template_id = if agent_id == "admin" { "admin" } else { "std" };
    let template_dir = config_dir.join("agents").join(template_id);

    let system_path = workspace.join("SYSTEM.md");
    if !system_path.exists() {
        let source = template_dir.join("SYSTEM.md");
        if source.exists() {
            std::fs::copy(&source, &system_path).ok();
        }
    }

    for name in &["SOUL.md", "USER.md", "IDENTITY.md"] {
        let target = workspace.join(name);
        if !target.exists() {
            let source = template_dir.join(name);
            if source.exists() {
                std::fs::copy(&source, &target).ok();
            }
        }
    }
}

/// 从 config.json 中读取指定 provider 的配置（api_key, api_base）。
/// 返回 HashMap，可能为空（未配置时）。
pub fn get_provider_config(user_id: &str, provider_name: &str) -> HashMap<String, String> {
    let cfg = get_config();
    let config_path = cfg
        .data_dir
        .join(format!("u_{}", user_id))
        .join("admin")
        .join("config.json");

    if let Ok(content) = std::fs::read_to_string(&config_path) {
        if let Ok(root) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(providers) = root.get("providers").and_then(|v| v.as_object()) {
                if let Some(provider_cfg) = providers.get(provider_name).and_then(|v| v.as_object()) {
                    let mut result = HashMap::new();
                    if let Some(ak) = provider_cfg.get("api_key").and_then(|v| v.as_str()) {
                        result.insert("api_key".to_string(), ak.to_string());
                    }
                    if let Some(ab) = provider_cfg.get("api_base").and_then(|v| v.as_str()) {
                        result.insert("api_base".to_string(), ab.to_string());
                    }
                    return result;
                }
            }
        }
    }
    HashMap::new()
}

pub fn get_agent_sessions_path(agent_id: &str) -> PathBuf {
    get_agent_base_dir(agent_id).join(".local").join("sessions.json")
}

pub fn get_agent_session_messages_dir(agent_id: &str) -> PathBuf {
    get_agent_base_dir(agent_id).join(".local").join("messages")
}

pub fn get_agent_session_messages_path(agent_id: &str, session_id: &str) -> PathBuf {
    get_agent_session_messages_dir(agent_id).join(format!("{}.jsonl", session_id))
}

pub fn get_agent_workspace_dir(agent_id: &str) -> PathBuf {
    let ws = get_agent_base_dir(agent_id);
    std::fs::create_dir_all(&ws).ok();
    // 惰性播种：如果 workspace 缺少 SYSTEM.md，从内置配置补齐
    ensure_agent_seeded(&ws, agent_id);
    ws
}

/// 为当前用户 seed 所有 agent workspace（系统 agent + 用户自定义 agent）。
///
/// 在用户认证通过后立即调用，确保该用户的 agent workspace 目录和 prompt 文件已就绪。
/// 不会覆盖用户已有的文件。
pub fn seed_user_agent_workspaces(user_agent_ids: &[String]) {
    let cfg = get_config();
    let mut all_ids: Vec<String> = cfg.agents.keys().cloned().collect();
    all_ids.extend(user_agent_ids.iter().cloned());

    for agent_id in all_ids {
        get_agent_workspace_dir(&agent_id);
    }
}

/// 递归复制目录下所有内容（类似 `cp -r`）。
fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

/// 检测并迁移旧格式的 user_data_dir 数据。
///
/// 旧格式：{user_data_dir}/<agent_id>/（无 u_{user_id}）
/// 新格式：{user_data_dir}/u_{user_id}/<agent_id>/
/// 在新路径不存在、旧路径存在时执行一次迁移（含旧格式至新格式）。
pub(crate) fn check_and_migrate_old_user_data_dir_format(user_id: &str, user_data_dir: &str) {
    let trimmed = user_data_dir.trim();
    if trimmed.is_empty() {
        return;
    }
    let old_root = PathBuf::from(trimmed);
    if !old_root.is_dir() {
        return;
    }
    let new_root = old_root.join(format!("u_{}", user_id));
    if new_root.exists() {
        return;
    }
    if let Ok(entries) = std::fs::read_dir(&old_root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            if !path.join("SYSTEM.md").exists() {
                continue;
            }
            let agent_id = entry.file_name().to_string_lossy().to_string();
            if agent_id == "admin" {
                continue;
            }
            let dst = new_root.join(&agent_id);
            if !dst.exists() {
                copy_dir_all(&path, &dst).ok();
            }
        }
    }
}

/// 当 user_data_dir 变化时，将所有非 admin agent 的 workspace 从旧路径迁移到新路径。
///
/// 在 settings API 写入新 user_data_dir 后调用。
/// - admin 固定在 DEFAULT_DATA_DIR，不参与迁移
/// - 旧路径不存在时跳过
/// - 新路径已存在时跳过（不覆盖已有数据）
pub fn migrate_workspace_if_needed(
    user_id: &str,
    old_user_data_dir: &str,
    new_user_data_dir: &str,
    user_agent_ids: &[String],
) {
    if old_user_data_dir == new_user_data_dir {
        return;
    }

    // 先确保旧格式数据迁移到新格式，再执行路径变更迁移
    check_and_migrate_old_user_data_dir_format(user_id, old_user_data_dir);

    let cfg = get_config();
    let data_dir = &cfg.data_dir;

    let mut all_ids: Vec<String> = cfg.agents.keys().cloned().collect();
    all_ids.extend(user_agent_ids.iter().cloned());

    for agent_id in all_ids {
        if agent_id == "admin" {
            continue;
        }

        let old_base = resolve_agent_base_dir_with_udd(&agent_id, user_id, old_user_data_dir, data_dir);
        let new_base = resolve_agent_base_dir_with_udd(&agent_id, user_id, new_user_data_dir, data_dir);

        if old_base == new_base || !old_base.exists() || new_base.exists() {
            continue;
        }

        if let Err(e) = copy_dir_all(&old_base, &new_base) {
            warn!("workspace 迁移失败: {} -> {}: {}", old_base.display(), new_base.display(), e);
        }
    }
}

pub fn get_agent_local_data_dir(agent_id: &str) -> PathBuf {
    // Python 端等义：<base>/knowledge_base/
    let local_data = get_agent_base_dir(agent_id).join("knowledge_base");
    std::fs::create_dir_all(&local_data).ok();
    local_data
}

pub fn get_agent_attachment_cache_dir(agent_id: &str) -> PathBuf {
    // Python 端等义：<base>/.local/cache/
    let cache = get_agent_base_dir(agent_id).join(".local").join("cache");
    std::fs::create_dir_all(&cache).ok();
    cache
}

pub fn get_database_registry_path(agent_id: &str) -> PathBuf {
    get_agent_local_data_dir(agent_id).join("databases.json")
}

pub fn get_database_nodes_path(agent_id: &str, kb_id: &str) -> PathBuf {
    get_agent_local_data_dir(agent_id).join(kb_id).join("view").join("nodes.json")
}

/// 读取 MCP 服务器配置。
///   1. config/mcp.yaml（内置）
///   2. data/u_{user_id}/mcp.yaml（用户覆盖）
pub fn load_mcp_servers(user_id: &str) -> HashMap<String, Value> {
    let config_dir = get_config_dir();
    let data_dir = &get_config().data_dir;
    let mut result = HashMap::new();

    if let Ok(content) = std::fs::read_to_string(config_dir.join("mcp.yaml")) {
        if let Ok(root) = serde_yaml::from_str::<Value>(&content) {
            if let Some(obj) = root.as_object() {
                for (k, v) in obj { result.insert(k.clone(), v.clone()); }
            }
        }
    }

    if !user_id.is_empty() {
        let p = data_dir.join(format!("u_{}", user_id)).join("mcp.yaml");
        if let Ok(content) = std::fs::read_to_string(&p) {
            if let Ok(root) = serde_yaml::from_str::<Value>(&content) {
                if let Some(obj) = root.as_object() {
                    for (k, v) in obj { result.insert(k.clone(), v.clone()); }
                }
            }
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── extract_yaml_frontmatter ─────────────────────────────────

    #[test]
    fn test_extract_frontmatter_valid() {
        let content = "---\ntitle: test\nname: test\nskills:\n  - skill_a\n---\n\nbody text";
        let result = extract_yaml_frontmatter(content);
        assert!(result.is_some());
        let fm = result.unwrap();
        assert!(fm.contains("title: test"));
        assert!(fm.contains("skill_a"));
    }

    #[test]
    fn test_extract_frontmatter_no_frontmatter() {
        assert_eq!(extract_yaml_frontmatter("just body text"), None);
    }

    #[test]
    fn test_extract_frontmatter_non_dict() {
        // Even non-dict YAML gets extracted — validation is caller's responsibility
        let content = "---\n- list\n- items\n---\n\nbody";
        let result = extract_yaml_frontmatter(content);
        assert!(result.is_some());
        assert!(result.unwrap().contains("list"));
    }

    #[test]
    fn test_extract_frontmatter_only_delimiters() {
        // `---\n---` — empty frontmatter
        let content = "---\n---\n\nbody";
        let result = extract_yaml_frontmatter(content);
        assert!(result.is_some());
        assert!(result.unwrap().trim().is_empty());
    }

    #[test]
    fn test_extract_frontmatter_no_closing() {
        // No closing `---` delimiter
        let content = "---\nname: test";
        assert_eq!(extract_yaml_frontmatter(content), None);
    }

    #[test]
    fn test_extract_frontmatter_body_contains_delimiter() {
        // Body containing `---` should not confuse the parser
        let content = "---\nkey: val\n---\nbody with ---\nmore text";
        let result = extract_yaml_frontmatter(content);
        assert!(result.is_some());
        let fm = result.unwrap();
        assert!(fm.contains("key: val"));
        assert!(!fm.contains("more text"));
    }

    #[test]
    fn test_extract_frontmatter_empty_content() {
        assert_eq!(extract_yaml_frontmatter(""), None);
    }

    #[test]
    fn test_extract_frontmatter_only_opening() {
        assert_eq!(extract_yaml_frontmatter("---"), None);
    }

    // ── load_agent_configs ───────────────────────────────────────

    #[test]
    fn test_load_agent_configs_empty_dir() {
        let tmp = tempfile::tempdir().unwrap();
        // No agents/ subdirectory — function returns empty
        let result = load_agent_configs(tmp.path());
        assert!(result.is_empty());
    }

    #[test]
    fn test_load_agent_configs_loads_system_md() {
        let tmp = tempfile::tempdir().unwrap();
        let agent_dir = tmp.path().join("agents").join("std");
        std::fs::create_dir_all(&agent_dir).unwrap();
        std::fs::write(
            agent_dir.join("SYSTEM.md"),
            "---\ntitle: 标准助手\nname: std\n---\n\n提示词正文",
        )
        .unwrap();

        let result = load_agent_configs(tmp.path());
        assert_eq!(result.len(), 1);
        assert!(result.contains_key("std"));
        assert_eq!(result.get("std").and_then(|c| c.title.clone()), Some("标准助手".to_string()));
    }

    #[test]
    fn test_load_agent_configs_default_title_when_missing() {
        let tmp = tempfile::tempdir().unwrap();
        let agent_dir = tmp.path().join("agents").join("std");
        std::fs::create_dir_all(&agent_dir).unwrap();
        // 旧格式：frontmatter 无 title 字段
        std::fs::write(
            agent_dir.join("SYSTEM.md"),
            "---\nname: 标准助手\n---\n\n提示词正文",
        )
        .unwrap();

        let result = load_agent_configs(tmp.path());
        assert_eq!(result.len(), 1);
        assert!(result.contains_key("std"));
        assert_eq!(
            result.get("std").and_then(|c| c.title.clone()),
            Some(DEFAULT_AGENT_TITLE.to_string())
        );
        // name 恒等于目录名（以文件名为准），frontmatter 中的旧显示名被覆盖
        assert_eq!(
            result.get("std").and_then(|c| c.name.clone()),
            Some("std".to_string())
        );
    }

    #[test]
    fn test_load_agent_configs_skips_non_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let agents_dir = tmp.path().join("agents");
        std::fs::create_dir_all(&agents_dir).unwrap();
        // Create a file (not directory) in agents dir — should be skipped
        std::fs::write(agents_dir.join("not_a_dir.txt"), "").unwrap();

        let result = load_agent_configs(tmp.path());
        assert!(result.is_empty());
    }

    #[test]
    fn test_load_agent_configs_skips_missing_system_md() {
        let tmp = tempfile::tempdir().unwrap();
        let agent_dir = tmp.path().join("agents").join("std");
        std::fs::create_dir_all(&agent_dir).unwrap();
        // No SYSTEM.md file in the directory

        let result = load_agent_configs(tmp.path());
        assert!(result.is_empty());
    }

    #[test]
    fn test_load_agent_configs_skips_invalid_frontmatter() {
        let tmp = tempfile::tempdir().unwrap();
        let agent_dir = tmp.path().join("agents").join("bad");
        std::fs::create_dir_all(&agent_dir).unwrap();
        // Plain text without frontmatter
        std::fs::write(agent_dir.join("SYSTEM.md"), "plain text without frontmatter").unwrap();

        let result = load_agent_configs(tmp.path());
        assert!(result.is_empty());
    }

    // ── resolve_agent_base_dir_for ─────────────────────────────────

    #[test]
    fn test_resolve_agent_base_dir_for_default() {
        let tmp = tempfile::tempdir().unwrap();
        let data_dir = tmp.path().join("data");
        // No config.json → default path
        let result = resolve_agent_base_dir_for("my-agent", "user123", &data_dir);
        assert_eq!(result, data_dir.join("u_user123").join("my-agent"));
    }

    #[test]
    fn test_resolve_agent_base_dir_for_admin() {
        let tmp = tempfile::tempdir().unwrap();
        let data_dir = tmp.path().join("data");
        // admin 永远在 data/u_{user_id}/admin/
        let result = resolve_agent_base_dir_for("admin", "user456", &data_dir);
        assert_eq!(result, data_dir.join("u_user456").join("admin"));
    }

    #[test]
    fn test_resolve_agent_base_dir_for_with_user_data_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let data_dir = tmp.path().join("data");
        let custom_dir = tmp.path().join("custom_storage");
        // Write config.json with user_data_dir
        let admin_dir = data_dir.join("u_u1").join("admin");
        std::fs::create_dir_all(&admin_dir).unwrap();
        let config_content = serde_json::json!({"user_data_dir": custom_dir}).to_string();
        std::fs::write(admin_dir.join("config.json"), &config_content).unwrap();

        let result = resolve_agent_base_dir_for("my-agent", "u1", &data_dir);
        assert_eq!(result, custom_dir.join("u_u1").join("my-agent"));
    }

    #[test]
    fn test_resolve_agent_base_dir_for_user_data_dir_empty() {
        let tmp = tempfile::tempdir().unwrap();
        let data_dir = tmp.path().join("data");
        // user_data_dir is an empty string in config.json → fallback to default
        let admin_dir = data_dir.join("u_u1").join("admin");
        std::fs::create_dir_all(&admin_dir).unwrap();
        std::fs::write(
            admin_dir.join("config.json"),
            r#"{"user_data_dir": ""}"#,
        )
        .unwrap();

        let result = resolve_agent_base_dir_for("my-agent", "u1", &data_dir);
        assert_eq!(result, data_dir.join("u_u1").join("my-agent"));
    }

    // ── seed_workspace_from ────────────────────────────────────────

    #[test]
    fn test_seed_workspace_from_copies_system_md() {
        let tmp = tempfile::tempdir().unwrap();
        let config_dir = tmp.path().join("config");
        let workspace = tmp.path().join("workspace");
        std::fs::create_dir_all(&workspace).unwrap();

        // Create built-in agent template
        let agent_src = config_dir.join("agents").join("std");
        std::fs::create_dir_all(&agent_src).unwrap();
        std::fs::write(agent_src.join("SYSTEM.md"), "---\nname: Std\n---\n\nprompt body").unwrap();

        seed_workspace_from(&workspace, "std", &config_dir);

        assert!(workspace.join("SYSTEM.md").exists());
        let content = std::fs::read_to_string(workspace.join("SYSTEM.md")).unwrap();
        assert_eq!(content, "---\nname: Std\n---\n\nprompt body");
    }

    #[test]
    fn test_seed_workspace_from_no_overwrite() {
        let tmp = tempfile::tempdir().unwrap();
        let config_dir = tmp.path().join("config");
        let workspace = tmp.path().join("workspace");
        std::fs::create_dir_all(&workspace).unwrap();

        // Built-in template
        let agent_src = config_dir.join("agents").join("std");
        std::fs::create_dir_all(&agent_src).unwrap();
        std::fs::write(agent_src.join("SYSTEM.md"), "built-in").unwrap();

        // User already has a SYSTEM.md in workspace — should NOT be overwritten
        std::fs::write(workspace.join("SYSTEM.md"), "user-modified").unwrap();

        seed_workspace_from(&workspace, "std", &config_dir);

        let content = std::fs::read_to_string(workspace.join("SYSTEM.md")).unwrap();
        assert_eq!(content, "user-modified", "现有的 SYSTEM.md 不应被覆盖");
    }

    #[test]
    fn test_seed_workspace_from_skips_missing_source() {
        let tmp = tempfile::tempdir().unwrap();
        let config_dir = tmp.path().join("config"); // No agents/ subdirectory
        let workspace = tmp.path().join("workspace");
        std::fs::create_dir_all(&workspace).unwrap();

        // Should not panic
        seed_workspace_from(&workspace, "nonexistent", &config_dir);
        assert!(!workspace.join("SYSTEM.md").exists());
    }

    #[test]
    fn test_seed_workspace_from_copies_bootstrap() {
        let tmp = tempfile::tempdir().unwrap();
        let config_dir = tmp.path().join("config");
        let workspace = tmp.path().join("workspace");
        std::fs::create_dir_all(&workspace).unwrap();

        // Built-in agent with SOUL.md and USER.md
        let agent_src = config_dir.join("agents").join("std");
        std::fs::create_dir_all(&agent_src).unwrap();
        std::fs::write(agent_src.join("SYSTEM.md"), "system prompt").unwrap();
        std::fs::write(agent_src.join("SOUL.md"), "soul content").unwrap();
        std::fs::write(agent_src.join("USER.md"), "user content").unwrap();

        seed_workspace_from(&workspace, "std", &config_dir);

        assert!(workspace.join("SYSTEM.md").exists());
        assert!(workspace.join("SOUL.md").exists());
        assert!(workspace.join("USER.md").exists());
        // IDENTITY.md 没有模板 → 不应创建
        assert!(!workspace.join("IDENTITY.md").exists());
    }

    // ── 新增：admin → config/agents/admin/ ─────────────────────────

    #[test]
    fn test_seed_workspace_from_admin_uses_admin_template() {
        let tmp = tempfile::tempdir().unwrap();
        let config_dir = tmp.path().join("config");
        let workspace = tmp.path().join("workspace");
        std::fs::create_dir_all(&workspace).unwrap();

        // admin 模板
        let admin_src = config_dir.join("agents").join("admin");
        std::fs::create_dir_all(&admin_src).unwrap();
        std::fs::write(admin_src.join("SYSTEM.md"), "admin-prompt").unwrap();

        // std 模板（不应被 admin 使用）
        let std_src = config_dir.join("agents").join("std");
        std::fs::create_dir_all(&std_src).unwrap();
        std::fs::write(std_src.join("SYSTEM.md"), "std-prompt").unwrap();

        seed_workspace_from(&workspace, "admin", &config_dir);

        let content = std::fs::read_to_string(workspace.join("SYSTEM.md")).unwrap();
        assert_eq!(content, "admin-prompt", "admin 应使用 admin 的模板");
    }

    // ── 新增：用户自定义 agent → 回退到 config/agents/std/ ─────────

    #[test]
    fn test_seed_workspace_from_user_agent_falls_back_to_std() {
        let tmp = tempfile::tempdir().unwrap();
        let config_dir = tmp.path().join("config");
        let workspace = tmp.path().join("workspace");
        std::fs::create_dir_all(&workspace).unwrap();

        // std 模板
        let std_src = config_dir.join("agents").join("std");
        std::fs::create_dir_all(&std_src).unwrap();
        std::fs::write(std_src.join("SYSTEM.md"), "std-prompt").unwrap();

        // 用户自定义 agent a_xxx — 没有自己的模板目录
        seed_workspace_from(&workspace, "a_abc123", &config_dir);

        let content = std::fs::read_to_string(workspace.join("SYSTEM.md")).unwrap();
        assert_eq!(content, "std-prompt", "用户自定义 agent 应回退到 std 的模板");
    }

    #[test]
    fn test_seed_workspace_from_user_agent_ignores_missing_std() {
        let tmp = tempfile::tempdir().unwrap();
        let config_dir = tmp.path().join("config"); // No agents/ at all
        let workspace = tmp.path().join("workspace");
        std::fs::create_dir_all(&workspace).unwrap();

        // User agent with no std template directory — should not panic
        seed_workspace_from(&workspace, "a_custom", &config_dir);
        assert!(!workspace.join("SYSTEM.md").exists(), "无模板时应静默跳过");
    }

    // ── resolve_agent_base_dir_with_udd ────────────────────────────

    #[test]
    fn test_resolve_agent_base_dir_with_udd_default() {
        let tmp = tempfile::tempdir().unwrap();
        let data_dir = tmp.path().join("data");
        let result = resolve_agent_base_dir_with_udd("my-agent", "u1", "", &data_dir);
        assert_eq!(result, data_dir.join("u_u1").join("my-agent"));
    }

    #[test]
    fn test_resolve_agent_base_dir_with_udd_admin() {
        let tmp = tempfile::tempdir().unwrap();
        let data_dir = tmp.path().join("data");
        // admin 不受 user_data_dir 影响
        let result = resolve_agent_base_dir_with_udd("admin", "u1", "/custom/path", &data_dir);
        assert_eq!(result, data_dir.join("u_u1").join("admin"));
    }

    #[test]
    fn test_resolve_agent_base_dir_with_udd_custom() {
        let tmp = tempfile::tempdir().unwrap();
        let data_dir = tmp.path().join("data");
        let custom = tmp.path().join("custom_storage");
        let result = resolve_agent_base_dir_with_udd("my-agent", "u1", custom.to_str().unwrap(), &data_dir);
        assert_eq!(result, custom.join("u_u1").join("my-agent"));
    }

    // ── copy_dir_all ───────────────────────────────────────────────

    #[test]
    fn test_copy_dir_all_copies_contents() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("src");
        let dst = tmp.path().join("dst");

        std::fs::create_dir_all(src.join("sub")).unwrap();
        std::fs::write(src.join("file.txt"), "hello").unwrap();
        std::fs::write(src.join("sub").join("nested.txt"), "nested").unwrap();

        copy_dir_all(&src, &dst).unwrap();

        assert_eq!(std::fs::read_to_string(dst.join("file.txt")).unwrap(), "hello");
        assert_eq!(std::fs::read_to_string(dst.join("sub").join("nested.txt")).unwrap(), "nested");
    }

    // ── migrate_workspace_if_needed ─────────────────────────────────

    #[test]
    fn test_migrate_workspace_if_needed_copies_std() {
        let tmp = tempfile::tempdir().unwrap();
        let data_dir = tmp.path().join("data");
        let old_root = tmp.path().join("old_data");
        let new_root = tmp.path().join("new_data");

        // 路径格式：{user_data_dir}/u_{user_id}/<agent_id>/
        let old_std = resolve_agent_base_dir_with_udd("std", "u1", old_root.to_str().unwrap(), &data_dir);
        let new_std = resolve_agent_base_dir_with_udd("std", "u1", new_root.to_str().unwrap(), &data_dir);

        std::fs::create_dir_all(&old_std).unwrap();
        std::fs::write(old_std.join("SYSTEM.md"), "old-prompt").unwrap();

        assert!(old_std.exists());
        assert!(!new_std.exists());

        copy_dir_all(&old_std, &new_std).unwrap();
        assert_eq!(std::fs::read_to_string(new_std.join("SYSTEM.md")).unwrap(), "old-prompt");
    }

    // ── check_and_migrate_old_user_data_dir_format ────────────────────

    #[test]
    fn test_check_and_migrate_old_format_copies_to_new() {
        let tmp = tempfile::tempdir().unwrap();
        let udd = tmp.path().join("user_data");

        std::fs::create_dir_all(udd.join("std")).unwrap();
        std::fs::write(udd.join("std").join("SYSTEM.md"), "old-prompt").unwrap();
        std::fs::create_dir_all(udd.join("custom_agent")).unwrap();
        std::fs::write(udd.join("custom_agent").join("SYSTEM.md"), "custom").unwrap();

        check_and_migrate_old_user_data_dir_format("u1", udd.to_str().unwrap());

        assert_eq!(std::fs::read_to_string(udd.join("u_u1").join("std").join("SYSTEM.md")).unwrap(), "old-prompt");
        assert_eq!(std::fs::read_to_string(udd.join("u_u1").join("custom_agent").join("SYSTEM.md")).unwrap(), "custom");
        // 旧格式数据应保留
        assert!(udd.join("std").join("SYSTEM.md").exists());
    }

    #[test]
    fn test_check_and_migrate_old_format_skips_admin() {
        let tmp = tempfile::tempdir().unwrap();
        let udd = tmp.path().join("user_data");

        std::fs::create_dir_all(udd.join("admin")).unwrap();
        std::fs::write(udd.join("admin").join("SYSTEM.md"), "admin-prompt").unwrap();
        std::fs::create_dir_all(udd.join("std")).unwrap();
        std::fs::write(udd.join("std").join("SYSTEM.md"), "std-prompt").unwrap();

        check_and_migrate_old_user_data_dir_format("u1", udd.to_str().unwrap());

        // admin 不应迁移
        assert!(!udd.join("u_u1").join("admin").exists());
        // std 应迁移
        assert_eq!(std::fs::read_to_string(udd.join("u_u1").join("std").join("SYSTEM.md")).unwrap(), "std-prompt");
    }

    #[test]
    fn test_check_and_migrate_old_format_skips_if_new_exists() {
        let tmp = tempfile::tempdir().unwrap();
        let udd = tmp.path().join("user_data");

        std::fs::create_dir_all(udd.join("std")).unwrap();
        std::fs::write(udd.join("std").join("SYSTEM.md"), "old-prompt").unwrap();
        std::fs::create_dir_all(udd.join("u_u1").join("std")).unwrap();
        std::fs::write(udd.join("u_u1").join("std").join("SYSTEM.md"), "existing").unwrap();

        check_and_migrate_old_user_data_dir_format("u1", udd.to_str().unwrap());

        // 不应覆盖
        assert_eq!(std::fs::read_to_string(udd.join("u_u1").join("std").join("SYSTEM.md")).unwrap(), "existing");
    }

    #[test]
    fn test_check_and_migrate_old_format_skips_empty_udd() {
        // user_data_dir 为空时跳过（不崩溃）
        check_and_migrate_old_user_data_dir_format("u1", "");
    }
}
