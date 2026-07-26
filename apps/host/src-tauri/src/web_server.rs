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
use crate::peer_server::{self, PeerRegistry};

/// The embedded remote control UI HTML
const REMOTE_UI_HTML: &str = include_str!("../remote-ui/index.html");

// Vendored third-party JS, embedded at compile time so the guest UI has zero
// internet dependency at runtime. See remote-ui/vendor/ for provenance; each
// file is pinned to the exact version noted in its filename.
const VENDOR_SOCKET_IO: &str = include_str!("../remote-ui/vendor/socket.io-4.8.3.min.js");
const VENDOR_PEERJS: &str = include_str!("../remote-ui/vendor/peerjs-1.5.5.min.js");
const VENDOR_QRCODEJS: &str = include_str!("../remote-ui/vendor/qrcodejs-1.0.0.min.js");
const VENDOR_LUCIDE: &str = include_str!("../remote-ui/vendor/lucide-1.27.0.min.js");

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

    // The embedded PeerJS broker. Without this, clients fall back to the public
    // 0.peerjs.com cloud and the app cannot connect guests without internet —
    // see peer_server.rs for the full rationale.
    let peer_registry = PeerRegistry::new();

    let peer_routes = Router::new()
        // GET /peerjs upgrades to the relay socket when an Upgrade header is
        // present; PeerJS also probes /peerjs/id for a server-assigned id.
        .route("/peerjs", get(peer_server::peer_ws_handler))
        .route("/peerjs/id", get(peer_server::generate_id))
        .route("/peerjs/peers", get(peer_server::peers_status))
        .with_state(peer_registry);

    // Create router with timeout and concurrency limits
    let app = Router::new()
        // Serve the remote control UI
        .route("/", get(serve_index))
        .route("/health", get(health_check))
        // Vendored third-party JS (see the VENDOR_* constants above) so the
        // guest UI never reaches out to a CDN.
        .route("/vendor/socket.io-4.8.3.min.js", get(serve_vendor_socket_io))
        .route("/vendor/peerjs-1.5.5.min.js", get(serve_vendor_peerjs))
        .route("/vendor/qrcodejs-1.0.0.min.js", get(serve_vendor_qrcodejs))
        .route("/vendor/lucide-1.27.0.min.js", get(serve_vendor_lucide))
        .merge(peer_routes)
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
    (
        [
            (axum::http::header::CONTENT_TYPE, "text/html"),
            (axum::http::header::CACHE_CONTROL, "no-cache, no-store, must-revalidate"),
            (axum::http::header::PRAGMA, "no-cache"),
            (axum::http::header::EXPIRES, "0"),
        ],
        Html(REMOTE_UI_HTML),
    )
}

/// Health check endpoint
async fn health_check() -> impl IntoResponse {
    (StatusCode::OK, "OK")
}

/// Serve a vendored JS asset with a JS content type and a long, immutable
/// cache lifetime — the filename is version-pinned, so a new version means a
/// new URL, and this response can be cached forever.
fn vendor_js_response(body: &'static str) -> impl IntoResponse {
    (
        [
            (axum::http::header::CONTENT_TYPE, "application/javascript"),
            (axum::http::header::CACHE_CONTROL, "public, max-age=31536000, immutable"),
        ],
        body,
    )
}

async fn serve_vendor_socket_io() -> impl IntoResponse {
    vendor_js_response(VENDOR_SOCKET_IO)
}

async fn serve_vendor_peerjs() -> impl IntoResponse {
    vendor_js_response(VENDOR_PEERJS)
}

async fn serve_vendor_qrcodejs() -> impl IntoResponse {
    vendor_js_response(VENDOR_QRCODEJS)
}

async fn serve_vendor_lucide() -> impl IntoResponse {
    vendor_js_response(VENDOR_LUCIDE)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_health_check() {
        let response = health_check().await.into_response();
        assert_eq!(response.status(), StatusCode::OK);
    }

    /// Shared assertion for the vendored asset routes: each must return 200,
    /// a non-empty body, and a JS content type — proving the guest UI's
    /// third-party dependencies are served from the binary, not a CDN.
    async fn assert_vendor_js_route(response: axum::response::Response) {
        assert_eq!(response.status(), StatusCode::OK);

        let content_type = response
            .headers()
            .get(axum::http::header::CONTENT_TYPE)
            .expect("vendor route must set a Content-Type header")
            .to_str()
            .expect("Content-Type must be valid ASCII");
        assert_eq!(content_type, "application/javascript");

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("body must be readable");
        assert!(!body.is_empty(), "vendor asset body must not be empty");
    }

    #[tokio::test]
    async fn test_vendor_socket_io_route() {
        let response = serve_vendor_socket_io().await.into_response();
        assert_vendor_js_route(response).await;
    }

    #[tokio::test]
    async fn test_vendor_peerjs_route() {
        let response = serve_vendor_peerjs().await.into_response();
        assert_vendor_js_route(response).await;
    }

    #[tokio::test]
    async fn test_vendor_qrcodejs_route() {
        let response = serve_vendor_qrcodejs().await.into_response();
        assert_vendor_js_route(response).await;
    }

    #[tokio::test]
    async fn test_vendor_lucide_route() {
        let response = serve_vendor_lucide().await.into_response();
        assert_vendor_js_route(response).await;
    }
}
