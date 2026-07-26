# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **The WebRTC handshake no longer leaves the LAN.** PeerJS was constructed without `host`/`port`/`path`, so it silently used the public `0.peerjs.com` cloud broker — meaning guests could not connect at all without internet, and a third-party outage would break every install at once. A PeerJS-compatible broker is now embedded in the host's own web server.
- **Join tokens are actually verified.** Verification was skipped whenever `roomId` was empty or `"default"`, and the shipped guest UI sent exactly that, so the token was decorative. Verification is now unconditional and the token travels in the QR URL. Room credentials use a CSPRNG instead of `Math.random()`, and hash comparison is constant-time.
- **A clean clone builds.** `packages/shared` was unbuildable — no `rootDir`, so output landed at `dist/src/index.js` while `main` pointed at `dist/index.js`.
- **Three commands invoked by the UI did not exist** (`open_log_folder`, `report_issue`, `fetch_song_metadata`); two more call sites passed argument names Rust does not declare, silently breaking Guest Mode playlist import.
- **Collection import/export no longer crashes on Android**, where the file dialog returns a `content://` URI that the old code unwrapped as a filesystem path.
- Entering Host Mode no longer sleeps 500 ms hoping the server bound; the port is now known before the command returns.
- The YouTube search cache is bounded — it previously grew for the lifetime of the process.
- Guest visibility filtering moved into Rust, so personal playlists never reach the broadcast path.

### Added
- **Volume, mute and seek controls.** These existed in the protocol and the Rust backend but had no UI *and* were never applied to the player.
- **Mic-based scoring.** Replaces `Math.random()` with a measure of how much of the song had mic input.
- **"Play next"** — bump a song to the front of the queue.
- **Screen wake lock** during playback; the display previously slept mid-song on Android and Android TV.
- **Help dialog** is now reachable; it was fully built but never rendered.
- **Linux builds** — `deb` and `AppImage` targets, plus POSIX `build.sh`, `start-dev.sh` and `clean_android_build.sh`.
- **CI and release workflows.** Every push runs typecheck, 44 frontend tests and 36 Rust tests; pushing a `v*` tag builds and publishes Windows, Linux and Android artifacts.
- **Offline guest UI** — socket.io, PeerJS, qrcodejs and lucide are vendored at pinned versions instead of loaded from CDNs on every page load.
- Host-side P2P liveness: `PONG` replies, error-drop, and a sweep for dead channels.
- Repository documentation: `REPOMAPPING.md`, `REPO_MAP.md`, `FEATURES.md`, `ISSUES.md`, `OPTIMIZATION.md`, `REPO_NOTES.md`, `task.md`, `docs/RELEASING.md`.

### Changed
- Player progress ticks send a `STATE_PATCH` instead of rebroadcasting the entire room every few seconds.
- Android manifest no longer requests `MODIFY_AUDIO_SETTINGS`, `CHANGE_WIFI_STATE` or `FOREGROUND_SERVICE`; the user-CA trust anchor is removed from the network security config.

### Removed
- `apps/signaling-server` and `apps/web-client` — both were complete applications that nothing in the shipped product reached. Signaling is native Rust; the guest UI is compiled into the host binary.
- Committed build artifacts: an `.apk.idsig`, two error logs, and a stale frontend bundle under `gen/android` that an Android build could pick up instead of fresh output.
- yt-dlp license files; the dependency was replaced by `rusty_ytdl` and no external binary is bundled.

## [0.2.0] - 2026-02-10

### Added
- **Working Playlist Collections**: Playlist collections now work properly.
- **Android Support**: Android devices can now host sessions and join as a guest.
- **TV Support**: Android TV devices can now be used to host session.

### Note
- ** Android and Android TV should be installed by side loading.**: Future release will have Google Play Store support.

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
