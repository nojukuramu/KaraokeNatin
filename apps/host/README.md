# Tauri Host Application

Desktop karaoke host built with Tauri v2 (Rust backend + React frontend).

## Features

- YouTube player integration (IFrame API)
- Unified Room State management (Rust)
- WebRTC P2P host (PeerJS)
- QR code generation for client pairing
- `yt-dlp` sidecar for metadata scraping

## Project Structure

```
host/
├── src/                    # React frontend
│   ├── components/
│   ├── hooks/
│   └── lib/
└── src-tauri/              # Rust backend
    ├── src/
    │   ├── main.rs
    │   ├── commands/
    │   ├── room_state.rs
    │   └── sidecar/
    ├── binaries/           # yt-dlp executables (add manually)
    └── Cargo.toml
```

## Setup

This app requires Tauri v2 CLI. Initialize with:

```bash
# Install Tauri CLI (once)
npm install -g @tauri-apps/cli@next

# Initialize Tauri project (creates src-tauri/)
npm create tauri-app@latest
# Select: React, TypeScript

# Install dependencies
npm install
```

## yt-dlp Sidecar Setup

Download platform-specific yt-dlp binaries and place in `src-tauri/binaries/`:

- Windows: `yt-dlp-x86_64-pc-windows-msvc.exe`
- macOS Intel: `yt-dlp-x86_64-apple-darwin`
- macOS Silicon: `yt-dlp-aarch64-apple-darwin`
- Linux: `yt-dlp-x86_64-unknown-linux-gnu`

Download from: https://github.com/yt-dlp/yt-dlp/releases

## Development

```bash
npm run tauri dev
```

## Build

```bash
npm run tauri build
```
