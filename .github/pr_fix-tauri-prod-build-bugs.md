## 概述
修复 Tauri 生产构建 (cargo tauri build) 的三个 bug：文件写入触发 rebuild 死循环、.env 未加载导致环境变量缺失、登录页 CORS 跨域错误。
为 cargo tauri build 后的程序修复这三个问题，以实现安装包可正常登录和使用。

## 改动说明
- 修复 src-tauri main.rs 在 setup 中设置 DATA_DIR 环境变量，将运行时数据目录移至 src-tauri/ 外部，避免 Tauri watcher 检测到文件变化触发全量 rebuild
- 修复 src-tauri main.rs 添加 dotenvy::dotenv() 调用，使 src-tauri/.env 中的环境变量正确加载
- 修复 backend-rs lib.rs CORS 配置添加 http://tauri.localhost，解决 Tauri webview 生产 origin 跨域被拦截
- 修复 backend-rs lib.rs 将路由拆为 public/protected，health 和 auth proxy 路由免除 auth_middleware
- 新增 backend-rs routes/auth.rs auth proxy 模块，将 /api/login 和 /api/me 请求转发至远程认证服务器，避免前端直连时的 CORS 问题
- 修复 frontend shared/api/auth.ts getBaseUrl() 在 Tauri 环境下返回 http://localhost:8001，通过 Rust 后端代理 auth 请求
- 更新 .gitignore 排除 src-tauri/u_*/ 和 /runtime-data/

## 实现目的
- 提升 Tauri 生产构建的可用性
- 修复开发与生产环境行为不一致的问题
- 保持代码架构清晰