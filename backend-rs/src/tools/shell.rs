use std::path::{Path, PathBuf};
use std::time::Duration;

use async_trait::async_trait;
use once_cell::sync::Lazy;
use regex::Regex;
use serde_json::Value;

use super::base::Tool;

const MAX_OUTPUT: usize = 10_000;

/// 解码命令输出：优先 UTF-8，非 UTF-8 时尝试 GBK（Windows 默认编码）
fn decode_command_output(bytes: &[u8]) -> String {
    if let Ok(s) = std::str::from_utf8(bytes) {
        return s.to_owned();
    }
    // 不是合法 UTF-8，可能是 Windows 系统编码（GBK/CP936 等）
    decode_non_utf8(bytes)
}

#[cfg(target_os = "windows")]
fn decode_non_utf8(bytes: &[u8]) -> String {
    use encoding_rs::GBK;
    let (decoded, _, _) = GBK.decode(bytes);
    decoded.into_owned()
}

#[cfg(not(target_os = "windows"))]
fn decode_non_utf8(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).into_owned()
}

const MAX_TIMEOUT: u64 = 600;

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

            // 1. 优先查用户 skill 目录（data/u_<uid>/data/<agent>/.agent/skills/<name>/）
            let user_dir = ws.join(".agent").join("skills").join(name);
            if user_dir.exists() {
                return Ok(crate::utils::helpers::normalize_path(
                    user_dir
                        .canonicalize()
                        .map_err(|e| format!("Error: {e}"))?,
                ));
            }

            // 2. fallback 到 bundled skills（config/agents/skills/<name>/）
            let bundled_dir = crate::core::config::get_config_dir()
                .join("agents")
                .join("skills")
                .join(name);
            if bundled_dir.exists() {
                return Ok(crate::utils::helpers::normalize_path(
                    bundled_dir
                        .canonicalize()
                        .map_err(|e| format!("Error: {e}"))?,
                ));
            }

            Err(format!(
                "Error: Skills directory not found for '{}' (tried user: {}, bundled: {})",
                name,
                user_dir.display(),
                bundled_dir.display()
            ))
        }
        _ => Ok(crate::utils::helpers::normalize_path(
            ws.canonicalize().map_err(|e| format!("Error: {e}"))?,
        )),
    }
}

// ============================================================
// Python 执行后端 —— 条件编译二选一
// ============================================================

/// Python 命令执行后端
enum PythonBackend {
    #[cfg(feature = "embedded-python")]
    Embedded(pyo3_backend::PyO3Runtime),
    #[cfg(not(feature = "embedded-python"))]
    System(subprocess_backend::SubprocessPython),
}

// ── PyO3 嵌入式解释器（仅 embedded-python feature） ─────────
#[cfg(feature = "embedded-python")]
mod pyo3_backend {
    use std::ffi::CString;
    use std::path::Path;

    use pyo3::prelude::*;
    use pyo3::types::PyAnyMethods;
    use pyo3::types::PyModule;

    pub struct PyO3Runtime {
        pub user_site: std::path::PathBuf,
    }

    impl PyO3Runtime {
        pub fn new(python_home: &Path) -> Result<Self, String> {
            std::env::set_var("PYTHONHOME", python_home);

            let omniage_root = std::env::var("OMNIAGE_ROOT")
                .map_err(|_| "OMNIAGE_ROOT not set".to_string())?;
            let user_site = std::path::PathBuf::from(&omniage_root)
                .join("data")
                .join("user-site-packages");
            std::fs::create_dir_all(&user_site).map_err(|e| e.to_string())?;

            tracing::info!("PyO3 runtime initialized, user-site-packages at {:?}", user_site);
            Ok(Self { user_site })
        }

