//! MCP client — connects to MCP servers and wraps their tools/resources/prompts
//! as native agent tools.  Based on rmcp 2.2.0 official SDK.

use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use rmcp::ServiceExt;
use serde_json::{json, Value};
use tokio::sync::Mutex;
use tracing::{debug, error, info, warn};

use super::base::Tool;
use super::registry::ToolRegistry;

// ── Helpers ──────────────────────────────────────────────────────────────

fn sanitize_name(name: &str) -> String {
    static RE: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    let re = RE.get_or_init(|| regex::Regex::new(r"[^a-zA-Z0-9_-]").unwrap());
    re.replace_all(&re.replace_all(name, "_"), "_").to_string()
}

fn normalize_schema_for_openai(schema: &Value) -> Value {
    let mut n = match schema {
        Value::Object(_) => schema.clone(),
        _ => return json!({"type": "object", "properties": {} }),
    };

    if let Some(arr) = n.get("type").and_then(|t| t.as_array()) {
        let non_null: Vec<_> = arr.iter().filter(|v| v.as_str() != Some("null")).cloned().collect();
        let has_null = arr.iter().any(|v| v.as_str() == Some("null"));
        if has_null && non_null.len() == 1 {
            if let Some(obj) = n.as_object_mut() {
                obj.insert("type".to_string(), non_null.into_iter().next().unwrap());
                obj.insert("nullable".to_string(), Value::Bool(true));
            }
        }
    }

    if let Some(props) = n.get("properties").and_then(|p| p.as_object()) {
        let new_props: serde_json::Map<String, Value> = props
            .iter()
            .map(|(k, v)| (k.clone(), normalize_schema_for_openai(v)))
            .collect();
        if let Some(obj) = n.as_object_mut() {
            obj.insert("properties".to_string(), Value::Object(new_props));
        }
    }

    if let Some(items) = n.get("items").cloned() {
        if let Some(obj) = n.as_object_mut() {
            obj.insert("items".to_string(), normalize_schema_for_openai(&items));
        }
    }

    if let Some(obj) = n.as_object_mut() {
        if !obj.contains_key("properties") {
            obj.insert("properties".to_string(), json!({}));
        }
    }
    n
}

// ── Tool Wrapper ─────────────────────────────────────────────────────────

pub struct McpToolWrapper {
    name: String,
    description: String,
    parameters: Value,
    service: Arc<Mutex<rmcp::service::RunningService<rmcp::RoleClient, ()>>>,
    tool_name: String,
    timeout_secs: u64,
}

impl McpToolWrapper {
    pub fn new(
        service: Arc<Mutex<rmcp::service::RunningService<rmcp::RoleClient, ()>>>,
        server_name: &str,
        tool_def: &rmcp::model::Tool,
        timeout_secs: u64,
    ) -> Self {
        let tn = tool_def.name.clone();
        let desc = tool_def.description.clone()
            .unwrap_or_else(|| tn.clone());
        let schema: Value = (*tool_def.input_schema).clone().into();
        Self {
            name: sanitize_name(&format!("mcp_{}_{}", server_name, tn)),
            description: desc.to_string(),
            parameters: normalize_schema_for_openai(&schema),
            service,
            tool_name: tn.to_string(),
            timeout_secs,
        }
    }
}

#[async_trait]
impl Tool for McpToolWrapper {
    fn name(&self) -> &str { &self.name }
    fn description(&self) -> &str { &self.description }
    fn parameters(&self) -> &Value { &self.parameters }

    async fn execute(&self, params: Value) -> Result<String, String> {
        let arguments: Option<serde_json::Map<String, Value>> = params.as_object().map(|o| {
            o.iter()
                .filter(|(_, v)| !v.is_null())
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect()
        });

        for attempt in 0..2 {
            let guard = self.service.lock().await;
            let mut req = rmcp::model::CallToolRequestParams::new(self.tool_name.clone());
            if let Some(ref args) = arguments {
                req = req.with_arguments(args.clone());
            }
            let fut = guard.call_tool(req);
            let result = tokio::time::timeout(
                std::time::Duration::from_secs(self.timeout_secs),
                fut,
            ).await;

            match result {
                Ok(Ok(r)) => {
                    let lines: Vec<&str> = r.content.iter()
                        .flat_map(|c| c.as_text().map(|t| t.text.as_str()))
                        .collect();
                    return Ok(if lines.is_empty() { "(no output)".to_string() } else { lines.join("\n") });
                }
                Ok(Err(e)) => {
                    let msg = e.to_string();
                    let transient = msg.contains("Closed") || msg.contains("reset") || msg.contains("Transport");
                    if transient && attempt == 0 {
                        warn!("MCP tool '{}' transient, retrying…", self.name);
                        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                        continue;
                    }
                    return Err(format!("MCP tool call failed: {msg}"));
                }
                Err(_) => {
                    warn!("MCP tool '{}' timed out after {}s", self.name, self.timeout_secs);
                    return Err(format!("MCP tool call timed out after {}s", self.timeout_secs));
                }
            }
        }
        Err("MCP tool call failed after retry".to_string())
    }
}

