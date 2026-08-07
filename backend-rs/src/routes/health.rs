pub fn router() -> axum::Router {
    axum::Router::new().route("/", axum::routing::get(health_check))
}

async fn health_check() -> axum::Json<serde_json::Value> {
    let agents = crate::agent::registry::list_agents();
    let agent_ids: Vec<&str> = agents.iter().map(|a| a.name.as_str()).collect();
    axum::Json(serde_json::json!({
        "status": "running",
        "version": "0.1.0",
        "agents": agent_ids,
    }))
}
