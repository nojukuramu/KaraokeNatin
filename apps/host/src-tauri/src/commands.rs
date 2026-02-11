use crate::room_state::{RoomStateManager, PlaylistStore, Song, PlaylistCollection, PlayerStatus, CollectionVisibility};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

/// Guard so start_host_server is idempotent
static SERVER_STARTED: AtomicBool = AtomicBool::new(false);

/// Client command types (from P2P protocol)
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type")]
#[allow(non_camel_case_types)]
pub enum ClientCommand {
    PLAY,
    PAUSE,
    SKIP,
    SEEK { time: f64 },
    SET_VOLUME { volume: u8 },
    TOGGLE_MUTE,
    ADD_SONG {
        #[serde(rename = "youtubeUrl")]
        youtube_url: String,
        #[serde(rename = "addedBy")]
        added_by: Option<String>,
    },
    REMOVE_SONG {
        #[serde(rename = "songId")]
        song_id: String,
    },
    MOVE_SONG_UP {
        #[serde(rename = "songId")]
        song_id: String,
    },
    MOVE_SONG_DOWN {
        #[serde(rename = "songId")]
        song_id: String,
    },
    MOVE_SONG_TO_TOP {
        #[serde(rename = "songId")]
        song_id: String,
    },
    MOVE_SONG_TO_BOTTOM {
        #[serde(rename = "songId")]
        song_id: String,
    },
    REORDER_QUEUE {
        #[serde(rename = "songId")]
        song_id: String,
        #[serde(rename = "newIndex")]
        new_index: usize,
    },
    SET_DISPLAY_NAME { name: String },
    PING,
    // Collection-based playlist commands
    PLAYLIST_ADD {
        #[serde(rename = "youtubeUrl")]
        youtube_url: String,
        #[serde(rename = "collectionId")]
        collection_id: String,
        #[serde(rename = "addedBy")]
        added_by: Option<String>,
    },
    PLAYLIST_REMOVE {
        #[serde(rename = "songId")]
        song_id: String,
        #[serde(rename = "collectionId")]
        collection_id: String,
    },
    PLAYLIST_TO_QUEUE {
        #[serde(rename = "songId")]
        song_id: String,
        #[serde(rename = "collectionId")]
        collection_id: String,
    },
    // Collection management commands
    CREATE_COLLECTION {
        name: String,
        #[serde(default = "default_public_visibility")]
        visibility: CollectionVisibility,
    },
    DELETE_COLLECTION {
        #[serde(rename = "collectionId")]
        collection_id: String,
    },
    RENAME_COLLECTION {
        #[serde(rename = "collectionId")]
        collection_id: String,
        name: String,
    },
    SET_COLLECTION_VISIBILITY {
        #[serde(rename = "collectionId")]
        collection_id: String,
        visibility: CollectionVisibility,
    },
    IMPORT_COLLECTION {
        data: String,
    },
}

fn default_public_visibility() -> CollectionVisibility {
    CollectionVisibility::Public
}

/// Create a new room
#[tauri::command]
pub fn create_room(
    state: tauri::State<RoomStateManager>,
    playlists: tauri::State<PlaylistStore>,
) -> Result<CreateRoomResponse, String> {
    // Generate unique room ID and join token
    let room_id = generate_room_id();
    let join_token = generate_join_token();
    
    // Sync latest playlists from store into the new room state
    // This ensures that if the user created playlists in Guest mode (via bridge),
    // they are immediately available in the new Host session.
    state.write().sync_playlists(playlists.get_all());
    
    log::info!("Created room: {} with token", room_id);
    
    Ok(CreateRoomResponse {
        room_id,
        join_token,
    })
}

/// Get the QR code URL for clients to connect
#[tauri::command]
pub fn get_qr_url() -> Result<String, String> {
    crate::network::generate_qr_url()
}

/// Get the web server port
#[tauri::command]
pub fn get_server_port() -> u16 {
    crate::web_server::get_server_port()
}

/// Get the current room state
#[tauri::command]
pub fn get_room_state(state: tauri::State<RoomStateManager>) -> Result<crate::room_state::RoomState, String> {
    Ok(state.clone_state())
}

