# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-02-10

### Added
- **Unified Build System**: Local `build.bat` for Android/Windows.
- **APK Signing**: Automated zipalign/apksigner.

### Changed
- Replaced OpenSSL with rustls for pure Rust TLS.
- Conditional single-instance plugin (desktop only).

## [0.1.3-beta] - 2025-12-01

### Fixed
- Fixed console window appearing when searching YouTube.

## [0.1.2-beta] - 2025-11-15

### Added
- yt-dlp license files and third-party license attribution in `licenses/` directory.

### Changed
- Migrated Node.js sidecars (signaling server, yt-dlp) to native Rust implementations — no more external binaries needed.

### Added
- Logging and issue reporting feature for easier debugging.
- YouTube player with scoring overlay, fullscreen support, and embedded signaling server.

## [0.1.1-beta] - 2025-10-20

### Fixed
- Startup errors on first launch.
- Port conflicts when running multiple instances.

## [0.1.0] - 2025-10-15

### Added
- Initial release of KaraokeNatin.
- Tauri desktop host application with embedded web server.
- YouTube integration via `yt_dlp` for karaoke video search and playback.
- Real-time song queue management with automatic song advancement.
- QR code display for easy guest connections.
- Web client (Next.js) for phone-based remote control.
- Peer-to-peer communication via PeerJS.
- Playlist collections with create, rename, delete, import/export support.
- Playback controls (play, pause, skip, volume) from any connected phone.
- Local network operation — works over Wi-Fi without internet (except for YouTube content).

[0.2.0]: https://github.com/nojukuramu/KaraokeNatin/compare/v0.1.3-beta...v0.2.0
[0.1.3-beta]: https://github.com/nojukuramu/KaraokeNatin/compare/v0.1.2-beta...v0.1.3-beta
[0.1.2-beta]: https://github.com/nojukuramu/KaraokeNatin/compare/v0.1.1-beta...v0.1.2-beta
[0.1.1-beta]: https://github.com/nojukuramu/KaraokeNatin/compare/v0.1.0...v0.1.1-beta
[0.1.0]: https://github.com/nojukuramu/KaraokeNatin/releases/tag/v0.1.0
