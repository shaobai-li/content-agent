pub mod agent;
pub mod core;
pub mod provider;
pub mod routes;
pub mod service;
pub mod tools;
pub mod utils;

use tower_http::cors::CorsLayer;
use crate::core::auth::auth_middleware;

/// 初始化：配置、agent 注册
pub fn initialize() {
    core::config::init_config();
    agent::registry::init_registry();
    agent::registry::init_agent_instances();
}

/// 组装 Axum Router（不含日志和 dotenvy）
pub fn build_app() -> axum::Router {
    let origins = [
        "http://localhost:3000".parse().unwrap(),
        "http://192.168.1.3:3000".parse().unwrap(),
        "http://localhost:5173".parse().unwrap(),
        // Tauri 桌面端 webview 来源
        "http://tauri.localhost".parse().unwrap(),
        "https://tauri.localhost".parse().unwrap(),
        "tauri://localhost".parse().unwrap(),
    ];

    let cors = CorsLayer::new()
        .allow_origin(origins)
        .allow_methods(tower_http::cors::Any)
        .allow_headers(tower_http::cors::Any);

    // 公开路由（无需认证）：health、auth proxy
    let public = routes::health::router()
        .merge(routes::auth::router());

    // 需要认证的路由
    let protected = routes::agent_config::router()
        .merge(routes::agents::router())
        .merge(routes::management::router())
        .merge(routes::settings::router())
        .merge(routes::sessions::router())
        .merge(routes::messages::router())
        .merge(routes::knowledge_base::router())
        .merge(routes::nodes::router())
        .merge(routes::kb_record_content::router())
        .merge(routes::files::router())
        .merge(routes::chat::router())
        .layer(axum::middleware::from_fn(auth_middleware));

    public.merge(protected).layer(cors)
}

/// 在指定端口启动 HTTP 服务
pub async fn run_server(port: u16, app: axum::Router) {
    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    tracing::info!("server starting on {}", addr);
    axum::serve(listener, app).await.unwrap();
}
