use std::collections::HashMap;
use std::sync::{Arc, OnceLock, RwLock};

use serde::Serialize;

use crate::agent::base::BaseAgent;

#[derive(Debug, Clone, Serialize)]
pub struct AgentMeta {
    pub name: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub visible: bool,
    pub locked: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub layout: Option<serde_json::Value>,
}

static AGENT_LIST: OnceLock<Vec<AgentMeta>> = OnceLock::new();
static AGENT_INSTANCES: OnceLock<RwLock<HashMap<String, Arc<dyn BaseAgent>>>> = OnceLock::new();

pub fn init_registry() {
    let config = crate::core::config::get_config();
    let visibility = &config.visibility;
    let mut agents: Vec<AgentMeta> = config
        .agents
        .iter()
        .map(|(id, cfg)| {
            let visible = visibility
                .overrides
                .get(id)
                .copied()
                .unwrap_or(visibility.default_visible);
            let layout = serde_json::to_value(&cfg.layout).ok();
            AgentMeta {
                name: id.clone(),
                title: cfg.title.clone().unwrap_or_else(|| id.clone()),
                description: cfg
                    .extra
                    .get("description")
                    .and_then(|v| v.as_str())
                    .map(str::to_string),
                visible,
                locked: cfg.locked.unwrap_or(false),
                layout,
            }
        })
        .collect();
    agents.sort_by(|a, b| a.name.cmp(&b.name));
    AGENT_LIST.set(agents).ok();
}

pub fn init_agent_instances() {
    let config = crate::core::config::get_config();
    let mut instances: HashMap<String, Arc<dyn BaseAgent>> = HashMap::new();
    for id in config.agents.keys() {
        if id.starts_with("write") {
            instances.insert(id.clone(), Arc::new(crate::agent::write_agent::WriteAgent::new(id)));
        } else {
            instances.insert(id.clone(), Arc::new(crate::agent::standard::StandardAgent::new(id)));
        }
    }
    AGENT_INSTANCES.set(RwLock::new(instances)).ok();
}

/// 动态注册 agent 实例（供 custom agent 使用）
pub fn register_agent(agent_id: &str, agent: Arc<dyn BaseAgent>) {
    if let Some(instances) = AGENT_INSTANCES.get() {
        if let Ok(mut guard) = instances.write() {
            guard.insert(agent_id.to_string(), agent);
        }
    }
}

pub fn list_agents() -> &'static Vec<AgentMeta> {
    AGENT_LIST.get().expect("registry not initialized")
}

pub fn get_agent(agent_id: &str) -> Option<Arc<dyn BaseAgent>> {
    AGENT_INSTANCES
        .get()
        .and_then(|instances| instances.read().ok())
        .and_then(|guard| guard.get(agent_id).cloned())
}