        pub fn run_script(&self, code: &str) -> Result<String, String> {
            Python::with_gil(|py| {
                // 1. 注入 sys.path（确保 user-site-packages 可被 import）
                let setup = format!(
                    "import sys\nuser_site=r'{}'\nif user_site not in sys.path:\n    sys.path.insert(0, user_site)",
                    self.user_site.to_string_lossy()
                );
                let c_setup = CString::new(setup).map_err(|e| format!("CString error: {e}"))?;
                py.run(&c_setup, None, None)
                    .map_err(|e| format!("Python sys.path setup error: {e}"))?;

                // 2. 从 PyO3 预置模块获取 io 和 sys
                let io: Bound<'_, PyModule> = py.import("io")
                    .map_err(|e| format!("Cannot import io: {e}"))?;
                let sys: Bound<'_, PyModule> = py.import("sys")
                    .map_err(|e| format!("Cannot import sys: {e}"))?;

                // 3. 保存原始 stdout，创建 StringIO 缓冲区并替换 sys.stdout
                let original_stdout = sys.getattr("stdout")
                    .map_err(|e| format!("Cannot get original sys.stdout: {e}"))?;
                let buffer = io.call_method0("StringIO")
                    .map_err(|e| format!("Cannot create StringIO: {e}"))?;
                sys.setattr("stdout", &buffer)
                    .map_err(|e| format!("Cannot set sys.stdout: {e}"))?;

                // 4. 执行用户代码（无论成功或失败，finally 恢复 stdout）
                let result = (|| -> Result<String, String> {
                    let c_code = CString::new(code).map_err(|e| format!("CString error: {e}"))?;
                    py.run(&c_code, None, None)
                        .map_err(|e| format!("Python error:\n{e}"))?;

                    // 5. 获取捕获的输出
                    let stdout_obj = sys.getattr("stdout")
                        .map_err(|e| format!("Cannot get sys.stdout: {e}"))?;
                    let output = stdout_obj.call_method0("getvalue")
                        .map_err(|e| format!("Cannot get StringIO value: {e}"))?;
                    Ok(output.extract::<String>().unwrap_or_default())
                })();

                // 6. 恢复原始 stdout
                let _ = sys.setattr("stdout", &original_stdout);

                result
            })
        }

        pub fn run_file(&self, path: &Path) -> Result<String, String> {
            let code =
                std::fs::read_to_string(path).map_err(|e| format!("Cannot read script: {e}"))?;
            self.run_script(&code)
        }
    }
}

// ── 系统 Python 子进程（默认，非 embedded-python） ──────────
#[cfg(not(feature = "embedded-python"))]
mod subprocess_backend {
    use std::path::Path;

    pub struct SubprocessPython;

    impl SubprocessPython {
        pub fn new() -> Self {
            Self
        }

        pub async fn run_script(&self, code: &str) -> Result<String, String> {
            let output = tokio::process::Command::new("python3")
                .arg("-c")
                .arg(code)
                .output()
                .await
                .map_err(|e| format!("Failed to run python3: {e}"))?;

            Ok(super::format_command_output(
                &output.stdout,
                &output.stderr,
                output.status.code().unwrap_or(-1),
            ))
        }

        pub async fn run_file(&self, path: &Path) -> Result<String, String> {
            let output = tokio::process::Command::new("python3")
                .arg(path)
                .output()
                .await
                .map_err(|e| format!("Failed to run python3: {e}"))?;

            Ok(super::format_command_output(
                &output.stdout,
                &output.stderr,
                output.status.code().unwrap_or(-1),
            ))
        }
    }
}

// ============================================================
// 命令分类
// ============================================================

/// 命令类型分类
enum CommandCategory {
    /// pip install / pip list 等 → 走 subprocess（用 bundle 或系统 Python）
    Pip,
    /// python -c 'code' → 用 Python 后端执行
    PythonInline(String),
    /// python script.py → 用 Python 后端读取文件执行
    PythonFile(PathBuf),
    /// 其他 shell 命令 → 原有 subprocess 路径
    Shell(String),
}

/// 从命令字符串中分类并提取 Python 代码
fn classify_command(command: &str) -> CommandCategory {
    let trimmed = command.trim();

    // pip 操作
    if trimmed.starts_with("pip ")
        || trimmed.starts_with("pip3 ")
        || trimmed.contains("python -m pip ")
        || trimmed.contains("python3 -m pip ")
    {
        return CommandCategory::Pip;
    }

    // python -c 'code'
    if let Some(code) = trimmed
        .strip_prefix("python3 -c ")
        .or_else(|| trimmed.strip_prefix("python -c "))
    {
        return CommandCategory::PythonInline(
            code.trim_matches('\'').trim_matches('"').to_string(),
        );
    }

    // python script.py
    if let Some(path_str) = trimmed
        .strip_prefix("python3 ")
        .or_else(|| trimmed.strip_prefix("python "))
    {
        let path = PathBuf::from(path_str.trim());
        if path.extension().is_some_and(|e| e == "py") {
            return CommandCategory::PythonFile(path);
        }
    }

    CommandCategory::Shell(trimmed.to_string())
}

// ============================================================
// 共享的输出格式化（RunCommandTool + subprocess_backend 共用）
// ============================================================

