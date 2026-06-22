//! 工具调用提示格式化 — 生成简洁的 tool_hint 摘要文本给前端显示。
//!
//! 格式：`{tool_name} ({abbreviated_param})`
//! 示例：`run_command (python script.py)`, `read_file (src/main.py)`

use std::collections::HashMap;

/// 提取 arguments 中首个匹配 key 的字符串值。
fn get_first_str_arg(args: &HashMap<String, serde_json::Value>, key_args: &[&str]) -> Option<String> {
    for key in key_args {
        if let Some(val) = args.get(*key) {
            if let Some(s) = val.as_str() {
                if !s.is_empty() {
                    return Some(s.to_string());
                }
            }
        }
    }
    // 兜底：取第一个字符串参数
    for val in args.values() {
        if let Some(s) = val.as_str() {
            if !s.is_empty() {
                return Some(s.to_string());
            }
        }
    }
    None
}

/// 在不超过 `max_byte` 的位置找到安全的 UTF-8 字符边界索引。
///
/// 避免直接用 `&s[..max_byte]` 切片时切到多字节字符中间导致 panic。
/// `shell.rs`、`runner.rs`、`web.rs` 中也用了相同的 `is_char_boundary` 模式。
fn safe_truncate_end(s: &str, max_byte: usize) -> usize {
    (0..=max_byte.min(s.len()))
        .rev()
        .find(|&i| s.is_char_boundary(i))
        .unwrap_or(0)
}

/// 缩写文件路径，保留 basename 和最近几级父目录。
fn abbrev_path(path: &str, max_len: usize) -> String {
    if path.is_empty() {
        return path.to_string();
    }

    let normalized = path.replace('\\', "/");
    if normalized.len() <= max_len {
        return normalized;
    }

    let parts: Vec<&str> = normalized.trim_end_matches('/').split('/').collect();
    if parts.len() <= 1 {
        let mut s = normalized;
        let end = safe_truncate_end(&s, max_len.saturating_sub(1));
        s.truncate(end);
        s.push('…');
        return s;
    }

    let basename = parts[parts.len() - 1];
    let mut budget = max_len as isize - basename.len() as isize - 3; // "…/" + "/"
    let mut kept: Vec<&str> = Vec::new();

    for seg in parts[..parts.len() - 1].iter().rev() {
        let needed = seg.len() as isize + 1;
        if kept.is_empty() && needed <= budget {
            kept.push(seg);
            budget -= needed;
        } else if !kept.is_empty() {
            if needed <= budget {
                kept.push(seg);
                budget -= needed;
            } else {
                break;
            }
        } else {
            break;
        }
    }

    kept.reverse();
    if kept.is_empty() {
        format!("…/{basename}")
    } else {
        format!("…/{}/{basename}", kept.join("/"))
    }
}

/// 生成简洁的工具调用提示文本。
///
/// 格式：`{tool_name} ({abbreviated_param})`
pub fn format_tool_hint(name: &str, arguments: &serde_json::Value) -> String {
    let args_map: HashMap<String, serde_json::Value> = match arguments {
        serde_json::Value::Object(map) => map.iter().map(|(k, v)| (k.clone(), v.clone())).collect(),
        _ => HashMap::new(),
    };

    let (key_args, is_path): (&[&str], bool) = match name {
        "run_command" => (&["command"][..], false),
        "read_file" => (&["path", "file_path"][..], true),
        "write_file" => (&["path", "file_path"][..], true),
        "edit_file" => (&["file_path", "path"][..], true),
        "list_dir" => (&["path"][..], true),
        "web_search" => (&["query"][..], false),
        "web_fetch" => (&["url"][..], true),
        "invoke_skill" => (&["skill_id"][..], false),
        "load_html_to_canvas" => (&["path"][..], true),
        _ => (&[][..], false),
    };

    if !key_args.is_empty() {
        if let Some(val) = get_first_str_arg(&args_map, key_args) {
            let display = if is_path {
                abbrev_path(&val, 40)
            } else if val.len() > 40 {
                format!("{}…", &val[..safe_truncate_end(&val, 39)])
            } else {
                val
            };
            return format!("{name} ({display})");
        }
    }

    // 无注册格式的兜底：取第一个字符串参数
    for val in args_map.values() {
        if let Some(s) = val.as_str() {
            if !s.is_empty() {
                let display = if s.len() > 40 {
                    format!("{}…", &s[..safe_truncate_end(&s, 39)])
                } else {
                    s.to_string()
                };
                return format!("{name} ({display})");
            }
        }
    }

    name.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_run_command() {
        assert_eq!(
            format_tool_hint("run_command", &json!({"command": "python script.py"})),
            "run_command (python script.py)"
        );
    }

    #[test]
    fn test_read_file() {
        let r = format_tool_hint("read_file", &json!({"path": "/home/user/project/src/main.py"}));
        assert!(r.starts_with("read_file ("));
        assert!(r.contains("main.py"));
    }

    #[test]
    fn test_web_search() {
        assert_eq!(
            format_tool_hint("web_search", &json!({"query": "quantum computing"})),
            "web_search (quantum computing)"
        );
    }

    #[test]
    fn test_unknown_tool_fallback() {
        assert_eq!(
            format_tool_hint("unknown_tool", &json!({"key": "value"})),
            "unknown_tool (value)"
        );
    }

    #[test]
    fn test_empty_args() {
        assert_eq!(format_tool_hint("unknown_tool", &json!({})), "unknown_tool");
    }

    #[test]
    fn test_list_dir() {
        let r = format_tool_hint("list_dir", &json!({"path": "/var/log/nginx"}));
        assert!(r.starts_with("list_dir ("));
    }

}
