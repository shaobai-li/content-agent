use serde_json::Value;

/// 从 mentions 列表中解析 article 引用，构建上下文消息
///
/// mentions: 引用字符串列表，格式如 `["article:xxx", "url:yyy"]`
/// 返回要插入到 LLM messages 中的上下文消息列表
pub fn get_article_context_messages(mentions: &[Value]) -> Vec<Value> {
    let mut messages = Vec::new();

    for mention in mentions {
        let mention_str = match mention.as_str() {
            Some(s) => s,
            None => continue,
        };
        if let Some(content) = resolve_mention(mention_str) {
            messages.push(serde_json::json!({
                "role": "user",
                "content": format!("[引用内容]:\n{}", content)
            }));
        }
    }

    messages
}

/// 解析单个 mention 引用，返回引用的文本内容
fn resolve_mention(mention: &str) -> Option<String> {
    if let Some(article_id) = mention.strip_prefix("article:") {
        return resolve_article(article_id);
    }
    if let Some(url) = mention.strip_prefix("url:") {
        return resolve_url_content(url);
    }
    None
}

/// 从 records 服务中读取指定 article_id 的内容
fn resolve_article(_article_id: &str) -> Option<String> {
    // TODO: 后续从 records 服务加载文章内容
    None
}

/// 从缓存目录读取已 fetch 的 URL 内容
fn resolve_url_content(_url: &str) -> Option<String> {
    // TODO: 后续从缓存或直接 fetch 获取内容
    None
}

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_article_context_messages_empty() {
        let mentions: Vec<Value> = vec![];
        let result = get_article_context_messages(&mentions);
        assert!(result.is_empty());
    }

    #[test]
    fn test_get_article_context_messages_article() {
        // article:xxx 格式 — 目前 resolve_article 返回 None，所以结果应为空
        let mentions = vec![Value::String("article:doc-123".to_string())];
        let result = get_article_context_messages(&mentions);
        assert!(result.is_empty());
    }

    #[test]
    fn test_get_article_context_messages_url() {
        // url:xxx 格式 — 目前 resolve_url_content 返回 None
        let mentions = vec![Value::String("url:https://example.com".to_string())];
        let result = get_article_context_messages(&mentions);
        assert!(result.is_empty());
    }

    #[test]
    fn test_get_article_context_messages_unknown_prefix() {
        // 未知前缀的 mention 应被忽略
        let mentions = vec![Value::String("unknown:something".to_string())];
        let result = get_article_context_messages(&mentions);
        assert!(result.is_empty());
    }

    #[test]
    fn test_get_article_context_messages_non_string() {
        // 非字符串的 mention 应被忽略
        let mentions = vec![serde_json::json!(42)];
        let result = get_article_context_messages(&mentions);
        assert!(result.is_empty());
    }

    #[test]
    fn test_get_article_context_messages_mixed() {
        let mentions = vec![
            serde_json::json!("article:doc-1"),
            serde_json::json!("url:https://example.com"),
            serde_json::json!("invalid"),
            serde_json::json!(99),
        ];
        // 所有 resolve 目前都返回 None
        let result = get_article_context_messages(&mentions);
        assert!(result.is_empty());
    }
}
