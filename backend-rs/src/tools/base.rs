use async_trait::async_trait;
use serde_json::Value;

/// Base trait for all tools.
#[async_trait]
pub trait Tool: Send + Sync {
    fn name(&self) -> &str;
    fn description(&self) -> &str;
    fn parameters(&self) -> &Value;

    fn read_only(&self) -> bool {
        false
    }

    fn concurrency_safe(&self) -> bool {
        false
    }

    async fn execute(&self, params: Value) -> Result<String, String>;

    fn cast_params(&self, params: Value) -> Value {
        params
    }

    fn validate_params(&self, params: &Value) -> Vec<String> {
        validate_json_schema_value(self.parameters(), params)
    }

    fn to_schema(&self) -> Value {
        serde_json::json!({
            "type": "function",
            "function": {
                "name": self.name(),
                "description": self.description(),
                "parameters": self.parameters(),
            }
        })
    }
}

/// Validate a value against a JSON Schema.
pub fn validate_json_schema_value(schema: &Value, value: &Value) -> Vec<String> {
    let mut errors = Vec::new();

    let schema_type = schema.get("type").and_then(|t| t.as_str());

    // Type check
    if let Some(st) = schema_type {
        let value_type = json_type_name(value);
        if st == "object" && value_type != "object" {
            errors.push(format!("expected object, got {}", value_type));
            return errors;
        }
        if st == "array" && value_type != "array" {
            errors.push(format!("expected array, got {}", value_type));
            return errors;
        }
        if st == "string" && value_type != "string" {
            errors.push(format!("expected string, got {}", value_type));
            return errors;
        }
    }

    // Check required properties
    if let Some(required) = schema.get("required").and_then(|r| r.as_array()) {
        for req in required {
            if let Some(name) = req.as_str() {
                if !value.get(name).is_some_and(|v| !v.is_null()) {
                    errors.push(format!("missing required property: {}", name));
                }
            }
        }
    }

    // Check properties
    if let Some(properties) = schema.get("properties").and_then(|p| p.as_object()) {
        for (prop_name, prop_schema) in properties {
            if let Some(prop_value) = value.get(prop_name) {
                if !prop_value.is_null() {
                    let sub_errors = validate_json_schema_value(prop_schema, prop_value);
                    errors.extend(sub_errors.into_iter().map(|e| format!("{}.{}", prop_name, e)));
                }
            }
        }
    }

    errors
}

fn json_type_name(value: &Value) -> &'static str {
    match value {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}
