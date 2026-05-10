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
