/// 解析后的文章结构
#[derive(Debug)]
pub struct ParsedArticle {
    pub title: Option<String>,
    pub sections: Vec<ArticleSection>,
}

#[derive(Debug)]
pub struct ArticleSection {
    pub heading: Option<String>,
    pub content: String,
}

/// 解析 Markdown 内容，提取标题和章节结构
pub fn parse_markdown(content: &str) -> ParsedArticle {
    let title = extract_title(content);
    let mut sections: Vec<ArticleSection> = Vec::new();
    let mut current_heading: Option<String> = None;
    let mut current_content = String::new();

    for line in content.lines() {
        if line.starts_with("##") || line.starts_with("###") || line.starts_with("# ") {
            // 保存上一个章节
            if !current_content.trim().is_empty() || current_heading.is_some() {
                sections.push(ArticleSection {
                    heading: current_heading.take(),
                    content: current_content.trim().to_string(),
                });
                current_content = String::new();
            }

            if line.starts_with("# ") {
                // H1 is the title, skip as section heading
                continue;
            }
            current_heading = Some(line.trim_start_matches('#').trim().to_string());
        } else {
            if !current_content.is_empty() {
                current_content.push('\n');
            }
            current_content.push_str(line);
        }
    }

    // 最后一个章节
    if !current_content.trim().is_empty() || current_heading.is_some() {
        sections.push(ArticleSection {
            heading: current_heading.take(),
            content: current_content.trim().to_string(),
        });
    }

    ParsedArticle { title, sections }
}

/// 从 Markdown 内容中提取标题（第一个 # 行）
pub fn extract_title(content: &str) -> Option<String> {
    for line in content.lines() {
        if let Some(title) = line.strip_prefix("# ") {
            let trimmed = title.trim().to_string();
            if !trimmed.is_empty() {
                return Some(trimmed);
            }
        }
    }
    None
}
