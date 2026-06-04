fn main() {
    // 先复制 config，再调用 tauri_build（它会校验 bundle.resources 路径）
    let src = std::path::Path::new("../config");
    let dst = std::path::Path::new("config");
    if src.exists() {
        let _ = std::fs::remove_dir_all(dst);
        copy_dir(src, dst).expect("failed to copy config for bundling");
        // config/ 下的任何文件变化都会触发 build.rs 重跑
        println!("cargo:rerun-if-changed={}", src.display());
    }

    tauri_build::build();
}

fn copy_dir(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    if !dst.exists() {
        std::fs::create_dir_all(dst)?;
    }
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let path = entry.path();
        let dest = dst.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&path, &dest)?;
        } else {
            std::fs::copy(&path, &dest)?;
        }
    }
    Ok(())
}
