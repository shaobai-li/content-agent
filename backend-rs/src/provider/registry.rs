use std::collections::HashMap;
use std::sync::Mutex;

use once_cell::sync::Lazy;

use crate::provider::base::LLMProvider;

type ProviderFactory = Box<dyn Fn() -> Box<dyn LLMProvider> + Send + Sync>;

static PROVIDER_REGISTRY: Lazy<Mutex<HashMap<String, ProviderFactory>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

pub fn register_provider(name: &str, factory: ProviderFactory) {
    PROVIDER_REGISTRY
        .lock()
        .unwrap()
        .insert(name.to_string(), factory);
}

/// 查找已注册 provider 并创建实例
pub fn find_by_name(name: &str) -> Option<Box<dyn LLMProvider>> {
    PROVIDER_REGISTRY.lock().unwrap().get(name).map(|factory| factory())
}

/// 列出所有已注册 provider 名称
pub fn list_providers() -> Vec<String> {
    PROVIDER_REGISTRY.lock().unwrap().keys().cloned().collect()
}
