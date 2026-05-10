use std::path::Path;

use async_trait::async_trait;
use once_cell::sync::Lazy;
use serde_json::Value;

use super::base::Tool;

static INVOKE_SKILL_PARAMS: Lazy<Value> = Lazy::new(|| {
    serde_json::json!({
        "type": "object",
        "properties": {
            "skill_id": {
                "type": "string",
                "description": "技能 id，与 <skill id=\"...\"> 相同"
            }
        },
        "required": ["skill_id"]
    })
});

pub struct InvokeSkillTool {
    workspace: String,
    agent_id: String,
}

impl InvokeSkillTool {
    pub fn new(workspace: &str, agent_id: &str) -> Self {
        Self {
            workspace: workspace.to_string(),
            agent_id: agent_id.to_string(),
        }
    }
}

#[async_trait]
impl Tool for InvokeSkillTool {
    fn name(&self) -> &str {
        "invoke_skill"
    }

    fn description(&self) -> &str {
        "加载某个 skill 的完整 SKILL.md 全文（含 YAML 头）。skill_id 须与系统提示词最前 <skills> 目录中某 <skill> 的 id 属性一致；仅可加载当前 Agent 已列出的 skill。"
    }

    fn parameters(&self) -> &Value {
        &INVOKE_SKILL_PARAMS
    }

    async fn execute(&self, params: Value) -> Result<String, String> {
        let skill_id = params
            .get("skill_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Error: missing required parameter 'skill_id'".to_string())?;

        Ok(invoke_skill(&self.workspace, &self.agent_id, skill_id))
    }
}

fn invoke_skill(workspace: &str, _agent_id: &str, skill_id: &str) -> String {
    let sid = skill_id.trim();
    if sid.is_empty() {
        return "Error: skill_id is required".to_string();
    }

    // Look in <workspace>/../skills/<skill_id>/SKILL.md
    let skills_path = Path::new(workspace)
        .parent()
        .unwrap_or(Path::new("."))
        .join("skills")
        .join(sid)
        .join("SKILL.md");

    if skills_path.exists() {
        match std::fs::read_to_string(&skills_path) {
            Ok(content) => content,
            Err(e) => format!("Error reading SKILL.md: {e}"),
        }
    } else {
        format!(
            "Error: unknown or unavailable skill_id '{skill_id}' for this agent. \
             Use an id from the <skills> block in the system prompt."
        )
    }
}
