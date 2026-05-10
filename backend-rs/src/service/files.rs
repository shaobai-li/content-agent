use std::path::{Path, PathBuf};

use tracing::{debug, warn};

use crate::core::config::get_agent_attachment_cache_dir;

pub fn sanitize_attachment_filename(raw: Option<&str>) -> String {
    match raw {
        Some(s) => {
            let name = Path::new(s)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unnamed")
                .replace('\0', "")
                .trim()
                .to_string();
            if name.is_empty() || name == "." || name == ".." {
                "unnamed".to_string()
            } else {
                name
            }
        }
        None => "unnamed".to_string(),
    }
}

pub fn resolve_validated_cache_paths(agent_id: &str, path_strings: &[String]) -> Vec<PathBuf> {
    let cache_root = get_agent_attachment_cache_dir(agent_id);
    let mut validated = vec![];

    for item in path_strings {
        let s = item.trim();
        if s.is_empty() {
            continue;
        }
        let p = Path::new(s);
        let resolved = if p.is_absolute() {
            p.to_path_buf()
        } else {
            cache_root.join(p)
        };
        let resolved = match resolved.canonicalize() {
            Ok(r) => r,
            Err(_) => {
                warn!("path resolve error: {} for agent {}", s, agent_id);
                continue;
            }
        };
        if !resolved.is_file() {
            warn!("path not file: {} for agent {}", s, agent_id);
            continue;
        }
        if resolved.starts_with(&cache_root) {
            validated.push(resolved);
        } else {
            warn!("path outside cache: {} for agent {}", s, agent_id);
        }
    }
    debug!("validated {} cache paths for agent {}", validated.len(), agent_id);
    validated
}

pub fn save_upload_to_agent_cache_keep_name(agent_id: &str, filename: &str, content: &[u8]) -> PathBuf {
    let cache_dir = get_agent_attachment_cache_dir(agent_id);
    let safe_name = sanitize_attachment_filename(Some(filename));
    let dest = cache_dir.join(&safe_name);
    std::fs::write(&dest, content).ok();
    debug!("cache saved: {} / {} size={}", agent_id, safe_name, content.len());
    dest
}
