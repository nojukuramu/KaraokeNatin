use serde::{Deserialize, Serialize};
use rusty_ytdl::{Video, VideoOptions};

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
    
    match video.get_info().await {
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
            // Log the actual error from rusty_ytdl for debugging
            log::error!("[Sidecar] rusty_ytdl error fetching {}: {}", youtube_id, e);
            
            // Fallback to basic metadata to ensure the user can still attempt to play/queue the song
            // This mirrors the previous behavior but with explicit error logging
            Ok(SongMetadata {
                title: format!("YouTube Video {}", youtube_id),
                artist: "Unknown Artist".to_string(),
                duration: 0,
                thumbnail_url: format!("https://img.youtube.com/vi/{}/mqdefault.jpg", youtube_id),
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_fetch_metadata_fallback() {
        // Test with a likely invalid ID to trigger fallback path
        // Note: rusty_ytdl might fail or succeed depending on network, but we want to ensure it doesn't panic
        // and returns a valid struct.
        let invalid_id = "invalid_id_12345";
        let res = fetch_metadata(invalid_id).await;

        assert!(res.is_ok());
        let meta = res.unwrap();
        assert_eq!(meta.artist, "Unknown Artist");
        // Thumbnail should be constructed fallback
        assert!(meta.thumbnail_url.contains(invalid_id));
    }
}
