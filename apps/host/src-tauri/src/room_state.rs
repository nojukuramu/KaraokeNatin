use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::path::PathBuf;
use std::fs;

/// Load playlists from file
fn load_playlists_from_file(path: &PathBuf) -> Vec<PlaylistCollection> {
    if path.exists() {
        match fs::read_to_string(path) {
            Ok(content) => {
                match serde_json::from_str::<Vec<PlaylistCollection>>(&content) {
                    Ok(playlists) => {
                        let total_songs: usize = playlists.iter().map(|c| c.songs.len()).sum();
                        log::info!("Loaded {} collections ({} total songs) from playlists file: {:?}", playlists.len(), total_songs, path);
                        return playlists;
                    }
                    Err(e) => log::error!("Failed to parse playlists file {:?}: {}", path, e),
                }
            }
            Err(e) => log::error!("Failed to read playlists file {:?}: {}", path, e),
        }
    }
    Vec::new()
}

/// Save playlists to file
fn save_playlists_to_file(path: &PathBuf, playlists: &[PlaylistCollection]) {
    match serde_json::to_string_pretty(playlists) {
        Ok(content) => {
            if let Err(e) = fs::write(path, content) {
                log::error!("Failed to write playlists file {:?}: {}", path, e);
            } else {
                let total_songs: usize = playlists.iter().map(|c| c.songs.len()).sum();
                log::info!("Saved {} collections ({} total songs) to playlists file: {:?}", playlists.len(), total_songs, path);
            }
        }
        Err(e) => log::error!("Failed to serialize playlists: {}", e),
    }
}

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

/// Collection visibility
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum CollectionVisibility {
    Public,
    Personal,
}

/// A named collection of songs (playlist)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaylistCollection {
    pub id: String,
    pub name: String,
    pub visibility: CollectionVisibility,
    pub songs: Vec<Song>,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
    #[serde(rename = "updatedAt")]
    pub updated_at: i64,
}

// ============================================================
// PlaylistStore — standalone, decoupled from Room lifecycle
// ============================================================

/// Thread-safe playlist store (always available, both Host and Guest modes)
pub struct PlaylistStore {
    base_path: Arc<RwLock<Option<PathBuf>>>,
    playlists: Arc<RwLock<Vec<PlaylistCollection>>>,
}

impl PlaylistStore {
    pub fn new() -> Self {
        Self {
            base_path: Arc::new(RwLock::new(None)),
            playlists: Arc::new(RwLock::new(Vec::new())),
        }
    }

    /// Initialize the store with a persistent path and load data
    pub fn initialize(&self, app_data_dir: PathBuf) -> Vec<PlaylistCollection> {
        let mut path = app_data_dir;
        let _ = fs::create_dir_all(&path);
        path.push("playlists.json");
        
        // 1. Check if new path exists
        if !path.exists() {
            // 2. Try migration from old 'KaraokeNatin' dir if on desktop
            #[cfg(not(target_os = "android"))]
            {
                let old_base = dirs::data_local_dir()
                    .or_else(|| dirs::data_dir());
                
                if let Some(mut old_path) = old_base {
                    old_path.push("KaraokeNatin");
                    
                    // Try migrating playlists.json
                    let mut old_playlists_json = old_path.clone();
                    old_playlists_json.push("playlists.json");
                    
                    if old_playlists_json.exists() {
                        log::info!("Migrating existing playlists.json from {:?}", old_playlists_json);
                        if let Ok(_) = fs::copy(&old_playlists_json, &path) {
                            // Optionally remove if you want to be clean, but maybe safer to keep for now
                            // let _ = fs::remove_file(&old_playlists_json);
                        }
                    } else {
                        // Try migrating legacy playlist.json
                        let mut legacy_json = old_path.clone();
                        legacy_json.push("playlist.json");
                        
                        if legacy_json.exists() {
                            log::info!("Migrating legacy playlist.json from {:?}", legacy_json);
                            if let Ok(content) = fs::read_to_string(&legacy_json) {
                                if let Ok(songs) = serde_json::from_str::<Vec<Song>>(&content) {
                                    let now = chrono::Utc::now().timestamp_millis();
                                    let default_collection = PlaylistCollection {
                                        id: uuid::Uuid::new_v4().to_string(),
                                        name: "Default Playlist".to_string(),
                                        visibility: CollectionVisibility::Public,
                                        songs,
                                        created_at: now,
                                        updated_at: now,
                                    };
                                    save_playlists_to_file(&path, &[default_collection]);
                                    // let _ = fs::remove_file(&legacy_json);
                                }
                            }
                        }
                    }
                }
            }
        }

        let loaded_playlists = load_playlists_from_file(&path);
        
        *self.base_path.write() = Some(path);
        *self.playlists.write() = loaded_playlists.clone();
        
        loaded_playlists
    }

