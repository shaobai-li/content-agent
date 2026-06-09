use std::path::PathBuf;

use async_trait::async_trait;
use once_cell::sync::Lazy;
use serde_json::Value;

use super::base::Tool;

pub fn resolve_under_workspace(workspace: &str, rel_path: &str) -> Result<PathBuf, String> {
    let root = crate::utils::helpers::normalize_path(
        std::path::Path::new(workspace)
            .canonicalize()
            .map_err(|e| format!("Error: cannot resolve workspace path: {e}"))?,
    );

    let full = root.join(rel_path);
    let full = if full.exists() {
        crate::utils::helpers::normalize_path(
            full.canonicalize()
                .map_err(|e| format!("Error: cannot resolve path: {e}"))?,
        )
    } else {
        let parent = full
            .parent()
            .map(|p| p.canonicalize().map(crate::utils::helpers::normalize_path))
            .transpose()
            .map_err(|e| format!("Error: cannot resolve parent path: {e}"))?
            .unwrap_or_else(|| root.clone());
        let filename = full
            .file_name()
            .ok_or_else(|| "Error: invalid path".to_string())?;
        parent.join(filename)
    };

    if !full.starts_with(&root) {
        return Err("Error: Path outside workspace not allowed".to_string());
    }
    Ok(full)
}

