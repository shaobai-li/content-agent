use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use serde::{Deserialize, Serialize};

static CONFIG: OnceLock<AppConfig> = OnceLock::new();

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
    pub base_dir: Option<String>,
    pub sessions_file: Option<String>,
    pub messages_file: Option<String>,
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

fn find_project_root() -> PathBuf {
    if let Ok(path) = std::env::current_exe() {
        let mut p = path.parent();
        while let Some(dir) = p {
            if dir.join("Cargo.toml").exists() || dir.join("config.yaml").exists() {
                return dir.to_path_buf();
            }
            p = dir.parent();
        }
    }
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn find_config_dir(project_root: &Path) -> PathBuf {
    // 如果从 backend-rs 下运行，配置在 ../config/
    let parent_config = project_root.join("config");
    if parent_config.exists() {
        return parent_config;
    }
    // 如果从项目根运行，配置在 backend/config/
    let backend_config = project_root.join("backend").join("config");
    if backend_config.exists() {
        return backend_config;
    }
    project_root.join("config")
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
    let data_dir = std::env::var("DATA_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."));
    let data_dir = data_dir.canonicalize().unwrap_or(data_dir);

    let project_root = find_project_root();
    let config_dir = find_config_dir(&project_root);

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

pub fn get_agent_config(agent_id: &str) -> Option<&'static AgentConfig> {
    get_config().agents.get(agent_id)
}

pub fn get_agent_base_dir(agent_id: &str) -> PathBuf {
    let cfg = get_config();

    // 有用户上下文时优先使用用户隔离路径：data_dir/u_{user_id}/data/{agent_id}
    if let Some(user_id) = crate::core::auth::get_current_user_id() {
        return cfg.data_dir.join(format!("u_{}", user_id)).join("data").join(agent_id);
    }

    // 无用户上下文时保持原有全局路径（向后兼容）
    let base_dir = cfg
        .agents
        .get(agent_id)
        .and_then(|a| a.base_dir.as_deref())
        .unwrap_or("agents/default");
    cfg.data_dir.join(base_dir)
}

pub fn get_agent_sessions_path(agent_id: &str) -> PathBuf {
    let base_dir = get_agent_base_dir(agent_id);
    let cfg = get_config();
    let filename = cfg
        .agents
        .get(agent_id)
        .and_then(|a| a.sessions_file.as_deref())
        .unwrap_or("sessions.json");
    base_dir.join(filename)
}

pub fn get_agent_messages_path(agent_id: &str) -> PathBuf {
    let base_dir = get_agent_base_dir(agent_id);
    let cfg = get_config();
    let filename = cfg
        .agents
        .get(agent_id)
        .and_then(|a| a.messages_file.as_deref())
        .unwrap_or("messages.json");
    base_dir.join(filename)
}

pub fn get_agent_local_data_dir(agent_id: &str) -> PathBuf {
    get_agent_workspace_dir(agent_id).join("local_data")
}

pub fn get_agent_workspace_dir(agent_id: &str) -> PathBuf {
    let ws = get_agent_base_dir(agent_id).join("workspace");
    std::fs::create_dir_all(&ws).ok();
    ws
}

pub fn get_agent_attachment_cache_dir(agent_id: &str) -> PathBuf {
    let cache = get_agent_local_data_dir(agent_id).join("cache");
    std::fs::create_dir_all(&cache).ok();
    cache
}

pub fn get_database_registry_path(agent_id: &str) -> PathBuf {
    get_agent_local_data_dir(agent_id).join("databases.json")
}

pub fn get_database_nodes_path(agent_id: &str, kb_id: &str) -> PathBuf {
    get_agent_local_data_dir(agent_id).join(kb_id).join("view").join("nodes.json")
}
