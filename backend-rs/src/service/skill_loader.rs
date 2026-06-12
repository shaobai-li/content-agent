use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::core::config::{get_agent_base_dir, get_agent_config};
use crate::service::disabled_skills::DisabledSkills;
use crate::utils::helpers::normalize_path;

/// Skill 元信息（对应 Python SkillHead）
#[derive(Debug, Clone)]
pub struct SkillHead {
    pub skill_id: String,
    pub name: String,
    pub description: String,
    pub source: String, // "bundled" | "user"
    pub skill_md_path: PathBuf,
}

/// 解析 SKILL.md 的 YAML frontmatter
#[derive(Debug)]
pub struct SkillMeta {
    pub name: String,
    pub description: String,
}

/// 解析 SKILL.md 文件，提取 YAML frontmatter
pub fn parse_skill_md(content: &str) -> Option<SkillMeta> {
    let trimmed = content.trim();
    if !trimmed.starts_with("---") {
        return None;
    }
    let without_start = &trimmed[3..];
    let end = without_start.find("\n---")?;
    let frontmatter_str = &without_start[..end];

    let name = frontmatter_str
        .lines()
        .find_map(|line| line.strip_prefix("name:").or_else(|| line.strip_prefix("name: ")))
        .map(|s| s.trim().trim_matches('"').to_string())
        .unwrap_or_default();

    let description = frontmatter_str
        .lines()
        .find_map(|line| line.strip_prefix("description:").or_else(|| line.strip_prefix("description: ")))
        .map(|s| s.trim().trim_matches('"').to_string())
        .unwrap_or_default();

    if name.is_empty() {
        return None;
    }

    Some(SkillMeta { name, description })
}

fn read_skill_head(skill_id: &str, path: &Path, source: &str) -> Option<SkillHead> {
    let content = std::fs::read_to_string(path).ok()?;
    let meta = parse_skill_md(&content)?;
    Some(SkillHead {
        skill_id: skill_id.to_string(),
        name: meta.name,
        description: meta.description,
        source: source.to_string(),
        skill_md_path: path.to_path_buf(),
    })
}

