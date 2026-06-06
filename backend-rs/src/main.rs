use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    // 确定项目根目录（OMNIAGE_ROOT），所有路径以此为锚点
    let cwd = std::env::current_dir().unwrap_or_default();
    let omniage_root = cwd.parent().unwrap_or(&cwd).to_path_buf();
    std::env::set_var("OMNIAGE_ROOT", omniage_root.to_string_lossy().to_string());

    // 加载 .env（相对于 OMNIAGE_ROOT）
    let env_path = omniage_root.join(".env");
    dotenvy::from_path(&env_path).ok();
    std::env::set_var("ENV_PATH", env_path.to_string_lossy().to_string());

    omniage_backend_rs::initialize();
    let app = omniage_backend_rs::build_app();
    omniage_backend_rs::run_server(8001, app).await;
}
