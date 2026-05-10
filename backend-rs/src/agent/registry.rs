use std::collections::HashMap;
use std::sync::{Arc, OnceLock};

use serde::Serialize;

use crate::agent::base::BaseAgent;

#[derive(Debug, Clone, Serialize)]
pub struct AgentMeta {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub layout: Option<serde_json::Value>,
}

static AGENT_LIST: OnceLock<Vec<AgentMeta>> = OnceLock::new();
static AGENT_INSTANCES: OnceLock<HashMap<String, Arc<dyn BaseAgent>>> = OnceLock::new();

pub fn init_registry() {
    let config = crate::core::config::get_config();
    let mut agents: Vec<AgentMeta> = config
        .agents
        .iter()
        .map(|(id, cfg)| {
            let layout = serde_json::to_value(&cfg.layout).ok();
            AgentMeta {
                id: id.clone(),
                name: cfg.name.clone().unwrap_or_else(|| id.clone()),
                layout,
            }
        })
        .collect();
    agents.sort_by(|a, b| a.id.cmp(&b.id));
    AGENT_LIST.set(agents).ok();
}

pub fn init_agent_instances() {
    let config = crate::core::config::get_config();
    let mut instances: HashMap<String, Arc<dyn BaseAgent>> = HashMap::new();
    for id in config.agents.keys() {
        instances.insert(id.clone(), Arc::new(crate::agent::standard::StandardAgent::new(id)));
    }
    AGENT_INSTANCES.set(instances).ok();
}

pub fn list_agents() -> &'static Vec<AgentMeta> {
    AGENT_LIST.get().expect("registry not initialized")
}

pub fn get_agent(agent_id: &str) -> Option<&'static Arc<dyn BaseAgent>> {
    AGENT_INSTANCES.get().and_then(|instances| instances.get(agent_id))
}
