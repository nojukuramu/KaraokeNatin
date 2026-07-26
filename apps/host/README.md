# Tauri Host Application

The whole KaraokeNatin application: a Tauri v2 app with a Rust backend and a React frontend, targeting Windows, Linux and Android (phone, tablet, TV).

It plays YouTube video and, from a web server embedded in its own backend, serves a remote-control page to guests on the same network. Nothing else needs to be installed or deployed.

## Features

- YouTube playback via the IFrame API, plus search and metadata through the pure-Rust `rusty_ytdl` crate — no external binaries
- Room state owned by Rust (`room_state.rs`) and broadcast to guests
- WebRTC peer-to-peer with a **self-hosted** PeerJS broker (`peer_server.rs`), so the handshake never leaves the LAN
- Socket.io signaling with join-token verification (`signaling.rs`)
- QR-code pairing, playlist collections with public/personal visibility, and mic-coverage scoring

## Structure

```
apps/host/
├── src/                        # React frontend (Vite)
│   ├── components/             # Player, ControlPanel, Library, Queue, …
│   ├── hooks/                  # useRoomState, usePeerHost, useMicCoverage, useWakeLock
│   └── lib/                    # typed invoke() wrappers, crypto helpers
└── src-tauri/                  # Rust backend
    ├── src/
    │   ├── lib.rs              # Tauri builder, state, command registration
    │   ├── commands.rs         # every #[tauri::command]
    │   ├── room_state.rs       # queue + playlists, the source of truth
    │   ├── web_server.rs       # embedded axum server
    │   ├── signaling.rs        # room creation / join verification
    │   ├── peer_server.rs      # PeerJS broker
    │   ├── youtube.rs          # search, with a bounded cache
    │   └── metadata.rs         # video metadata
    ├── remote-ui/              # guest UI, compiled into the binary
    │   └── vendor/             # pinned JS libs, so guests work offline
    └── gen/android/            # Android project (manifest and gradle are hand-edited)
```

## Setup

From the **repository root**, not this directory:

```bash
pnpm run setup
```

pnpm is required — the workspace uses `workspace:` protocol dependencies. This also builds `packages/shared`, which `apps/host` imports by package `main`; skipping it produces unresolved-module errors.

Linux additionally needs GTK/WebKit headers — see `QUICK_START.md`.

## Development

```bash
pnpm run dev:host    # from the repo root
```

The embedded web server starts lazily when you pick Host Mode, not at launch.

## Verify

```bash
pnpm run check       # typecheck + frontend tests + Rust tests
```

## Build

```bash
pnpm run build       # desktop, current platform
./build.sh android   # APK (build.bat on Windows)
```

Releases are built by `.github/workflows/release.yml` — see `docs/RELEASING.md`.

## Notes for contributors

`invoke()` is type-checked by neither `tsc` nor `cargo`. When adding one, open the Rust signature and check the command name and argument names; `tauri-commands.test.ts` will catch you if you don't. See `REPOMAPPING.md` for the rest of the traps in this codebase.
