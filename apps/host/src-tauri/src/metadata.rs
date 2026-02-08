use serde::{Deserialize, Serialize};
use rusty_ytdl::{Video, VideoOptions};
use std::time::Duration;
use tokio::time::timeout;

/// Metadata fetched from rusty_ytdl
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SongMetadata {
    pub title: String,
    pub artist: String,
    pub duration: u32,
    pub thumbnail_url: String,
}

/// Fetch song metadata using rusty_ytdl
pub async fn fetch_metadata(youtube_id: &str) -> Result<SongMetadata, String> {
    let url = format!("https://www.youtube.com/watch?v={}", youtube_id);
    
    log::info!("Fetching metadata for: {}", youtube_id);
    
    // Create Video object with default options
    let video = Video::new_with_options(&url, VideoOptions::default())
        .map_err(|e| format!("Failed to create video object: {}", e))?;
    
    match timeout(Duration::from_secs(10), video.get_info()).await {
        Err(_) => {
            log::warn!("Metadata fetch timed out for: {}", youtube_id);
            // Fallback to basic metadata on timeout
            Ok(SongMetadata {
                title: format!("YouTube Video {}", youtube_id),
                artist: "Unknown Artist".to_string(),
                duration: 0,
                thumbnail_url: format!("https://img.youtube.com/vi/{}/mqdefault.jpg", youtube_id),
            })
        }
        Ok(result) => match result {
            Ok(info) => {
                let details = info.video_details;

                // Get best thumbnail (usually the last one is high quality)
                let thumbnail_url = details.thumbnails.last()
                    .map(|t| t.url.clone())
                    .unwrap_or_else(|| format!("https://img.youtube.com/vi/{}/mqdefault.jpg", youtube_id));

                let duration = details.length_seconds.parse::<u32>().unwrap_or(0);

                let artist = if !details.owner_channel_name.is_empty() {
                    details.owner_channel_name
                } else {
                    "Unknown Artist".to_string()
                };

                Ok(SongMetadata {
                    title: details.title,
                    artist,
                    duration,
                    thumbnail_url,
                })
            }
            Err(e) => {
                log::error!("rusty_ytdl error: {}", e);
                
                // Fallback to basic metadata
                Ok(SongMetadata {
                    title: format!("YouTube Video {}", youtube_id),
                    artist: "Unknown Artist".to_string(),
                    duration: 0,
                    thumbnail_url: format!("https://img.youtube.com/vi/{}/mqdefault.jpg", youtube_id),
                })
            }
        }
    }
}