    fn save(&self) {
        let pl = self.playlists.read();
        if let Some(path) = self.base_path.read().as_ref() {
            save_playlists_to_file(path, &pl);
        }
    }

    /// Get a snapshot of all playlists
    pub fn get_all(&self) -> Vec<PlaylistCollection> {
        self.playlists.read().clone()
    }

    /// Get only public playlists (for broadcasting to remotes)
    pub fn get_public(&self) -> Vec<PlaylistCollection> {
        self.playlists.read().iter()
            .filter(|c| c.visibility == CollectionVisibility::Public)
            .cloned()
            .collect()
    }

    /// Create a new playlist collection, returns its ID
    pub fn create_collection(&self, name: String, visibility: CollectionVisibility) -> String {
        let now = chrono::Utc::now().timestamp_millis();
        let id = uuid::Uuid::new_v4().to_string();
        {
            let mut pl = self.playlists.write();
            pl.push(PlaylistCollection {
                id: id.clone(),
                name,
                visibility,
                songs: Vec::new(),
                created_at: now,
                updated_at: now,
            });
        }
        self.save();
        id
    }

    /// Delete a playlist collection
    pub fn delete_collection(&self, collection_id: &str) -> bool {
        let success = {
            let mut pl = self.playlists.write();
            if let Some(pos) = pl.iter().position(|c| c.id == collection_id) {
                pl.remove(pos);
                true
            } else {
                false
            }
        };
        if success {
            self.save();
        }
        success
    }

    /// Rename a playlist collection
    pub fn rename_collection(&self, collection_id: &str, name: String) -> bool {
        let success = {
            let mut pl = self.playlists.write();
            if let Some(col) = pl.iter_mut().find(|c| c.id == collection_id) {
                col.name = name;
                col.updated_at = chrono::Utc::now().timestamp_millis();
                true
            } else {
                false
            }
        };
        if success {
            self.save();
        }
        success
    }

    /// Set visibility of a playlist collection
    pub fn set_collection_visibility(&self, collection_id: &str, visibility: CollectionVisibility) -> bool {
        let success = {
            let mut pl = self.playlists.write();
            if let Some(col) = pl.iter_mut().find(|c| c.id == collection_id) {
                col.visibility = visibility;
                col.updated_at = chrono::Utc::now().timestamp_millis();
                true
            } else {
                false
            }
        };
        if success {
            self.save();
        }
        success
    }

    /// Add a song to a specific collection
    pub fn add_to_collection(&self, collection_id: &str, song: Song) -> bool {
        let success = {
            let mut pl = self.playlists.write();
            if let Some(col) = pl.iter_mut().find(|c| c.id == collection_id) {
                col.songs.push(song);
                col.updated_at = chrono::Utc::now().timestamp_millis();
                true
            } else {
                false
            }
        };
        if success {
            self.save();
        }
        success
    }

    /// Remove a song from a specific collection
    pub fn remove_from_collection(&self, collection_id: &str, song_id: &str) -> bool {
        let success = {
            let mut pl = self.playlists.write();
            if let Some(col) = pl.iter_mut().find(|c| c.id == collection_id) {
                if let Some(pos) = col.songs.iter().position(|s| s.id == song_id) {
                    col.songs.remove(pos);
                    col.updated_at = chrono::Utc::now().timestamp_millis();
                    true
                } else {
                    false
                }
            } else {
                false
            }
        };
        if success {
            self.save();
        }
        success
    }

    /// Copy a song from a collection, returning a new Song for the queue
    pub fn clone_song_for_queue(&self, collection_id: &str, song_id: &str) -> Option<Song> {
        let pl = self.playlists.read();
        pl.iter()
            .find(|c| c.id == collection_id)
            .and_then(|c| c.songs.iter().find(|s| s.id == song_id))
            .map(|song| Song {
                id: uuid::Uuid::new_v4().to_string(),
                youtube_id: song.youtube_id.clone(),
                title: song.title.clone(),
                artist: song.artist.clone(),
                duration: song.duration,
                thumbnail_url: song.thumbnail_url.clone(),
                added_by: song.added_by.clone(),
                added_at: chrono::Utc::now().timestamp_millis(),
            })
    }

    /// Get the default collection ID, creating one if none exist
    pub fn get_or_create_default_collection(&self) -> String {
        {
            let pl = self.playlists.read();
            if let Some(first) = pl.first() {
                return first.id.clone();
            }
        }
        self.create_collection("Default Playlist".to_string(), CollectionVisibility::Public)
    }

