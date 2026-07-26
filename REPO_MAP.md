# KaraokeNatin — Repository Map

Generated for audit purposes by reading source directly. READMEs, `BUILD_SETUP.md`,
`DEPLOYMENT.md`, `QUICK_START.md`, and package `README.md` files are **not** used as
sources of truth here — they describe an older architecture (see "Dead / orphaned
paths" below) and are known to be stale.

## What this project is

KaraokeNatin is a local-network karaoke party app. One machine runs the **host app**
(a Tauri 2 desktop/Android application) which plays YouTube videos full-screen and
exposes a small embedded web server on the LAN. Guests scan a QR code shown by the
host, which opens a **remote-control web page served directly by the host's own Rust
backend** in their phone browser. That page lets guests search YouTube, queue songs,
and control playback; it talks to the host over a WebRTC data channel (PeerJS),
with a local Socket.IO endpoint (also served by the Rust backend) used only to
bootstrap the WebRTC handshake. All queue/player state lives in the host process's
memory (`RoomStateManager`) and is persisted to disk as JSON playlists. No YouTube
downloader binary or Node.js process is spawned by the shipped app — YouTube search
and metadata are done with the pure-Rust `rusty_ytdl` crate directly inside the
Tauri backend.

The repository also contains a Node.js Socket.IO signaling server
(`apps/signaling-server`) and a Next.js remote-control client
(`apps/web-client`) that duplicate parts of this design. Both are dead code paths
in the shipped product (see "Dead / orphaned paths").

## Workspace / package table

pnpm workspace root: `/home/user/KaraokeNatin/package.json:1`, member globs
`apps/*` and `packages/*` (`pnpm-workspace.yaml:1-2`).

| Package | Path | Type | Status |
|---|---|---|---|
| `@karaokenatin/host` | `apps/host` | Tauri 2 app: React+TS frontend (`src/`) + Rust backend (`src-tauri/`) | **LIVE** — the shipped product |
| `@karaokenatin/shared` | `packages/shared` | TS-only package of protocol/state types | **LIVE** — used by `host`, `signaling-server`, and `web-client` |
| `@karaokenatin/signaling-server` | `apps/signaling-server` | Node + socket.io signaling server, TS | **DEAD** — never launched by the host; superseded by Rust `signaling.rs` |
| `@karaokenatin/web-client` | `apps/web-client` | Next.js 14 remote-control web app | **ORPHANED** — not built/bundled/served; superseded by `remote-ui/index.html` |

## Runtime architecture

```
                                   ┌───────────────────────────────────────────┐
                                   │  apps/host  (Tauri 2 process)              │
                                   │                                             │
                                   │  React frontend (src/)                     │
                                   │   App.tsx ── mode router ──┐               │
                                   │              │             │               │
                                   │        HostView        GuestView           │
                                   │        (Player,        (embeds remote-ui   │
                                   │         ControlPanel)   as an <iframe>,    │
                                   │              │           mode=inapp)        │
                                   │              │             │               │
                                   │   usePeerHost.ts (PeerJS host + socket.io  │
                                   │   client to localhost:<port>)              │
                                   │              │                             │
                                   │      invoke() / listen()  (Tauri IPC)      │
                                   │              │                             │
                                   │  ┌───────────▼─────────────────────────┐   │
                                   │  │ Rust backend (src-tauri/src/)       │   │
                                   │  │  lib.rs → commands.rs → room_state.rs│  │
                                   │  │  web_server.rs (axum, binds          │   │
                                   │  │   0.0.0.0:<random 49152-65535>)      │   │
                                   │  │   ├─ GET /            → serve_index()│   │
                                   │  │   │   (embeds remote-ui/index.html   │   │
                                   │  │   │    via include_str! at compile)  │   │
                                   │  │   ├─ GET /health                     │   │
                                   │  │   └─ socketioxide layer → signaling.rs│  │
                                   │  │       (RoomManager: CREATE_ROOM/     │   │
                                   │  │        JOIN_ROOM bookkeeping only)   │   │
                                   │  │  youtube.rs (rusty_ytdl search)      │   │
                                   │  │  metadata.rs (rusty_ytdl video info) │   │
                                   │  │  network.rs (local IP + QR URL)      │   │
                                   │  └───────────────────────────────────────┘  │
                                   └──────────────┬──────────────────────────────┘
                                                   │ LAN (http://<host-ip>:<port>)
                                                   │
                        ┌──────────────────────────▼──────────────────────────┐
                        │  Guest's phone browser                              │
                        │  GET http://<host-ip>:<port>/  → remote-ui/index.html│
                        │  (standalone web mode; identical bundle also runs   │
                        │   inside the host's own GuestView <iframe>)         │
                        │                                                     │
                        │  1. socket.io → same origin → JOIN_ROOM             │
                        │  2. PeerJS DataConnection → host's PeerJS peer      │
                        │     (WebRTC handshake brokered by PeerJS's public   │
                        │      cloud server, NOT the local signaling server)  │
                        └─────────────────────────────────────────────────────┘

  DEAD / ORPHANED (not part of any runtime path above):
   apps/signaling-server (Node + socket.io)  — never spawned; no sidecar exists
   apps/web-client (Next.js)                 — never built/served; console.log only
```

Key point: **there are two independent signaling implementations** — the Rust one
above (`web_server.rs` + `signaling.rs`, embedded in the Tauri process, listening
on a random ephemeral port) and the standalone Node one in `apps/signaling-server`
(listens on port 3001 by default). Only the Rust one is ever started in the shipped
app: the host frontend calls `invoke('get_server_port')` (`apps/host/src/hooks/usePeerHost.ts:71`)
and connects `io('http://localhost:${port}')` (`usePeerHost.ts:72`) to it, and
`remote-ui/index.html` connects via `socket = io(window.location.origin, ...)` (`apps/host/src-tauri/remote-ui/index.html:2132-2138`) — i.e. back to whatever axum
port served the page. Nothing in the host ever spawns `apps/signaling-server`.

**There are also two guest-client implementations.** `apps/host/src-tauri/remote-ui/index.html`
(2378 lines, vanilla JS, inlined into the Rust binary via `include_str!` at
`apps/host/src-tauri/src/web_server.rs:15` and served at `GET /`) is the one guests
actually reach via the QR code. `apps/web-client` (Next.js) is not referenced by the
Rust server at all; its only appearance anywhere in the live code is a dev-only
`console.log` of a `localhost:3000` URL at `apps/host/src/hooks/usePeerHost.ts:86`.

## Per-package sections

### `apps/host` — the shipped product

**Frontend entry point:** `apps/host/src/main.tsx:7-13` mounts `<App/>` (wrapped in
`ErrorBoundary`) into `#root`. Vite project, `apps/host/vite.config.ts`, dev
server on `localhost:5173` (`apps/host/src-tauri/tauri.conf.json:8`).

**Rust entry point:** `apps/host/src-tauri/src/main.rs:5` calls `app_lib::run()`
(defined in `apps/host/src-tauri/src/lib.rs:16`). `run()`:
- builds a `PlaylistStore` and `RoomStateManager` and `.manage()`s them as Tauri
  state (`lib.rs:18-27,40-41`);
- registers `tauri_plugin_dialog`; on non-Android targets also registers
  `tauri_plugin_single_instance` (`lib.rs:29-37`, gated by `#[cfg(not(target_os = "android"))]`
  because single-instance isn't supported on Android, per `Cargo.toml:33-35`);
- in `setup()`, resolves `app_local_data_dir()` and calls `PlaylistStore::initialize()`
  to load `playlists.json` from disk, then syncs it into `RoomStateManager`
  (`lib.rs:52-66`);
- registers every `#[tauri::command]` via `generate_handler!` (`lib.rs:73-95`);
- does **not** start the web server here — it's started lazily by the
  `start_host_server` command (`lib.rs:68-69` comment, implemented in
  `commands.rs:544-566`).

**Rust modules (`apps/host/src-tauri/src/`):**

| Module | Lines | Purpose |
|---|---|---|
| `lib.rs` | 98 | Tauri builder entry, state management, command registration |
| `commands.rs` | 639 | All `#[tauri::command]` handlers: room/player commands, playlist commands, YouTube search, `start_host_server` |
| `room_state.rs` | 702 | `PlaylistStore` (persisted collections, JSON to disk) + `RoomState`/`RoomStateManager` (in-memory player+queue, `parking_lot::RwLock`) |
| `signaling.rs` | 302 | `RoomManager` — in-memory room/token registry for the embedded socketioxide server (`CREATE_ROOM`/`JOIN_ROOM`/disconnect handling) |
| `web_server.rs` | 139 | axum HTTP server: binds `0.0.0.0` on a random port in `49152..=65535` (`web_server.rs:39`, fallback to OS-assigned `web_server.rs:47`), serves `remote-ui/index.html` at `/`, `/health`, and mounts the socketioxide layer |
| `youtube.rs` | 151 | `search_youtube()` via `rusty_ytdl::search::YouTube`, with a 30-minute in-memory `SEARCH_CACHE` (`youtube.rs:21,37`) |
| `metadata.rs` | 73 | `fetch_metadata()` via `rusty_ytdl::Video::get_info()`, with a 10s timeout and graceful fallback metadata on failure/timeout |
| `network.rs` | 35 | `get_local_ip()` (via `local-ip-address` crate) and `generate_qr_url()` = `http://<ip>:<port>` |
| `main.rs` | 6 | Binary entry point, calls `app_lib::run()` |

Cargo dependencies of note (`apps/host/src-tauri/Cargo.toml:14-35`): `axum`,
`socketioxide` (features `["state"]`), `rusty_ytdl` (default-features off,
`["search", "live", "rustls-tls"]` — explicitly pure-Rust/no default TLS),
`local-ip-address`, `parking_lot`, `tauri-plugin-dialog`. No `tauri-plugin-shell`
dependency and no sidecar/binary-spawning code exists anywhere in this crate —
confirmed by `grep -r sidecar` across the repo, which only matches a comment in
`youtube.rs` ("pure Rust YouTube integration ... no sidecar").

**Frontend modules (`apps/host/src/`):**

| File | Purpose |
|---|---|
| `App.tsx` | Mode router: `select \| host \| guest \| library` (`App.tsx:28,328-352`). `HostView` (`App.tsx:31-167`) renders `Player` + `ControlPanel` and drives `useRoomState`/`usePeerHost`. `GuestView` (`App.tsx:170-325`) renders `GuestMode` (QR scanner) until connected, then embeds `remote-ui` as an `<iframe src="...&mode=inapp">` and bridges native playlist calls via `postMessage` (`App.tsx:192-278`) |
| `hooks/usePeerHost.ts` | PeerJS host setup; connects to the Rust signaling server at `http://localhost:${invoke('get_server_port')}` (`usePeerHost.ts:71-72`); emits `CREATE_ROOM` (`:75`); listens for Tauri's `room_state_updated` event and re-broadcasts a filtered `STATE_UPDATE` to every open `DataConnection` (`:26-48`); routes incoming `DataConnection` messages either to a local `SEARCH` handler or into `invoke('process_command', ...)` (`:110-171`) |
| `hooks/useRoomState.ts` | Calls `createRoom()`/`getRoomState()` Tauri commands and subscribes to `room_state_updated` (`useRoomState.ts:37,53`); has input-focus-aware update deferral to avoid re-render-while-typing (`:9-20`) |
| `lib/commands.ts` | Thin `invoke()` wrappers for every Tauri command (room, playlist, `start_host_server`) |
| `lib/security.ts` | `hashToken()` — SHA-256 via `crypto.subtle`, used to hash join tokens client-side before sending to the signaling layer |
| `components/Player.tsx` | YouTube IFrame Player API wrapper, reports `update_player_state` back to Rust |
| `components/ControlPanel.tsx` (829 lines) | Host-side sidebar: QR display, search, queue, playlist management |
| `components/GuestMode.tsx` | QR scanner (`html5-qrcode`) / paste-URL flow that resolves a host URL and calls `onConnect(hostUrl)` |
| `components/QRDisplay.tsx`, `Queue.tsx`, `Library.tsx`, `ModeSelect.tsx`, `ScoringOverlay.tsx`, `HelpDialog.tsx`, `ErrorBoundary.tsx` | Presentational / supporting UI pieces |

**`apps/host/src-tauri/remote-ui/index.html`** (2378 lines, vanilla JS, single file,
no build step) — the actual guest UI. Served verbatim by `web_server.rs:113-123`
(`serve_index()`, with `no-cache` headers). Runs in two modes, selected by the
`mode` query parameter (`remote-ui/index.html:1177`):
- **standalone web mode** — guest opens the QR-code URL directly in a mobile
  browser;
- **`mode=inapp`** — embedded as an `<iframe>` inside the host app's own Guest
  Mode (`App.tsx:298-306`), additionally bridging native playlist/library actions
  to Rust via `window.parent.postMessage` (e.g. `remote-ui/index.html:1852,1871,1882,1902,1909,1913,2362`).

In both modes it connects identically: `socket = io(window.location.origin, ...)`
(`remote-ui/index.html:2132-2138`), emits `JOIN_ROOM` with `roomId: 'default'`
(`:2147-2151`, i.e. "attach me to whatever room is active" — matches the
single-room design of `signaling.rs`'s `get_first_active_room()`), then on
`JOIN_SUCCESS` opens a PeerJS `DataConnection` to the host's `hostPeerId`
(`:2224-2253`).

**Talks to:** itself (Rust IPC via `invoke`/`listen`/`emit`), the guest browser
(HTTP + WebSocket via the embedded axum/socketioxide server), YouTube (via
`rusty_ytdl`, no API key), and PeerJS's public cloud broker (`0.peerjs.com`, used
implicitly by `new Peer({...})` with no explicit `host`/`port` in both
`usePeerHost.ts:52-59` and `remote-ui/index.html:2229-2236`) for the actual WebRTC
signaling/ICE handshake — the local socket.io server only does room/token
bookkeeping, not WebRTC signaling itself.

### `packages/shared`

TypeScript-only, compiled with `tsc` (`packages/shared/package.json`). Exported
from `src/index.ts:6-8`:
- `room-state.ts` (97 lines) — `RoomState`, `Song`, `PlaylistCollection`,
  `CollectionVisibility`, `PlayerState` type definitions.
- `p2p-protocol.ts` (72 lines) — `ClientCommand` union (`:10-34`), `HostBroadcast`
  union including `STATE_UPDATE`, **`STATE_PATCH`** (`:41`), `ERROR`, `PONG`; and
  runtime type guards `isClientCommand`/`isHostBroadcast` (`:48-72`).
- `signaling-protocol.ts` (51 lines) — Socket.IO event/payload typings, used only
  by the dead Node signaling server and the orphaned web-client (the Rust
  signaling layer defines its own equivalent Rust structs in `signaling.rs:137-196`
  rather than importing this file, since it can't consume TS types).

`STATE_PATCH` is defined but never constructed or sent anywhere in the codebase —
grep confirms `usePeerHost.ts` and `remote-ui/index.html` both only ever build
`{ type: 'STATE_UPDATE', state: ... }` broadcasts (`usePeerHost.ts:34-37,182-185`).
State sync is always full-state, never a diff/patch.

**Talks to:** consumed by `apps/host` (`workspace:*` dependency,
`apps/host/package.json`), and by the two dead/orphaned packages below.

### `apps/signaling-server` — DEAD

Node + `socket.io` server, `apps/signaling-server/src/index.ts` (228 lines).
Listens on `PORT` env var, default **3001** (`index.ts:12`), 0.0.0.0. Implements
`CREATE_ROOM`/`JOIN_ROOM`/disconnect handling (`index.ts:66-157`) — functionally a
near-1:1 TypeScript twin of Rust's `signaling.rs:199-302`. `roomManager.ts` and
`security.ts` supply the room registry and token hashing.

Nothing in `apps/host` spawns this process. It predates the Rust
`web_server.rs`/`signaling.rs` implementation: the git history shows commit
`e4d7bdf` ("Migrate Node.js sidecars (signaling, yt-dlp) to native Rust
implementations") replaced the sidecar-spawn approach, and commit `1f6e0f0`
("GRRR") added Android build scaffolding (`apps/host/src-tauri/gen/android/`) —
Android cannot spawn sidecar processes, which is why the sidecar-based Node
server had to be replaced rather than merely relocated. There is no
`src-tauri/src/sidecar.rs` file in the current tree, and no `tauri-plugin-shell`
sidecar entries reference a signaling binary in `apps/host/src-tauri/tauri.conf.json`
or `Cargo.toml`.

Its `bundle` script (`apps/signaling-server/package.json:9`) still packages it
into a Windows `.exe` via `@yao-pkg/pkg`, targeting
`../host/src-tauri/binaries/signaling-server-x86_64-pc-windows-msvc.exe` — a path
that would only matter to a Tauri sidecar mechanism that no longer exists in this
codebase.

### `apps/web-client` — ORPHANED

Next.js 14 app (`apps/web-client/package.json`), pages under `app/`:
`app/page.tsx`, `app/join/page.tsx`, `app/room/[id]/page.tsx`, plus components
(`AddSong.tsx`, `Controls.tsx`, `NowPlaying.tsx`, `Playlist.tsx`, `QueueDisplay.tsx`)
and hooks (`lib/usePeerClient.ts`, `lib/useRoomState.ts`). Its PeerJS client hook
hardcodes `DEFAULT_SIGNALING_URL = 'http://localhost:3001'`
(`apps/web-client/lib/usePeerClient.ts:7`) — i.e. it's wired to talk to the dead
Node signaling server above, not the Rust one (which uses a random ephemeral
port, not 3001). It is not referenced by any build step of `apps/host`, is not
copied into `frontendDist` (`apps/host/src-tauri/tauri.conf.json:7` points at
`../dist`, the Vite output of `apps/host` only), and is not served by
`web_server.rs`. The only mention of it anywhere in the live runtime path is a
`console.log` in `apps/host/src/hooks/usePeerHost.ts:85-87` that prints a
`localhost:3000/room/...` URL purely for developer convenience when running
`pnpm dev:web` standalone — it is never opened or fetched by app code.

## Runtime flows

### 1. App startup

1. Tauri launches the Rust binary → `main.rs:5` → `app_lib::run()` (`lib.rs:16`).
2. `PlaylistStore` and `RoomStateManager` are constructed and registered as
   managed state (`lib.rs:18-27,40-41`); `RoomStateManager` starts with
   `room_id = "pending"` and a fresh random `host_peer_id` UUID (`lib.rs:21-22`).
3. `setup()` resolves the OS app-local-data directory and loads
   `playlists.json` from it via `PlaylistStore::initialize()` (`lib.rs:56-63`,
   `room_state.rs:99-159`, with legacy-path migration logic at
   `room_state.rs:104-151`); loaded playlists are synced into the room state.
4. The web server is **not** started yet — `lib.rs:68-69` comment plus
   `commands.rs:545-566`.
5. React mounts (`main.tsx:7-13`) and `App.tsx` renders `ModeSelect`
   (`App.tsx:333-341`), showing Host / Guest / Library choices.

### 2. Host mode — room creation

1. User picks "Host" → `App.tsx` sets `appMode='host'` → `HostView` mounts
   (`App.tsx:343-344`).
2. `HostView`'s effect calls `startHostServer()` (`App.tsx:44-52`, wrapping
   `invoke('start_host_server')`, `lib/commands.ts:100-102`), which in Rust
   (`commands.rs:544-566`) spins up a dedicated Tokio runtime on a background
   thread and calls `web_server::start_web_server()`.
3. `start_web_server()` (`web_server.rs:51-110`) picks a random port in
   `49152..=65535` (retrying up to 20 times, falling back to an OS-assigned
   port), builds the socketioxide layer with a fresh `RoomManager`
   (`web_server.rs:57-64`), mounts routes `/`, `/health`, CORS `Any`, a
   64-connection concurrency limit, and binds `0.0.0.0:<port>`. The chosen
   port is stored in the atomic `ACTUAL_PORT` (`web_server.rs:18,94`).
4. Back in `HostView`, once `startHostServer()` resolves, `initializeRoom()`
   runs (`App.tsx:50`, `useRoomState.ts:37-49`), calling `invoke('create_room')`
   (`commands.rs:107-126`) which generates a 6-hex-char room ID and a join
   token (not yet actually enforced against the web server's room registry —
   see below) and syncs the latest playlists into `RoomStateManager`.
5. In parallel, `usePeerHost` (`usePeerHost.ts:50-108`) creates a PeerJS
   `Peer` (signaling via PeerJS's public cloud broker). On `'open'`
   (`:61-95`) it generates its **own** `roomId`/`joinToken` client-side
   (`generateRoomId`/`generateJoinToken`, `:209-215` — separate from the one
   `create_room` generated in step 4), fetches the web server port via
   `invoke('get_server_port')` (`:71`), opens a socket.io connection to
   `http://localhost:${port}` (`:72`), and emits `CREATE_ROOM` with that
   `roomId`, a SHA-256 hash of the token (`security.ts:5-11`), and its PeerJS
   peer ID (`:75`). The Rust `signaling.rs::on_connect`'s `CREATE_ROOM` handler
   (`signaling.rs:203-217`) stores this in `RoomManager` and joins the socket
   to a socket.io room named after `roomId`.
6. On `ROOM_CREATED`, `usePeerHost` calls `invoke('get_qr_url')`
   (`commands.rs:129-132` → `network.rs:12-16`, `http://<local-ip>:<port>`) and
   stores it as `connectionUrl`, which `QRDisplay`/`ControlPanel` render as a
   QR code.

### 3. A guest joining

1. Guest scans the QR code (or the in-app `GuestMode` scanner,
   `components/GuestMode.tsx`) and navigates to `http://<host-ip>:<port>/`.
2. axum's `serve_index()` (`web_server.rs:113-123`) returns
   `remote-ui/index.html` verbatim (compiled into the binary).
3. The page's `startConnection()` (`remote-ui/index.html:2121-2200`) opens a
   socket.io connection to `window.location.origin` and emits `JOIN_ROOM`
   with `roomId: 'default'`, empty `joinToken` (`:2147-2151`) — note this is
   the "standalone mode" branch, not a token-verified join.
4. `signaling.rs`'s `JOIN_ROOM` handler (`signaling.rs:220-276`) sees
   `room_id: Some("default")`, treats it as "find first active room"
   (`get_first_active_room()`, `signaling.rs:106-110,222-231`), skips
   `verify_room`'s token check entirely for this branch
   (`signaling.rs:235-241`), joins the guest's socket to that socket.io room,
   increments `client_count`, notifies the host socket with `CLIENT_JOINED`,
   and replies to the guest with `JOIN_SUCCESS { hostPeerId }`.
5. On `JOIN_SUCCESS`, the guest page calls `initPeer(hostPeerId)`
   (`remote-ui/index.html:2224-2253`), creating its own PeerJS `Peer` and
   opening a `DataConnection` directly to the host's PeerJS peer ID — this
   handshake goes through PeerJS's public cloud broker, not through the
   local socket.io server.
6. On the host side, `usePeerHost`'s `peerInstance.on('connection', ...)`
   (`usePeerHost.ts:97-100`) fires, `setupDataChannelHandlers` registers the
   new `DataConnection`, and on `'open'` immediately sends a full
   `STATE_UPDATE` snapshot (filtered to public playlists) to the new guest
   (`usePeerHost.ts:110-117,173-190`).

### 4. A guest queuing a song

1. Guest searches in `remote-ui/index.html`; a `{ type: 'SEARCH', query }`
   message is sent over the PeerJS `DataConnection`.
2. Host's `conn.on('data', ...)` handler (`usePeerHost.ts:119-143`) detects
   the non-`ClientCommand` `SEARCH` shape, calls
   `invoke('search_youtube', { query, limit })` (→ `commands.rs:147-151` →
   `youtube.rs:42-125`, cached 30 minutes, backed by `rusty_ytdl::search::YouTube`),
   and sends `{ type: 'SEARCH_RESULTS', results }` back over the same
   `DataConnection`.
3. Guest picks a result and sends an `ADD_SONG` (or `PLAYLIST_ADD`)
   `ClientCommand` over the data channel.
4. Host's handler recognizes it via `isClientCommand()`
   (`packages/shared/src/p2p-protocol.ts:48-61`) and calls
   `invoke('process_command', { command })` (`usePeerHost.ts:145-160` →
   `lib/commands.ts:16-18`).
5. Rust's `process_command` (`commands.rs:154-314`) matches on the command
   variant; for `ADD_SONG` it extracts the YouTube ID
   (`commands.rs:592-618`), calls `metadata::fetch_metadata()`
   (`metadata.rs:16-73`, 10s timeout with graceful fallback), builds a `Song`,
   and calls `state.write().add_song(song)` (`room_state.rs:497-506`) under
   the `parking_lot::RwLock` write lock — this either becomes the current
   song (if idle) or is appended to `queue`.
6. At the end of `process_command`, regardless of which variant ran, the new
   full `RoomState` is cloned and emitted as the Tauri event
   `room_state_updated` (`commands.rs:309-311`).
7. Two listeners react to that event independently:
   - the host's own React tree, via `useRoomState`'s `listen('room_state_updated', ...)`
     (`useRoomState.ts:53-60`), which re-renders `Player`/`ControlPanel`/`Queue`;
   - `usePeerHost`'s separate `listen('room_state_updated', ...)`
     (`usePeerHost.ts:26-48`), which filters out personal playlists and
     rebroadcasts the **full** state as a `STATE_UPDATE` to every open
     `DataConnection` (including the guest who made the request). There is
     no partial/diff update path — `STATE_PATCH` exists in the protocol type
     (`p2p-protocol.ts:41`) but is never constructed.

## Dead / orphaned paths

1. **`apps/signaling-server`** (Node + socket.io, port 3001 by default,
   `apps/signaling-server/src/index.ts`). Not spawned, imported, or bundled by
   `apps/host` in any way. Its logic was reimplemented in Rust in
   `apps/host/src-tauri/src/signaling.rs` (commit `e4d7bdf`, "Migrate Node.js
   sidecars (signaling, yt-dlp) to native Rust implementations") when sidecar
   process spawning was dropped to support Android (commit `1f6e0f0`, which
   added `apps/host/src-tauri/gen/android/`). It still appears live in the
   **root** `package.json`:
   - `"dev:signaling": "cd apps/signaling-server && pnpm run dev"` (`package.json:8`)
   - `"build:signaling": "cd apps/signaling-server && pnpm run build"` (`package.json:11`)
   - `"build:signaling-exe": "cd apps/signaling-server && pnpm run bundle"` (`package.json:12`)
   - and the aggregate `"build": "pnpm run build:signaling-exe && pnpm run build:host"` (`package.json:15`) — the real release build (`build:host`) does not depend on this, but the combined `build` script still runs it, producing a `.exe` (via `@yao-pkg/pkg`, `apps/signaling-server/package.json:9`) that nothing consumes.
   - `setup:packages` also still `pnpm install`s it (`package.json:17`).

2. **`apps/web-client`** (Next.js 14, `apps/web-client/`). Not built, not
   copied into the Tauri `frontendDist`, not served by `web_server.rs`. Its
   PeerJS client hook targets the also-dead Node signaling server directly
   (`DEFAULT_SIGNALING_URL = 'http://localhost:3001'`,
   `apps/web-client/lib/usePeerClient.ts:7`), so even run standalone it cannot
   reach the Rust server the host app actually starts (which listens on a
   random ephemeral port, not 3001). The only live-code reference to it is a
   dev-only `console.log` of a `localhost:3000/room/...` URL at
   `apps/host/src/hooks/usePeerHost.ts:85-87`. It still appears in the root
   `package.json`:
   - `"dev:web": "cd apps/web-client && pnpm run dev"` (`package.json:10`)
   - `"build:web": "cd apps/web-client && pnpm run build"` (`package.json:14`, not part of the aggregate `"build"` script)
   - `setup:packages` also still `pnpm install`s it (`package.json:17`).

3. Both dead packages still declare `@karaokenatin/shared` as a
   `workspace:*` dependency, so `pnpm install` at the root continues to wire
   them into the workspace graph even though nothing in the shipped app
   depends on them.
