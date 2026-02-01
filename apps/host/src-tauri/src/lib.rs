#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod room_state;
mod commands;
mod sidecar;
mod network;
mod web_server;
mod youtube;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

use room_state::RoomStateManager;
use uuid::Uuid;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

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

            // Start Node.js signaling server as sidecar process
            std::thread::spawn(|| {
                log::info!("[Tauri] Starting signaling server...");
                
                // In development, run from the signaling-server directory
                #[cfg(all(debug_assertions, target_os = "windows"))]
                {
                    let mut cmd = std::process::Command::new("node");
                    cmd.current_dir("../../signaling-server")
                        .arg("dist/index.js")
                        .creation_flags(CREATE_NO_WINDOW);
                    
                    match cmd.spawn() {
                        Ok(mut child) => {
                            log::info!("[Tauri] Signaling server started (dev mode)");
                            let _ = child.wait();
                        }
                        Err(e) => {
                            log::error!("[Tauri] Failed to start signaling server: {}", e);
                            log::info!("[Tauri] Trying with tsx...");
                            
                            // Fallback: try running with tsx
                            let mut fallback = std::process::Command::new("npx");
                            fallback.current_dir("../../signaling-server")
                                .args(["tsx", "src/index.ts"])
                                .creation_flags(CREATE_NO_WINDOW);
                            let _ = fallback.spawn();
                        }
                    }
                }
                
                // In production, run bundled signaling server executable
                #[cfg(all(not(debug_assertions), target_os = "windows"))]
                {
                    use std::env;
                    
                    // Get the directory where the executable is located
                    let exe_dir = env::current_exe()
                        .ok()
                        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
                        .unwrap_or_default();
                    
                    // Tauri strips the target triple, so it's just "signaling-server.exe"
                    let signaling_path = exe_dir.join("signaling-server.exe");
                    
                    log::info!("[Tauri] Starting bundled signaling server: {:?}", signaling_path);
                    
                    let mut cmd = std::process::Command::new(&signaling_path);
                    cmd.creation_flags(CREATE_NO_WINDOW);
                    
                    match cmd.spawn() {
                        Ok(mut child) => {
                            log::info!("[Tauri] Signaling server started (production)");
                            let _ = child.wait();
                        }
                        Err(e) => {
                            log::error!("[Tauri] Failed to start signaling server: {}", e);
                        }
                    }
                }
            });

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
            commands::get_room_state,
            commands::search_youtube,
            commands::process_command,
            commands::update_player_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
