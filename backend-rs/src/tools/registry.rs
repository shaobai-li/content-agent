use std::collections::HashMap;
use std::sync::Mutex;

use serde_json::Value;

use super::base::Tool;

/// Registry for agent tools — register, prepare, execute.
pub struct ToolRegistry {
    tools: HashMap<String, Box<dyn Tool>>,
    cached_definitions: Mutex<Option<Vec<Value>>>,
}

impl ToolRegistry {
    pub fn new() -> Self {
        Self {
            tools: HashMap::new(),
            cached_definitions: Mutex::new(None),
        }
    }

    /// Register a tool.
    pub fn register(&mut self, tool: Box<dyn Tool>) {
        self.tools.insert(tool.name().to_string(), tool);
        *self.cached_definitions.get_mut().unwrap() = None;
    }

    /// Unregister a tool by name.
    pub fn unregister(&mut self, name: &str) {
        self.tools.remove(name);
        *self.cached_definitions.get_mut().unwrap() = None;
    }

    /// Get a tool by name.
    pub fn get(&self, name: &str) -> Option<&dyn Tool> {
        self.tools.get(name).map(|t| t.as_ref())
    }

    /// Check if a tool is registered.
    pub fn has(&self, name: &str) -> bool {
        self.tools.contains_key(name)
    }

    /// Get tool definitions (OpenAI schema format), cached until register/unregister.
    pub fn get_definitions(&self) -> Vec<Value> {
        {
            let cache = self.cached_definitions.lock().unwrap();
            if let Some(defs) = cache.as_ref() {
                return defs.clone();
            }
        }

        let mut definitions: Vec<Value> = self.tools.values().map(|t| t.to_schema()).collect();
        definitions.sort_by(|a, b| {
            let name_a = Self::schema_name(a);
            let name_b = Self::schema_name(b);
            name_a.cmp(name_b)
        });

        let mut cache = self.cached_definitions.lock().unwrap();
        *cache = Some(definitions.clone());
        definitions
    }

    /// Resolve, cast, and validate a tool call.
    pub fn prepare_call(
        &self,
        name: &str,
        params: Value,
    ) -> Result<(&dyn Tool, Value), String> {
        let tool = self.tools.get(name).ok_or_else(|| {
            let names = self.tool_names().join(", ");
            format!("Error: Tool '{name}' not found. Available: {names}")
        })?;

        let cast_params = tool.cast_params(params);
        let errors = tool.validate_params(&cast_params);
        if !errors.is_empty() {
            return Err(format!(
                "Error: Invalid parameters for tool '{name}': {}",
                errors.join("; ")
            ));
        }

        Ok((tool.as_ref(), cast_params))
    }

    /// Execute a tool by name with given parameters.
    pub async fn execute(&self, name: &str, params: Value) -> String {
        const HINT: &str = "\n\n[Analyze the error above and try a different approach.]";

        let (tool, params) = match self.prepare_call(name, params) {
            Err(error) => return error + HINT,
            Ok(result) => result,
        };

        match tool.execute(params).await {
            Ok(result) => {
                if result.starts_with("Error") {
                    result + HINT
                } else {
                    result
                }
            }
            Err(e) => format!("Error executing {name}: {e}") + HINT,
        }
    }

    pub fn tool_names(&self) -> Vec<&str> {
        self.tools.keys().map(|s| s.as_str()).collect()
    }

    pub fn len(&self) -> usize {
        self.tools.len()
    }

    pub fn is_empty(&self) -> bool {
        self.tools.is_empty()
    }

    fn schema_name(schema: &Value) -> &str {
        schema
            .get("function")
            .and_then(|f| f.get("name"))
            .and_then(|n| n.as_str())
            .or_else(|| schema.get("name").and_then(|n| n.as_str()))
            .unwrap_or("")
    }
}