// ── Resource Wrapper ─────────────────────────────────────────────────────

pub struct McpResourceWrapper {
    name: String,
    description: String,
    parameters: Value,
    service: Arc<Mutex<rmcp::service::RunningService<rmcp::RoleClient, ()>>>,
    uri: String,
    timeout_secs: u64,
}

impl McpResourceWrapper {
    pub fn new(
        service: Arc<Mutex<rmcp::service::RunningService<rmcp::RoleClient, ()>>>,
        server_name: &str,
        resource: &rmcp::model::Resource,
        timeout_secs: u64,
    ) -> Self {
        let rn = &resource.name;
        Self {
            name: sanitize_name(&format!("mcp_{}_resource_{}", server_name, rn)),
            description: format!("[MCP Resource] {}\nURI: {}",
                resource.description.as_deref().unwrap_or(rn), resource.uri),
            parameters: json!({"type": "object", "properties": {} }),
            service,
            uri: resource.uri.clone(),
            timeout_secs,
        }
    }
}

#[async_trait]
impl Tool for McpResourceWrapper {
    fn name(&self) -> &str { &self.name }
    fn description(&self) -> &str { &self.description }
    fn parameters(&self) -> &Value { &self.parameters }
    fn read_only(&self) -> bool { true }

    async fn execute(&self, _p: Value) -> Result<String, String> {
        let guard = self.service.lock().await;
        let req = rmcp::model::ReadResourceRequestParams::new(self.uri.clone());
        match tokio::time::timeout(
            std::time::Duration::from_secs(self.timeout_secs),
            guard.read_resource(req),
        ).await {
            Ok(Ok(r)) => {
                let lines: Vec<String> = r.contents.iter().map(|c| match c {
                    rmcp::model::ResourceContents::TextResourceContents { text, .. } => text.to_string(),
                    rmcp::model::ResourceContents::BlobResourceContents { blob, .. } => format!("[{} bytes]", blob.len()),
                    _ => format!("{:?}", c),
                }).collect();
                Ok(if lines.is_empty() { "(no output)".to_string() } else { lines.join("\n") })
            }
            Ok(Err(e)) => Err(format!("MCP resource read failed: {e}")),
            Err(_) => Err(format!("MCP resource read timed out after {}s", self.timeout_secs)),
        }
    }
}

// ── Prompt Wrapper ───────────────────────────────────────────────────────

pub struct McpPromptWrapper {
    name: String,
    description: String,
    parameters: Value,
    service: Arc<Mutex<rmcp::service::RunningService<rmcp::RoleClient, ()>>>,
    prompt_name: String,
    timeout_secs: u64,
}

impl McpPromptWrapper {
    pub fn new(
        service: Arc<Mutex<rmcp::service::RunningService<rmcp::RoleClient, ()>>>,
        server_name: &str,
        prompt: &rmcp::model::Prompt,
        timeout_secs: u64,
    ) -> Self {
        let pn = &prompt.name;
        let mut props = serde_json::Map::new();
        let mut req: Vec<Value> = vec![];
        if let Some(args) = &prompt.arguments {
            for a in args {
                let mut p = serde_json::Map::new();
                p.insert("type".to_string(), json!("string"));
                if let Some(d) = &a.description { p.insert("description".to_string(), json!(d)); }
                props.insert(a.name.clone(), Value::Object(p));
                if a.required.unwrap_or(false) { req.push(json!(a.name)); }
            }
        }
        Self {
            name: sanitize_name(&format!("mcp_{}_prompt_{}", server_name, pn)),
            description: format!("[MCP Prompt] {}", prompt.description.as_deref().unwrap_or(pn)),
            parameters: json!({"type": "object", "properties": props, "required": req }),
            service,
            prompt_name: pn.clone(),
            timeout_secs,
        }
    }
}