static READ_FILE_PARAMS: Lazy<Value> = Lazy::new(|| {
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

static WRITE_FILE_PARAMS: Lazy<Value> = Lazy::new(|| {
    serde_json::json!({
        "type": "object",
        "properties": {
            "path": {
                "type": "string",
                "description": "相对于工作区根目录的文件路径"
            },
            "content": {
                "type": "string",
                "description": "要写入的文本内容"
            }
        },
        "required": ["path", "content"]
    })
});

pub struct ReadFileTool {
    workspace: String,
}

impl ReadFileTool {
    pub fn new(workspace: &str) -> Self {
        Self {
            workspace: workspace.to_string(),
        }
    }
}

#[async_trait]
impl Tool for ReadFileTool {
    fn name(&self) -> &str {
        "read_file"
    }

    fn description(&self) -> &str {
        "读取文本文件内容。path 为相对于工作区根目录的相对路径。"
    }

    fn parameters(&self) -> &Value {
        &READ_FILE_PARAMS
    }

    fn read_only(&self) -> bool {
        true
    }

    async fn execute(&self, params: Value) -> Result<String, String> {
        let path = params
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Error: missing required parameter 'path'".to_string())?;

        let file_path = resolve_under_workspace(&self.workspace, path)?;

        if !file_path.exists() {
            return Ok(format!("Error: File {path} does not exist"));
        }

        match std::fs::read_to_string(&file_path) {
            Ok(content) => Ok(content),
            Err(e) => Ok(format!("Error reading file: {e}")),
        }
    }
}

pub struct WriteFileTool {
    workspace: String,
}

impl WriteFileTool {
    pub fn new(workspace: &str) -> Self {
        Self {
            workspace: workspace.to_string(),
        }
    }
}

#[async_trait]
impl Tool for WriteFileTool {
    fn name(&self) -> &str {
        "write_file"
    }

    fn description(&self) -> &str {
        "写入文本文件（按需创建父目录）。path 为相对于工作区根目录的相对路径。"
    }

    fn parameters(&self) -> &Value {
        &WRITE_FILE_PARAMS
    }

    async fn execute(&self, params: Value) -> Result<String, String> {
        let path = params
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Error: missing required parameter 'path'".to_string())?;

        let content = params
            .get("content")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Error: missing required parameter 'content'".to_string())?;

        let file_path = resolve_under_workspace(&self.workspace, path)?;

        if let Some(parent) = file_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Error creating directories: {e}"))?;
        }

        match std::fs::write(&file_path, content) {
            Ok(()) => Ok(format!("Successfully wrote to {path}")),
            Err(e) => Ok(format!("Error writing file: {e}")),
        }
    }
}

// ── EditFileTool ─────────────────────────────────────────────────────

static EDIT_FILE_PARAMS: Lazy<Value> = Lazy::new(|| {
    serde_json::json!({
        "type": "object",
        "properties": {
            "file_path": {
                "type": "string",
                "description": "相对于工作区根目录的文件路径"
            },
            "old_text": {
                "type": "string",
                "description": "要被替换的字符串（文件内必须唯一匹配）"
            },
            "new_text": {
                "type": "string",
                "description": "替换后的字符串"
            },
            "partial_line": {
                "type": "boolean",
                "description": "是否允许部分行匹配（默认 false）"
            }
        },
        "required": ["file_path", "old_text", "new_text"]
    })
});

pub struct EditFileTool {
    workspace: String,
}

impl EditFileTool {
    pub fn new(workspace: &str) -> Self {
        Self {
            workspace: workspace.to_string(),
        }
    }
}

#[async_trait]
impl Tool for EditFileTool {
    fn name(&self) -> &str {
        "edit_file"
    }

    fn description(&self) -> &str {
        "编辑文件：用新字符串替换旧字符串。支持精确匹配和部分行匹配。"
    }

    fn parameters(&self) -> &Value {
        &EDIT_FILE_PARAMS
    }

    async fn execute(&self, params: Value) -> Result<String, String> {
        let file_path = params
            .get("file_path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Error: missing required parameter 'file_path'".to_string())?;

        let old_text = params
            .get("old_text")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Error: missing required parameter 'old_text'".to_string())?;

        let new_text = params
            .get("new_text")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Error: missing required parameter 'new_text'".to_string())?;

        let partial_line = params
            .get("partial_line")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let full_path = resolve_under_workspace(&self.workspace, file_path)?;

        if !full_path.exists() {
            return Ok(format!("Error: File {file_path} does not exist"));
        }

        let content =
            std::fs::read_to_string(&full_path).map_err(|e| format!("Error reading file: {e}"))?;

        // 归一化 CRLF → LF，记录原始格式用于写回时还原
        let has_crlf = content.contains("\r\n");
        let content = content.replace("\r\n", "\n");

        if partial_line {
            // 部分行匹配：逐行查找包含 old_text 的行，必须唯一
            let lines: Vec<&str> = content.split('\n').collect();
            let mut matched_line_idx = None;

            for (i, line) in lines.iter().enumerate() {
                if line.contains(old_text) {
                    if matched_line_idx.is_some() {
                        return Ok(
                            "Error: old_text matched multiple lines. \
                             Please provide a more unique string."
                                .to_string(),
                        );
                    }
                    matched_line_idx = Some(i);
                }
            }

            match matched_line_idx {
                None => Ok(format!(
                    "Error: old_text not found in any line. old_text: {old_text}"
                )),
                Some(idx) => {
                    let new_lines: Vec<String> = lines
                        .iter()
                        .enumerate()
                        .map(|(i, line)| {
                            if i == idx {
                                line.replace(old_text, new_text)
                            } else {
                                line.to_string()
                            }
                        })
                        .collect();
                    let new_content = new_lines.join("\n");
                    let write_content = if has_crlf {
                        new_content.replace("\n", "\r\n")
                    } else {
                        new_content
                    };
                    std::fs::write(&full_path, &write_content)
                        .map_err(|e| format!("Error writing file: {e}"))?;
                    Ok(format!(
                        "Successfully edited file {file_path}. Replaced 1 occurrence."
                    ))
                }
            }
        } else {
            // 精确匹配：在整个文件内容中查找 old_text，必须恰好出现一次
            let count = content.matches(old_text).count();
            if count == 0 {
                return Ok(format!(
                    "Error: old_text not found in file. old_text: {old_text}"
                ));
            }
            if count > 1 {
                return Ok(format!(
                    "Error: old_text matched {count} times. \
                     Please provide a more unique string."
                ));
            }

            let new_content = content.replace(old_text, new_text);
            let write_content = if has_crlf {
                new_content.replace("\n", "\r\n")
            } else {
                new_content
            };
            std::fs::write(&full_path, &write_content)
                .map_err(|e| format!("Error writing file: {e}"))?;
            Ok(format!(
                "Successfully edited file {file_path}. Replaced 1 occurrence."
            ))
        }
    }
}

// ── ListDirTool ──────────────────────────────────────────────────────

static LIST_DIR_PARAMS: Lazy<Value> = Lazy::new(|| {
    serde_json::json!({
        "type": "object",
        "properties": {
            "path": {
                "type": "string",
                "description": "相对于工作区根目录的目录路径"
            }
        },
        "required": ["path"]
    })
});

pub struct ListDirTool {
    workspace: String,
}

impl ListDirTool {
    pub fn new(workspace: &str) -> Self {
        Self {
            workspace: workspace.to_string(),
        }
    }
}

#[async_trait]
impl Tool for ListDirTool {
    fn name(&self) -> &str {
        "list_dir"
    }

    fn description(&self) -> &str {
        "列出目录内容。返回格式化的文件/目录列表，目录在前，文件在后。"
    }

    fn parameters(&self) -> &Value {
        &LIST_DIR_PARAMS
    }

    async fn execute(&self, params: Value) -> Result<String, String> {
        let path = params
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Error: missing required parameter 'path'".to_string())?;

        let full_path = resolve_under_workspace(&self.workspace, path)?;

        if !full_path.exists() {
            return Ok(format!("Error: Path {path} does not exist"));
        }

        if !full_path.is_dir() {
            return Ok(format!("Error: {path} is not a directory"));
        }

        let mut entries: Vec<_> = std::fs::read_dir(&full_path)
            .map_err(|e| format!("Error reading directory: {e}"))?
            .filter_map(|e| e.ok())
            .collect();

        // 排序：目录在前，文件在后，按名称字母序
        entries.sort_by(|a, b| {
            let a_is_dir = a.file_type().map(|t| t.is_dir()).unwrap_or(false);
            let b_is_dir = b.file_type().map(|t| t.is_dir()).unwrap_or(false);

            if a_is_dir != b_is_dir {
                b_is_dir.cmp(&a_is_dir) // 目录在前
            } else {
                a.file_name().cmp(&b.file_name())
            }
        });

        let mut output: Vec<String> = Vec::new();
        for entry in &entries {
            let name = entry.file_name().to_string_lossy().to_string();
            if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                output.push(format!("[DIR] {name}"));
            } else {
                let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                output.push(format!("[FILE] {name} {size}"));
            }
        }

        if output.is_empty() {
            return Ok("(empty directory)".to_string());
        }

        Ok(output.join("\n"))
    }
}

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn setup_workspace() -> (TempDir, String) {
        let dir = TempDir::new().unwrap();
        let workspace = dir.path().to_string_lossy().to_string();
        (dir, workspace)
    }

    #[tokio::test]
    async fn test_edit_file_exact_match() {
        let (_tmp, workspace) = setup_workspace();
        let file_path = "test_edit.txt";
        let full_path = std::path::Path::new(&workspace).join(file_path);

        fs::write(&full_path, "Hello, world!\nThis is a test.\nGoodbye!").unwrap();

        let tool = EditFileTool::new(&workspace);
        let params = serde_json::json!({
            "file_path": file_path,
            "old_text": "world",
            "new_text": "Rust"
        });

        let result = tool.execute(params).await.unwrap();
        assert!(result.contains("Successfully edited"));

        let content = fs::read_to_string(&full_path).unwrap();
        assert_eq!(content, "Hello, Rust!\nThis is a test.\nGoodbye!");
    }

    #[tokio::test]
    async fn test_edit_file_exact_not_found() {
        let (_tmp, workspace) = setup_workspace();
        let file_path = "test_notfound.txt";
        let full_path = std::path::Path::new(&workspace).join(file_path);

        fs::write(&full_path, "Hello, world!").unwrap();

        let tool = EditFileTool::new(&workspace);
        let params = serde_json::json!({
            "file_path": file_path,
            "old_text": "nonexistent",
            "new_text": "Rust"
        });

        let result = tool.execute(params).await.unwrap();
        assert!(result.contains("not found"));
    }

    #[tokio::test]
    async fn test_edit_file_multiple_matches() {
        let (_tmp, workspace) = setup_workspace();
        let file_path = "test_multiple.txt";
        let full_path = std::path::Path::new(&workspace).join(file_path);

        fs::write(&full_path, "foo\nbar\nfoo\nbaz").unwrap();

        let tool = EditFileTool::new(&workspace);
        let params = serde_json::json!({
            "file_path": file_path,
            "old_text": "foo",
            "new_text": "qux"
        });

        let result = tool.execute(params).await.unwrap();
        assert!(result.contains("matched 2 times"));
    }

    #[tokio::test]
    async fn test_edit_file_crlf_normalization() {
        let (_tmp, workspace) = setup_workspace();
        let file_path = "test_crlf.txt";
        let full_path = std::path::Path::new(&workspace).join(file_path);

        // 写 CRLF 格式文件
        fs::write(&full_path, "Hello, world!\r\nThis is a test.\r\nGoodbye!").unwrap();

        let tool = EditFileTool::new(&workspace);
        let params = serde_json::json!({
            "file_path": file_path,
            "old_text": "world",
            "new_text": "Rust"
        });

        let result = tool.execute(params).await.unwrap();
        assert!(result.contains("Successfully edited"));

        // 验证 CRLF 格式保留
        let content = std::fs::read(&full_path).unwrap();
        assert!(
            content.windows(2).any(|w| w == b"\r\n"),
            "CRLF line endings should be preserved"
        );
        assert!(content.starts_with(b"Hello, Rust!"));
    }

    #[tokio::test]
    async fn test_edit_file_partial_line() {
        let (_tmp, workspace) = setup_workspace();
        let file_path = "test_partial.txt";
        let full_path = std::path::Path::new(&workspace).join(file_path);

        fs::write(
            &full_path,
            "fn hello() {\n    println!(\"Hello, world!\");\n}\n",
        )
        .unwrap();

        let tool = EditFileTool::new(&workspace);
        let params = serde_json::json!({
            "file_path": file_path,
            "old_text": "Hello, world!",
            "new_text": "Hello, Rust!",
            "partial_line": true
        });

        let result = tool.execute(params).await.unwrap();
        assert!(result.contains("Successfully edited"));

        let content = fs::read_to_string(&full_path).unwrap();
        assert!(content.contains("Hello, Rust!"));
    }

    #[tokio::test]
    async fn test_edit_file_partial_line_multiple() {
        let (_tmp, workspace) = setup_workspace();
        let file_path = "test_partial_multi.txt";
        let full_path = std::path::Path::new(&workspace).join(file_path);

        fs::write(
            &full_path,
            "fn hello() {\n    println!(\"Hello\");\n    println!(\"Hello\");\n}\n",
        )
        .unwrap();

        let tool = EditFileTool::new(&workspace);
        let params = serde_json::json!({
            "file_path": file_path,
            "old_text": "Hello",
            "new_text": "Hey",
            "partial_line": true
        });

        let result = tool.execute(params).await.unwrap();
        assert!(result.contains("matched multiple lines"));
    }

    #[tokio::test]
    async fn test_list_dir() {
        let (_tmp, workspace) = setup_workspace();
        let ws_path = std::path::Path::new(&workspace);

        // 创建文件和子目录
        fs::create_dir_all(ws_path.join("subdir")).unwrap();
        fs::write(ws_path.join("alpha.txt"), "alpha").unwrap();
        fs::write(ws_path.join("beta.txt"), "beta").unwrap();

        let tool = ListDirTool::new(&workspace);
        let params = serde_json::json!({"path": "."});

        let result = tool.execute(params).await.unwrap();

        // 目录在前
        assert!(result.starts_with("[DIR] subdir"));
        // 文件在后，按字母序
        assert!(result.contains("[FILE] alpha.txt"));
        assert!(result.contains("[FILE] beta.txt"));
    }

    #[tokio::test]
    async fn test_list_dir_empty() {
        let (_tmp, workspace) = setup_workspace();

        let tool = ListDirTool::new(&workspace);
        let params = serde_json::json!({"path": "."});

        let result = tool.execute(params).await.unwrap();
        assert_eq!(result, "(empty directory)");
    }

    #[tokio::test]
    async fn test_list_dir_nonexistent() {
        let (_tmp, workspace) = setup_workspace();

        let tool = ListDirTool::new(&workspace);
        let params = serde_json::json!({"path": "nonexistent_dir"});

        let result = tool.execute(params).await.unwrap();
        assert!(result.contains("does not exist"));
    }

    #[tokio::test]
    async fn test_edit_file_nonexistent() {
        let (_tmp, workspace) = setup_workspace();

        let tool = EditFileTool::new(&workspace);
        let params = serde_json::json!({
            "file_path": "nonexistent.txt",
            "old_text": "foo",
            "new_text": "bar"
        });

        let result = tool.execute(params).await.unwrap();
        assert!(result.contains("does not exist"));
    }
}
