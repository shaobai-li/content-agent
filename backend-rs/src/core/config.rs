use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

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

fn load_agent_yamls(config_dir: &Path) -> HashMap<String, AgentConfig> {
    let agents_dir = config_dir.join("agents");
    let mut agents = HashMap::new();

    if !agents_dir.is_dir() {
        return agents;
    }

    let mut entries: Vec<_> = match std::fs::read_dir(&agents_dir) {
        Ok(entries) => entries
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().is_some_and(|ext| ext == "yaml"))
            .collect(),
        Err(_) => return agents,
    };
    entries.sort_by_key(|e| e.file_name());

    for entry in entries {
        let path = entry.path();
        let agent_id = path
            .file_stem()
            .and_then(|s| s.to_str())
            .map(|s| s.to_string())
            .unwrap_or_default();

        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(cfg) = serde_yaml::from_str::<AgentConfig>(&content) {
                agents.insert(agent_id, cfg);
            }
        }
    }

    agents
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

    let agents = load_agent_yamls(&config_dir);

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

    // 有用户上下文时尝试从用户目录加载 YAML 配置
    if let Some(user_id) = crate::core::auth::get_current_user_id() {
        let user_yaml = cfg
            .data_dir
            .join(format!("u_{}", user_id))
            .join("agent")
            .join(format!("{}.yaml", agent_id));

        if user_yaml.exists() {
            if let Ok(content) = std::fs::read_to_string(&user_yaml) {
                if let Ok(user_cfg) = serde_yaml::from_str::<AgentConfig>(&content) {
                    return Some(merge_agent_configs(base, user_cfg));
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

pub fn get_agent_base_dir(agent_id: &str) -> PathBuf {
    let cfg = get_config();
    let user_id = crate::core::auth::get_current_user_id().unwrap_or_default();
    let default_base = cfg.data_dir.join(format!("u_{}", user_id));

    // 管理员 workspace 永远在 data/u_{user_id}/admin/
    if agent_id == "admin" {
        return default_base.join("admin");
    }

    // 读取用户配置 config.json 中的 user_data_dir
    let config_path = default_base.join("admin").join("config.json");
    if let Ok(content) = std::fs::read_to_string(&config_path) {
        if let Ok(user_config) = serde_json::from_str::<std::collections::HashMap<String, String>>(&content) {
            if let Some(user_data_dir) = user_config.get("user_data_dir") {
                let trimmed = user_data_dir.trim();
                if !trimmed.is_empty() {
                    return PathBuf::from(trimmed).join(agent_id);
                }
            }
        }
    }

    default_base.join(agent_id)
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
    ws
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
