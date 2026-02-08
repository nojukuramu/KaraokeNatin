use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::LazyLock;
use parking_lot::RwLock;
use rusty_ytdl::search::{YouTube, SearchResult as YtSearchResult, SearchOptions, SearchType};
use std::time::Duration;
use tokio::time::timeout;

/// Search result from YouTube
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub id: String,
    pub title: String,
    pub channel: String,
    pub duration: String,
    pub thumbnail: String,
    pub url: String,
}

/// Cache TTL in seconds (30 minutes)
const CACHE_TTL_SECS: u64 = 1800;

/// Cache entry with timestamp for potential TTL
#[derive(Debug, Clone)]
struct CacheEntry {
    results: Vec<SearchResult>,
    cached_at: std::time::Instant,
}

impl CacheEntry {
    fn is_expired(&self) -> bool {
        self.cached_at.elapsed().as_secs() > CACHE_TTL_SECS
    }
}

/// Thread-safe in-memory cache for search results
static SEARCH_CACHE: LazyLock<RwLock<HashMap<String, CacheEntry>>> = LazyLock::new(|| {
    RwLock::new(HashMap::new())
});

/// Search YouTube for videos matching the query using rusty_ytdl (pure Rust, no sidecar)
pub async fn search_youtube(query: &str, limit: u32) -> Result<Vec<SearchResult>, String> {
    // Append "karaoke" to the query to prioritize karaoke-friendly results
    let karaoke_query = format!("{} karaoke", query);
    let cache_key = format!("{}:{}", karaoke_query.to_lowercase(), limit);

    // Check cache first
    {
        let cache = SEARCH_CACHE.read();
        if let Some(entry) = cache.get(&cache_key) {
            if !entry.is_expired() {
                log::info!("[YouTube] Cache hit for: {}", karaoke_query);
                return Ok(entry.results.clone());
            } else {
                log::info!("[YouTube] Cache expired for: {}", karaoke_query);
            }
        }
    }

    log::info!("[YouTube] Cache miss, searching with rusty_ytdl for: {}", karaoke_query);

    let youtube = YouTube::new().map_err(|e| format!("Failed to create YouTube client: {}", e))?;

    let search_options = SearchOptions {
        limit: limit as u64,
        search_type: SearchType::Video,
        safe_search: false,
    };

    let search_results = timeout(
        Duration::from_secs(10),
        youtube.search(&karaoke_query, Some(&search_options))
    )
    .await
    .map_err(|_| "YouTube search timed out after 10 seconds".to_string())?
    .map_err(|e| format!("YouTube search failed: {}", e))?;

    let mut results = Vec::new();

    for item in search_results {
        match item {
            YtSearchResult::Video(video) => {
                let id = video.id.clone();
                let title = video.title.clone();
                let channel = video.channel.name.clone();

                let duration = format_duration_ms(video.duration);

                let thumbnail = video
                    .thumbnails
                    .last()
                    .map(|t| t.url.clone())
                    .unwrap_or_else(|| {
                        format!("https://i.ytimg.com/vi/{}/hqdefault.jpg", id)
                    });

                let url = format!("https://www.youtube.com/watch?v={}", id);

                results.push(SearchResult {
                    id,
                    title,
                    channel,
                    duration,
                    thumbnail,
                    url,
                });
            }
            // Skip non-video results (playlists, channels)
            _ => continue,
        }
    }

    log::info!("[YouTube] Found {} results via rusty_ytdl, caching...", results.len());

    // Store in cache
    {
        let mut cache = SEARCH_CACHE.write();
        cache.insert(cache_key, CacheEntry {
            results: results.clone(),
            cached_at: std::time::Instant::now(),
        });
    }

    Ok(results)
}

/// Format duration from milliseconds to MM:SS or HH:MM:SS
fn format_duration_ms(ms: u64) -> String {
    let total_secs = ms / 1000;
    let hours = total_secs / 3600;
    let minutes = (total_secs % 3600) / 60;
    let secs = total_secs % 60;

    if hours > 0 {
        format!("{}:{:02}:{:02}", hours, minutes, secs)
    } else {
        format!("{}:{:02}", minutes, secs)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_duration_ms() {
        assert_eq!(format_duration_ms(65000), "1:05");
        assert_eq!(format_duration_ms(3661000), "1:01:01");
        assert_eq!(format_duration_ms(0), "0:00");
    }
}
