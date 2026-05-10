use std::path::{Path, PathBuf};

use chrono::Local;
use serde_json::Value;

use crate::core::config::get_agent_base_dir as core_get_agent_base_dir;

use super::turn_context::AgentTurnContext;

/// Built-in base system prompt (embedded at compile time).
const DEFAULT_SYSTEM_PROMPT: &str = include_str!("standard/prompts/system.md");

const BOOTSTRAP_FILES: &[&str] = &["SOUL.md", "USER.md", "IDENTITY.md"];

/// Builds the context (system prompt + messages) for the agent.
pub struct ContextBuilder {
    workspace: PathBuf,
    agent_id: Option<String>,
}

impl ContextBuilder {
    pub fn new(workspace: &str, agent_id: Option<&str>) -> Self {
        Self {
            workspace: PathBuf::from(workspace),
            agent_id: agent_id.map(|s| s.to_string()),
        }
    }

    /// Build the full system prompt sent to the LLM.
    pub fn build_system_prompt(&self) -> String {
        let mut parts: Vec<String> = Vec::new();

        // 1. Skills XML catalog
        if let Some(ref agent_id) = self.agent_id {
            let xml = discover_skills_xml_for_agent(agent_id);
            if !xml.trim().is_empty() {
                parts.push(xml);
            }
        }

        // 2. Bootstrap files (SOUL.md, USER.md, IDENTITY.md)
        let bootstrap = self.load_bootstrap_files();
        if !bootstrap.is_empty() {
            parts.push(bootstrap);
        }

        // 3. Base prompt
        let base = self.resolve_base_prompt();
        if !base.is_empty() {
            parts.push(base);
        }

        // 4. Current datetime
        parts.push(Self::current_datetime());

        // 5. Tool guard
        let head = parts.join("\n\n");
        let guard = self.build_tool_guard();
        if head.is_empty() {
            return guard.trim().to_string();
        }
        format!("{head}{guard}")
    }

    /// Load bootstrap files from workspace.
    fn load_bootstrap_files(&self) -> String {
        let mut parts: Vec<String> = Vec::new();
        for filename in BOOTSTRAP_FILES {
            let file_path = self.workspace.join(filename);
            if file_path.exists() {
                if let Ok(content) = std::fs::read_to_string(&file_path) {
                    let trimmed = content.trim().to_string();
                    if !trimmed.is_empty() {
                        parts.push(format!("## {filename}\n\n{trimmed}"));
                    }
                }
            }
        }
        parts.join("\n\n")
    }

    /// Return the base system prompt.
    ///
    /// Priority:
    ///   1. Agent data dir `prompts/system_prompt.md` (user override)
    ///   2. Built-in default prompt
    fn resolve_base_prompt(&self) -> String {
        if let Some(ref agent_id) = self.agent_id {
            let user_path = core_get_agent_base_dir(agent_id).join("prompts").join("system_prompt.md");
            if user_path.exists() {
                if let Ok(text) = std::fs::read_to_string(&user_path) {
                    let trimmed = text.trim().to_string();
                    if !trimmed.is_empty() {
                        return trimmed;
                    }
                }
            }
        }
        DEFAULT_SYSTEM_PROMPT.trim().to_string()
    }

    /// Public alias for resolving base prompt (used by callers that need only the text).
    pub fn resolve_base_prompt_alias(&self) -> String {
        self.resolve_base_prompt()
    }

    fn current_datetime() -> String {
        let now = Local::now();
        format!(
            "当前本地时间（请以此为准处理所有与日期/时间相关的问题）：{}",
            now.format("%Y-%m-%d %H:%M:%S %z")
        )
    }

