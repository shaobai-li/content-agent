/// 契约测试：验证 Rust (Axum) 服务的 API 响应符合 specs/openapi.yaml 定义。
///
/// 测试前需启动 Rust 服务：
/// ```bash
/// cd backend-rs && cargo run &
/// ```
///
/// 运行契约测试：
/// ```bash
/// cargo test --test contract_tests
/// ```
///
/// 设计原则：
/// - 仅测试 x-status: ported 的端点（Rust 已实现）
/// - JSON 端点：校验状态码 + 响应结构符合 schema
/// - SSE 端点（x-sse: true）：仅校验状态码 200 + Content-Type
/// - 需要替换路径参数的端点，使用默认测试值（如 agent_id = "std"）

use serde_json::Value;
use std::collections::HashMap;

const RUST_BASE: &str = "http://localhost:8001";
const SPEC_PATH: &str = "../../specs/openapi.yaml";

/// 从 YAML 文件加载 OpenAPI 规范。
fn load_openapi_spec() -> Value {
    let spec_str = std::fs::read_to_string(SPEC_PATH)
        .expect("OpenAPI spec 文件必须存在，请确认 specs/openapi.yaml 在项目根目录");
    serde_yaml::from_str(&spec_str).expect("规范文件格式错误，请检查 YAML 语法")
}

/// 从规范中取出指定路径、方法、状态码的响应 JSON schema。
/// 返回 None 表示该组合未在规范中定义（测试应跳过）。
fn get_response_schema(spec: &Value, path: &str, method: &str, status: u16) -> Option<&Value> {
    let status_str = status.to_string();
    spec.pointer(&format!(
        "/paths/{}/{}/responses/{}/content/application~1json/schema",
        path, method, status_str
    ))
}

/// 检查路径操作上是否标记了 x-status: ported。
fn is_ported(spec: &Value, path: &str, method: &str) -> bool {
    spec.pointer(&format!("/paths/{}/{}/x-status", path, method))
        .and_then(|v| v.as_str())
        .map(|s| s == "ported")
        .unwrap_or(false)
}

/// 检查路径操作是否标记为 SSE 端点。
fn is_sse(spec: &Value, path: &str, method: &str) -> bool {
    spec.pointer(&format!("/paths/{}/{}/x-sse", path, method))
        .and_then(|v| v.as_bool())
        .unwrap_or(false)
}

/// 替换路径中的 `{param}` 为实际测试值。
fn resolve_path(path: &str, params: &HashMap<&str, &str>) -> String {
    let mut resolved = path.to_string();
    for (key, value) in params {
        resolved = resolved.replace(&format!("{{{}}}", key), value);
    }
    resolved
}

/// 校验 JSON 值是否符合 JSON Schema，返回错误列表。
/// 空列表表示通过。
fn validate_against_schema(value: &Value, schema: &Value) -> Vec<String> {
    validate_json_schema_value(schema, value)
}

// ── JSON Schema 校验函数（复用 tools/base.rs 的相同逻辑） ───────────

fn json_type_name(value: &Value) -> &'static str {
    match value {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}

fn validate_json_schema_value(schema: &Value, value: &Value) -> Vec<String> {
    let mut errors = Vec::new();

    let schema_type = schema.get("type").and_then(|t| t.as_str());

    if let Some(st) = schema_type {
        let value_type = json_type_name(value);
        if st == "object" && value_type != "object" {
            errors.push(format!("expected object, got {}", value_type));
            return errors;
        }
        if st == "array" && value_type != "array" {
            errors.push(format!("expected array, got {}", value_type));
            return errors;
        }
        if st == "string" && value_type != "string" {
            errors.push(format!("expected string, got {}", value_type));
            return errors;
        }
    }

    if let Some(required) = schema.get("required").and_then(|r| r.as_array()) {
        for req in required {
            if let Some(name) = req.as_str() {
                if !value.get(name).is_some_and(|v| !v.is_null()) {
                    errors.push(format!("missing required property: {}", name));
                }
            }
        }
    }

    if let Some(properties) = schema.get("properties").and_then(|p| p.as_object()) {
        for (prop_name, prop_schema) in properties {
            if let Some(prop_value) = value.get(prop_name) {
                if !prop_value.is_null() {
                    let sub_errors = validate_json_schema_value(prop_schema, prop_value);
                    errors.extend(
                        sub_errors
                            .into_iter()
                            .map(|e| format!("{}.{}", prop_name, e)),
                    );
                }
            }
        }
    }

    errors
}

