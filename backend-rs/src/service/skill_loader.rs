use std::path::{Path, PathBuf};

use crate::service::disabled_skills::DisabledSkills;

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

/// 将 skill 列表渲染为 XML 目录
pub fn format_skills_discovery_xml(skills: &[SkillHead]) -> String {
    if skills.is_empty() {
        return String::new();
    }
    let mut parts: Vec<String> = Vec::new();
    parts.push("<skills>".to_string());
    for s in skills {
        parts.push(format!(
            r#"  <skill id="{}" name="{}" description="{}" source="{}" />"#,
            xml_text(&s.skill_id),
            xml_text(&s.name),
            xml_text(&s.description),
            xml_text(&s.source),
        ));
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
        assert!(xml.contains(r#"name="Web Search""#));
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
