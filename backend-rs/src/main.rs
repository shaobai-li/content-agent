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

    omniage_backend_rs::initialize();
    let app = omniage_backend_rs::build_app();
    omniage_backend_rs::run_server(8001, app).await;
}
