use std::path::PathBuf;
use std::time::Duration;

use async_trait::async_trait;
use once_cell::sync::Lazy;
use regex::Regex;
use serde_json::Value;

use super::base::Tool;

const MAX_OUTPUT: usize = 10_000;

static DENY_PATTERNS: Lazy<Vec<Regex>> = Lazy::new(|| {
    vec![
        Regex::new(r"\brm\s+-[rf]{1,2}\b").unwrap(),
        Regex::new(r"\bdel\s+/[fq]\b").unwrap(),
        Regex::new(r"\brmdir\s+/s\b").unwrap(),
        Regex::new(r"(?:^|[;&|]\s*)format\b").unwrap(),
        Regex::new(r"\b(mkfs|diskpart)\b").unwrap(),
        Regex::new(r"\bdd\s+if=").unwrap(),
        Regex::new(r">\s*/dev/sd").unwrap(),
        Regex::new(r"\b(shutdown|reboot|poweroff)\b").unwrap(),
        Regex::new(r":\(\)\s*\{.*\};\s*:").unwrap(),
    ]
});

fn is_blocked(command: &str) -> bool {
    let lower = command.trim().to_lowercase();
    DENY_PATTERNS.iter().any(|p| p.is_match(&lower))
}

fn resolve_run_cwd(workspace: &str, cwd_mode: &str, skill_name: &str) -> Result<PathBuf, String> {
    let ws = PathBuf::from(workspace);
    match cwd_mode {
        "skills" => {
            let name = skill_name.trim();
            if name.is_empty() {
                return Err("Error: skill_name is required when cwd=skills".to_string());
            }
            let skills_dir = ws
                .parent()
                .ok_or_else(|| "Error: cannot resolve parent of workspace".to_string())?
                .join("skills")
                .join(name);
            if !skills_dir.exists() {
                return Err(format!("Error: Skills directory not found: {}", skills_dir.display()));
            }
            Ok(crate::utils::helpers::normalize_path(
                skills_dir.canonicalize().map_err(|e| format!("Error: {e}"))?,
            ))
        }
        _ => Ok(crate::utils::helpers::normalize_path(
            ws.canonicalize().map_err(|e| format!("Error: {e}"))?,
        )),
    }
}

fn build_env(workspace: &str, cwd: &PathBuf, use_skills_cwd: bool) -> Vec<(String, String)> {
    let ws = PathBuf::from(workspace);
    let skills_dir = ws
        .parent()
        .map(|p| p.join("skills"))
        .unwrap_or_else(|| PathBuf::from("skills"));

    let agent_skills = if use_skills_cwd {
        cwd.to_string_lossy().to_string()
    } else {
        skills_dir.to_string_lossy().to_string()
    };

    vec![
        ("AGENT_WORKSPACE".to_string(), ws.to_string_lossy().to_string()),
        ("AGENT_SKILLS".to_string(), agent_skills),
    ]
}

static RUN_COMMAND_PARAMS: Lazy<Value> = Lazy::new(|| {
    serde_json::json!({
        "type": "object",
        "properties": {
            "command": {
                "type": "string",
                "description": "要执行的 shell 命令"
            },
            "cwd": {
                "type": "string",
                "enum": ["workspace", "skills"],
                "default": "workspace",
                "description": "命令工作目录：workspace(默认) | skills"
            },
            "skill_name": {
                "type": "string",
                "description": "当 cwd=skills 时，指定技能目录名"
            }
        },
        "required": ["command"]
    })
});

pub struct RunCommandTool {
    workspace: String,
    timeout_secs: u64,
}

impl RunCommandTool {
    pub fn new(workspace: &str, timeout_secs: u64) -> Self {
        Self {
            workspace: workspace.to_string(),
            timeout_secs,
        }
    }
}

#[async_trait]
impl Tool for RunCommandTool {
    fn name(&self) -> &str {
        "run_command"
    }

    fn description(&self) -> &str {
        "执行 shell 命令（如 ls、python script.py）。可选 cwd: workspace|skills。当 cwd=skills 时需提供 skill_name。命令可使用环境变量 AGENT_WORKSPACE、AGENT_SKILLS。"
    }

    fn parameters(&self) -> &Value {
        &RUN_COMMAND_PARAMS
    }

    fn concurrency_safe(&self) -> bool {
        false
    }

    async fn execute(&self, params: Value) -> Result<String, String> {
        let command = params
            .get("command")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Error: missing required parameter 'command'".to_string())?;

        let cwd_mode = params
            .get("cwd")
            .and_then(|v| v.as_str())
            .unwrap_or("workspace");

        let skill_name = params
            .get("skill_name")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        // Safety guard
        if is_blocked(command) {
            return Ok("Error: Command blocked by safety guard (dangerous pattern detected)".to_string());
        }

        // Resolve working directory
        let run_cwd = resolve_run_cwd(&self.workspace, cwd_mode, skill_name)?;
        let use_skills = cwd_mode == "skills";
        let env = build_env(&self.workspace, &run_cwd, use_skills);

        if cfg!(target_os = "windows") {
            self.run_cmd(command, &run_cwd, &env).await
        } else {
            self.run_bash(command, &run_cwd, &env).await
        }
    }
}

impl RunCommandTool {
    async fn run_cmd(&self, command: &str, cwd: &PathBuf, env: &[(String, String)]) -> Result<String, String> {
        let comspec = std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string());
        let mut cmd = tokio::process::Command::new(&comspec);
        cmd.arg("/c").arg(command);
        cmd.current_dir(cwd);
        for (k, v) in env {
            cmd.env(k, v);
        }

        let output = tokio::time::timeout(Duration::from_secs(self.timeout_secs), cmd.output())
            .await
            .map_err(|_| format!("Error: Command timed out after {} seconds", self.timeout_secs))?
            .map_err(|e| format!("Error executing command: {e}"))?;

        Ok(self.format_output(&output.stdout, &output.stderr, output.status.code().unwrap_or(-1)))
    }

    async fn run_bash(&self, command: &str, cwd: &PathBuf, env: &[(String, String)]) -> Result<String, String> {
        let mut cmd = tokio::process::Command::new("bash");
        cmd.arg("-c").arg(command);
        cmd.current_dir(cwd);
        for (k, v) in env {
            cmd.env(k, v);
        }

        let output = tokio::time::timeout(Duration::from_secs(self.timeout_secs), cmd.output())
            .await
            .map_err(|_| format!("Error: Command timed out after {} seconds", self.timeout_secs))?
            .map_err(|e| format!("Error executing command: {e}"))?;

        Ok(self.format_output(&output.stdout, &output.stderr, output.status.code().unwrap_or(-1)))
    }

    fn format_output(&self, stdout: &[u8], stderr: &[u8], exit_code: i32) -> String {
        let stdout_str = String::from_utf8_lossy(stdout);
        let stderr_str = String::from_utf8_lossy(stderr);

        let mut parts: Vec<String> = Vec::new();
        if !stdout_str.is_empty() {
            parts.push(stdout_str.to_string());
        }
        if !stderr_str.trim().is_empty() {
            parts.push(format!("[stderr]\n{}", stderr_str));
        }
        parts.push(format!("\nExit code: {exit_code}"));

        let mut result = if parts.is_empty() {
            "(no output)".to_string()
        } else {
            parts.join("\n")
        };

        // Truncate if too long
        if result.len() > MAX_OUTPUT {
            let half = MAX_OUTPUT / 2;
            result = format!(
                "{}\n... ({} chars truncated) ...\n{}",
                &result[..half],
                result.len() - MAX_OUTPUT,
                &result[result.len() - half..],
            );
        }

        result
    }
}
