mod agent;
mod core;
mod service;

use axum::{routing::get, Router};
use tower_http::cors::CorsLayer;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    // 初始化日志
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    // 加载配置
    dotenvy::dotenv().ok();
    core::config::init_config();
    agent::registry::init_registry();

    let origins = [
        "http://localhost:3000".parse().unwrap(),
        "http://192.168.1.3:3000".parse().unwrap(),
    ];

    let cors = CorsLayer::new()
        .allow_origin(origins)
        .allow_methods(tower_http::cors::Any)
        .allow_headers(tower_http::cors::Any);

    let app = Router::new()
        .route("/", get(health_check))
        .layer(cors);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8001")
        .await
        .unwrap();
    tracing::info!("server starting on 0.0.0.0:8001");
    axum::serve(listener, app).await.unwrap();
}

async fn health_check() -> axum::Json<serde_json::Value> {
    let agents = agent::registry::list_agents();
    let agent_ids: Vec<&str> = agents.iter().map(|a| a.id.as_str()).collect();
    axum::Json(serde_json::json!({
        "status": "running",
        "version": "0.1.0",
        "agents": agent_ids,
    }))
}