#[async_trait]
impl Tool for McpPromptWrapper {
    fn name(&self) -> &str { &self.name }
    fn description(&self) -> &str { &self.description }
    fn parameters(&self) -> &Value { &self.parameters }
    fn read_only(&self) -> bool { true }

    async fn execute(&self, params: Value) -> Result<String, String> {
        let arguments: Option<serde_json::Map<String, Value>> = match params.as_object() {
            Some(o) if !o.is_empty() => Some(o.clone()),
            _ => None,
        };
        let guard = self.service.lock().await;
        let mut req = rmcp::model::GetPromptRequestParams::new(self.prompt_name.clone());
        if let Some(args) = arguments {
            req = req.with_arguments(args);
        }
        match tokio::time::timeout(
            std::time::Duration::from_secs(self.timeout_secs),
            guard.get_prompt(req),
        ).await {
            Ok(Ok(r)) => {
                let lines: Vec<String> = r.messages.iter().flat_map(|m| match &m.content {
                    rmcp::model::ContentBlock::Text(t) => vec![t.text.clone()],
                    other => vec![format!("{:?}", other)],
                }).collect();
                Ok(if lines.is_empty() { "(no output)".to_string() } else { lines.join("\n") })
            }
            Ok(Err(e)) => Err(format!("MCP prompt failed: {e}")),
            Err(_) => Err(format!("MCP prompt timed out after {}s", self.timeout_secs)),
        }
    }
}

// ── Connection ────────────────────────────────────────────────────────────

pub struct McpGuard {
    _svc: Arc<Mutex<rmcp::service::RunningService<rmcp::RoleClient, ()>>>,
}

fn cfg_str(cfg: &Value, key: &str) -> Option<String> {
    cfg.get(key).and_then(|v| v.as_str()).map(|s| s.to_string())
}

fn cfg_list(cfg: &Value, key: &str) -> Vec<String> {
    cfg.get(key).and_then(|v| v.as_array())
        .map_or(vec![], |a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect())
}

fn cfg_env(cfg: &Value) -> HashMap<String, String> {
    cfg.get("env").and_then(|v| v.as_object()).map_or(HashMap::new(), |o| {
        o.iter().filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string()))).collect()
    })
}

async fn connect_one(
    name: &str,
    cfg: &Value,
    registry: &mut ToolRegistry,
) -> Result<McpGuard, String> {
    let timeout: u64 = cfg.get("tool_timeout").and_then(|v| v.as_u64()).unwrap_or(30);
    let enabled_tools: Vec<String> = cfg.get("enabled_tools")
        .and_then(|v| v.as_array()).map_or(vec!["*".to_string()], |a|
            a.iter().filter_map(|v| v.as_str().map(String::from)).collect());
    let allow_all = enabled_tools.iter().any(|t| t == "*");

    let has_cmd = cfg_str(cfg, "command").is_some();
    let url = cfg_str(cfg, "url");
    let ttype = if has_cmd { "stdio" }
        else if url.as_ref().map_or(false, |u| u.ends_with("/sse")) { "sse" }
        else if url.is_some() { "streamableHttp" }
        else { warn!("MCP '{name}': no command/url"); return Err("no command or url".to_string()) };

    let running = match ttype {
        "stdio" => {
            let cmd_str = cfg_str(cfg, "command").ok_or("stdio requires command")?;
            let mut cmd = tokio::process::Command::new(&cmd_str);
            cmd.args(&cfg_list(cfg, "args"));
            for (k, v) in cfg_env(cfg) { cmd.env(k, v); }
            cmd.kill_on_drop(true);
            let tp = rmcp::transport::TokioChildProcess::new(cmd)
                .map_err(|e| format!("TokioChildProcess: {e}"))?;
            ().serve(tp).await.map_err(|e| format!("serve: {e}"))?
        }
        "sse" | "streamableHttp" => {
            let u = url.ok_or("url required")?;
            let tp = rmcp::transport::StreamableHttpClientTransport::from_uri(u);
            ().serve(tp).await.map_err(|e| format!("serve: {e}"))?
        }
        _ => return Err(format!("unknown transport: {ttype}")),
    };

    let svc = Arc::new(Mutex::new(running));
    let mut cnt = 0u32;

    // Tools
    {
        let g = svc.lock().await;
        if let Ok(list) = g.list_tools(Default::default()).await {
            for t in &list.tools {
                let wn = sanitize_name(&format!("mcp_{}_{}", name, t.name));
                if !allow_all && !enabled_tools.iter().any(|et| et == &t.name || et == &wn) {
                    debug!("MCP skip tool '{wn}'");
                    continue;
                }
                let w = McpToolWrapper::new(svc.clone(), name, t, timeout);
                debug!("MCP register tool '{}'", w.name());
                registry.register(Box::new(w));
                cnt += 1;
            }
        }
    }
    // Resources
    {
        let g = svc.lock().await;
        if let Ok(list) = g.list_resources(Default::default()).await {
            for r in &list.resources {
                let w = McpResourceWrapper::new(svc.clone(), name, r, timeout);
                registry.register(Box::new(w));
                cnt += 1;
            }
        }
    }
    // Prompts
    {
        let g = svc.lock().await;
        if let Ok(list) = g.list_prompts(Default::default()).await {
            for p in &list.prompts {
                let w = McpPromptWrapper::new(svc.clone(), name, p, timeout);
                registry.register(Box::new(w));
                cnt += 1;
            }
        }
    }

    info!("MCP '{name}': connected, {cnt} capabilities registered");

    Ok(McpGuard { _svc: svc })
}

