// Prevents additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[tauri::command]
fn open_file_dialog() -> String {
    // 占位：后续实现
    String::new()
}

#[tauri::command]
fn show_notification(message: String) {
    // 占位：后续实现
    println!("{}", message);
}

fn main() {
    // ── 确定 OMNIAGE_ROOT（所有路径的锚点） ──────────────────────
    let omniage_root = if cfg!(not(debug_assertions)) {
        // 生产环境：从 exe 所在目录确定（config/ 通过 bundle.resources 打包到 exe 旁边）
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            .unwrap_or_default()
    } else {
        // 开发环境：src-tauri/ 的父目录 = content-agent/
        std::env::current_dir()
            .unwrap_or_default()
            .parent()
            .unwrap_or(&std::env::current_dir().unwrap_or_default())
            .to_path_buf()
    };
    std::env::set_var("OMNIAGE_ROOT", omniage_root.to_string_lossy().to_string());

    // 加载 .env（相对于 OMNIAGE_ROOT）
    let env_path = omniage_root.join(".env");
    dotenvy::from_path(&env_path).ok();
    std::env::set_var("ENV_PATH", env_path.to_string_lossy().to_string());

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    tauri::Builder::default()
        .setup(|_app| {
            // DATA_DIR 默认在 OMNIAGE_ROOT/data 下
            if std::env::var("DATA_DIR").is_err() {
                let root = std::env::var("OMNIAGE_ROOT").unwrap_or_default();
                let data_dir = std::path::PathBuf::from(&root).join("data");
                std::env::set_var(
                    "DATA_DIR",
                    data_dir.to_string_lossy().to_string(),
                );
            }

            // 初始化 backend-rs（配置、agent 注册）—— OMNIAGE_ROOT 已就位
            omniage_backend_rs::initialize();
            // 在后台启动 Axum server
            let app = omniage_backend_rs::build_app();
            tauri::async_runtime::spawn(
                omniage_backend_rs::run_server(8001, app)
            );
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_file_dialog,
            show_notification,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
