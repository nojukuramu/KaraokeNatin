use axum::{
    Router,
    routing::get,
    response::{Html, IntoResponse},
    http::StatusCode,
};
use tower_http::cors::{CorsLayer, Any};
use std::net::SocketAddr;

/// The embedded remote control UI HTML
const REMOTE_UI_HTML: &str = include_str!("../remote-ui/index.html");

/// Start the embedded web server
pub async fn start_web_server() -> Result<(), String> {
    log::info!("[WebServer] Starting embedded web server on port 8080");

    // Create router
    let app = Router::new()
        // Serve the remote control UI
        .route("/", get(serve_index))
        .route("/health", get(health_check))
        // Add CORS for local development
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        );

    // Bind to all network interfaces on port 8080
    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    
    log::info!("[WebServer] Listening on {}", addr);

    // Create TCP listener
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| format!("[WebServer] Failed to bind: {}", e))?;

    // Start server
    match axum::serve(listener, app).await {
        Ok(_) => {
            log::info!("[WebServer] Server stopped gracefully");
            Ok(())
        }
        Err(e) => {
            let err_msg = format!("[WebServer] Server error: {}", e);
            log::error!("{}", err_msg);
            Err(err_msg)
        }
    }
}

/// Serve the remote control UI
async fn serve_index() -> impl IntoResponse {
    Html(REMOTE_UI_HTML)
}

/// Health check endpoint
async fn health_check() -> impl IntoResponse {
    (StatusCode::OK, "OK")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_health_check() {
        let response = health_check().await.into_response();
        assert_eq!(response.status(), StatusCode::OK);
    }
}