/// XML 转义
fn xml_text(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

/// 内置 skill 根路径（统一 config/agents/skills/）
fn bundled_skills_dir() -> PathBuf {
    crate::core::config::get_config_dir()
        .join("agents")
        .join("skills")
}

/// 解析 run_command 在 cwd=skills 时的工作目录（与 Python _resolve_run_cwd 一致）
pub fn resolve_skill_run_dir(workspace: &str, skill_name: &str) -> Result<PathBuf, String> {
    let raw = skill_name.trim();
    if raw.is_empty() {
        return Err("Error: skill_name is required when cwd=skills".to_string());
    }
    let safe_path = PathBuf::from(raw);
    let safe = safe_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");
    if safe.is_empty() || safe == "." || safe == ".." {
        return Err("Error: invalid skill_name".to_string());
    }

    let ws = PathBuf::from(workspace);
    let ws_resolved = ws.canonicalize().unwrap_or(ws);
    let user_root = ws_resolved
        .parent()
        .ok_or_else(|| "Error: cannot resolve parent of workspace".to_string())?
        .join("skills");
    let user_dir = user_root.join(safe);
    if user_dir.is_dir() {
        return Ok(normalize_path(
            user_dir.canonicalize().map_err(|e| format!("Error: {e}"))?,
        ));
    }

    let bundled_dir = bundled_skills_dir().join(safe);
    if bundled_dir.is_dir() {
        return Ok(normalize_path(
            bundled_dir.canonicalize().map_err(|e| format!("Error: {e}"))?,
        ));
    }

    std::fs::create_dir_all(&user_dir).map_err(|e| format!("Error: {e}"))?;
    Ok(normalize_path(
        user_dir.canonicalize().map_err(|e| format!("Error: {e}"))?,
    ))
}

/// 发现指定 agent 可用的所有 skill
pub fn discover_skills_for_agent(agent_id: &str) -> Vec<SkillHead> {
    let disabled = DisabledSkills::load(agent_id);
    let bundled_root = bundled_skills_dir();
    let user_root = get_agent_base_dir(agent_id).join(".agent").join("skills");

    let mut merged: HashMap<String, SkillHead> = HashMap::new();
    let mut ordered: Vec<String> = Vec::new();

    // 1. 从配置中读取有序 skill 列表
    if let Some(cfg) = get_agent_config(agent_id) {
        if let Some(skill_ids) = &cfg.skills {
            for skill_id in skill_ids {
                if disabled.is_disabled(skill_id) {
                    continue;
                }
                let p = bundled_root.join(skill_id).join("SKILL.md");
                if p.is_file() {
                    if let Some(head) = read_skill_head(skill_id, &p, "bundled") {
                        if !merged.contains_key(skill_id) {
                            merged.insert(skill_id.clone(), head);
                            ordered.push(skill_id.clone());
                        }
                    }
                }
            }
        }
    }

    // 2. 扫描用户目录下的 user skill
    if user_root.exists() {
        let mut user_ids: Vec<String> = Vec::new();
        if let Ok(entries) = std::fs::read_dir(&user_root) {
            for entry in entries.flatten() {
                let skill_id = entry.file_name().to_string_lossy().to_string();
                if merged.contains_key(&skill_id) || disabled.is_disabled(&skill_id) {
                    continue;
                }
                let p = user_root.join(&skill_id).join("SKILL.md");
                if p.is_file() {
                    user_ids.push(skill_id);
                }
            }
        }
        user_ids.sort();
        for skill_id in user_ids {
            let p = user_root.join(&skill_id).join("SKILL.md");
            if let Some(head) = read_skill_head(&skill_id, &p, "user") {
                merged.insert(skill_id.clone(), head);
                ordered.push(skill_id);
            }
        }
    }

    ordered.into_iter().filter_map(|id| merged.remove(&id)).collect()
}

/// 发现某 agent 可用 skill（含 disable 过滤），返回 XML 字符串
pub fn discover_skills_xml_for_agent(agent_id: &str) -> String {
    let skills = discover_skills_for_agent(agent_id);
    format_skills_discovery_xml(&skills)
}

/// 将 skill 列表渲染为 XML 目录（与 Python 端 format_skills_discovery_xml 一致）
pub fn format_skills_discovery_xml(skills: &[SkillHead]) -> String {
    if skills.is_empty() {
        return String::new();
    }
    let mut parts: Vec<String> = Vec::new();
    parts.push("<skills>".to_string());
    for s in skills {
        let path_str = normalize_path(s.skill_md_path.canonicalize()
            .unwrap_or_else(|_| s.skill_md_path.clone()))
            .to_string_lossy()
            .to_string();
        parts.push(format!(
            r#"  <skill id="{}" source="{}">"#,
            xml_text(&s.skill_id),
            xml_text(&s.source),
        ));
        parts.push(format!(r#"    <name>{}</name>"#, xml_text(&s.name)));
        parts.push(format!(r#"    <description>{}</description>"#, xml_text(&s.description)));
        parts.push(format!(r#"    <path>{}</path>"#, xml_text(&path_str)));
        parts.push("  </skill>".to_string());
    }
    parts.push("</skills>".to_string());
    parts.join("\n")
}

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_skill_md_valid() {
        let content = r#"---
name: test-skill
description: A test skill
---

# Skill body here
"#;
        let meta = parse_skill_md(content).expect("should parse");
        assert_eq!(meta.name, "test-skill");
        assert_eq!(meta.description, "A test skill");
    }

    #[test]
    fn test_parse_skill_md_no_frontmatter() {
        let content = "# Just a markdown file\nno frontmatter here";
        assert!(parse_skill_md(content).is_none());
    }

    #[test]
    fn test_parse_skill_md_missing_name() {
        let content = "---\ndescription: only desc\n---\nbody";
        assert!(parse_skill_md(content).is_none());
    }

    #[test]
    fn test_parse_skill_md_quoted_values() {
        let content = r#"---
name: "quoted-name"
description: "quoted desc"
---
"#;
        let meta = parse_skill_md(content).expect("should parse");
        assert_eq!(meta.name, "quoted-name");
        assert_eq!(meta.description, "quoted desc");
    }

    #[test]
    fn test_format_skills_xml_empty() {
        assert_eq!(format_skills_discovery_xml(&[]), "");
    }

    #[test]
    fn test_format_skills_xml_with_items() {
        let skills = vec![
            SkillHead {
                skill_id: "web-search".into(),
                name: "Web Search".into(),
                description: "Search the web".into(),
                source: "bundled".into(),
                skill_md_path: PathBuf::from("/tmp/skills/web-search/SKILL.md"),
            },
        ];
        let xml = format_skills_discovery_xml(&skills);
        assert!(xml.contains("<skills>"));
        assert!(xml.contains(r#"id="web-search""#));
        assert!(xml.contains(r#"source="bundled""#));
        assert!(xml.contains("<name>Web Search</name>"));
        assert!(xml.contains("<description>Search the web</description>"));
        assert!(xml.contains("<path>"));
        assert!(xml.contains("</skill>"));
        assert!(xml.contains("</skills>"));
    }

    #[test]
    fn test_format_skills_xml_escapes_special_chars() {
        let skills = vec![
            SkillHead {
                skill_id: "a&b".into(),
                name: "A < B".into(),
                description: "Use > and <".into(),
                source: "user".into(),
                skill_md_path: PathBuf::new(),
            },
        ];
        let xml = format_skills_discovery_xml(&skills);
        assert!(xml.contains("a&amp;b"));
        assert!(xml.contains("A &lt; B"));
        assert!(xml.contains("&gt;"));
    }
}