/// Search YouTube for videos
#[tauri::command]
pub async fn search_youtube(query: String, limit: Option<u32>) -> Result<Vec<crate::youtube::SearchResult>, String> {
    let search_limit = limit.unwrap_or(10);
    crate::youtube::search_youtube(&query, search_limit).await
}

/// Process a client command
#[tauri::command]
pub async fn process_command(
    command: ClientCommand,
    state: tauri::State<'_, RoomStateManager>,
    playlists: tauri::State<'_, PlaylistStore>,
    app: AppHandle,
) -> Result<(), String> {
    log::info!("Processing command: {:?}", command);
    
    match command {
        ClientCommand::PLAY => {
            state.write().play();
        }
        ClientCommand::PAUSE => {
            state.write().pause();
        }
        ClientCommand::SKIP => {
            state.write().skip_song();
        }
        ClientCommand::SEEK { time } => {
            state.write().seek(time);
        }
        ClientCommand::SET_VOLUME { volume } => {
            state.write().set_volume(volume);
        }
        ClientCommand::TOGGLE_MUTE => {
            state.write().toggle_mute();
        }
        ClientCommand::ADD_SONG { youtube_url, added_by } => {
            let youtube_id = extract_youtube_id(&youtube_url)
                .ok_or_else(|| "Invalid YouTube URL".to_string())?;
            
            match crate::metadata::fetch_metadata(&youtube_id).await {
                Ok(metadata) => {
                    let song = Song {
                        id: Uuid::new_v4().to_string(),
                        youtube_id: youtube_id.clone(),
                        title: metadata.title,
                        artist: metadata.artist,
                        duration: metadata.duration,
                        thumbnail_url: metadata.thumbnail_url,
                        added_by: added_by.unwrap_or_else(|| "Guest".to_string()),
                        added_at: chrono::Utc::now().timestamp_millis(),
                    };
                    state.write().add_song(song);
                }
                Err(e) => {
                    log::error!("Failed to fetch metadata: {}", e);
                    return Err(format!("Failed to fetch song metadata: {}", e));
                }
            }
        }
        ClientCommand::REMOVE_SONG { song_id } => {
            if !state.write().remove_song(&song_id) {
                return Err("Song not found".to_string());
            }
        }
        ClientCommand::MOVE_SONG_UP { song_id } => {
            state.write().move_song_up(&song_id);
        }
        ClientCommand::MOVE_SONG_DOWN { song_id } => {
            state.write().move_song_down(&song_id);
        }
        ClientCommand::MOVE_SONG_TO_TOP { song_id } => {
            state.write().move_song_to_top(&song_id);
        }
        ClientCommand::MOVE_SONG_TO_BOTTOM { song_id } => {
            state.write().move_song_to_bottom(&song_id);
        }
        ClientCommand::REORDER_QUEUE { song_id, new_index } => {
            if !state.write().reorder_queue(&song_id, new_index) {
                return Err("Failed to reorder queue".to_string());
            }
        }
        ClientCommand::SET_DISPLAY_NAME { name } => {
            log::info!("Client set display name: {}", name);
        }
        ClientCommand::PING => {}
        // ---- playlist commands delegate to PlaylistStore ----
        ClientCommand::PLAYLIST_ADD { youtube_url, collection_id, added_by } => {
            let youtube_id = extract_youtube_id(&youtube_url)
                .ok_or_else(|| "Invalid YouTube URL".to_string())?;
            
            match crate::metadata::fetch_metadata(&youtube_id).await {
                Ok(metadata) => {
                    let song = Song {
                        id: Uuid::new_v4().to_string(),
                        youtube_id: youtube_id.clone(),
                        title: metadata.title,
                        artist: metadata.artist,
                        duration: metadata.duration,
                        thumbnail_url: metadata.thumbnail_url,
                        added_by: added_by.unwrap_or_else(|| "Guest".to_string()),
                        added_at: chrono::Utc::now().timestamp_millis(),
                    };
                    let target_id = if collection_id.is_empty() {
                        playlists.get_or_create_default_collection()
                    } else {
                        collection_id
                    };
                    if !playlists.add_to_collection(&target_id, song) {
                        return Err("Collection not found".to_string());
                    }
                    // Sync snapshot into room state
                    state.write().sync_playlists(playlists.get_all());
                }
                Err(e) => {
                    log::error!("Failed to fetch metadata: {}", e);
                    return Err(format!("Failed to fetch song metadata: {}", e));
                }
            }
        }
        ClientCommand::PLAYLIST_REMOVE { song_id, collection_id } => {
            if !playlists.remove_from_collection(&collection_id, &song_id) {
                return Err("Song not found in collection".to_string());
            }
            state.write().sync_playlists(playlists.get_all());
        }
        ClientCommand::PLAYLIST_TO_QUEUE { song_id, collection_id } => {
            if let Some(song) = playlists.clone_song_for_queue(&collection_id, &song_id) {
                state.write().add_song(song);
            } else {
                return Err("Song not found in collection".to_string());
            }
        }
        ClientCommand::CREATE_COLLECTION { name, visibility } => {
            playlists.create_collection(name, visibility);
            state.write().sync_playlists(playlists.get_all());
        }
        ClientCommand::DELETE_COLLECTION { collection_id } => {
            if !playlists.delete_collection(&collection_id) {
                return Err("Collection not found".to_string());
            }
            state.write().sync_playlists(playlists.get_all());
        }
        ClientCommand::RENAME_COLLECTION { collection_id, name } => {
            if !playlists.rename_collection(&collection_id, name) {
                return Err("Collection not found".to_string());
            }
            state.write().sync_playlists(playlists.get_all());
        }
        ClientCommand::SET_COLLECTION_VISIBILITY { collection_id, visibility } => {
            if !playlists.set_collection_visibility(&collection_id, visibility) {
                return Err("Collection not found".to_string());
            }
            state.write().sync_playlists(playlists.get_all());
        }
        ClientCommand::IMPORT_COLLECTION { data } => {
            playlists.import_collection(&data)
                .map_err(|e| format!("Import failed: {}", e))?;
            state.write().sync_playlists(playlists.get_all());
        }
    }
    
    // Emit state update event to frontend
    let new_state = state.clone_state();
    app.emit("room_state_updated", new_state)
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

/// Update player state (called from frontend YouTube player)
#[tauri::command]
pub fn update_player_state(
    status: Option<String>,
    current_time: Option<f64>,
    duration: Option<f64>,
    state: tauri::State<RoomStateManager>,
    app: AppHandle,
) -> Result<(), String> {
    let player_status = status.and_then(|s| match s.as_str() {
        "playing" => Some(PlayerStatus::Playing),
        "paused" => Some(PlayerStatus::Paused),
        "loading" => Some(PlayerStatus::Loading),
        "error" => Some(PlayerStatus::Error),
        "idle" => Some(PlayerStatus::Idle),
        _ => None,
    });
    
    state.write().update_player(player_status, current_time, duration);
    
    // Emit state update
    let new_state = state.clone_state();
    app.emit("room_state_updated", new_state)
        .map_err(|e| e.to_string())?;
    
    Ok(())
}

/// Export a collection to JSON string
#[tauri::command]
pub fn export_collection(collection_id: String, playlists: tauri::State<PlaylistStore>) -> Result<String, String> {
    playlists.export_collection(&collection_id)
}

// ============================================================
// Standalone playlist commands (available in ALL modes)
// ============================================================

/// Get all playlists (for Guest Mode local playlists too)
#[tauri::command]
pub fn get_playlists(playlists: tauri::State<PlaylistStore>) -> Vec<PlaylistCollection> {
    playlists.get_all()
}

/// Create a collection (standalone)
#[tauri::command]
pub fn playlist_create_collection(
    name: String,
    visibility: Option<String>,
    playlists: tauri::State<PlaylistStore>,
) -> String {
    let vis = match visibility.as_deref() {
        Some("personal") => CollectionVisibility::Personal,
        _ => CollectionVisibility::Public,
    };
    playlists.create_collection(name, vis)
}

/// Delete a collection (standalone)
#[tauri::command]
pub fn playlist_delete_collection(
    collection_id: String,
    playlists: tauri::State<PlaylistStore>,
) -> Result<(), String> {
    if playlists.delete_collection(&collection_id) {
        Ok(())
    } else {
        Err("Collection not found".into())
    }
}

/// Rename a collection (standalone)
#[tauri::command]
pub fn playlist_rename_collection(
    collection_id: String,
    name: String,
    playlists: tauri::State<PlaylistStore>,
) -> Result<(), String> {
    if playlists.rename_collection(&collection_id, name) {
        Ok(())
    } else {
        Err("Collection not found".into())
    }
}

/// Set collection visibility (standalone)
#[tauri::command]
pub fn playlist_set_visibility(
    collection_id: String,
    visibility: String,
    playlists: tauri::State<PlaylistStore>,
) -> Result<(), String> {
    let vis = match visibility.as_str() {
        "personal" => CollectionVisibility::Personal,
        _ => CollectionVisibility::Public,
    };
    if playlists.set_collection_visibility(&collection_id, vis) {
        Ok(())
    } else {
        Err("Collection not found".into())
    }
}

/// Add a song to a collection (standalone, fetches metadata)
#[tauri::command]
pub async fn playlist_add_song(
    youtube_url: String,
    collection_id: String,
    added_by: Option<String>,
    playlists: tauri::State<'_, PlaylistStore>,
) -> Result<(), String> {
    let youtube_id = extract_youtube_id(&youtube_url)
        .ok_or_else(|| "Invalid YouTube URL".to_string())?;
    let metadata = crate::metadata::fetch_metadata(&youtube_id).await
        .map_err(|e| format!("Failed to fetch metadata: {}", e))?;
    let song = Song {
        id: Uuid::new_v4().to_string(),
        youtube_id,
        title: metadata.title,
        artist: metadata.artist,
        duration: metadata.duration,
        thumbnail_url: metadata.thumbnail_url,
        added_by: added_by.unwrap_or_else(|| "Host".to_string()),
        added_at: chrono::Utc::now().timestamp_millis(),
    };
    let target_id = if collection_id.is_empty() {
        playlists.get_or_create_default_collection()
    } else {
        collection_id
    };
    if playlists.add_to_collection(&target_id, song) {
        Ok(())
    } else {
        Err("Collection not found".into())
    }
}

/// Remove a song from a collection (standalone)
#[tauri::command]
pub fn playlist_remove_song(
    collection_id: String,
    song_id: String,
    playlists: tauri::State<PlaylistStore>,
) -> Result<(), String> {
    if playlists.remove_from_collection(&collection_id, &song_id) {
        Ok(())
    } else {
        Err("Song not found in collection".into())
    }
}

/// Import a collection from JSON string (standalone)
#[tauri::command]
pub fn playlist_import_collection(
    data: String,
    playlists: tauri::State<PlaylistStore>,
) -> Result<String, String> {
    playlists.import_collection(&data)
}

/// Save a collection to a file (using system file dialog)
#[tauri::command]
pub async fn save_collection_to_file(
    collection_id: String,
    playlists: tauri::State<'_, PlaylistStore>,
    app: AppHandle,
) -> Result<(), String> {
    let json = playlists.export_collection(&collection_id)?;
    log::info!("Exporting collection {} (JSON length: {})", collection_id, json.len());
    
    // Get a suggested filename from collection name
    let all = playlists.get_all();
    let col_name = all.iter()
        .find(|c| c.id == collection_id)
        .map(|c| c.name.clone())
        .unwrap_or_else(|| "playlist".to_string());
    let safe_name = col_name.replace(|c: char| !c.is_alphanumeric() && c != ' ' && c != '-' && c != '_', "");
    
    use tauri_plugin_dialog::DialogExt;
    let path = app.dialog()
        .file()
        .set_file_name(&format!("{}.karaoke.json", safe_name))
        .add_filter("KaraokeNatin Playlist", &["karaoke.json", "json"])
        .blocking_save_file();
    
    if let Some(file_path) = path {
        let p = file_path.as_path().unwrap();
        log::info!("Saving collection to: {:?}", p);
        std::fs::write(p, &json)
            .map_err(|e| format!("Failed to write file: {}", e))?;
        
        // Final verification check
        if let Ok(metadata) = std::fs::metadata(p) {
            log::info!("Verified saved file size: {} bytes", metadata.len());
        }
        
        Ok(())
    } else {
        Err("Save cancelled".into())
    }
}

/// Load a collection from a file (using system file dialog)
#[tauri::command]
pub async fn load_collection_from_file(
    playlists: tauri::State<'_, PlaylistStore>,
    app: AppHandle,
) -> Result<String, String> {
    use tauri_plugin_dialog::DialogExt;
    let path = app.dialog()
        .file()
        .add_filter("KaraokeNatin Playlist", &["karaoke.json", "json"])
        .blocking_pick_file();
    
    if let Some(file_path) = path {
        let data = std::fs::read_to_string(file_path.as_path().unwrap())
            .map_err(|e| format!("Failed to read file: {}", e))?;
        playlists.import_collection(&data)
    } else {
        Err("Open cancelled".into())
    }
}

// ============================================================
// Lazy host server start
// ============================================================

/// Start the web/signaling server (called when entering Host Mode)
#[tauri::command]
pub fn start_host_server() -> Result<u16, String> {
    if SERVER_STARTED.swap(true, Ordering::SeqCst) {
        // Already started — just return port
        return Ok(crate::web_server::get_server_port());
    }

    std::thread::spawn(|| {
        let rt = tokio::runtime::Runtime::new().expect("Failed to create Tokio runtime");
        rt.block_on(async {
            log::info!("[Tauri] Starting embedded web server...");
            if let Err(e) = crate::web_server::start_web_server().await {
                log::error!("[Tauri] Web server error: {}", e);
            }
        });
    });

    // Wait for bind
    std::thread::sleep(std::time::Duration::from_millis(500));
    let port = crate::web_server::get_server_port();
    log::info!("[Tauri] Web server (and signaling) on port {}", port);
    Ok(port)
}

/// Response types
#[derive(Debug, Serialize)]
pub struct CreateRoomResponse {
    pub room_id: String,
    pub join_token: String,
}

/// Generate a unique room ID
fn generate_room_id() -> String {
    use sha2::{Sha256, Digest};
    
    let uuid = Uuid::new_v4();
    let mut hasher = Sha256::new();
    hasher.update(uuid.as_bytes());
    let result = hasher.finalize();
    hex::encode(&result[..3]) // 6 characters
}

/// Generate a secure join token
fn generate_join_token() -> String {
    Uuid::new_v4().to_string().replace("-", "")
}

/// Extract YouTube video ID from URL
fn extract_youtube_id(url: &str) -> Option<String> {
    // Support various YouTube URL formats
    // https://www.youtube.com/watch?v=VIDEO_ID
    // https://youtu.be/VIDEO_ID
    // youtube.com/watch?v=VIDEO_ID
    
    if let Some(pos) = url.find("v=") {
        let start = pos + 2;
        let end = url[start..].find('&').map(|p| start + p).unwrap_or(url.len());
        Some(url[start..end].to_string())
    } else if url.contains("youtu.be/") {
        if let Some(pos) = url.find("youtu.be/") {
            let start = pos + 9;
            let end = url[start..].find('?').map(|p| start + p).unwrap_or(url.len());
            Some(url[start..end].to_string())
        } else {
            None
        }
    } else {
        // Assume it's already a video ID
        if url.len() == 11 {
            Some(url.to_string())
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_youtube_id() {
        assert_eq!(
            extract_youtube_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
            Some("dQw4w9WgXcQ".to_string())
        );
        assert_eq!(
            extract_youtube_id("https://youtu.be/dQw4w9WgXcQ"),
            Some("dQw4w9WgXcQ".to_string())
        );
        assert_eq!(
            extract_youtube_id("dQw4w9WgXcQ"),
            Some("dQw4w9WgXcQ".to_string())
        );
    }
}