// ── 辅助函数 ───────────────────────────────────────────────────────

/// 对 JSON 端点发起 GET 请求并校验 200 + schema。
async fn test_get_json(path: &str) {
    let spec = load_openapi_spec();

    if !is_ported(&spec, path, "get") {
        eprintln!("SKIP: GET {} (x-status != ported)", path);
        return;
    }
    if is_sse(&spec, path, "get") {
        eprintln!("SKIP: GET {} is SSE endpoint, use test_sse instead", path);
        return;
    }

    let url = format!("{}{}", RUST_BASE, path);
    let resp = reqwest::get(&url).await.expect(&format!("GET {} 请求失败", path));
    assert_eq!(resp.status(), 200, "GET {} 应返回 200，实际返回 {}", path, resp.status());

    let body: Value = resp.json().await.expect("响应体应为有效 JSON");
    let schema = get_response_schema(&spec, path, "get", 200)
        .expect(&format!("规范中应定义 GET {} 的 200 响应 schema", path));

    let errors = validate_against_schema(&body, schema);
    if !errors.is_empty() {
        eprintln!("GET {} 响应不符合规范:", path);
        for e in &errors {
            eprintln!("  - {}", e);
        }
    }
    assert!(errors.is_empty(), "GET {} schema 校验失败", path);
}

/// 对 SSE 端点发起 POST 请求并校验 200 + Content-Type。
async fn test_sse_post(path: &str, form_data: Vec<(&str, &str)>) {
    let spec = load_openapi_spec();

    if !is_ported(&spec, path, "post") {
        eprintln!("SKIP: POST {} (x-status != ported)", path);
        return;
    }
    if !is_sse(&spec, path, "post") {
        eprintln!("WARN: POST {} is not marked as x-sse, use test_get_json instead", path);
    }

    let client = reqwest::Client::new();
    let mut form = reqwest::multipart::Form::new();
    for (key, value) in form_data {
        form = form.text(key.to_string(), value.to_string());
    }

    let url = format!("{}{}", RUST_BASE, path);
    let resp = client
        .post(&url)
        .multipart(form)
        .send()
        .await
        .expect(&format!("POST {} 请求失败", path));

    assert_eq!(
        resp.status(),
        200,
        "POST {} 应返回 200，实际返回 {}",
        path,
        resp.status()
    );

    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    assert!(
        content_type.starts_with("text/event-stream"),
        "POST {} Content-Type 应为 text/event-stream，实际为 {}",
        path,
        content_type
    );
}

// ── 契约测试 ───────────────────────────────────────────────────────

#[tokio::test]
async fn test_get_agents() {
    test_get_json("/api/agents").await;
}

#[tokio::test]
async fn test_get_sessions() {
    let path = resolve_path("/api/agents/{agent_id}/sessions", &HashMap::from([
        ("agent_id", "std"),
    ]));
    test_get_json(&path).await;
}

#[tokio::test]
async fn test_delete_session() {
    // DELETE 操作：先确认端点存在且返回 200（即使会话不存在也应正常响应）
    let path = resolve_path("/api/agents/{agent_id}/sessions/{session_id}", &HashMap::from([
        ("agent_id", "std"),
        ("session_id", "nonexistent-session"),
    ]));
    let url = format!("{}{}", RUST_BASE, path);
    let client = reqwest::Client::new();
    let resp = client
        .delete(&url)
        .send()
        .await
        .expect("DELETE session 请求失败");
    assert_eq!(
        resp.status(),
        200,
        "DELETE {} 应返回 200，实际返回 {}",
        path,
        resp.status()
    );
}

#[tokio::test]
async fn test_get_messages() {
    let path = resolve_path(
        "/api/agents/{agent_id}/sessions/{session_id}/messages",
        &HashMap::from([("agent_id", "std"), ("session_id", "nonexistent-session")]),
    );
    test_get_json(&path).await;
}

#[tokio::test]
async fn test_get_knowledge_bases() {
    let path = resolve_path(
        "/api/agents/{agent_id}/knowledge-bases",
        &HashMap::from([("agent_id", "std")]),
    );
    test_get_json(&path).await;
}

