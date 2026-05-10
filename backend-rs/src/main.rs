mod agent;
mod core;
mod provider;
mod routes;
mod service;
mod tools;

use tower_http::cors::CorsLayer;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

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

    let app = routes::health::router()
        .merge(routes::agents::router())
        .merge(routes::sessions::router())
        .merge(routes::messages::router())
        .merge(routes::knowledge_base::router())
        .merge(routes::nodes::router())
        .merge(routes::files::router())
        .merge(routes::chat::router())
        .layer(cors);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:8001")
        .await
        .unwrap();
    tracing::info!("server starting on 0.0.0.0:8001");
    axum::serve(listener, app).await.unwrap();
}
