use std::path::PathBuf;

/// 备忘录数据结构
pub struct Memo {
    pub id: String,
    pub title: String,
    pub content: String,
    pub created_at: String,
    pub updated_at: String,
}

pub struct MemoStore {
    base_dir: PathBuf,
}

impl MemoStore {
    pub fn new(agent_id: &str) -> Self {
        let base_dir = crate::core::config::get_agent_base_dir(agent_id)
            .join(".agent")
            .join("memos");
        std::fs::create_dir_all(&base_dir).ok();
        Self { base_dir }
    }

    fn memo_path(&self, id: &str) -> PathBuf {
        self.base_dir.join(format!("{}.json", id))
    }

    /// 创建备忘录
    pub fn create(&self, title: &str, content: &str) -> Result<String, String> {
        let id = uuid::Uuid::new_v4().simple().to_string();
        let now = crate::utils::helpers::now_iso_string();
        let memo = serde_json::json!({
            "id": id,
            "title": title,
            "content": content,
            "created_at": now,
            "updated_at": now,
        });
        let path = self.memo_path(&id);
        serde_json::to_string_pretty(&memo)
            .map_err(|e| format!("Failed to serialize memo: {e}"))
            .and_then(|json| {
                std::fs::write(&path, json).map_err(|e| format!("Failed to write memo: {e}"))
            })?;
        Ok(id)
    }

    /// 读取备忘录
    pub fn read(&self, id: &str) -> Result<Memo, String> {
        let path = self.memo_path(id);
        if !path.exists() {
            return Err(format!("Memo not found: {id}"));
        }
        let content = std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read memo: {e}"))?;
        let json: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse memo: {e}"))?;
        Ok(Memo {
            id: json["id"].as_str().unwrap_or("").to_string(),
            title: json["title"].as_str().unwrap_or("").to_string(),
            content: json["content"].as_str().unwrap_or("").to_string(),
            created_at: json["created_at"].as_str().unwrap_or("").to_string(),
            updated_at: json["updated_at"].as_str().unwrap_or("").to_string(),
        })
    }

    /// 更新备忘录
    pub fn update(&self, id: &str, content: &str) -> Result<(), String> {
        let mut memo = self.read(id)?;
        memo.content = content.to_string();
        memo.updated_at = crate::utils::helpers::now_iso_string();
        let json = serde_json::json!({
            "id": memo.id,
            "title": memo.title,
            "content": memo.content,
            "created_at": memo.created_at,
            "updated_at": memo.updated_at,
        });
        let path = self.memo_path(id);
        serde_json::to_string_pretty(&json)
            .map_err(|e| format!("Failed to serialize memo: {e}"))
            .and_then(|json_str| {
                std::fs::write(&path, json_str).map_err(|e| format!("Failed to write memo: {e}"))
            })
    }

    /// 删除备忘录
    pub fn delete(&self, id: &str) -> Result<(), String> {
        let path = self.memo_path(id);
        if !path.exists() {
            return Err(format!("Memo not found: {id}"));
        }
        std::fs::remove_file(&path).map_err(|e| format!("Failed to delete memo: {e}"))
    }

    /// 列出所有备忘录
    pub fn list(&self) -> Result<Vec<serde_json::Value>, String> {
        let mut memos = Vec::new();
        if !self.base_dir.exists() {
            return Ok(memos);
        }
        for entry in std::fs::read_dir(&self.base_dir).map_err(|e| format!("Failed to list memos: {e}"))? {
            let entry = entry.map_err(|e| format!("Failed to read entry: {e}"))?;
            let path = entry.path();
            if path.extension().map(|e| e == "json").unwrap_or(false) {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                        memos.push(json);
                    }
                }
            }
        }
        Ok(memos)
    }
}
