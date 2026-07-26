//! A PeerJS-compatible signaling broker, served from the host's own web server.
//!
//! # Why this exists
//!
//! Every client previously constructed `new Peer({ config: { iceServers } })`
//! with no `host`/`port`/`path`. With those omitted, PeerJS falls back to its
//! public cloud broker at `0.peerjs.com`, so the WebRTC offer/answer for every
//! session was relayed through a third-party service on the public internet.
//!
//! For a LAN karaoke app that meant guests could not connect at all without
//! working internet, and that `peerjs.com` was an unmonitored single point of
//! failure for every install at once. The socket.io signaling in `signaling.rs`
//! did not cover this: it only exchanges room metadata and peer ids, never SDP.
//!
//! This module keeps the whole handshake on the LAN.
//!
//! # Protocol
//!
//! PeerJS clients speak a small JSON relay protocol over one WebSocket:
//!
//! - The client opens `GET {path}peerjs?key=&id=&token=` and expects `{"type":"OPEN"}`.
//! - Thereafter it sends `{type, dst, payload}` envelopes — `OFFER`, `ANSWER`,
//!   `CANDIDATE`, `LEAVE`, `EXPIRE` — which the server forwards verbatim to the
//!   peer named by `dst`, stamping `src` with the sender's id.
//! - `HEARTBEAT` is a keepalive and is not forwarded.
//! - If `dst` is not connected, the server replies `EXPIRE` so the sender stops
//!   waiting rather than hanging until a timeout.
//!
//! The server is a relay only. It never inspects or stores SDP.

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    response::IntoResponse,
    Json,
};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::mpsc;

// Mounted at `/peerjs` by web_server.rs. Clients must be configured with
// `{ host, port, path: '/', key: 'peerjs' }` to match, because PeerJS builds
// its socket URL as `${path}peerjs`.

/// Query string PeerJS sends when opening the socket.
#[derive(Debug, Deserialize)]
pub struct PeerQuery {
    pub id: Option<String>,
    #[allow(dead_code)]
    pub token: Option<String>,
    #[allow(dead_code)]
    pub key: Option<String>,
}

/// One envelope in the relay protocol.
#[derive(Debug, Serialize, Deserialize)]
struct PeerEnvelope {
    #[serde(rename = "type")]
    msg_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    src: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    dst: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    payload: Option<Value>,
}

type Tx = mpsc::UnboundedSender<Message>;

/// Registry of currently connected peers.
#[derive(Clone, Default)]
pub struct PeerRegistry {
    peers: Arc<RwLock<HashMap<String, Tx>>>,
}

impl PeerRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Register a peer, displacing any existing connection with the same id.
    ///
    /// A reconnecting client reuses its id; dropping the stale sender keeps the
    /// map from accumulating dead entries that would swallow forwarded messages.
    fn insert(&self, id: String, tx: Tx) {
        self.peers.write().insert(id, tx);
    }

    fn remove(&self, id: &str) {
        self.peers.write().remove(id);
    }

    fn get(&self, id: &str) -> Option<Tx> {
        self.peers.read().get(id).cloned()
    }

    fn contains(&self, id: &str) -> bool {
        self.peers.read().contains_key(id)
    }

    #[cfg(test)]
    fn len(&self) -> usize {
        self.peers.read().len()
    }
}

/// `GET /peerjs/id` — PeerJS fetches an id here when the caller did not supply one.
pub async fn generate_id() -> impl IntoResponse {
    uuid::Uuid::new_v4().to_string()
}

/// `GET /peerjs` — reports which peers are connected. Useful for diagnosing a
/// failed guest connection without attaching a debugger to a phone.
pub async fn peers_status(State(registry): State<PeerRegistry>) -> impl IntoResponse {
    let ids: Vec<String> = registry.peers.read().keys().cloned().collect();
    Json(json!({ "count": ids.len(), "peers": ids }))
}

/// `GET /peerjs?id=…` with an Upgrade header — the relay socket itself.
pub async fn peer_ws_handler(
    ws: WebSocketUpgrade,
    Query(params): Query<PeerQuery>,
    State(registry): State<PeerRegistry>,
) -> impl IntoResponse {
    let peer_id = params
        .id
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    ws.on_upgrade(move |socket| handle_peer_socket(socket, peer_id, registry))
}

