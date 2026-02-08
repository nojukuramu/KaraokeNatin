use axum::{
    Router,
    routing::get,
    response::{Html, IntoResponse},
    http::StatusCode,
};
use tower_http::cors::{CorsLayer, Any};
use std::net::SocketAddr;
use std::sync::atomic::{AtomicU16, Ordering};
use std::time::Duration;
use socketioxide::SocketIo;
use crate::signaling::{RoomManager, on_connect};

/// The embedded remote control UI HTML
const REMOTE_UI_HTML: &str = include_str!("../remote-ui/index.html");

/// Store the actual port being used (for QR code generation)
static ACTUAL_PORT: AtomicU16 = AtomicU16::new(0);

/// Get the current server port
pub fn get_server_port() -> u16 {
    ACTUAL_PORT.load(Ordering::SeqCst)
}

/// Check if a port is available
async fn is_port_available(port: u16) -> bool {
    tokio::net::TcpListener::bind(SocketAddr::from(([0, 0, 0, 0], port)))
        .await
        .is_ok()
}

/// Find an available port using random selection in the ephemeral range
async fn find_available_port() -> u16 {
    use rand::Rng;
    let mut rng = rand::thread_rng();

    // Try random ports in the IANA ephemeral range (49152–65535)
    for _ in 0..20 {
        let port = rng.gen_range(49152..=65535);
        if is_port_available(port).await {
            return port;
        }
    }

    // Fallback to OS-assigned port
    log::warn!("[WebServer] No random ports available, using OS-assigned port");
    0
}

/// Start the embedded web server
pub async fn start_web_server() -> Result<(), String> {
    let port = find_available_port().await;
    
    log::info!("[WebServer] Starting embedded web server on port {}", port);

    // Initialize Socket.io with connection limits
    let (layer, io) = SocketIo::builder()
        .with_state(RoomManager::new())
        .ping_interval(Duration::from_secs(25))
        .ping_timeout(Duration::from_secs(20))
        .max_buffer_size(128)
        .build_layer();

    io.ns("/", on_connect);

    // Create router with timeout and concurrency limits
    let app = Router::new()
        // Serve the remote control UI
        .route("/", get(serve_index))
        .route("/health", get(health_check))
        .layer(layer) // Socket.io layer
        // Add CORS for local development
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        // Limit concurrent connections to prevent resource exhaustion
        .layer(tower::limit::ConcurrencyLimitLayer::new(64));

    // Bind to all network interfaces
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    
    // Create TCP listener
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| format!("[WebServer] Failed to bind: {}", e))?;
    
    // Store the actual port (in case OS assigned one)
    let actual_port = listener.local_addr()
        .map(|a| a.port())
        .unwrap_or(port);
    ACTUAL_PORT.store(actual_port, Ordering::SeqCst);
    
    log::info!("[WebServer] Listening on port {}", actual_port);

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
