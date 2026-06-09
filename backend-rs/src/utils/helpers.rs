use std::path::PathBuf;

use chrono::Utc;

/// 移除 Windows 规范路径中的 `\\?\` 前缀（verbatim prefix）。
///
/// Rust 的 `std::fs::canonicalize()` 在 Windows 上会通过 `GetFinalPathNameByHandleW`
/// 返回带 `\\?\` 前缀的路径。此前缀在大多数用户场景中不必要且会导致路径不美观，
/// 在传给 LLM 或显示给用户时尤其需要去除。
///
/// 非 Windows 平台直接返回原路径。
#[cfg(windows)]
pub fn normalize_path(path: PathBuf) -> PathBuf {
    let s = path.to_string_lossy().to_string();
    // 处理 \\?\C:\... 和 \\?\UNC\server\share\...
    if s.starts_with("\\\\?\\") {
        let without_prefix = &s[4..];
        // \\?\UNC\server\share → \\server\share
        if without_prefix.starts_with("UNC\\") || without_prefix.starts_with("UNC/") {
            PathBuf::from(format!("\\{}", &without_prefix[3..]))
        } else {
            PathBuf::from(without_prefix)
        }
    } else {
        path
    }
}

/// 非 Windows 平台：原样返回。
#[cfg(not(windows))]
pub fn normalize_path(path: PathBuf) -> PathBuf {
    path
}

/// 截断文本到指定长度，超过时末尾添加 "..."
pub fn truncate_text(text: &str, max_len: usize) -> String {
    if text.len() <= max_len {
        return text.to_string();
    }
    let mut truncated = text.chars().take(max_len.saturating_sub(3)).collect::<String>();
    truncated.push_str("...");
    truncated
}

/// 净化文件名：移除非法字符，限制长度
pub fn sanitize_filename(name: &str) -> String {
    let sanitized: String = name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' || c == '.' || c == ' ' {
                c
            } else {
                '_'
            }
        })
        .collect();
    let trimmed: String = sanitized.trim().to_string();
    truncate_text(&trimmed, 200)
}

/// 返回当前时间的 ISO 8601 字符串
pub fn now_iso_string() -> String {
    Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

/// 解析逗号分隔的键值对字符串为 HashMap
/// 格式："key1=value1,key2=value2"
pub fn parse_kv_pairs(input: &str) -> std::collections::HashMap<String, String> {
    let mut map = std::collections::HashMap::new();
    for pair in input.split(',') {
        let mut parts = pair.splitn(2, '=');
        let key = parts.next().unwrap_or("").trim().to_string();
        let value = parts.next().unwrap_or("").trim().to_string();
        if !key.is_empty() {
            map.insert(key, value);
        }
    }
    map
}
