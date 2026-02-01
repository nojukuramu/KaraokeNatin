use serde::{Deserialize, Serialize};

/// Metadata fetched from yt-dlp
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SongMetadata {
    pub title: String,
    pub artist: String,
    pub duration: u32,
    pub thumbnail_url: String,
}

/// Fetch song metadata using yt-dlp sidecar
pub async fn fetch_metadata(youtube_id: &str) -> Result<SongMetadata, String> {
    let url = format!("https://www.youtube.com/watch?v={}", youtube_id);
    
    log::info!("Fetching metadata for: {}", youtube_id);
    
    // Try to execute yt-dlp binary
    // The binary should be in src-tauri/binaries/yt-dlp-{target}.exe
    let output = std::process::Command::new("yt-dlp")
        .arg("--dump-json")
        .arg("--no-playlist")
        .arg("--skip-download")
        .arg(&url)
        .output();
    
    match output {
        Ok(output) => {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                parse_ytdlp_output(&stdout)
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
            log::warn!("yt-dlp not available: {}. Using fallback metadata.", e);
            
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
fn parse_ytdlp_output(json_str: &str) -> Result<SongMetadata, String> {
    #[derive(Deserialize)]
    struct YtDlpOutput {
        title: Option<String>,
        uploader: Option<String>,
        artist: Option<String>,
        duration: Option<f64>,
        thumbnail: Option<String>,
        id: String,
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
            format!("https://img.youtube.com/vi/{}/mqdefault.jpg", data.id)
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
        
        let metadata = parse_ytdlp_output(json).unwrap();
        assert_eq!(metadata.title, "Test Song");
        assert_eq!(metadata.artist, "Test Artist");
        assert_eq!(metadata.duration, 213);
    }
}
