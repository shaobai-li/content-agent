use std::sync::OnceLock;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct AgentMeta {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub layout: Option<serde_json::Value>,
}

static AGENT_LIST: OnceLock<Vec<AgentMeta>> = OnceLock::new();

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

pub fn list_agents() -> &'static Vec<AgentMeta> {
    AGENT_LIST.get().expect("registry not initialized")
}
