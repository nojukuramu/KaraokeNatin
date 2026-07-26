use serde::{Deserialize, Serialize};
use socketioxide::extract::{Data, SocketRef, State};
use std::sync::Arc;
use parking_lot::RwLock;
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_CLIENTS_PER_ROOM: usize = 10;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomMetadata {
    pub room_id: String,
    pub host_socket_id: String,
    pub host_peer_id: Option<String>,
    pub join_token_hash: String,
    pub created_at: u64,
    pub client_count: usize,
}

#[derive(Clone)]
pub struct RoomManager {
    rooms: Arc<RwLock<HashMap<String, RoomMetadata>>>,
    /// Map socket IDs to room IDs for client disconnect tracking
    socket_rooms: Arc<RwLock<HashMap<String, String>>>,
}

/// Compare two byte strings without short-circuiting on the first difference.
///
/// Token hashes are compared on every join attempt; a plain `!=` leaks how many
/// leading bytes matched via timing. The length check is not secret (both sides
/// are fixed-width hex SHA-256).
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

impl RoomManager {
    pub fn new() -> Self {
        Self {
            rooms: Arc::new(RwLock::new(HashMap::new())),
            socket_rooms: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub fn create_room(&self, room_id: String, host_socket_id: String, join_token_hash: String, host_peer_id: Option<String>) -> Result<(), String> {
        let mut rooms = self.rooms.write();
        if rooms.contains_key(&room_id) {
            return Err("Room already exists".to_string());
        }

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        let rid = room_id.clone();
        let hsid = host_socket_id.clone();
        rooms.insert(rid.clone(), RoomMetadata {
            room_id,
            host_socket_id,
            host_peer_id,
            join_token_hash,
            created_at: now,
            client_count: 0,
        });

        log::info!("[Signaling] Room created: {} (host_socket: {})", rid, hsid);
        Ok(())
    }

    pub fn get_room(&self, room_id: &str) -> Option<RoomMetadata> {
        self.rooms.read().get(room_id).cloned()
    }

    pub fn verify_room(&self, room_id: &str, join_token: &str) -> Result<RoomMetadata, String> {
        let room = self.get_room(room_id).ok_or("Room not found")?;

        let token_hash = hash_token(join_token);
        if !constant_time_eq(token_hash.as_bytes(), room.join_token_hash.as_bytes()) {
            return Err("Invalid token".to_string());
        }

        if room.client_count >= MAX_CLIENTS_PER_ROOM {
            return Err("Room is full".to_string());
        }

        Ok(room)
    }

    pub fn add_client(&self, room_id: &str) {
        if let Some(room) = self.rooms.write().get_mut(room_id) {
            room.client_count += 1;
        }
    }

    pub fn remove_client(&self, room_id: &str) {
        if let Some(room) = self.rooms.write().get_mut(room_id) {
            if room.client_count > 0 {
                room.client_count -= 1;
            }
        }
    }

    pub fn delete_room(&self, room_id: &str) {
        if self.rooms.write().remove(room_id).is_some() {
            log::info!("[Signaling] Room deleted: {}", room_id);
        }
    }

    pub fn get_room_by_host_socket(&self, socket_id: &str) -> Option<RoomMetadata> {
        self.rooms.read().values()
            .find(|r| r.host_socket_id == socket_id)
            .cloned()
    }

    pub fn get_first_active_room(&self) -> Option<RoomMetadata> {
        self.rooms.read().values()
            .find(|r| r.client_count < MAX_CLIENTS_PER_ROOM)
            .cloned()
    }

    /// Track which room a socket belongs to
    pub fn set_socket_room(&self, socket_id: &str, room_id: &str) {
        self.socket_rooms.write().insert(socket_id.to_string(), room_id.to_string());
    }

    /// Get the room a socket belongs to
    pub fn get_socket_room(&self, socket_id: &str) -> Option<String> {
        self.socket_rooms.read().get(socket_id).cloned()
    }

    /// Remove a socket-to-room mapping
    pub fn remove_socket_room(&self, socket_id: &str) {
        self.socket_rooms.write().remove(socket_id);
    }
}

fn hash_token(token: &str) -> String {
    use sha2::{Sha256, Digest};
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

// Payload structs

#[derive(Debug, Deserialize)]
pub struct CreateRoomPayload {
    #[serde(rename = "roomId")]
    pub room_id: String,
    #[serde(rename = "joinTokenHash")]
    pub join_token_hash: String,
    #[serde(rename = "hostPeerId")]
    pub host_peer_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct JoinRoomPayload {
    #[serde(rename = "roomId")]
    pub room_id: Option<String>,
    #[serde(rename = "joinToken")]
    pub join_token: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
}

#[derive(Debug, Serialize)]
pub struct RoomCreatedPayload {
    #[serde(rename = "roomId")]
    pub room_id: String,
}

#[derive(Debug, Serialize)]
pub struct JoinSuccessPayload {
    #[serde(rename = "roomId")]
    pub room_id: String,
    #[serde(rename = "hostPeerId")]
    pub host_peer_id: String,
}

#[derive(Debug, Serialize)]
pub struct ErrorPayload {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct JoinRejectedPayload {
    pub reason: String,
}

#[derive(Debug, Serialize)]
pub struct ClientJoinedPayload {
    #[serde(rename = "clientId")]
    pub client_id: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
    #[serde(rename = "peerId")]
    pub peer_id: String,
}

#[derive(Debug, Serialize)]
pub struct ClientLeftPayload {
    #[serde(rename = "clientId")]
    pub client_id: String,
}

// Socket handler
pub async fn on_connect(socket: SocketRef, _state: State<RoomManager>) {
    log::info!("[Signaling] Client connected: {}", socket.id);

    // Host creates a room
    socket.on("CREATE_ROOM", |socket: SocketRef, Data::<CreateRoomPayload>(data), state: State<RoomManager>| async move {
        let room_id = data.room_id.clone();
        match state.create_room(room_id.clone(), socket.id.to_string(), data.join_token_hash, data.host_peer_id) {
            Ok(_) => {
                let _ = socket.join(room_id.clone());
                let _ = socket.emit("ROOM_CREATED", RoomCreatedPayload { room_id });
            }
            Err(e) => {
                let _ = socket.emit("ERROR", ErrorPayload {
                    code: "CREATE_ROOM_FAILED".to_string(),
                    message: e,
                });
            }
        }
    });

    // Client joins a room
    socket.on("JOIN_ROOM", |socket: SocketRef, Data::<JoinRoomPayload>(data), state: State<RoomManager>| async move {
        // Resolve target room ID
        let target_room_id = if let Some(rid) = &data.room_id {
            if rid.is_empty() || rid == "default" {
                // Standalone mode: find first active room
                state.get_first_active_room().map(|r| r.room_id)
            } else {
                Some(rid.clone())
            }
        } else {
            state.get_first_active_room().map(|r| r.room_id)
        };

        match target_room_id {
            Some(room_id) => {
                // Always verify the join token.
                //
                // This previously skipped verification whenever room_id was
                // empty or "default", which is exactly what the QR-code guest
                // client sent — so the token was never actually checked and any
                // device on the LAN could join. Room *resolution* still falls
                // back to the first active room (a guest scanning the QR does
                // not know the room id), but resolution and authorisation are
                // now separate: you may be pointed at the room without being
                // let into it.
                let room_res = state.verify_room(&room_id, &data.join_token);

                match room_res {
                    Ok(room) => {
                        let _ = socket.join(room_id.clone());
                        state.add_client(&room_id);

                        // Store socket-to-room mapping
                        state.set_socket_room(&socket.id.to_string(), &room_id);

                        // Notify host
                        let host_socket_id = room.host_socket_id.clone();
                        let host_peer_id = room.host_peer_id.unwrap_or_else(|| room.host_socket_id.clone());
                        let _ = socket.to(host_socket_id).emit("CLIENT_JOINED", ClientJoinedPayload {
                            client_id: socket.id.to_string(),
                            display_name: data.display_name,
                            // The guest's real PeerJS id does not exist yet at this point in
                            // the handshake: `remote-ui/index.html` only constructs its `Peer`
                            // object (and receives an id from the embedded broker) *after*
                            // JOIN_SUCCESS hands it the host's peer id — see `initPeer()` /
                            // `peer.on('open', ...)` there. So JOIN_ROOM cannot carry it, and
                            // this field is filled with the socket.io id as a placeholder.
                            // In practice this is harmless: the host never reads
                            // `CLIENT_JOINED.peerId` (grep confirms no consumer in
                            // apps/host/src), because it identifies connected guests by
                            // `conn.peer` from the actual WebRTC DataConnection instead
                            // (`usePeerHost.ts`). If a real consumer of this field is ever
                            // added, it will need the guest to report its peer id in a
                            // follow-up message after `Peer` finishes opening, not here.
                            peer_id: socket.id.to_string(),
                        });

                        // Confirm to client
                        let _ = socket.emit("JOIN_SUCCESS", JoinSuccessPayload {
                            room_id: room_id.clone(),
                            host_peer_id,
                        });

                        log::info!("[Signaling] Client {} joined room {}", socket.id, room_id);
                    }
                    Err(e) => {
                        let _ = socket.emit("JOIN_REJECTED", JoinRejectedPayload { reason: e });
                    }
                }
            }
            None => {
                 let _ = socket.emit("JOIN_REJECTED", JoinRejectedPayload { reason: "No active host found".to_string() });
            }
        }
    });

    // Handle disconnect
    socket.on_disconnect(|socket: SocketRef, state: State<RoomManager>| async move {
        log::info!("[Signaling] Client disconnected: {}", socket.id);

        // Check if host
        if let Some(room) = state.get_room_by_host_socket(&socket.id.to_string()) {
            // Host disconnected
            let _ = socket.to(room.room_id.clone()).emit("HOST_DISCONNECTED", ());
            state.delete_room(&room.room_id);
            return;
        }

        // Check if client
        if let Some(room_id) = state.get_socket_room(&socket.id.to_string()) {
             if let Some(room) = state.get_room(&room_id) {
                 // Notify host
                 let _ = socket.to(room.host_socket_id).emit("CLIENT_LEFT", ClientLeftPayload {
                     client_id: socket.id.to_string(),
                 });
                 state.remove_client(&room_id);
             }
             state.remove_socket_room(&socket.id.to_string());
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    const TOKEN: &str = "correct-horse-battery-staple";

    fn manager_with_room() -> RoomManager {
        let mgr = RoomManager::new();
        mgr.create_room(
            "room-1".to_string(),
            "host-socket".to_string(),
            hash_token(TOKEN),
            Some("host-peer".to_string()),
        )
        .expect("room creation should succeed");
        mgr
    }

    #[test]
    fn constant_time_eq_matches_plain_comparison() {
        assert!(constant_time_eq(b"abc", b"abc"));
        assert!(!constant_time_eq(b"abc", b"abd"));
        assert!(!constant_time_eq(b"abc", b"ab"));
        assert!(!constant_time_eq(b"", b"a"));
        assert!(constant_time_eq(b"", b""));
        // Differing only in the final byte must still fail; a short-circuiting
        // comparison would too, but this pins the behaviour.
        assert!(!constant_time_eq(b"aaaaaaaaaa", b"aaaaaaaaab"));
    }

    #[test]
    fn verify_room_accepts_the_correct_token() {
        let mgr = manager_with_room();
        assert!(mgr.verify_room("room-1", TOKEN).is_ok());
    }

    #[test]
    fn verify_room_rejects_a_wrong_token() {
        let mgr = manager_with_room();
        assert!(mgr.verify_room("room-1", "wrong").is_err());
    }

    /// The regression this whole change exists for: JOIN_ROOM used to skip
    /// verification when the client sent an empty token, and the shipped guest
    /// UI sent exactly that. An empty token must now be rejected like any other
    /// wrong token.
    #[test]
    fn verify_room_rejects_an_empty_token() {
        let mgr = manager_with_room();
        assert!(mgr.verify_room("room-1", "").is_err());
    }

    #[test]
    fn verify_room_rejects_an_unknown_room() {
        let mgr = manager_with_room();
        assert!(mgr.verify_room("no-such-room", TOKEN).is_err());
    }

    #[test]
    fn verify_room_rejects_a_full_room() {
        let mgr = manager_with_room();
        for _ in 0..MAX_CLIENTS_PER_ROOM {
            mgr.add_client("room-1");
        }
        let err = mgr.verify_room("room-1", TOKEN).unwrap_err();
        assert!(err.contains("full"), "expected a capacity error, got: {err}");
    }

    #[test]
    fn get_first_active_room_resolves_without_authorising() {
        // Resolution and authorisation are deliberately separate: a guest who
        // scanned the QR does not know the room id, so the server still points
        // them at the active room — but still demands a valid token.
        let mgr = manager_with_room();
        let resolved = mgr.get_first_active_room().expect("a room should resolve");
        assert_eq!(resolved.room_id, "room-1");
        assert!(mgr.verify_room(&resolved.room_id, "").is_err());
    }

    #[test]
    fn hash_token_is_stable_and_distinct() {
        assert_eq!(hash_token(TOKEN), hash_token(TOKEN));
        assert_ne!(hash_token(TOKEN), hash_token("other"));
        // SHA-256 hex
        assert_eq!(hash_token(TOKEN).len(), 64);
    }
}
