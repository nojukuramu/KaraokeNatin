use serde::{Deserialize, Serialize};
use socketioxide::{
    extract::{Data, SocketRef, State},
    SocketIo,
};
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
}

impl RoomManager {
    pub fn new() -> Self {
        Self {
            rooms: Arc::new(RwLock::new(HashMap::new())),
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

        rooms.insert(room_id.clone(), RoomMetadata {
            room_id,
            host_socket_id,
            host_peer_id,
            join_token_hash,
            created_at: now,
            client_count: 0,
        });

        log::info!("[Signaling] Room created: {} (host_socket: {})", rooms.get(&room_id).unwrap().room_id, host_socket_id);
        Ok(())
    }

    pub fn get_room(&self, room_id: &str) -> Option<RoomMetadata> {
        self.rooms.read().get(room_id).cloned()
    }

    pub fn verify_room(&self, room_id: &str, join_token: &str) -> Result<RoomMetadata, String> {
        let room = self.get_room(room_id).ok_or("Room not found")?;

        let token_hash = hash_token(join_token);
        if token_hash != room.join_token_hash {
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

// Wrapper struct for storing room ID in socket extensions
#[derive(Clone, Debug)]
struct ConnectedRoomId(String);

// Socket handler
pub async fn on_connect(socket: SocketRef, state: State<RoomManager>) {
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
                let room_res = if data.room_id.as_deref().unwrap_or("") == "default" || data.room_id.as_deref().unwrap_or("").is_empty() {
                    // Start mode - just get the room if it exists (we already got ID)
                    state.get_room(&room_id).ok_or("Room not found".to_string())
                } else {
                    state.verify_room(&room_id, &data.join_token)
                };

                match room_res {
                    Ok(room) => {
                        let _ = socket.join(room_id.clone());
                        state.add_client(&room_id);

                        // Store metadata in socket extensions
                        socket.extensions.insert(ConnectedRoomId(room_id.clone()));

                        // Notify host
                        let host_socket_id = room.host_socket_id;
                        let _ = socket.to(host_socket_id).emit("CLIENT_JOINED", ClientJoinedPayload {
                            client_id: socket.id.to_string(),
                            display_name: data.display_name,
                            peer_id: socket.id.to_string(), // Using socket ID as temp peer ID
                        });

                        // Confirm to client
                        let _ = socket.emit("JOIN_SUCCESS", JoinSuccessPayload {
                            room_id: room_id.clone(),
                            host_peer_id: room.host_peer_id.unwrap_or_else(|| room.host_socket_id.clone()),
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
        if let Some(ConnectedRoomId(room_id)) = socket.extensions.get::<ConnectedRoomId>() {
             if let Some(room) = state.get_room(room_id) {
                 // Notify host
                 let _ = socket.to(room.host_socket_id).emit("CLIENT_LEFT", ClientLeftPayload {
                     client_id: socket.id.to_string(),
                 });
                 state.remove_client(room_id);
             }
        }
    });
}
