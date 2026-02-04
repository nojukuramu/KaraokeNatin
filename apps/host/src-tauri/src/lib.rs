#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod room_state;
mod commands;
mod sidecar;
mod network;
mod web_server;
mod youtube;
mod signaling;

use room_state::RoomStateManager;
use uuid::Uuid;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize room state manager with placeholder values
    // These will be replaced when create_room is called
    let initial_room_id = "pending".to_string();
    let initial_peer_id = Uuid::new_v4().to_string();
    let room_manager = RoomStateManager::new(initial_room_id, initial_peer_id);

    tauri::Builder::default()
        .manage(room_manager)
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Start embedded web server in background (with its own Tokio runtime)
            std::thread::spawn(|| {
                let rt = tokio::runtime::Runtime::new().expect("Failed to create Tokio runtime");
                rt.block_on(async {
                    log::info!("[Tauri] Starting embedded web server...");
                    if let Err(e) = web_server::start_web_server().await {
                        log::error!("[Tauri] Web server error: {}", e);
                    }
                });
            });

            // Wait a moment for web server to bind its port
            std::thread::sleep(std::time::Duration::from_millis(500));
            
            let web_port = web_server::get_server_port();
            log::info!("[Tauri] Web server (and signaling) on port {}", web_port);

            // Log local IP for QR code generation
            match network::generate_qr_url() {
                Ok(url) => {
                    log::info!("[Tauri] Remote control URL: {}", url);
                    log::info!("[Tauri] Scan QR code to connect from your phone");
                }
                Err(e) => {
                    log::error!("[Tauri] Failed to generate QR URL: {}", e);
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_room,
            commands::get_qr_url,
            commands::get_server_port,
            commands::get_room_state,
            commands::search_youtube,
            commands::process_command,
            commands::update_player_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
