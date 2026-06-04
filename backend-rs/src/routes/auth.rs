use axum::{
    extract::Json,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Extension, Router,
};
use reqwest::Client;
use serde_json::Value;
use std::env;
use std::sync::OnceLock;

static AUTH_API_URL: OnceLock<String> = OnceLock::new();

fn get_auth_base() -> &'static str {
    AUTH_API_URL.get_or_init(|| {
        env::var("AUTH_API_URL").unwrap_or_else(|_| "http://120.48.78.73:3005".to_string())
    })
}

async fn proxy_login(
    Extension(client): Extension<Client>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let url = format!("{}/api/login", get_auth_base());
    match client.post(&url).json(&body).send().await {
        Ok(resp) => {
            let status = resp.status();
            let json: Value = resp.json().await.unwrap_or_default();
            if status.is_success() {
                (status, Json(json)).into_response()
            } else {
                (status, Json(json)).into_response()
            }
        }
        Err(e) => (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({"message": format!("auth proxy error: {}", e)})),
        )
            .into_response(),
    }
}

async fn proxy_me(
    Extension(client): Extension<Client>,
    headers: axum::http::HeaderMap,
) -> impl IntoResponse {
    let url = format!("{}/api/me", get_auth_base());
    let mut req = client.get(&url);

    if let Some(auth) = headers.get("authorization") {
        if let Ok(v) = auth.to_str() {
            req = req.header("authorization", v);
        }
    }

    match req.send().await {
        Ok(resp) => {
            let status = resp.status();
            let json: Value = resp.json().await.unwrap_or_default();
            if status.is_success() {
                (status, Json(json)).into_response()
            } else {
                (status, Json(json)).into_response()
            }
        }
        Err(e) => (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({"message": format!("auth proxy error: {}", e)})),
        )
            .into_response(),
    }
}

pub fn router() -> Router {
    Router::new()
        .route("/api/login", post(proxy_login))
        .route("/api/me", get(proxy_me))
        .layer(Extension(Client::new()))
}
