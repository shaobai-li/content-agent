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
    // 先加载 .env 文件（此时 CWD 是 src-tauri/）
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    tauri::Builder::default()
        .setup(|_app| {
            // 将数据目录设置在 src-tauri 外部，避免运行时文件写入触发 Tauri 的 rebuild
            if std::env::var("DATA_DIR").is_err() {
                let cwd = std::env::current_dir().unwrap_or_default();
                // 从 src-tauri/ -> 项目根目录 (content-agent/)
                let data_dir = cwd
                    .parent()
                    .map(|p| p.join("runtime-data"))
                    .unwrap_or_else(|| cwd.join(".runtime-data"));
                std::env::set_var(
                    "DATA_DIR",
                    data_dir.to_string_lossy().to_string(),
                );
            }

            // 初始化 backend-rs（配置、agent 注册）
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
