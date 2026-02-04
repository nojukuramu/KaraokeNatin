use crate::room_state::{RoomStateManager, Song, PlayerStatus};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

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
    // Playlist commands
    PLAYLIST_ADD {
        #[serde(rename = "youtubeUrl")]
        youtube_url: String,
        #[serde(rename = "addedBy")]
        added_by: Option<String>,
    },
    PLAYLIST_REMOVE {
        #[serde(rename = "songId")]
        song_id: String,
    },
    PLAYLIST_TO_QUEUE {
        #[serde(rename = "songId")]
        song_id: String,
    },
}

/// Create a new room
#[tauri::command]
pub fn create_room(_state: tauri::State<RoomStateManager>) -> Result<CreateRoomResponse, String> {
    // Generate unique room ID and join token
    let room_id = generate_room_id();
    let join_token = generate_join_token();
    
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
            // Extract YouTube ID from URL
            let youtube_id = extract_youtube_id(&youtube_url)
                .ok_or_else(|| "Invalid YouTube URL".to_string())?;
            
            // Fetch metadata using yt-dlp
            match crate::sidecar::fetch_metadata(&youtube_id).await {
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
            // This would be handled differently - storing client metadata
            log::info!("Client set display name: {}", name);
        }
        ClientCommand::PING => {
            // Respond to ping - handled at protocol level
        }
        ClientCommand::PLAYLIST_ADD { youtube_url, added_by } => {
            // Extract YouTube ID from URL
            let youtube_id = extract_youtube_id(&youtube_url)
                .ok_or_else(|| "Invalid YouTube URL".to_string())?;
            
            // Fetch metadata using yt-dlp
            match crate::sidecar::fetch_metadata(&youtube_id).await {
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
                    state.write().add_to_playlist(song);
                }
                Err(e) => {
                    log::error!("Failed to fetch metadata: {}", e);
                    return Err(format!("Failed to fetch song metadata: {}", e));
                }
            }
        }
        ClientCommand::PLAYLIST_REMOVE { song_id } => {
            if !state.write().remove_from_playlist(&song_id) {
                return Err("Song not found in playlist".to_string());
            }
        }
        ClientCommand::PLAYLIST_TO_QUEUE { song_id } => {
            if !state.write().playlist_to_queue(&song_id) {
                return Err("Song not found in playlist".to_string());
            }
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
