use std::path::{Path, PathBuf};

use chrono::Local;
use serde_json::Value;

use crate::core::config::get_agent_base_dir as core_get_agent_base_dir;

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
        let prompt = if head.is_empty() {
            guard.trim().to_string()
        } else {
            format!("{head}{guard}")
        };

        // debug: print the assembled system prompt
        use std::io::Write;
        let separator = "=".repeat(80);
        eprintln!("\n{separator}");
        eprintln!("【System Prompt】");
        eprintln!("{separator}");
        eprintln!("{prompt}");
        eprintln!("{separator}");
        std::io::stderr().flush().ok();

        prompt
    }

    /// Load bootstrap files from workspace root (SOUL.md, USER.md, IDENTITY.md).
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
    /// 只从 workspace 目录读取 SYSTEM.md（由 seed 机制保证文件存在）。
    fn resolve_base_prompt(&self) -> String {
        if let Some(ref agent_id) = self.agent_id {
            let user_path = core_get_agent_base_dir(agent_id).join("SYSTEM.md");
            if user_path.exists() {
                if let Some(body) = Self::extract_system_md_body(&user_path) {
                    return body;
                }
            }
        }

        String::new()
    }

    /// 提取 SYSTEM.md 中 frontmatter 之后的 Markdown body。
    fn extract_system_md_body(path: &Path) -> Option<String> {
        let content = std::fs::read_to_string(path).ok()?;
        if content.starts_with("---") {
            let parts: Vec<&str> = content.splitn(3, "---").collect();
            if parts.len() >= 3 {
                let body = parts[2].trim();
                return if body.is_empty() { None } else { Some(body.to_string()) };
            }
        }
        let trimmed = content.trim();
        if trimmed.is_empty() { None } else { Some(trimmed.to_string()) }
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
        let ws = crate::utils::helpers::normalize_path(
            self.workspace.canonicalize().unwrap_or_else(|_| self.workspace.clone()),
        );
        let skills_dir = ws
            .join(".agent")
            .join("skills")
            .canonicalize()
            .map(crate::utils::helpers::normalize_path)
            .unwrap_or_else(|_| ws.join(".agent").join("skills"));

        let kb_line = self.build_kb_env_line();

        format!(
            "\n\n你可以使用提供的工具。\
            \nrun_command 默认 cwd=workspace；\
            注意！调用技能中的脚本时，必须设置 cwd=skills，\
            同时必须要提供 skill_name，目录为 .agent/skills/<skill_name>/。\
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

/// 发现某 agent 可用 skill，返回 XML 目录（集成 disabled_skills 过滤）
/// 委托给 service::skill_loader
fn discover_skills_xml_for_agent(agent_id: &str) -> String {
    crate::service::skill_loader::discover_skills_xml_for_agent(agent_id)
}

#[cfg(test)]
mod tests {
    use serde_json::json;
    use super::*;

    // ── merge_message_content ───────────────────────────────────────────

    #[test]
    fn test_merge_two_strings_joined_with_double_newline() {
        let result = ContextBuilder::merge_message_content(
            Some(&Value::String("hello".to_string())),
            Some(&Value::String("world".to_string())),
        );
        assert_eq!(result, Value::String("hello\n\nworld".to_string()));
    }

    #[test]
    fn test_merge_empty_left_returns_right() {
        let result = ContextBuilder::merge_message_content(
            Some(&Value::String("".to_string())),
            Some(&Value::String("world".to_string())),
        );
        assert_eq!(result, Value::String("world".to_string()));
    }

    #[test]
    fn test_merge_list_and_string_returns_block_list() {
        let result = ContextBuilder::merge_message_content(
            Some(&json!([{"type": "text", "text": "a"}])),
            Some(&Value::String("b".to_string())),
        );
        let expected = json!([
            {"type": "text", "text": "a"},
            {"type": "text", "text": "b"},
        ]);
        assert_eq!(result, expected);
    }

    #[test]
    fn test_merge_none_left_with_string_right() {
        let result = ContextBuilder::merge_message_content(
            None,
            Some(&Value::String("hello".to_string())),
        );
        let expected = json!([{"type": "text", "text": "hello"}]);
        assert_eq!(result, expected);
    }
}
