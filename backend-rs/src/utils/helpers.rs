use chrono::Utc;

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