/// 格式化命令的标准输出/标准错误/退出码，统一截断逻辑
fn format_command_output(stdout: &[u8], stderr: &[u8], exit_code: i32) -> String {
    let stdout_str = decode_command_output(stdout);
    let stderr_str = decode_command_output(stderr);

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

    // Truncate if too long, using char-boundary-safe slicing
    if result.len() > MAX_OUTPUT {
        let half = MAX_OUTPUT / 2;
        let head_end = (0..=half)
            .rev()
            .find(|&i| result.is_char_boundary(i))
            .unwrap_or(0);
        let tail_start = (result.len() - half..result.len())
            .find(|&i| result.is_char_boundary(i))
            .unwrap_or(result.len());

        result = format!(
            "{}\n... ({} bytes truncated) ...\n{}",
            &result[..head_end],
            result.len() - MAX_OUTPUT,
            &result[tail_start..],
        );
    }

    result
}

// ============================================================
// RunCommandTool
// ============================================================

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
            },
            "timeout": {
                "type": "integer",
                "description": "超时时间（秒），最长 600 秒",
                "minimum": 1,
                "maximum": 600
            }
        },
        "required": ["command"]
    })
});

pub struct RunCommandTool {
    workspace: String,
    timeout_secs: u64,
    /// Python 执行后端（None = 不可用）
    python_backend: Option<PythonBackend>,
}

impl RunCommandTool {
    pub fn new(workspace: &str, timeout_secs: u64) -> Self {
        let python_backend = Self::init_python_backend();
        Self {
            workspace: workspace.to_string(),
            timeout_secs: timeout_secs.min(MAX_TIMEOUT),
            python_backend,
        }
    }

    /// 根据编译 feature 和运行时环境初始化 Python 后端
    fn init_python_backend() -> Option<PythonBackend> {
        #[cfg(feature = "embedded-python")]
        {
            // Tauri 场景：从 OMNIAGE_ROOT 查找 bundle Python
            if let Ok(python_home) = std::env::var("PYTHONHOME") {
                let path = std::path::PathBuf::from(&python_home);
                if path.exists() {
                    match pyo3_backend::PyO3Runtime::new(&path) {
                        Ok(runtime) => {
                            tracing::info!("PyO3 embedded Python initialized");
                            return Some(PythonBackend::Embedded(runtime));
                        }
                        Err(e) => tracing::warn!("PyO3 init failed: {e}"),
                    }
                }
            }
            tracing::warn!("PYTHONHOME not set or bundle not found — Python skills disabled");
            None
        }
        #[cfg(not(feature = "embedded-python"))]
        {
            // Server 场景：检查系统 python3 是否可用
            let has_python = std::process::Command::new("python3")
                .arg("--version")
                .output()
                .ok()
                .and_then(|o| {
                    if o.status.success() {
                        Some(())
                    } else {
                        None
                    }
                })
                .is_some();
            if has_python {
                tracing::info!("System python3 detected");
                Some(PythonBackend::System(subprocess_backend::SubprocessPython::new()))
            } else {
                tracing::warn!("python3 not found in PATH — Python skills disabled");
                None
            }
        }
    }

    /// 构建最小环境变量，支持 bundle Python PATH 注入
    fn build_env(&self, workspace: &str, cwd: &Path, use_skills_cwd: bool) -> Vec<(String, String)> {
        let ws = std::path::PathBuf::from(workspace);

        let agent_skills = if use_skills_cwd {
            cwd.to_string_lossy().to_string()
        } else {
            String::new()
        };

        // mut 在 embedded-python feature 下需要（push PATH），
        // 无 feature 时 push 被编译掉，加 allow 消除警告
        #[allow(unused_mut)]
        let mut env = vec![
            ("AGENT_WORKSPACE".to_string(), ws.to_string_lossy().to_string()),
            ("AGENT_SKILLS".to_string(), agent_skills),
        ];

        // 注入 bundle Python PATH（仅 embedded-python 场景，Tauri 桌面端）
        #[cfg(feature = "embedded-python")]
        if let Ok(root) = std::env::var("OMNIAGE_ROOT") {
            let bundle_bin = std::path::PathBuf::from(&root)
                .join("resources").join("python").join("bin");
            if bundle_bin.exists() {
                let existing_path = std::env::var("PATH").unwrap_or_default();
                let separator = if cfg!(target_os = "windows") { ";" } else { ":" };
                env.push(("PATH".to_string(), format!("{}{}{}", bundle_bin.display(), separator, existing_path)));
            }
        }

        env
    }

    async fn run_shell_command(
        &self,
        command: &str,
        cwd: &Path,
        timeout_secs: u64,
    ) -> Result<String, String> {
        let env = self.build_env(&self.workspace, cwd, false);

        if cfg!(target_os = "windows") {
            self.run_cmd(command, cwd, &env, timeout_secs).await
        } else {
            self.run_bash(command, cwd, &env, timeout_secs).await
        }
    }

