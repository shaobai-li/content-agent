/// 集成测试：layout 读取/写入行为（对齐 Python 端 PR #337）。
///
/// 覆盖：
/// - `list_agents` 原样返回系统 agent 的 layout（来自 config/agents/*/SYSTEM.md）；
/// - `list_agents` 对无 layout 的自定义 agent 返回 `layout: null`（不注入默认，与 Python 一致）；
/// - `create_agent` 将默认 layout 写入新自定义 agent 的 SYSTEM.md，且能被读回并出现在 `list_agents` 响应中。
///
/// 通过设置 OMNIAGE_ROOT 指向临时目录，在进程内初始化后端并直接发 HTTP 请求。
/// 注意：全局配置为 OnceLock，本二进制内只能 `initialize()` 一次，故整个流程放在单个测试中。
use axum::body::{to_bytes, Body};
use axum::http::header;
use axum::http::{Request, StatusCode};
use serde_json::Value;
use std::path::Path;
use tower::ServiceExt;

/// 构造临时 OMNIAGE_ROOT：config/agents/std（带 layout）+ visibility + data/u_1/a_custom（无 layout）。
fn setup_temp_root() -> tempfile::TempDir {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();

    std::fs::create_dir_all(root.join("config/agents/std")).unwrap();
    std::fs::write(
        root.join("config/agents/std/SYSTEM.md"),
        "---\ntitle: 标准助手\nname: std\nlayout:\n  left: [history, knowledgebase, document]\n  defaultLeft: knowledgebase\n  right: [chat]\n  defaultRight: chat\n---\n\nstd body",
    )
    .unwrap();
    std::fs::write(root.join("config/visibility.yaml"), "default_visible: true\n").unwrap();

    // 存量自定义 agent：SYSTEM.md 未声明 layout
    std::fs::create_dir_all(root.join("data/u_1/a_custom")).unwrap();
    std::fs::write(
        root.join("data/u_1/a_custom/SYSTEM.md"),
        "---\ntitle: 自定义\nname: a_custom\n---\n\ncustom body",
    )
    .unwrap();

    tmp
}

/// 提取 SYSTEM.md 的 YAML frontmatter 为 serde_json::Value。
fn parse_frontmatter(system_md: &Path) -> Value {
    let content = std::fs::read_to_string(system_md).unwrap();
    let start = content.find("---").expect("缺少 frontmatter 起始标记");
    let rest = &content[start + 3..];
    let end = rest.find("\n---").expect("缺少 frontmatter 结束标记");
    serde_yaml::from_str(&rest[..end]).unwrap()
}

async fn get_agents(app: &axum::Router, user_id: &str) -> Vec<Value> {
    let resp = app
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/agents")
                .header(header::HeaderName::from_static("x-user-id"), user_id)
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body = to_bytes(resp.into_body(), 1024 * 1024).await.unwrap();
    let data: Value = serde_json::from_slice(&body).unwrap();
    data["agents"].as_array().unwrap().clone()
}

#[tokio::test]
async fn test_layout_create_and_list_flow() {
    let tmp = setup_temp_root();
    std::env::set_var("OMNIAGE_ROOT", tmp.path().to_string_lossy().to_string());
    omniage_backend_rs::initialize();

    let app = omniage_backend_rs::build_app();

    // 1. 初始 GET：std 返回其 SYSTEM.md 声明的 layout；a_custom 无 layout → 返回 null
    let agents = get_agents(&app, "1").await;
    let std_agent = agents.iter().find(|a| a["name"] == "std").expect("应包含 std");
    assert_eq!(std_agent["layout"]["defaultLeft"], "knowledgebase");
    let custom = agents.iter().find(|a| a["name"] == "a_custom").expect("应包含 a_custom");
    assert!(custom.get("layout").is_some(), "无 layout 的自定义 agent 应返回 layout 键");
    assert!(custom["layout"].is_null(), "缺失 layout 应返回 null（与 Python 一致）");

    // 2. POST 创建新自定义 agent
    let resp = app
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/agents")
                .header(header::HeaderName::from_static("x-user-id"), "1")
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(r#"{"title":"测试智能体","description":"描述"}"#))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(resp.status(), StatusCode::OK);
    let body = to_bytes(resp.into_body(), 1024 * 1024).await.unwrap();
    let data: Value = serde_json::from_slice(&body).unwrap();
    let agent_id = data["agent"]["name"].as_str().expect("应返回 agent_id").to_string();
    assert!(agent_id.starts_with("a_"));

    // 3. 新 agent 的 SYSTEM.md 含默认 layout，且能读回
    let system_md = tmp.path().join("data/u_1").join(&agent_id).join("SYSTEM.md");
    assert!(system_md.is_file(), "create_agent 应写入 SYSTEM.md");
    let fm = parse_frontmatter(&system_md);
    assert_eq!(
        fm["layout"],
        omniage_backend_rs::core::config::default_agent_layout(),
        "新 agent 的 SYSTEM.md 应写入默认 layout"
    );

    // 4. 再次 GET：新 agent 返回其 layout
    let agents = get_agents(&app, "1").await;
    let new_agent = agents
        .iter()
        .find(|a| a["name"] == agent_id)
        .expect("新 agent 应出现在列表");
    assert_eq!(
        new_agent["layout"],
        omniage_backend_rs::core::config::default_agent_layout()
    );
}
