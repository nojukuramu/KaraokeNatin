use serde::{Deserialize, Serialize};
use std::process::Command;

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

/// Get the path to the bundled yt-dlp executable
fn get_ytdlp_path() -> String {
    // In development, use the binaries folder
    #[cfg(debug_assertions)]
    {
        "binaries/yt-dlp-x86_64-pc-windows-msvc.exe".to_string()
    }
    
    // In production, yt-dlp will be bundled with the app
    #[cfg(not(debug_assertions))]
    {
        // Tauri bundles external binaries in the resource directory
        "yt-dlp-x86_64-pc-windows-msvc.exe".to_string()
    }
}

/// Search YouTube for videos matching the query
pub fn search_youtube(query: &str, limit: u32) -> Result<Vec<SearchResult>, String> {
    let ytdlp_path = get_ytdlp_path();
    
    // Build search query (ytsearch:N searches for N results)
    let search_query = format!("ytsearch{}:{}", limit, query);
    
    log::info!("[YouTube] Searching for: {}", query);
    
    // Run yt-dlp with JSON output
    let output = Command::new(&ytdlp_path)
        .args([
            &search_query,
            "--dump-json",           // Output as JSON
            "--flat-playlist",       // Don't download, just get info
            "--no-download",
            "--no-warnings",
            "--ignore-errors",
        ])
        .output()
        .map_err(|e| format!("Failed to run yt-dlp: {}", e))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        log::error!("[YouTube] yt-dlp error: {}", stderr);
        return Err(format!("yt-dlp failed: {}", stderr));
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut results = Vec::new();
    
    // Each line is a separate JSON object
    for line in stdout.lines() {
        if line.trim().is_empty() {
            continue;
        }
        
        match serde_json::from_str::<serde_json::Value>(line) {
            Ok(json) => {
                let id = json["id"].as_str().unwrap_or("").to_string();
                let title = json["title"].as_str().unwrap_or("Unknown Title").to_string();
                let channel = json["channel"].as_str()
                    .or_else(|| json["uploader"].as_str())
                    .unwrap_or("Unknown Channel")
                    .to_string();
                
                // Duration in seconds or as string
                let duration = if let Some(d) = json["duration"].as_f64() {
                    format_duration(d as u64)
                } else if let Some(d) = json["duration_string"].as_str() {
                    d.to_string()
                } else {
                    "0:00".to_string()
                };
                
                // Get best thumbnail
                let thumbnail = json["thumbnail"].as_str()
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| {
                        format!("https://i.ytimg.com/vi/{}/hqdefault.jpg", id)
                    });
                
                let url = json["url"].as_str()
                    .or_else(|| json["webpage_url"].as_str())
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| format!("https://www.youtube.com/watch?v={}", id));
                
                results.push(SearchResult {
                    id,
                    title,
                    channel,
                    duration,
                    thumbnail,
                    url,
                });
            }
            Err(e) => {
                log::warn!("[YouTube] Failed to parse result: {}", e);
            }
        }
    }
    
    log::info!("[YouTube] Found {} results", results.len());
    Ok(results)
}

/// Format seconds as MM:SS or HH:MM:SS
fn format_duration(seconds: u64) -> String {
    let hours = seconds / 3600;
    let minutes = (seconds % 3600) / 60;
    let secs = seconds % 60;
    
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
    fn test_format_duration() {
        assert_eq!(format_duration(65), "1:05");
        assert_eq!(format_duration(3661), "1:01:01");
        assert_eq!(format_duration(0), "0:00");
    }
}
