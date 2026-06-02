use std::collections::HashMap;
use std::path::PathBuf;

use async_trait::async_trait;
use once_cell::sync::Lazy;
use serde_json::Value;

use super::base::Tool;

static FILE_STATE_PARAMS: Lazy<Value> = Lazy::new(|| {
    serde_json::json!({
        "type": "object",
        "properties": {
            "path": {
                "type": "string",
                "description": "相对于工作区根目录的文件路径"
            }
        },
        "required": ["path"]
    })
});

/// 追踪文件状态，判断文件是否被修改过
pub struct FileStateTool {
    workspace: String,
    state_file: PathBuf,
}

impl FileStateTool {
    pub fn new(workspace: &str) -> Self {
        let state_file = PathBuf::from(workspace).join(".agent").join("file_states.json");
        Self {
            workspace: workspace.to_string(),
            state_file,
        }
    }

    fn load_states(&self) -> HashMap<String, (u64, u64)> {
        if !self.state_file.exists() {
            return HashMap::new();
        }
        std::fs::read_to_string(&self.state_file)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    fn save_states(&self, states: &HashMap<String, (u64, u64)>) {
        let serializable: HashMap<&String, Vec<u64>> = states
            .iter()
            .map(|(k, (mtime, size))| (k, vec![*mtime, *size]))
            .collect();
        if let Ok(json) = serde_json::to_string(&serializable) {
            if let Some(parent) = self.state_file.parent() {
                std::fs::create_dir_all(parent).ok();
            }
            std::fs::write(&self.state_file, json).ok();
        }
    }
}

#[async_trait]
impl Tool for FileStateTool {
    fn name(&self) -> &str {
        "file_state"
    }

    fn description(&self) -> &str {
        "检查文件状态（mtime + size），判断文件是否被外部修改过。"
    }

    fn parameters(&self) -> &Value {
        &FILE_STATE_PARAMS
    }

    fn read_only(&self) -> bool {
        true
    }

    fn concurrency_safe(&self) -> bool {
        true
    }

    async fn execute(&self, params: Value) -> Result<String, String> {
        let path = params
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Error: missing required parameter 'path'".to_string())?;

        let full_path = crate::tools::filesystem::resolve_under_workspace(&self.workspace, path)?;

        if !full_path.exists() {
            return Ok(format!("File does not exist: {path}"));
        }

        let metadata = std::fs::metadata(&full_path)
            .map_err(|e| format!("Error reading file metadata: {e}"))?;

        let current_mtime = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let current_size = metadata.len();

        let states = self.load_states();
        let last_state = states.get(path);

        let changed = match last_state {
            Some(&(last_mtime, last_size)) => current_mtime != last_mtime || current_size != last_size,
            None => true, // 首次检查视为已变更
        };

        // 保存当前状态
        let mut new_states = states;
        new_states.insert(path.to_string(), (current_mtime, current_size));
        self.save_states(&new_states);

        Ok(serde_json::json!({
            "path": path,
            "changed": changed,
            "mtime": current_mtime,
            "size": current_size,
        })
        .to_string())
    }
}