pub async fn connect_mcp_servers(
    mcp_servers: &HashMap<String, Value>,
    registry: &mut ToolRegistry,
) -> Vec<(String, McpGuard)> {
    let mut guards = vec![];
    for (name, cfg) in mcp_servers {
        match connect_one(name, cfg, registry).await {
            Ok(g) => guards.push((name.clone(), g)),
            Err(e) => error!("MCP '{name}': connect failed: {e}"),
        }
    }
    guards
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── sanitize_name ────────────────────────────────────────────────

    #[test]
    fn test_sanitize_name_keeps_alphanumeric() {
        assert_eq!(sanitize_name("hello"), "hello");
    }

    #[test]
    fn test_sanitize_name_replaces_spaces() {
        assert_eq!(sanitize_name("my tool"), "my_tool");
    }

    #[test]
    fn test_sanitize_name_replaces_special_chars() {
        assert_eq!(sanitize_name("a@b#c$d"), "a_b_c_d");
    }

    #[test]
    fn test_sanitize_name_keeps_underscore_dash() {
        assert_eq!(sanitize_name("a-b_c"), "a-b_c");
    }

    #[test]
    fn test_sanitize_name_empty() {
        assert_eq!(sanitize_name(""), "");
    }

    #[test]
    fn test_sanitize_name_mcp_prefix() {
        let result = sanitize_name("mcp_server_my-tool");
        assert_eq!(result, "mcp_server_my-tool");
    }

    // ── normalize_schema_for_openai ───────────────────────────────────

    #[test]
    fn test_normalize_schema_non_object_returns_default() {
        let result = normalize_schema_for_openai(&json!("string"));
        assert_eq!(result, json!({"type": "object", "properties": {}}));
    }

    #[test]
    fn test_normalize_schema_type_array_with_null() {
        let schema = json!({
            "type": ["null", "string"],
            "title": "Name"
        });
        let result = normalize_schema_for_openai(&schema);
        assert_eq!(result["type"], "string");
        assert_eq!(result["nullable"], true);
        assert_eq!(result["title"], "Name");
    }

    #[test]
    fn test_normalize_schema_type_array_without_null() {
        let schema = json!({
            "type": ["string", "integer"],
        });
        let result = normalize_schema_for_openai(&schema);
        // multiple non-null types stay as array
        assert!(result["type"].is_array());
    }

    #[test]
    fn test_normalize_schema_recurses_properties() {
        let schema = json!({
            "type": "object",
            "properties": {
                "name": {
                    "type": ["null", "string"]
                }
            }
        });
        let result = normalize_schema_for_openai(&schema);
        assert_eq!(result["properties"]["name"]["type"], "string");
        assert_eq!(result["properties"]["name"]["nullable"], true);
    }

    #[test]
    fn test_normalize_schema_recurses_items() {
        let schema = json!({
            "type": "array",
            "items": {
                "type": ["null", "string"]
            }
        });
        let result = normalize_schema_for_openai(&schema);
        assert_eq!(result["items"]["type"], "string");
        assert_eq!(result["items"]["nullable"], true);
    }

    #[test]
    fn test_normalize_schema_adds_missing_properties() {
        let schema = json!({"type": "string"});
        let result = normalize_schema_for_openai(&schema);
        assert_eq!(result["type"], "string");
        assert_eq!(result["properties"], json!({}));
    }
}
