use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};
use serde_json::Value;

static CONFIG: OnceLock<AppConfig> = OnceLock::new();
static CONFIG_DIR: OnceLock<PathBuf> = OnceLock::new();

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
                if let Ok(cfg) = serde_yaml::from_str::<AgentConfig>(frontmatter) {
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
                    if let Ok(user_cfg) = serde_yaml::from_str::<AgentConfig>(frontmatter) {
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

/// get_agent_base_dir_for 的核心路径解析逻辑（纯函数，便于测试）。
fn resolve_agent_base_dir_for(agent_id: &str, user_id: &str, data_dir: &Path) -> PathBuf {
    let default_base = data_dir.join(format!("u_{}", user_id));

    // 管理员 workspace 永远在 data/u_{user_id}/admin/
    if agent_id == "admin" {
        return default_base.join("admin");
    }

    // 读取用户配置 config.json 中的 user_data_dir
    // 使用 serde_json::Value 而非 HashMap<String,String>，以兼容包含嵌套对象（如 providers）的配置
    let config_path = default_base.join("admin").join("config.json");
    if let Ok(content) = std::fs::read_to_string(&config_path) {
        if let Ok(user_config) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(user_data_dir) = user_config.get("user_data_dir").and_then(|v| v.as_str()) {
                let trimmed = user_data_dir.trim();
                if !trimmed.is_empty() {
                    return PathBuf::from(trimmed).join(agent_id);
                }
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

/// ensure_agent_seeded 的核心文件复制逻辑（纯函数，便于测试）。
fn seed_workspace_from(workspace: &Path, agent_id: &str, config_dir: &Path) {
    let system_path = workspace.join("SYSTEM.md");
    if !system_path.exists() {
        let source = config_dir.join("agents").join(agent_id).join("SYSTEM.md");
        if source.exists() {
            std::fs::copy(&source, &system_path).ok();
        }
    }

    for name in &["SOUL.md", "USER.md", "IDENTITY.md"] {
        let target = workspace.join(name);
        if !target.exists() {
            let source = config_dir.join("agents").join(agent_id).join(name);
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
        let content = "---\nname: test\nskills:\n  - skill_a\n---\n\nbody text";
        let result = extract_yaml_frontmatter(content);
        assert!(result.is_some());
        let fm = result.unwrap();
        assert!(fm.contains("name: test"));
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
            "---\nname: 标准助手\n---\n\n提示词正文",
        )
        .unwrap();

        let result = load_agent_configs(tmp.path());
        assert_eq!(result.len(), 1);
        assert!(result.contains_key("std"));
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
        assert_eq!(result, custom_dir.join("my-agent"));
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
}
