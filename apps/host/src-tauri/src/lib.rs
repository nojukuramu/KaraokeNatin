#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod room_state;
mod commands;
mod metadata;
mod network;
mod web_server;
mod youtube;
mod signaling;

use room_state::{RoomStateManager, PlaylistStore};
use uuid::Uuid;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // PlaylistStore is always available (both Host & Guest modes)
    let playlist_store = PlaylistStore::new();

    // Room state manager — playlists injected from store
    let initial_room_id = "pending".to_string();
    let initial_peer_id = Uuid::new_v4().to_string();
    let room_manager = RoomStateManager::new(
        initial_room_id,
        initial_peer_id,
        playlist_store.get_all(),
    );

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init());

    #[cfg(not(target_os = "android"))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = app.get_webview_window("main").expect("no main window").set_focus();
        }));
    }

    builder
        .manage(playlist_store)
        .manage(room_manager)
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Initialize PlaylistStore with persistent path
            let app_handle = app.handle();
            let playlist_store = app_handle.state::<PlaylistStore>();
            let room_manager = app_handle.state::<RoomStateManager>();
            
            match app.path().app_local_data_dir() {
                Ok(path) => {
                    log::info!("Resolved app local data dir: {:?}", path);
                    let loaded_playlists = playlist_store.initialize(path);
                    
                    // Sync initial playlists to RoomStateManager
                    let mut state = room_manager.write();
                    state.sync_playlists(loaded_playlists);
                }
                Err(e) => log::error!("Failed to resolve app local data dir: {}", e),
            }

            // NOTE: Web server is now started lazily via start_host_server command
            // when the user picks Host Mode from the landing screen.

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Host-mode room commands
            commands::create_room,
            commands::get_qr_url,
            commands::get_server_port,
            commands::get_room_state,
            commands::search_youtube,
            commands::process_command,
            commands::update_player_state,
            commands::export_collection,
            commands::start_host_server,
            // Standalone playlist commands (available in all modes)
            commands::get_playlists,
            commands::playlist_create_collection,
            commands::playlist_delete_collection,
            commands::playlist_rename_collection,
            commands::playlist_set_visibility,
            commands::playlist_add_song,
            commands::playlist_remove_song,
            commands::playlist_import_collection,
            commands::save_collection_to_file,
            commands::load_collection_from_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
