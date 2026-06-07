// Prevents additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

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

fn resolve_omniage_root() -> std::path::PathBuf {
    if cfg!(not(debug_assertions)) {
        // ── 生产环境 ─────────────────────────────────────────
        if cfg!(target_os = "macos") {
            // macOS 惯例：用户配置 → ~/Library/Application Support/<bundle-id>/
            let home = std::env::var("HOME").unwrap_or_default();
            std::path::PathBuf::from(&home)
                .join("Library")
                .join("Application Support")
                .join("com.omniage.content-agent")
        } else {
            // Windows/Linux：config/ 通过 bundle.resources 打包到 exe 旁边
            std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|p| p.to_path_buf()))
                .unwrap_or_default()
        }
    } else {
        // ── 开发环境：src-tauri/ 的父目录 = content-agent/ ──
        std::env::current_dir()
            .unwrap_or_default()
            .parent()
            .unwrap_or(&std::env::current_dir().unwrap_or_default())
            .to_path_buf()
    }
}

/// macOS 首次启动时：将 .app 内置的 config/ 复制到 ~/Library/Application Support/ 下
#[cfg(target_os = "macos")]
fn seed_default_config(app: &tauri::App) {
    let omniage_root = std::env::var("OMNIAGE_ROOT")
        .map(std::path::PathBuf::from)
        .ok();
    let dest = omniage_root.as_ref().map(|r| r.join("config"));

    // 从 Tauri 资源目录获取内置的 config/
    let resource_dir = app.path().resource_dir().ok();
    let src = resource_dir.as_ref().map(|r| r.join("config"));

    match (src, dest) {
        (Some(src), Some(dest)) if src.exists() && !dest.exists() => {
            if let Some(parent) = dest.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            match copy_dir_recursively(&src, &dest) {
                Ok(_) => tracing::info!("已复制默认 config 到 {:?}", dest),
                Err(e) => tracing::warn!("复制默认 config 失败: {e}"),
            }
        }
        _ => {
            // config 目录已存在或无法找到内置资源 → 跳过
        }
    }
}

fn copy_dir_recursively(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    if !dst.exists() {
        std::fs::create_dir_all(dst)?;
    }
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let target = dst.join(entry.file_name());
        if file_type.is_dir() {
            copy_dir_recursively(&entry.path(), &target)?;
        } else {
            std::fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

fn main() {
    // ── 确定 OMNIAGE_ROOT（所有路径的锚点） ──────────────────────
    let omniage_root = resolve_omniage_root();
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
        .setup(|app| {
            // macOS：首次启动时从 .app bundle 复制默认 config
            #[cfg(target_os = "macos")]
            if cfg!(not(debug_assertions)) {
                seed_default_config(app);
            }

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