#[tokio::test]
async fn test_create_and_delete_knowledge_base() {
    let path = resolve_path(
        "/api/agents/{agent_id}/knowledge-bases",
        &HashMap::from([("agent_id", "std")]),
    );

    let url = format!("{}{}", RUST_BASE, path);
    let client = reqwest::Client::new();

    // Create
    let resp = client
        .post(&url)
        .json(&serde_json::json!({
            "name": "contract-test-kb",
            "description": "temporary kb created by contract test"
        }))
        .send()
        .await
        .expect("POST knowledge-bases 请求失败");
    assert_eq!(resp.status(), 200, "POST knowledge-bases 应返回 200");

    let body: Value = resp.json().await.expect("响应体应为有效 JSON");
    assert!(body.get("id").is_some(), "创建 KB 应返回 id 字段");

    // Delete
    if let Some(kb_id) = body.get("id").and_then(|v| v.as_str()) {
        let delete_path = resolve_path(
            "/api/agents/{agent_id}/knowledge-bases/{kb_id}",
            &HashMap::from([("agent_id", "std"), ("kb_id", kb_id)]),
        );
        let delete_url = format!("{}{}", RUST_BASE, delete_path);
        let resp = client
            .delete(&delete_url)
            .send()
            .await
            .expect("DELETE knowledge-base 请求失败");
        assert_eq!(resp.status(), 200, "DELETE knowledge-base 应返回 200");
    }
}

#[tokio::test]
async fn test_get_nodes() {
    let path = resolve_path(
        "/api/agents/{agent_id}/res/{res_name}",
        &HashMap::from([("agent_id", "std"), ("res_name", "nodes")]),
    );
    let url = format!("{}{}?kb_id=default", RUST_BASE, path);
    let resp = reqwest::get(&url).await.expect("GET nodes 请求失败");
    assert_eq!(resp.status(), 200, "GET nodes 应返回 200");
}

#[tokio::test]
async fn test_upload_file() {
    let path = resolve_path(
        "/api/agents/{agent_id}/attachments/cache",
        &HashMap::from([("agent_id", "std")]),
    );
    let url = format!("{}{}", RUST_BASE, path);

    let client = reqwest::Client::new();
    let form = reqwest::multipart::Form::new()
        .part("file", reqwest::multipart::Part::text("test content").file_name("test.txt"));

    let resp = client
        .post(&url)
        .multipart(form)
        .send()
        .await
        .expect("POST attachments/cache 请求失败");
    assert_eq!(resp.status(), 200, "POST attachments/cache 应返回 200");

    let body: Value = resp.json().await.expect("响应体应为有效 JSON");
    assert!(
        body.get("cached_path").is_some(),
        "上传文件响应应包含 cached_path 字段"
    );
}

#[tokio::test]
async fn test_chat_stream() {
    test_sse_post(
        "/api/agents/std/chat/stream",
        vec![("text", "hello"), ("session_id", "contract-test-session")],
    )
    .await;
}

/// 遍历 specs/openapi.yaml 中所有 `x-status: ported` 的端点，
/// 确保它们都已被测试覆盖。非 ported 端点跳过。
#[test]
fn test_all_ported_endpoints_listed() {
    let spec = load_openapi_spec();
    let paths = spec
        .get("paths")
        .and_then(|p| p.as_object())
        .expect("规范中应定义 paths");

    let mut ported_endpoints: Vec<String> = Vec::new();

    for (path, path_item) in paths {
        let methods = path_item.as_object().expect("path item 应为对象");
        for (method, _) in methods {
            if method == "parameters" || method == "summary" || method == "description" {
                continue;
            }
            if is_ported(&spec, path, method) {
                ported_endpoints.push(format!("{} {}", method.to_uppercase(), path));
            }
        }
    }

    // 这个测试不会自动覆盖所有端点（端口测试需要实际运行），
    // 但会打印出所有应该被覆盖的 ported 端点列表，
    // 以便人工检查是否遗漏。
    eprintln!("=== ported 端点（应全部被契约测试覆盖） ===");
    for ep in &ported_endpoints {
        eprintln!("  {}", ep);
    }
    eprintln!("=== 共 {} 个 ported 端点 ===", ported_endpoints.len());
}
