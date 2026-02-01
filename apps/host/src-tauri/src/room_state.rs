use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

/// Represents a song in the queue
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Song {
    pub id: String,
    #[serde(rename = "youtubeId")]
    pub youtube_id: String,
    pub title: String,
    pub artist: String,
    pub duration: u32,
    #[serde(rename = "thumbnailUrl")]
    pub thumbnail_url: String,
    #[serde(rename = "addedBy")]
    pub added_by: String,
    #[serde(rename = "addedAt")]
    pub added_at: i64,
}

/// Player status
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PlayerStatus {
    Idle,
    Playing,
    Paused,
    Loading,
    Error,
}

/// Player state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerState {
    pub status: PlayerStatus,
    #[serde(rename = "currentSong")]
    pub current_song: Option<Song>,
    #[serde(rename = "currentTime")]
    pub current_time: f64,
    pub duration: f64,
    pub volume: u8,
    #[serde(rename = "isMuted")]
    pub is_muted: bool,
}

/// Connected client information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectedClient {
    pub id: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
    #[serde(rename = "connectedAt")]
    pub connected_at: i64,
}

/// Main room state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomState {
    #[serde(rename = "roomId")]
    pub room_id: String,
    #[serde(rename = "hostPeerId")]
    pub host_peer_id: String,
    #[serde(rename = "connectedClients")]
    pub connected_clients: Vec<ConnectedClient>,
    pub player: PlayerState,
    pub queue: Vec<Song>,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
    #[serde(rename = "updatedAt")]
    pub updated_at: i64,
}

impl RoomState {
    /// Create a new room state
    pub fn new(room_id: String, host_peer_id: String) -> Self {
        let now = chrono::Utc::now().timestamp_millis();
        Self {
            room_id,
            host_peer_id,
            connected_clients: Vec::new(),
            player: PlayerState {
                status: PlayerStatus::Idle,
                current_song: None,
                current_time: 0.0,
                duration: 0.0,
                volume: 80,
                is_muted: false,
            },
            queue: Vec::new(),
            created_at: now,
            updated_at: now,
        }
    }


    /// Add a song to the queue
    pub fn add_song(&mut self, song: Song) {
        let was_empty = self.queue.is_empty() && self.player.current_song.is_none();
        self.queue.push(song);
        
        // Auto-play if queue was empty and nothing is playing
        if was_empty {
            self.play();
        } else {
            self.touch();
        }
    }

    /// Remove a song from the queue by ID
    pub fn remove_song(&mut self, song_id: &str) -> bool {
        if let Some(pos) = self.queue.iter().position(|s| s.id == song_id) {
            self.queue.remove(pos);
            self.touch();
            true
        } else {
            false
        }
    }

    /// Reorder a song in the queue
    pub fn reorder_queue(&mut self, song_id: &str, new_index: usize) -> bool {
        if let Some(current_pos) = self.queue.iter().position(|s| s.id == song_id) {
            if new_index < self.queue.len() {
                let song = self.queue.remove(current_pos);
                self.queue.insert(new_index, song);
                self.touch();
                return true;
            }
        }
        false
    }

    /// Move a song up in the queue
    pub fn move_song_up(&mut self, song_id: &str) -> bool {
        if let Some(pos) = self.queue.iter().position(|s| s.id == song_id) {
            if pos > 0 {
                self.queue.swap(pos, pos - 1);
                self.touch();
                return true;
            }
        }
        false
    }

    /// Move a song down in the queue
    pub fn move_song_down(&mut self, song_id: &str) -> bool {
        if let Some(pos) = self.queue.iter().position(|s| s.id == song_id) {
            if pos < self.queue.len() - 1 {
                self.queue.swap(pos, pos + 1);
                self.touch();
                return true;
            }
        }
        false
    }

    /// Move a song to top of the queue
    pub fn move_song_to_top(&mut self, song_id: &str) -> bool {
        if let Some(pos) = self.queue.iter().position(|s| s.id == song_id) {
            if pos > 0 {
                let song = self.queue.remove(pos);
                self.queue.insert(0, song);
                self.touch();
                return true;
            }
        }
        false
    }

    /// Move a song to bottom of the queue
    pub fn move_song_to_bottom(&mut self, song_id: &str) -> bool {
        if let Some(pos) = self.queue.iter().position(|s| s.id == song_id) {
            if pos < self.queue.len() - 1 {
                let song = self.queue.remove(pos);
                self.queue.push(song);
                self.touch();
                return true;
            }
        }
        false
    }

    /// Update player state
    pub fn update_player(&mut self, status: Option<PlayerStatus>, current_time: Option<f64>, duration: Option<f64>) {
        if let Some(s) = status {
            self.player.status = s;
        }
        if let Some(t) = current_time {
            self.player.current_time = t;
        }
        if let Some(d) = duration {
            self.player.duration = d;
        }
        self.touch();
    }

    /// Set volume
    pub fn set_volume(&mut self, volume: u8) {
        self.player.volume = volume.min(100);
        self.touch();
    }

    /// Toggle mute
    pub fn toggle_mute(&mut self) {
        self.player.is_muted = !self.player.is_muted;
        self.touch();
    }

    /// Skip to next song
    pub fn skip_song(&mut self) {
        if !self.queue.is_empty() {
            self.queue.remove(0);
            self.player.current_song = self.queue.first().cloned();
            self.player.current_time = 0.0;
            self.player.status = if self.player.current_song.is_some() {
                PlayerStatus::Loading
            } else {
                PlayerStatus::Idle
            };
            self.touch();
        }
    }

    /// Play current song
    pub fn play(&mut self) {
        if self.player.current_song.is_some() {
            self.player.status = PlayerStatus::Playing;
            self.touch();
        } else if !self.queue.is_empty() {
            self.player.current_song = Some(self.queue[0].clone());
            self.player.status = PlayerStatus::Loading;
            self.touch();
        }
    }

    /// Pause playback
    pub fn pause(&mut self) {
        self.player.status = PlayerStatus::Paused;
        self.touch();
    }

    /// Seek to a specific time
    pub fn seek(&mut self, time: f64) {
        self.player.current_time = time;
        self.touch();
    }

    /// Add a connected client
    #[allow(dead_code)]
    pub fn add_client(&mut self, client: ConnectedClient) {
        self.connected_clients.push(client);
        self.touch();
    }

    /// Remove a connected client by ID
    #[allow(dead_code)]
    pub fn remove_client(&mut self, client_id: &str) {
        self.connected_clients.retain(|c| c.id != client_id);
        self.touch();
    }

    /// Update the timestamp
    fn touch(&mut self) {
        self.updated_at = chrono::Utc::now().timestamp_millis();
    }
}

/// Thread-safe room state manager
pub struct RoomStateManager {
    state: Arc<RwLock<RoomState>>,
}

impl RoomStateManager {
    /// Create a new room state manager
    pub fn new(room_id: String, host_peer_id: String) -> Self {
        Self {
            state: Arc::new(RwLock::new(RoomState::new(room_id, host_peer_id))),
        }
    }

    /// Get a read lock on the state
    /// Get a write lock on the state
    pub fn write(&self) -> parking_lot::RwLockWriteGuard<'_, RoomState> {
        self.state.write()
    }

    /// Clone the current state
    pub fn clone_state(&self) -> RoomState {
        self.state.read().clone()
    }
}
