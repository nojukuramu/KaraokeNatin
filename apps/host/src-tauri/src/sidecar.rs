use serde::{Deserialize, Serialize};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// Metadata fetched from yt-dlp
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SongMetadata {
    pub title: String,
    pub artist: String,
    pub duration: u32,
    pub thumbnail_url: String,
}

/// Get the path to the bundled yt-dlp executable
fn get_ytdlp_path() -> String {
    // In development, use the binaries folder
    #[cfg(debug_assertions)]
    {
        "binaries/yt-dlp-x86_64-pc-windows-msvc.exe".to_string()
    }
    
    // In production, yt-dlp will be bundled alongside the exe
    // Tauri strips the target triple, so it's just "yt-dlp.exe"
    #[cfg(not(debug_assertions))]
    {
        use std::env;
        
        let exe_dir = env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.to_path_buf()))
            .unwrap_or_default();
        
        exe_dir.join("yt-dlp.exe").to_string_lossy().to_string()
    }
}

/// Fetch song metadata using yt-dlp sidecar
pub async fn fetch_metadata(youtube_id: &str) -> Result<SongMetadata, String> {
    let url = format!("https://www.youtube.com/watch?v={}", youtube_id);
    let ytdlp_path = get_ytdlp_path();
    
    log::info!("Fetching metadata for: {} using {}", youtube_id, ytdlp_path);
    
    // Try to execute yt-dlp binary using tokio for async
    let mut cmd = tokio::process::Command::new(&ytdlp_path);
    cmd.arg("--dump-json")
        .arg("--no-playlist")
        .arg("--skip-download")
        .arg(&url);
    
    // Hide console window on Windows
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    
    let output = cmd.output().await;
    
    match output {
        Ok(output) => {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                parse_ytdlp_output(&stdout, youtube_id)
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                log::error!("yt-dlp error: {}", stderr);
                
                // Fallback to basic metadata
                Ok(SongMetadata {
                    title: format!("YouTube Video {}", youtube_id),
                    artist: "Unknown Artist".to_string(),
                    duration: 0,
                    thumbnail_url: format!("https://img.youtube.com/vi/{}/mqdefault.jpg", youtube_id),
                })
            }
        }
        Err(e) => {
            log::warn!("yt-dlp not available at {}: {}. Using fallback metadata.", ytdlp_path, e);
            
            // Fallback metadata
            Ok(SongMetadata {
                title: format!("YouTube Video {}", youtube_id),
                artist: "Unknown Artist".to_string(),
                duration: 0,
                thumbnail_url: format!("https://img.youtube.com/vi/{}/mqdefault.jpg", youtube_id),
            })
        }
    }
}

/// Parse yt-dlp JSON output
fn parse_ytdlp_output(json_str: &str, youtube_id: &str) -> Result<SongMetadata, String> {
    #[derive(Deserialize)]
    struct YtDlpOutput {
        title: Option<String>,
        uploader: Option<String>,
        artist: Option<String>,
        duration: Option<f64>,
        thumbnail: Option<String>,
        #[allow(dead_code)]
        id: Option<String>,
    }
    
    let data: YtDlpOutput = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse yt-dlp output: {}", e))?;
    
    Ok(SongMetadata {
        title: data.title.unwrap_or_else(|| "Unknown Title".to_string()),
        artist: data.artist
            .or(data.uploader)
            .unwrap_or_else(|| "Unknown Artist".to_string()),
        duration: data.duration.unwrap_or(0.0) as u32,
        thumbnail_url: data.thumbnail.unwrap_or_else(|| {
            format!("https://img.youtube.com/vi/{}/mqdefault.jpg", youtube_id)
        }),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_ytdlp_output() {
        let json = r#"{
            "id": "dQw4w9WgXcQ",
            "title": "Test Song",
            "uploader": "Test Artist",
            "duration": 213.5,
            "thumbnail": "https://example.com/thumb.jpg"
        }"#;
        
        let metadata = parse_ytdlp_output(json, "dQw4w9WgXcQ").unwrap();
        assert_eq!(metadata.title, "Test Song");
        assert_eq!(metadata.artist, "Test Artist");
        assert_eq!(metadata.duration, 213);
    }
}