    /// Import a collection from JSON data
    pub fn import_collection(&self, data: &str) -> Result<String, String> {
        #[derive(Deserialize)]
        struct ExportedCollection {
            #[allow(dead_code)]
            karaokenatin: String,
            collection: ImportedCollectionData,
        }
        #[derive(Deserialize)]
        struct ImportedCollectionData {
            name: String,
            visibility: CollectionVisibility,
            songs: Vec<Song>,
        }

        let exported: ExportedCollection = serde_json::from_str(data)
            .map_err(|e| format!("Invalid collection data: {}", e))?;
        
        let now = chrono::Utc::now().timestamp_millis();
        let id = uuid::Uuid::new_v4().to_string();
        
        let songs: Vec<Song> = exported.collection.songs.into_iter().map(|mut s| {
            s.id = uuid::Uuid::new_v4().to_string();
            s.added_at = now;
            s
        }).collect();
        
        {
            let mut pl = self.playlists.write();
            
            // Check for name collision and add suffix if needed
            let base_name = exported.collection.name.clone();
            let mut final_name = exported.collection.name;
            let mut suffix_count = 0;
            while pl.iter().any(|c| c.name == final_name) {
                suffix_count += 1;
                if suffix_count == 1 {
                    final_name = format!("{} (Imported)", final_name);
                } else {
                    final_name = format!("{} (Imported {})", base_name, suffix_count);
                }
            }

            pl.push(PlaylistCollection {
                id: id.clone(),
                name: final_name,
                visibility: exported.collection.visibility,
                songs,
                created_at: now,
                updated_at: now,
            });
        }
        self.save();
        Ok(id)
    }

    /// Export a collection to JSON
    pub fn export_collection(&self, collection_id: &str) -> Result<String, String> {
        let pl = self.playlists.read();
        let col = pl.iter().find(|c| c.id == collection_id)
            .ok_or_else(|| "Collection not found".to_string())?;
        
        #[derive(Serialize)]
        struct ExportedCollection<'a> {
            karaokenatin: &'a str,
            collection: ExportedCollectionData<'a>,
        }
        #[derive(Serialize)]
        struct ExportedCollectionData<'a> {
            name: &'a str,
            visibility: &'a CollectionVisibility,
            songs: &'a [Song],
        }

        let export = ExportedCollection {
            karaokenatin: "1.0",
            collection: ExportedCollectionData {
                name: &col.name,
                visibility: &col.visibility,
                songs: &col.songs,
            },
        };
        
        serde_json::to_string_pretty(&export)
            .map_err(|e| format!("Failed to serialize: {}", e))
    }
}

// ============================================================
// RoomState — player + queue state for Host Mode
// ============================================================

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

/// Main room state (for Host Mode broadcasting)
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
    pub playlists: Vec<PlaylistCollection>,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
    #[serde(rename = "updatedAt")]
    pub updated_at: i64,
}

impl RoomState {
    /// Create a new room state (playlists injected from PlaylistStore)
    pub fn new(room_id: String, host_peer_id: String, playlists: Vec<PlaylistCollection>) -> Self {
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
            playlists,
            created_at: now,
            updated_at: now,
        }
    }

    /// Refresh playlists from PlaylistStore snapshot
    pub fn sync_playlists(&mut self, playlists: Vec<PlaylistCollection>) {
        self.playlists = playlists;
        self.touch();
    }

    /// Add a song to the queue
    pub fn add_song(&mut self, song: Song) {
        if self.player.current_song.is_none() {
            self.player.current_song = Some(song);
            self.player.status = PlayerStatus::Loading;
            self.player.current_time = 0.0;
        } else {
            self.queue.push(song);
        }
        self.touch();
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
            let next_song = self.queue.remove(0);
            self.player.current_song = Some(next_song);
            self.player.current_time = 0.0;
            self.player.status = PlayerStatus::Loading;
        } else {
            self.player.current_song = None;
            self.player.current_time = 0.0;
            self.player.status = PlayerStatus::Idle;
        }
        self.touch();
    }

    /// Play current song
    pub fn play(&mut self) {
        if self.player.current_song.is_some() {
            self.player.status = PlayerStatus::Playing;
            self.touch();
        } else if !self.queue.is_empty() {
            let next_song = self.queue.remove(0);
            self.player.current_song = Some(next_song);
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

    /// Get a copy of the state with only public playlists (for broadcasting to remote clients)
    pub fn public_state(&self) -> RoomState {
        let mut state = self.clone();
        state.playlists.retain(|c| c.visibility == CollectionVisibility::Public);
        state
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
    pub fn new(room_id: String, host_peer_id: String, playlists: Vec<PlaylistCollection>) -> Self {
        Self {
            state: Arc::new(RwLock::new(RoomState::new(room_id, host_peer_id, playlists))),
        }
    }

    /// Get a write lock on the state
    pub fn write(&self) -> parking_lot::RwLockWriteGuard<'_, RoomState> {
        self.state.write()
    }

    /// Clone the current state (full, including personal collections — for host UI)
    pub fn clone_state(&self) -> RoomState {
        self.state.read().clone()
    }

    /// Clone a filtered state (public only — for broadcast to remote clients)
    pub fn clone_public_state(&self) -> RoomState {
        self.state.read().public_state()
    }
}
