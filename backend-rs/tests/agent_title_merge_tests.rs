/// 集成测试：list_agents 对系统 agent 合并用户 workspace 的 SYSTEM.md 元信息（对齐 Python PR #343）。
///
/// 覆盖：
/// - 有用户上下文时，系统 agent 的 title/description/locked/layout 来自用户 workspace SYSTEM.md；
/// - 无用户上下文时回退内置配置快照；
/// - 自定义 agent 行为不变。
///
/// 通过设置 OMNIAGE_ROOT 指向临时目录，在进程内初始化后端并直接发 HTTP 请求。
/// 注意：全局配置为 OnceLock，本二进制内只能 `initialize()` 一次，故整个流程放在单个测试中。
use axum::body::{to_bytes, Body};
use axum::http::header;
use axum::http::{Request, StatusCode};
use serde_json::Value;
use tower::ServiceExt;

/// 构造临时 OMNIAGE_ROOT：内置 std + 用户 workspace 覆盖 + 自定义 agent。
fn setup_temp_root() -> tempfile::TempDir {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();

    // 内置配置
    std::fs::create_dir_all(root.join("config/agents/std")).unwrap();
    std::fs::write(
        root.join("config/agents/std/SYSTEM.md"),
        "---\ntitle: 内置标题\nname: std\nlayout:\n  left: [history]\n  defaultLeft: history\n  right: [chat]\n  defaultRight: chat\n---\n\nstd body",
    )
    .unwrap();
    std::fs::write(root.join("config/visibility.yaml"), "default_visible: true\n").unwrap();

    // 用户 workspace SYSTEM.md：模拟设置页保存后的状态（覆盖 title/description/locked/layout）
    std::fs::create_dir_all(root.join("data/u_1/std")).unwrap();
    std::fs::write(
        root.join("data/u_1/std/SYSTEM.md"),
        "---\ntitle: 用户改的标题\ndescription: 用户描述\nname: std\nlocked: true\nlayout:\n  left: [history, settings]\n  defaultLeft: settings\n  right: [chat]\n  defaultRight: chat\n---\n\nstd body",
    )
    .unwrap();

    // 存量自定义 agent
    std::fs::create_dir_all(root.join("data/u_1/a_custom")).unwrap();
    std::fs::write(
        root.join("data/u_1/a_custom/SYSTEM.md"),
        "---\ntitle: 自定义\nname: a_custom\n---\n\ncustom body",
    )
    .unwrap();

    tmp
}

async fn get_agents(app: &axum::Router, user_id: Option<&str>) -> Vec<Value> {
    let mut builder = Request::builder().method("GET").uri("/api/agents");
    if let Some(uid) = user_id {
        builder = builder.header(header::HeaderName::from_static("x-user-id"), uid);
    }
    let resp = app
        .clone()
        .oneshot(builder.body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body = to_bytes(resp.into_body(), 1024 * 1024).await.unwrap();
    let data: Value = serde_json::from_slice(&body).unwrap();
    data["agents"].as_array().unwrap().clone()
}

#[tokio::test]
async fn test_list_agents_merges_user_workspace_system_md() {
    let tmp = setup_temp_root();
    std::env::set_var("OMNIAGE_ROOT", tmp.path().to_string_lossy().to_string());
    omniage_backend_rs::initialize();

    let app = omniage_backend_rs::build_app();

    // 1. 有用户上下文 → 系统 agent 合并用户 workspace SYSTEM.md
    let agents = get_agents(&app, Some("1")).await;
    let std_agent = agents.iter().find(|a| a["name"] == "std").expect("应包含 std");
    assert_eq!(std_agent["title"], "用户改的标题");
    assert_eq!(std_agent["description"], "用户描述");
    assert_eq!(std_agent["locked"], true);
    assert_eq!(std_agent["layout"]["defaultLeft"], "settings");
    // 自定义 agent 行为不变
    let custom = agents.iter().find(|a| a["name"] == "a_custom").expect("应包含 a_custom");
    assert_eq!(custom["title"], "自定义");

    // 2. 无用户上下文 → 回退内置配置快照
    let agents = get_agents(&app, None).await;
    let std_agent = agents.iter().find(|a| a["name"] == "std").expect("应包含 std");
    assert_eq!(std_agent["title"], "内置标题");
    assert_eq!(std_agent["layout"]["defaultLeft"], "history");
}
