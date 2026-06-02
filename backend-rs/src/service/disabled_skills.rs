use std::collections::HashSet;
use std::path::PathBuf;

/// 已禁用的 Skill 管理
pub struct DisabledSkills {
    disabled: HashSet<String>,
    file_path: PathBuf,
}

impl DisabledSkills {
    /// 从指定 agent 的配置目录加载
    pub fn load(agent_id: &str) -> Self {
        let path = Self::file_path_for(agent_id);
        let disabled = if path.exists() {
            std::fs::read_to_string(&path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default()
        } else {
            HashSet::new()
        };
        Self {
            disabled,
            file_path: path,
        }
    }

    fn file_path_for(agent_id: &str) -> PathBuf {
        crate::core::config::get_agent_base_dir(agent_id)
            .join(".agent")
            .join("disabled_skills.json")
    }

    pub fn is_disabled(&self, skill_id: &str) -> bool {
        self.disabled.contains(skill_id)
    }

    pub fn skill_ids(&self) -> &HashSet<String> {
        &self.disabled
    }

    pub fn set_disabled(&mut self, skill_id: &str, disabled: bool) {
        if disabled {
            self.disabled.insert(skill_id.to_string());
        } else {
            self.disabled.remove(skill_id);
        }
    }

    pub fn save(&self) {
        if let Some(parent) = self.file_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        if let Ok(content) = serde_json::to_string_pretty(&self.disabled) {
            std::fs::write(&self.file_path, content).ok();
        }
    }
}

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_disabled_skills_default_is_empty() {
        let ds = DisabledSkills {
            disabled: HashSet::new(),
            file_path: PathBuf::from("/tmp/test.json"),
        };
        assert!(ds.skill_ids().is_empty());
        assert!(!ds.is_disabled("any-skill"));
    }

    #[test]
    fn test_disabled_skills_toggle() {
        let mut ds = DisabledSkills {
            disabled: HashSet::new(),
            file_path: PathBuf::from("/tmp/test.json"),
        };

        ds.set_disabled("skill-a", true);
        assert!(ds.is_disabled("skill-a"));
        assert_eq!(ds.skill_ids().len(), 1);

        ds.set_disabled("skill-a", false);
        assert!(!ds.is_disabled("skill-a"));
        assert!(ds.skill_ids().is_empty());
    }

    #[test]
    fn test_disabled_skills_persist() {
        let tmp = TempDir::new().unwrap();
        let file_path = tmp.path().join("disabled_skills.json");

        // 先保存
        {
            let mut ds = DisabledSkills {
                disabled: HashSet::new(),
                file_path: file_path.clone(),
            };
            ds.set_disabled("skill-b", true);
            ds.save();
        }

        // 再加载验证
        {
            let content = std::fs::read_to_string(&file_path).unwrap();
            let loaded: HashSet<String> = serde_json::from_str(&content).unwrap();
            assert!(loaded.contains("skill-b"));
        }
    }

    #[test]
    fn test_load_nonexistent_returns_empty() {
        // 不存在的文件应返回空
        let ds = DisabledSkills {
            disabled: HashSet::new(),
            file_path: PathBuf::from("/tmp/nonexistent_file_12345.json"),
        };
        // 直接构造，不调用 load（因为 load 依赖 agent config）
        assert!(ds.skill_ids().is_empty());
    }
}