    fn build_tool_guard(&self) -> String {
        let ws = self.workspace.canonicalize().unwrap_or_else(|_| self.workspace.clone());
        let skills_dir = ws
            .parent()
            .map(|p| p.join("skills"))
            .unwrap_or_else(|| PathBuf::from("skills"))
            .canonicalize()
            .unwrap_or_else(|_| PathBuf::from("skills"));

        let kb_line = self.build_kb_env_line();

        format!(
            "\n\n你可以使用提供的工具。\
            \nrun_command 默认 cwd=workspace；\
            注意！调用技能中的脚本时，必须设置 cwd=skills，\
            同时必须要提供 skill_name，目录为 agent_id/skills/<skill_name>/。\
            \n命令中可使用环境变量: AGENT_WORKSPACE / AGENT_SKILLS / AGENT_DEFAULT_KB。\
            \nAGENT_WORKSPACE={}\
            \nAGENT_SKILLS（skills 根目录）={}{kb_line}",
            ws.display(),
            skills_dir.display(),
        )
    }

    fn build_kb_env_line(&self) -> String {
        if self.agent_id.is_none() {
            return "\nAGENT_DEFAULT_KB（默认知识库路径）=无".to_string();
        }
        // Simplified: knowledge base registry not yet ported
        "\nAGENT_DEFAULT_KB（默认知识库路径）=无".to_string()
    }

    /// Build the complete message list for an LLM call.
    pub fn build_messages(
        &self,
        history: &[Value],
        current_message: &str,
        mentions: &[Value],
    ) -> Vec<Value> {
        let system_prompt = self.build_system_prompt();
        let mut messages: Vec<Value> = vec![
            serde_json::json!({"role": "system", "content": system_prompt}),
        ];

        messages.extend(history.iter().cloned());

        if !mentions.is_empty() {
            let refs = self.build_reference_messages(mentions);
            if !refs.is_empty() {
                if let Some(last) = messages.last() {
                    if last.get("role") == refs[0].get("role") {
                        let mut merged = last.clone();
                        let merged_content = Self::merge_message_content(
                            last.get("content"),
                            refs[0].get("content"),
                        );
                        merged["content"] = merged_content;
                        let len = messages.len();
                        messages[len - 1] = merged;
                        messages.extend(refs[1..].iter().cloned());
                    } else {
                        messages.extend(refs);
                    }
                } else {
                    messages.extend(refs);
                }
            }
        }

        if !current_message.is_empty() {
            messages.push(serde_json::json!({"role": "user", "content": current_message}));
        }

        messages
    }

    fn merge_message_content(left: Option<&Value>, right: Option<&Value>) -> Value {
        match (left, right) {
            (Some(Value::String(l)), Some(Value::String(r))) => {
                if l.is_empty() {
                    Value::String(r.clone())
                } else {
                    Value::String(format!("{l}\n\n{r}"))
                }
            }
            _ => {
                let mut blocks: Vec<Value> = Vec::new();
                if let Some(l) = left {
                    Self::push_content_blocks(l, &mut blocks);
                }
                if let Some(r) = right {
                    Self::push_content_blocks(r, &mut blocks);
                }
                Value::Array(blocks)
            }
        }
    }

    fn push_content_blocks(value: &Value, blocks: &mut Vec<Value>) {
        match value {
            Value::Array(arr) => {
                for item in arr {
                    if item.is_object() {
                        blocks.push(item.clone());
                    } else {
                        blocks.push(serde_json::json!({"type": "text", "text": item}));
                    }
                }
            }
            Value::String(s) if !s.is_empty() => {
                blocks.push(serde_json::json!({"type": "text", "text": s}));
            }
            _ => {}
        }
    }

    fn build_reference_messages(&self, mentions: &[Value]) -> Vec<Value> {
        let mut result: Vec<Value> = Vec::new();
        for mention in mentions {
            let path_str = mention.get("parsed_path").and_then(|v| v.as_str());
            if path_str.is_none_or(|s| s.is_empty()) {
                continue;
            }
            let path_str = path_str.unwrap();
            let path = Path::new(path_str);
            if !path.exists() {
                continue;
            }
            let content = match std::fs::read_to_string(path) {
                Ok(c) => c,
                Err(_) => continue,
            };
            let name = mention
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("未命名文章");
            result.push(serde_json::json!({
                "role": "user",
                "content": format!("# 参考文章: {name}\n\n{content}"),
            }));
        }
        result
    }
}

/// Stub: discover skills XML for an agent.
/// Full implementation requires porting skill_loader from Python.
fn discover_skills_xml_for_agent(_agent_id: &str) -> String {
    String::new()
}