    async fn run_cmd(
        &self,
        command: &str,
        cwd: &Path,
        env: &[(String, String)],
        timeout_secs: u64,
    ) -> Result<String, String> {
        let comspec = std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string());
        let mut cmd = tokio::process::Command::new(&comspec);
        cmd.arg("/c").arg(command);
        cmd.current_dir(cwd);
        for (k, v) in env {
            cmd.env(k, v);
        }

        let output = tokio::time::timeout(Duration::from_secs(timeout_secs), cmd.output())
            .await
            .map_err(|_| {
                format!(
                    "Error: Command timed out after {} seconds",
                    timeout_secs
                )
            })?
            .map_err(|e| format!("Error executing command: {e}"))?;

        Ok(format_command_output(
            &output.stdout,
            &output.stderr,
            output.status.code().unwrap_or(-1),
        ))
    }

    async fn run_bash(
        &self,
        command: &str,
        cwd: &Path,
        env: &[(String, String)],
        timeout_secs: u64,
    ) -> Result<String, String> {
        let mut cmd = tokio::process::Command::new("bash");
        cmd.arg("-c").arg(command);
        cmd.current_dir(cwd);
        for (k, v) in env {
            cmd.env(k, v);
        }

        let output = tokio::time::timeout(Duration::from_secs(timeout_secs), cmd.output())
            .await
            .map_err(|_| {
                format!(
                    "Error: Command timed out after {} seconds",
                    timeout_secs
                )
            })?
            .map_err(|e| format!("Error executing command: {e}"))?;

        Ok(format_command_output(
            &output.stdout,
            &output.stderr,
            output.status.code().unwrap_or(-1),
        ))
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

        let skill_name = params.get("skill_name").and_then(|v| v.as_str()).unwrap_or("");

        let effective_timeout = params
            .get("timeout")
            .and_then(|v| v.as_u64())
            .map(|t| t.min(MAX_TIMEOUT))
            .unwrap_or(self.timeout_secs);

        // 安全守卫
        if is_blocked(command) {
            return Ok(
                "Error: Command blocked by safety guard (dangerous pattern detected)".to_string(),
            );
        }

        // 解析工作目录
        let run_cwd = resolve_run_cwd(&self.workspace, cwd_mode, skill_name)?;

        // 命令分类与分发
        match classify_command(command) {
            CommandCategory::Pip => {
                // pip 操作：直接走 subprocess（env 已由 build_env 注入 bundle PATH）
                self.run_shell_command(command, &run_cwd, effective_timeout)
                    .await
            }
            CommandCategory::PythonInline(code) => match &self.python_backend {
                #[cfg(feature = "embedded-python")]
                Some(PythonBackend::Embedded(runtime)) => {
                    // 将同步 GIL 操作移出 Tokio 异步上下文，防止阻塞 worker 线程
                    let code = code.clone();
                    let user_site = runtime.user_site.clone();
                    tokio::task::spawn_blocking(move || {
                        let rt = pyo3_backend::PyO3Runtime { user_site };
                        rt.run_script(&code)
                    })
                    .await
                    .map_err(|e| format!("Spawn blocking error: {e}"))?
                }
                #[cfg(not(feature = "embedded-python"))]
                Some(PythonBackend::System(runtime)) => runtime.run_script(&code).await,
                None => Ok(
                    "Error: Python backend not available. For desktop app, ensure Python bundle is included. For server, install python3."
                        .to_string(),
                ),
            },
            CommandCategory::PythonFile(path) => match &self.python_backend {
                #[cfg(feature = "embedded-python")]
                Some(PythonBackend::Embedded(runtime)) => {
                    let path = path.clone();
                    let user_site = runtime.user_site.clone();
                    tokio::task::spawn_blocking(move || {
                        let rt = pyo3_backend::PyO3Runtime { user_site };
                        rt.run_file(&path)
                    })
                    .await
                    .map_err(|e| format!("Spawn blocking error: {e}"))?
                }
                #[cfg(not(feature = "embedded-python"))]
                Some(PythonBackend::System(runtime)) => runtime.run_file(&path).await,
                None => Ok(
                    "Error: Python backend not available. For desktop app, ensure Python bundle is included. For server, install python3."
                        .to_string(),
                ),
            },
            CommandCategory::Shell(cmd) => {
                self.run_shell_command(&cmd, &run_cwd, effective_timeout)
                    .await
            }
        }
    }
}