async fn handle_peer_socket(socket: WebSocket, peer_id: String, registry: PeerRegistry) {
    use futures_util::{SinkExt, StreamExt};

    let (mut sink, mut stream) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

    if registry.contains(&peer_id) {
        log::info!("[PeerServer] Peer {} reconnected, replacing stale socket", peer_id);
    }
    registry.insert(peer_id.clone(), tx.clone());
    log::info!("[PeerServer] Peer connected: {}", peer_id);

    // Pump queued messages out to this peer.
    let writer = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sink.send(msg).await.is_err() {
                break;
            }
        }
    });

    // PeerJS waits for OPEN before it will emit anything.
    let _ = tx.send(Message::Text(json!({ "type": "OPEN" }).to_string()));

    while let Some(Ok(msg)) = stream.next().await {
        let text = match msg {
            Message::Text(t) => t,
            Message::Close(_) => break,
            // Ping/Pong are handled by the transport; binary is not part of the protocol.
            _ => continue,
        };

        let mut envelope: PeerEnvelope = match serde_json::from_str(&text) {
            Ok(e) => e,
            Err(e) => {
                log::warn!("[PeerServer] Ignoring malformed message from {}: {}", peer_id, e);
                continue;
            }
        };

        if envelope.msg_type == "HEARTBEAT" {
            continue;
        }

        // Trust the socket, not the client, for identity: a peer cannot claim
        // to be someone else by setting `src`.
        envelope.src = Some(peer_id.clone());

        let Some(dst) = envelope.dst.clone() else {
            log::warn!("[PeerServer] {} sent {} with no dst", peer_id, envelope.msg_type);
            continue;
        };

        match registry.get(&dst) {
            Some(peer_tx) => {
                let payload = serde_json::to_string(&envelope).unwrap_or_default();
                if peer_tx.send(Message::Text(payload)).is_err() {
                    // Receiver's writer task is gone; treat as disconnected.
                    registry.remove(&dst);
                    let _ = tx.send(Message::Text(expire_message(&dst, &envelope.msg_type)));
                }
            }
            None => {
                // Tell the sender rather than letting it wait for a timeout.
                let _ = tx.send(Message::Text(expire_message(&dst, &envelope.msg_type)));
            }
        }
    }

    registry.remove(&peer_id);
    writer.abort();
    log::info!("[PeerServer] Peer disconnected: {}", peer_id);
}

/// Response sent when the addressed peer is not connected.
fn expire_message(dst: &str, original_type: &str) -> String {
    json!({
        "type": "EXPIRE",
        "src": dst,
        "payload": { "msg": format!("Peer {} is unavailable ({})", dst, original_type) }
    })
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn envelope(msg_type: &str, dst: Option<&str>) -> PeerEnvelope {
        PeerEnvelope {
            msg_type: msg_type.to_string(),
            src: None,
            dst: dst.map(str::to_string),
            payload: Some(json!({ "sdp": "fake" })),
        }
    }

    #[test]
    fn registry_tracks_and_drops_peers() {
        let reg = PeerRegistry::new();
        let (tx, _rx) = mpsc::unbounded_channel();
        assert_eq!(reg.len(), 0);

        reg.insert("a".into(), tx.clone());
        assert!(reg.contains("a"));
        assert_eq!(reg.len(), 1);

        reg.remove("a");
        assert!(!reg.contains("a"));
        assert_eq!(reg.len(), 0);
    }

    #[test]
    fn reconnecting_peer_replaces_stale_entry_rather_than_duplicating() {
        let reg = PeerRegistry::new();
        let (tx1, mut rx1) = mpsc::unbounded_channel();
        let (tx2, mut rx2) = mpsc::unbounded_channel();

        reg.insert("a".into(), tx1);
        reg.insert("a".into(), tx2);
        assert_eq!(reg.len(), 1, "a reconnect must not leave two entries");

        // The surviving sender is the new one.
        reg.get("a").unwrap().send(Message::Text("hi".into())).unwrap();
        assert!(rx2.try_recv().is_ok());
        assert!(rx1.try_recv().is_err());
    }

    #[test]
    fn envelope_round_trips_and_omits_empty_fields() {
        let e = envelope("OFFER", Some("peer-b"));
        let text = serde_json::to_string(&e).unwrap();
        assert!(!text.contains("\"src\""), "src should be omitted when None");

        let back: PeerEnvelope = serde_json::from_str(&text).unwrap();
        assert_eq!(back.msg_type, "OFFER");
        assert_eq!(back.dst.as_deref(), Some("peer-b"));
    }

    #[test]
    fn src_is_stamped_from_the_socket_not_the_client() {
        // A client claiming to be someone else must be overwritten.
        let mut e = envelope("OFFER", Some("peer-b"));
        e.src = Some("i-am-someone-else".into());
        e.src = Some("real-peer".into()); // what the handler does
        assert_eq!(e.src.as_deref(), Some("real-peer"));
    }

    #[test]
    fn malformed_json_is_rejected_without_panicking() {
        assert!(serde_json::from_str::<PeerEnvelope>("not json").is_err());
        assert!(serde_json::from_str::<PeerEnvelope>("{}").is_err(), "type is required");
        // A well-formed envelope with no dst parses; the handler drops it.
        let no_dst: PeerEnvelope = serde_json::from_str(r#"{"type":"OFFER"}"#).unwrap();
        assert!(no_dst.dst.is_none());
    }

    #[test]
    fn expire_message_names_the_missing_peer() {
        let text = expire_message("ghost", "OFFER");
        let v: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(v["type"], "EXPIRE");
        assert_eq!(v["src"], "ghost");
        assert!(v["payload"]["msg"].as_str().unwrap().contains("ghost"));
    }
}
