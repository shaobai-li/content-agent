fn main() {
    // 仅为 embedded-python feature 生成链接指令
    // 非 Tauri 构建时 cargo 忽略此文件（空操作）
    #[cfg(feature = "embedded-python")]
    {
        let target = std::env::var("TARGET").unwrap();

        // macOS: rpath → .app bundle 内的 Resources 目录
        // 路径解析：OmniAge.app/Contents/MacOS/omniage → @executable_path/../
        //         → 指向 OmniAge.app/Contents/ 再 ../Resources/resources/python/lib
        if target.contains("apple") {
            println!("cargo:rustc-link-arg=-Wl,-rpath,@executable_path/../Resources/resources/python/lib");
        } else if target.contains("linux") {
            // Linux: $ORIGIN 解析为 binary 所在目录
            println!("cargo:rustc-link-arg=-Wl,-rpath,$ORIGIN/resources/python/lib");
        }
        // Windows: 不需要额外 rpath，DLL 在同一目录即可

        // 当 PYO3_PYTHON 或 OMNIAGE_ROOT 变化时，重新运行 build.rs
        println!("cargo:rerun-if-env-changed=PYO3_PYTHON");
        println!("cargo:rerun-if-env-changed=OMNIAGE_ROOT");
    }
}
