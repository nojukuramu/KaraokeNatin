# KaraokeNatin — Feature Inventory (Audit)

> **Updated after the implementation pass.** Notable changes since this was
> written: scoring is no longer fake (it measures mic input coverage); volume,
> mute, seek and "play next" now have UI; `HelpDialog` is reachable; the three
> missing Tauri commands are implemented or removed; and `apps/web-client` has
> been deleted. Individual entries below are annotated where they changed.

Scope: `apps/host` (the Tauri desktop/Android app — this is "the app"). Compiled by reading source directly; READMEs were not used as a source of truth. Line numbers are current as of this audit and will drift as the code changes — treat them as pointers, not permanent anchors.

Two GUI surfaces exist for the same backend:
- **Host GUI** — the React app in `apps/host/src` (`App.tsx` + `components/*`), running inside the Tauri webview. Used in Host mode, Guest-in-app mode (as the iframe host/bridge), and Library mode.
- **Guest remote-ui** — a single self-contained HTML file (`apps/host/src-tauri/remote-ui/index.html`, 2378 lines) served by the embedded Axum web server and loaded either (a) directly by a phone browser over LAN, or (b) inside an `<iframe>` by the Host GUI's in-app Guest mode.

A third, unrelated web app, `apps/web-client` (Next.js), also speaks the same PeerJS/Socket.IO protocol. It is not bundled into the Tauri app, appears to be a dev-only/legacy alternate client (`usePeerHost.ts:86` even logs a "Web client URL (dev)"), and is out of scope for this inventory.

Logic layer = Rust (`apps/host/src-tauri/src/*.rs`) plus the shared TS protocol (`packages/shared/src/*.ts`) that both GUIs and the Rust backend agree on. GUI layer = the two frontends above.

---

## Summary Table

| Feature | Host GUI | Guest remote-ui | Library mode |
|---|:---:|:---:|:---:|
| Room hosting + QR/link invite | Yes | Yes (shows its own invite QR) | N/A |
| Guest join via QR scan / paste URL (in-app) | Yes (Guest mode) | N/A | N/A |
| Guest join via browser (out-of-app) | N/A | Yes | N/A |
| YouTube search | Yes | Yes (out-of-band `SEARCH`) | Yes |
| Add search result to queue | Yes | Yes | No (no live queue in Library) |
| Add search result to a collection | Yes | Yes | Yes |
| Add search result to "My Library" (local, in-app only) | N/A (host has no local/remote split) | Yes, in-app only | N/A (Library IS the local library) |
| Queue: view | Yes | Yes (Playing tab + dead Queue tab) | N/A |
| Queue: move up/down | Yes | Yes | N/A |
| Queue: remove | Yes | Yes | N/A |
| Queue: move to top ("play next") | **Yes** | Backend only, no UI | N/A |
| Queue: move to bottom, reorder-to-index | Backend only, no UI | Backend only, no UI | N/A |
| Playback: play/pause | Yes | Yes | N/A |
| Playback: skip | Yes | Yes | N/A |
| Playback: seek | **Yes** (seek bar) | Backend only, no UI | N/A |
| Playback: volume / mute | **Yes** (slider + mute) | Backend only, no UI | N/A |
| Fullscreen toggle | Yes (Player) | N/A (no video element) | N/A |
| Scoring overlay (mic input coverage) | Yes | N/A | N/A |
| Playlist collections: create/rename/delete | Yes | No (create-only via search picker's implicit flow is host-only) | Yes |
| Playlist collections: set public/personal visibility | Yes | View-only (icon) | Yes |
| Playlist collections: add/remove song | Yes | Yes (add via queue/search; remove yes) | Yes |
| Playlist collections: song → queue | Yes | Yes | N/A (no active room) |
| Playlist collections: export to file | Yes | No (host-only file dialog) | Yes |
| Playlist collections: import from file | Yes | No directly; guest imports via "My Library" bridge | Yes |
| "My Library" (local playlist store) via Guest bridge | N/A | Yes, in-app only | N/A |
| Theme toggle (dark/light) | Yes | Yes | Yes |
| Android TV / D-pad spatial navigation | Yes | No (phone-oriented UI) | No |
| Mobile responsive tab bar (Player/Controls) | Yes | N/A (already mobile-first) | N/A |
| Connected-clients count | Yes | No | N/A |
| Help dialog (logs / report issue) | **Yes** — reachable from the mode-select screen | N/A | N/A |
| ~~`fetch_song_metadata`~~ | Removed — the command never existed and nothing called it | N/A | N/A |

---

## 1. Room Hosting & Connectivity

### 1.1 Room creation
**What it does:** On entering Host mode, starts the embedded web/signaling server, then creates an in-memory room (room ID, host PeerJS ID, empty queue, playlists synced from disk).
**GUI layer:** `apps/host/src/App.tsx:42-52` (`HostView` effect calls `startHostServer()` then `initializeRoom()`); `apps/host/src/hooks/useRoomState.ts:37-49` (`initializeRoom`).
**Logic layer:** `apps/host/src-tauri/src/commands.rs:106-126` (`create_room` — generates room ID via SHA-256 truncation, join token via UUID, syncs playlists into `RoomStateManager`); `apps/host/src-tauri/src/commands.rs:544-566` (`start_host_server`, idempotent via `SERVER_STARTED` atomic, spawns a Tokio runtime on its own OS thread); `apps/host/src-tauri/src/web_server.rs:51-110` (`start_web_server` — picks a random ephemeral port 49152–65535, falls back to OS-assigned, serves Axum router).
**Notes:** `create_room`'s returned `join_token` is unused by the Host GUI — `usePeerHost.ts` generates its *own* separate room ID / join token locally (see 1.2) rather than using this one. Two independent ID/token generators exist for the same concept.

### 1.2 WebRTC peer + signaling room registration
**What it does:** Establishes a PeerJS peer, registers a room on the embedded Socket.IO signaling server, and exposes the connect URL/QR payload.
**GUI layer:** `apps/host/src/hooks/usePeerHost.ts:50-108` (`Peer` init, `CREATE_ROOM` emit, `ROOM_CREATED` handler that fetches `get_qr_url`), `apps/host/src/hooks/usePeerHost.ts:209-215` (local `generateRoomId`/`generateJoinToken`, `Math.random().toString(36)` — not cryptographically strong).
**Logic layer:** `apps/host/src-tauri/src/signaling.rs:203-217` (`CREATE_ROOM` socket handler → `RoomManager::create_room`), `apps/host/src-tauri/src/signaling.rs:27-59` (room bookkeeping, `MAX_CLIENTS_PER_ROOM = 10`), `apps/host/src-tauri/src/network.rs:11-16` (`generate_qr_url`, joins local IP + server port).
**Notes:** The join-token flow in signaling (`verify_room`, `signaling.rs:65-78`) is effectively bypassed for LAN guests — `remote-ui/index.html:2147-2151` always joins with `roomId: 'default', joinToken: ''`, and `signaling.rs:222-231` treats `'default'`/empty room ID as "just attach to the first active room" without token verification (`signaling.rs:235-241`). Token verification exists in the code but isn't exercised by the shipped guest flow.

### 1.3 QR code invite
**What it does:** Displays a QR code and copyable link for guests to join over LAN.
**GUI layer:** `apps/host/src/components/QRDisplay.tsx:1-144` (fetches `get_qr_url`, renders `QRCodeSVG`, copy-to-clipboard button); invoked from `apps/host/src/components/ControlPanel.tsx:415-419` (Invite Friends panel).
**Logic layer:** `apps/host/src-tauri/src/commands.rs:129-132` (`get_qr_url`), `apps/host/src-tauri/src/commands.rs:135-138` (`get_server_port`), `apps/host/src-tauri/src/network.rs:11-16`.
**Notes:** Guest remote-ui has its **own separate** invite-QR feature (see 7.1) using a different client-side QR library, generating a link to itself rather than round-tripping through Tauri.

### 1.4 Guest join (in-app: QR scan / paste URL)
**What it does:** From the Host app's own Guest mode, scan a QR with the device camera or paste/paste-from-clipboard a host URL, then load that host's remote-ui in an iframe.
**GUI layer:** `apps/host/src/components/GuestMode.tsx:1-198` (`Html5Qrcode` camera scan lines 45-78, clipboard paste lines 90-99, manual URL entry lines 101-111); wired up in `apps/host/src/App.tsx:170-183` (`GuestView.handleGuestConnect`, appends `?mode=inapp&t=<cachebust>` to the target URL).
**Logic layer:** None — pure client-side URL parsing/validation, no Tauri command involved.
**Notes:** N/A.

### 1.5 Guest join (out-of-app browser)
**What it does:** A guest visits the host's LAN URL directly in a mobile browser; the remote-ui prompts for a display name then connects via Socket.IO + PeerJS.
**GUI layer:** `apps/host/src-tauri/remote-ui/index.html:1273-1295` (`renderJoinScreen`), `:1775-1786` (`handleJoin`), `:2121-2223` (`startConnection` — Socket.IO connect, `JOIN_ROOM` emit, reconnect/backoff state machine), `:2224-2344` (`initPeer` — PeerJS connect to host's peer ID, `dataConn` open/data/close handlers).
**Logic layer:** `apps/host/src-tauri/src/web_server.rs:113-123` (`serve_index` serves the embedded HTML with no-cache headers), `apps/host/src-tauri/src/signaling.rs:220-276` (`JOIN_ROOM` handler).
**Notes:** Includes exponential-backoff auto-reconnect (`:2085-2114`, capped at 15s, 5 attempts) and foreground/online-event triggered reconnects (`:2206-2222`).

### 1.6 Connected-clients count
**What it does:** Shows how many guest data-channels are currently open.
**GUI layer:** `apps/host/src/components/ControlPanel.tsx:454-459` (`Users` icon + count), sourced from `apps/host/src/hooks/usePeerHost.ts:203` (`connectedClients: connections.size`).
**Logic layer:** None — purely a count of open PeerJS `DataConnection`s tracked client-side in `usePeerHost.ts:14,110-170`; `ConnectedClient`/`add_client`/`remove_client` exist in Rust (`room_state.rs:440-447`, `:648-660`) but are marked `#[allow(dead_code)]` and never invoked.
**Notes:** The Rust-side `connected_clients` list in `RoomState` is entirely unused dead code — the real count lives only in the React hook.

---

## 2. YouTube Search

### 2.1 Search for songs
**What it does:** Full-text search against YouTube, results biased toward karaoke versions by appending `"karaoke"` to the query server-side; results cached in-memory for 30 minutes.
**GUI layer:** Host: `apps/host/src/App.tsx:82-93` (`handleSearch`) feeding `apps/host/src/components/ControlPanel.tsx:154-166,462-497` (search box + spinner) and results list `:499-673`. Library mode: `apps/host/src/components/Library.tsx:75-94` (`handleSearch`), results `:263-356`. Guest remote-ui: `apps/host/src-tauri/remote-ui/index.html:1793-1805` (`handleSearch`), rendered `:1447-1543` (`renderSearchTab`).
**Logic layer:** `apps/host/src-tauri/src/commands.rs:147-151` (`search_youtube` Tauri command, used by Host GUI and Library mode); `apps/host/src-tauri/src/youtube.rs:42-125` (`search_youtube` impl — `rusty_ytdl` pure-Rust client, 10s timeout, in-memory `SEARCH_CACHE` keyed by lowercased query+limit, `:20-34`).
**Notes:** Guest remote-ui does **not** call `search_youtube` via Tauri (it can't — it's a webpage, not a webview with `invoke`). Instead it uses an out-of-band WebRTC message (see 2.2). This means Guest search results can differ subtly from Host search results only in transport, not in backend logic — same Rust function underneath, just reached over the DataChannel instead of `invoke`.

### 2.2 Guest search over WebRTC (out-of-band protocol)
**What it does:** Because the remote-ui runs in a browser/iframe with no Tauri bridge, it sends a raw `{type:'SEARCH', query, limit}` message over the existing PeerJS DataChannel instead of a `ClientCommand`; the host intercepts it before generic command dispatch and replies with `{type:'SEARCH_RESULTS', results}`.
**GUI layer:** `apps/host/src-tauri/remote-ui/index.html:1793-1805` (send), `:2301-2304` (receive `SEARCH_RESULTS`, and `:2305-2309` receive `ERROR`).
**Logic layer:** `apps/host/src/hooks/usePeerHost.ts:122-143` (interception — checked *before* `isClientCommand`, calls `invoke('search_youtube', ...)` directly from the React host process, then `conn.send({type:'SEARCH_RESULTS', results})` or an `ERROR` reply).
**Notes:** This is a bespoke, ad-hoc protocol extension — `SEARCH`/`SEARCH_RESULTS` are **not** part of `packages/shared/src/p2p-protocol.ts`'s `ClientCommand`/`HostBroadcast` unions (`p2p-protocol.ts:10-43`) and are absent from the Rust `ClientCommand` enum (`commands.rs:14-99`). It only works because `usePeerHost.ts` pattern-matches on the raw message shape before validating against `isClientCommand`.

---

## 3. Queue Management

### 3.1 Add song to queue (from search)
**What it does:** Resolves a YouTube URL to a video ID, fetches metadata, and either starts it playing immediately (if nothing is playing) or appends to the queue.
**GUI layer:** Host: `apps/host/src/components/ControlPanel.tsx:194-206` (`handleAddToQueue`, sends `ADD_SONG`). Guest: `apps/host/src-tauri/remote-ui/index.html:1807-1814` (`addFromSearch`, sends `ADD_SONG`).
**Logic layer:** `apps/host/src-tauri/src/commands.rs:182-205` (`ClientCommand::ADD_SONG` arm — `extract_youtube_id`, `crate::metadata::fetch_metadata`, then `RoomState::add_song`); `apps/host/src-tauri/src/room_state.rs:497-506` (`add_song` — plays immediately if `current_song` is `None`, else pushes to `queue`).
**Notes:** N/A.

### 3.2 View queue
**What it does:** Live "Up Next" list synced from `room_state_updated` Tauri events / `STATE_UPDATE` WebRTC broadcasts.
**GUI layer:** Host: `apps/host/src/components/Queue.tsx:99-153` (rendered inside `ControlPanel.tsx:678-681`). Guest: inline in the Playing tab, `apps/host/src-tauri/remote-ui/index.html:1410-1443`.
**Logic layer:** `RoomState.queue: Vec<Song>` (`room_state.rs:459`), broadcast via `app.emit("room_state_updated", ...)` in every mutating command (e.g. `commands.rs:308-311`) and forwarded to guests in `apps/host/src/hooks/usePeerHost.ts:26-48` (host) / `:173-190` (initial state on connect).
**Notes:** Guest remote-ui also has a standalone `renderQueueTab` function (`index.html:1545-1585`) that is **dead code** — there is no `queue` entry in `nav-tabs` (`:1350-1365` only wires `playing`/`search`/`playlist`/`library`) and nothing sets `state.activeTab = 'queue'`; the function is never called. Guests only ever see the queue inline under the "Playing" tab.

### 3.3 Reorder queue: move up / move down
**What it does:** Swap a song with its neighbor in the queue.
**GUI layer:** Host: `apps/host/src/components/Queue.tsx:57-75` (`handleMoveUp`/`handleMoveDown`, sends `MOVE_SONG_UP`/`MOVE_SONG_DOWN`). Guest: `apps/host/src-tauri/remote-ui/index.html:1925-1935` (`moveQueueItem`).
**Logic layer:** `apps/host/src-tauri/src/commands.rs:211-216`; `apps/host/src-tauri/src/room_state.rs:533-554` (`move_song_up`/`move_song_down` — `Vec::swap`).
**Notes:** N/A.

### 3.4 Remove song from queue
**What it does:** Deletes a song from the queue by ID.
**GUI layer:** Host: `apps/host/src/components/Queue.tsx:77-85`. Guest: `apps/host/src-tauri/remote-ui/index.html:1937-1943`.
**Logic layer:** `apps/host/src-tauri/src/commands.rs:206-210`; `apps/host/src-tauri/src/room_state.rs:509-517`.
**Notes:** N/A.

### 3.5 Move to top / move to bottom / reorder-to-index (unreachable)
**What it does:** Rust backend supports jumping a song to the front/back of the queue and reordering to an arbitrary index.
**GUI layer:** None in either frontend. `MOVE_SONG_TO_TOP` / `MOVE_SONG_TO_BOTTOM` aren't even declared in the shared TS protocol (`packages/shared/src/p2p-protocol.ts:10-34`); `REORDER_QUEUE` *is* declared in the shared protocol (`p2p-protocol.ts:19`) but no UI code constructs or sends it.
**Logic layer:** `apps/host/src-tauri/src/commands.rs:39-52,217-227` (enum variants + dispatch); `apps/host/src-tauri/src/room_state.rs:520-530,556-580` (`reorder_queue`, `move_song_to_top`, `move_song_to_bottom`).
**Notes:** Fully implemented and tested at the backend layer, completely unreachable from any UI. Candidate for either wiring up (e.g. drag-to-reorder) or removal.

---

## 4. Playback Control

### 4.1 Play / Pause
**What it does:** Toggles playback of the current song.
**GUI layer:** Host: `apps/host/src/components/ControlPanel.tsx:174-182,436-442` (`handlePlayPause`). Guest: `apps/host/src-tauri/remote-ui/index.html:1945-1952` (`togglePlayPause`, also optimistically flips local `state.roomState.player.status` before the round-trip, `:1949`).
**Logic layer:** `apps/host/src-tauri/src/commands.rs:164-169`; `apps/host/src-tauri/src/room_state.rs:623-640` (`play`/`pause` — `play()` also auto-advances from an empty `current_song` by popping the queue, `:628-633`).
**Logic layer (actual playback):** `apps/host/src/components/Player.tsx:309-320` — a `useEffect` that watches `roomState.player.status` and calls the real YouTube IFrame API's `playVideo()`/`pauseVideo()`. This is the *only* place actual video playback happens; the Rust side just tracks intended status.
**Notes:** N/A.

### 4.2 Skip
**What it does:** Advances to the next queued song (or clears to idle if queue is empty).
**GUI layer:** Host: `apps/host/src/components/ControlPanel.tsx:184-192,443-449`. Guest: `apps/host/src-tauri/remote-ui/index.html:1954-1956` (`skipSong`).
**Logic layer:** `apps/host/src-tauri/src/commands.rs:170-172`; `apps/host/src-tauri/src/room_state.rs:608-621` (`skip_song`).
**Notes:** Also triggered automatically after the (fake) scoring overlay finishes — see 8.1.

### 4.3 Seek (unreachable from GUI)
**What it does:** Backend command to set `player.current_time`.
**GUI layer:** None. Not present in `ControlPanel.tsx`, `Player.tsx`, or `remote-ui/index.html` (confirmed via search — only CSS class `.volume-slider`/`.volume-control` artifacts exist, no seek bar markup at all).
**Logic layer:** `apps/host/src-tauri/src/commands.rs:18,173-175` (`ClientCommand::SEEK{time}`); `apps/host/src-tauri/src/room_state.rs:643-646` (`seek`); declared in shared protocol `p2p-protocol.ts:14`.
**Notes:** There is no seek bar / scrubber anywhere. The YouTube IFrame player itself has `controls: 0` set (`Player.tsx:163`), so users cannot even scrub via the embedded player's native UI.

### 4.4 Volume / Mute (unreachable from GUI)
**What it does:** Backend command + state fields for volume level (0-100) and mute toggle.
**GUI layer:** None in Host GUI or Guest remote-ui. Confirmed by search: no component references `SET_VOLUME`, `TOGGLE_MUTE`, `volume`, or `mute` outside of unused CSS (`remote-ui/index.html:319-343`, a `.volume-control`/`.volume-slider` style block with no matching HTML ever generated by any `render*` function).
**Logic layer:** `apps/host/src-tauri/src/commands.rs:19-20,176-181` (`SET_VOLUME`, `TOGGLE_MUTE`); `apps/host/src-tauri/src/room_state.rs:597-606` (`set_volume` clamps to 100, `toggle_mute`); `PlayerState.volume`/`is_muted` fields (`room_state.rs:434-436`) default to `volume: 80, is_muted: false` (`room_state.rs:480-481`) and are never read by `Player.tsx` (the YouTube IFrame player's own volume is never set from this state).
**Notes:** Entirely dead: the state exists, defaults are set, the Rust mutators exist and are unit-testable, but nothing in the app ever changes them or displays them. The YouTube embed always plays at the browser/embed default volume.

### 4.5 Player time/duration sync
**What it does:** The host's real YouTube IFrame player polls its own current time every 1s and pushes a status/time/duration update to the Rust backend at most every 5s (throttled), which then re-broadcasts to all guests via `room_state_updated`.
**GUI layer:** `apps/host/src/components/Player.tsx:236-261` (`startTimePolling` — `setInterval(...,1000)`, `lastBroadcastTime` throttle to 5000ms), `:222-233` (`updatePlayerState` invoking `update_player_state`).
**Logic layer:** `apps/host/src-tauri/src/commands.rs:317-342` (`update_player_state` command — maps string status to `PlayerStatus` enum, calls `RoomState::update_player`, re-emits `room_state_updated`); `apps/host/src-tauri/src/room_state.rs:582-594`.
**Notes:** Guests never drive playback directly — they only ever see time/duration that the host chooses to broadcast, matching Ground Truth #4 (host Player.tsx owns the only real IFrame player; guests are command senders only).

### 4.6 Now Playing display
**What it does:** Shows current song title/artist/added-by across all three surfaces.
**GUI layer:** Host player: `apps/host/src/components/Player.tsx:409-416`. Host control panel: `apps/host/src/components/ControlPanel.tsx:424-434`. Guest: `apps/host/src-tauri/remote-ui/index.html:1384-1398` (`renderPlayingTab`).
**Logic layer:** `RoomState.player.current_song` (`room_state.rs:429-430`), populated by `add_song`/`skip_song`/`play`.
**Notes:** N/A.

---

## 5. Playback Surface (YouTube IFrame Player)

### 5.1 Embedded YouTube playback
**What it does:** Loads and controls a real YouTube IFrame API player instance; this is the actual video-rendering surface for the whole app.
**GUI layer:** `apps/host/src/components/Player.tsx:123-183` (IFrame API bootstrap + `YT.Player` construction with `controls:0, disablekb:1, rel:0`), `:287-307` (loads a new video via `loadVideoById` when `currentSong.id` changes), `:191-220` (`handlePlayerStateChange` maps YT player states → app `PlayerStatus` strings and calls `update_player_state`).
**Logic layer:** None directly — Rust only stores/broadcasts the *status label*, never touches video bytes; YouTube's iframe does all real decoding/rendering client-side in the Host webview.
**Notes:** Because only the Host webview embeds the IFrame, playback requires the host device to stay awake/foregrounded; guests including in-app Guest mode never render video.

### 5.2 Fullscreen toggle
**What it does:** Requests/exits browser Fullscreen API on the player container.
**GUI layer:** `apps/host/src/components/Player.tsx:111-121` (`toggleFullscreen`), `:94-103` (`fullscreenchange` listener), button at `:390-403`.
**Logic layer:** None — pure browser API (`element.requestFullscreen()` / `document.exitFullscreen()`).
**Notes:** Host-only; no equivalent in Guest remote-ui (there is no video element to fullscreen there).

### 5.3 Auto-play on cue / auto-advance on end
**What it does:** When a video reaches the `CUED` state it auto-plays (`Player.tsx:206-211`); when it reaches `ENDED`, the (fake) scoring overlay is shown, then on completion the song is auto-skipped.
**GUI layer:** `apps/host/src/components/Player.tsx:212-216` (`ENDED` → `handleSongEnded`), `:263-273` (`handleSongEnded` — captures title, generates fake score, shows overlay), `:276-285` (`handleScoringComplete` → sends `SKIP`).
**Logic layer:** `SKIP` handling as in 4.2.
**Notes:** See 8.1 for why the score is fake.

---

## 6. Playlist Collections ("Library")

Collections are managed by a single Rust `PlaylistStore` (`apps/host/src-tauri/src/room_state.rs:85-408`) that is **decoupled from room lifecycle** — it's available in Host mode, Guest-in-app mode (via bridge), and standalone Library mode, all backed by the same `playlists.json` file.

### 6.1 Persistence & migration
**What it does:** Collections persist as JSON at `app_local_data_dir/playlists.json`. On first run, if that file is missing, attempts a one-time migration from a legacy path.
**GUI layer:** N/A (invisible to users).
**Logic layer:** `apps/host/src-tauri/src/room_state.rs:99-159` (`PlaylistStore::initialize`) — checks `dirs::data_local_dir()/KaraokeNatin/playlists.json` first, then falls back to a legacy flat `playlist.json` (single array of songs, wrapped into a synthesized "Default Playlist" collection), gated `#[cfg(not(target_os = "android"))]` (`:107`); `apps/host/src-tauri/src/lib.rs:56-66` (calls `initialize` with `app.path().app_local_data_dir()` at startup and syncs into `RoomStateManager`).
**Notes:** Migration logic never deletes the old file (commented-out `fs::remove_file` calls at `room_state.rs:123,144`) — intentionally non-destructive, but means old files linger forever.

### 6.2 Create / rename / delete collection
**What it does:** Standalone collection CRUD, available in all three modes.
**GUI layer:** Host ControlPanel: `ControlPanel.tsx:221-246` (create, dual-purpose with search-picker), `:314-324` (rename), `:299-312` (delete, with `confirm()` and guard against deleting the last collection, `:770`). Library: `Library.tsx:96-106` (create), `:143-156` (rename), `:126-141` (delete). Guest remote-ui: create-only, via "My Library" bridge (`index.html:1849-1857,1878-1889`, `createLocalCollection`); no rename/delete UI in remote-ui at all.
**Logic layer:** `apps/host/src-tauri/src/commands.rs:361-399` (`playlist_create_collection`, `playlist_delete_collection`, `playlist_rename_collection`); `apps/host/src-tauri/src/room_state.rs:182-233`.
**Notes:** Host also has a second, room-scoped path to create a collection — the `CREATE_COLLECTION` `ClientCommand` (`ControlPanel.tsx:729-735`, dispatched via `process_command` rather than the standalone `playlist_create_collection` wrapper) — both ultimately call the same `PlaylistStore::create_collection`.

### 6.3 Visibility toggle (public / personal)
**What it does:** Public collections are broadcast to guests; personal ones are filtered out before broadcast.
**GUI layer:** Host: `ControlPanel.tsx:326-340` (`handleToggleVisibility`), `:746-752` (button). Library: `Library.tsx:158-166`. Guest remote-ui: read-only globe/lock icon per collection tab, no toggle UI (`index.html:1616`).
**Logic layer:** `apps/host/src-tauri/src/commands.rs:402-417` (`playlist_set_visibility`); filtering for broadcast happens client-side in `apps/host/src/hooks/usePeerHost.ts:28-33,178-181` (`playlists.filter(c => c.visibility === 'public')`) — **not** enforced in Rust; `RoomState::public_state()` (`room_state.rs:663-667`) exists as a Rust-side filter but is only used for `clone_public_state` (`room_state.rs:699-701`), which nothing currently calls (`get_room_state` command uses `clone_state()`, the *unfiltered* version, at `commands.rs:143`).
**Notes:** `ControlPanel.tsx:326-339` contains a multi-line comment block where the developer is visibly second-guessing their own visibility-string mapping (`'public'`/`'private'` vs `'public'`/`'personal'`) — functionally the ternary resolves correctly, but it's a readability/maintenance flag for the audit.

### 6.4 Add / remove song in a collection
**What it does:** Standalone add (fetches metadata, resolves default collection if none given) and remove.
**GUI layer:** Host: `ControlPanel.tsx:248-260` (add via "Library" picker), `:290-297` (remove). Library: `Library.tsx:168-189`. Guest remote-ui: add via "My Library" bridge (`index.html:1868-1876`), remove (`:1900-1906`).
**Logic layer:** `apps/host/src-tauri/src/commands.rs:420-465` (`playlist_add_song`, `playlist_remove_song`); room-scoped equivalents `PLAYLIST_ADD`/`PLAYLIST_REMOVE` also exist for the WebRTC path (`commands.rs:233-271`).
**Notes:** N/A.

### 6.5 Collection song → queue
**What it does:** Copies a song from a collection into the live queue (new ID, new `added_at`).
**GUI layer:** Host: `ControlPanel.tsx:280-288,807-810`. Guest: `index.html:1829-1835` (playlist tab), `:1891-1898` (`libraryToQueue`, local library tab — note this one actually sends a normal `ADD_SONG`, not `PLAYLIST_TO_QUEUE`, since local-library songs aren't part of room state).
**Logic layer:** `apps/host/src-tauri/src/commands.rs:272-278` (`PLAYLIST_TO_QUEUE`); `apps/host/src-tauri/src/room_state.rs:293-309` (`clone_song_for_queue`).
**Notes:** N/A.

### 6.6 Export collection to file
**What it does:** Opens a native "Save As" dialog and writes a versioned JSON export (`{"karaokenatin":"1.0","collection":{...}}`).
**GUI layer:** Host: `ControlPanel.tsx:344-353,765-769`. Library: `Library.tsx:193-201,479-483`. Guest remote-ui: **not present** — `exportLibrary()` (`index.html:1912-1917`) posts `EXPORT_LOCAL_PLAYLIST` up to the parent (Host GUI bridge), which is only wired when remote-ui is embedded in-app (see 7.3); a standalone browser guest has no export path at all.
**Logic layer:** `apps/host/src-tauri/src/commands.rs:478-516` (`save_collection_to_file` — `tauri_plugin_dialog` blocking save, sanitizes filename, writes with `.karaoke.json` suggested extension, logs verification of written file size); `room_state.rs:379-407` (`export_collection`).
**Notes:** N/A.

### 6.7 Import collection from file
**What it does:** Opens a native "Open" dialog, parses the versioned export format, de-duplicates collection names by appending "(Imported)"/"(Imported N)".
**GUI layer:** Host: `ControlPanel.tsx:355-364,690-694`. Library: `Library.tsx:203-212,364-369`. Guest remote-ui bridge: `index.html:1908-1910` (`importLibrary`, posts `IMPORT_LOCAL_PLAYLIST`).
**Logic layer:** `apps/host/src-tauri/src/commands.rs:519-537` (`load_collection_from_file`); `room_state.rs:322-376` (`import_collection` — name-collision suffixing loop `:352-363`).
**Notes:** **BROKEN for Guest-mode import.** The bridge handler in `apps/host/src/App.tsx:251-265` does `const json = await invoke<string>('load_collection_from_file'); ... await invoke('playlist_import_collection', { json });` — but the Rust command signature is `playlist_import_collection(data: String, ...)` (`commands.rs:469-474`). The invoke call passes a key named `json`, not `data`, so Tauri will fail to deserialize the required `data` argument and the call will reject. This is a real bug, distinct from the three explicitly-missing commands in the ground truth — it's a parameter-name mismatch on a command that *does* exist.

### 6.8 "My Library" — Guest-mode bridge to local playlists
**What it does:** Since the Guest remote-ui iframe has no direct Tauri access, `App.tsx`'s `GuestView` listens for `postMessage`s from the iframe and proxies them to the same standalone playlist commands used by Host/Library mode, giving in-app guests a private "Library" tab backed by the local `playlists.json`.
**GUI layer:** Remote-ui side (message senders): `index.html:1849-1917` (`createLocalCollection`, `commitSaveToLibrary`, `removeFromLibrary`, `importLibrary`, `exportLibrary`), `:2351-2363` (listens for `LOCAL_PLAYLISTS_UPDATED`/`TOAST` replies, requests initial data via `REQUEST_LOCAL_PLAYLISTS`), tab rendered at `:1673-1772` (`renderLibraryTab`, only shown when `state.isInAppRemote` is true, gated on `?mode=inapp` query param). Host side (bridge): `apps/host/src/App.tsx:192-278` (`handleMessage` — origin-checked against `guestIframeRef.current.contentWindow`, dispatches on `event.data.type`: `REQUEST_LOCAL_PLAYLISTS`, `CREATE_LOCAL_COLLECTION`, `ADD_TO_LOCAL_PLAYLIST`, `REMOVE_FROM_LOCAL_PLAYLIST`, `IMPORT_LOCAL_PLAYLIST`, `EXPORT_LOCAL_PLAYLIST`).
**Logic layer:** Same standalone commands as 6.2/6.4/6.6/6.7 (`get_playlists`, `playlist_create_collection`, `playlist_add_song`, `playlist_remove_song`, `load_collection_from_file`+`playlist_import_collection`, `save_collection_to_file`).
**Notes:** Guest-created collections are always forced to `visibility: 'personal'` (`App.tsx:212`), and songs added this way are attributed as `addedBy: 'Guest'` (`App.tsx:225`). Import via this path is broken — see 6.7. Web-only guests (not embedded in-app) never get a Library tab at all; `renderPlaylistTab` even shows them a note pointing to the downloadable app instead (`index.html:1588-1593`).

### 6.9 `export_collection` Tauri command (dead)
**What it does:** Returns collection JSON as a string without a file dialog.
**GUI layer:** None — `apps/host/src/lib/commands.ts:38-40` wraps it (`exportCollection`) but no component calls that wrapper.
**Logic layer:** `apps/host/src-tauri/src/commands.rs:345-348`.
**Notes:** Dead command; both frontends use `save_collection_to_file`/`load_collection_from_file` (native dialogs) instead.

---

## 7. Guest Remote-UI-Specific Features

These exist only in `remote-ui/index.html` and have no Host-GUI counterpart (the Host doesn't need them — it already has native OS affordances).

### 7.1 In-remote invite QR (separate from Host's QRDisplay)
**What it does:** Guests can also generate a QR/link to the *current page URL* (i.e., re-share the same room) from within the remote-ui itself.
**GUI layer:** `apps/host/src-tauri/remote-ui/index.html:1958-1988` (`showInviteQR`, uses `window.location.href` and the `qrcodejs` CDN library, distinct from the React app's `qrcode.react`), `:1990-1996` (`copyInviteLink`).
**Logic layer:** None.
**Notes:** N/A.

### 7.2 Toast notifications & confirm modal
**What it does:** Lightweight toast (`showToast`) and a generic confirm modal (`showModal`/`closeModal`) used throughout remote-ui for feedback (e.g. "Song added to queue", "Open in YouTube?").
**GUI layer:** `apps/host/src-tauri/remote-ui/index.html:2008-2041`; success-toast heuristics derived by diffing old/new `STATE_UPDATE` payloads at `:2258-2294` (infers "added to queue" vs "added to playlist" by comparing array lengths, not by explicit ack).
**Logic layer:** None.
**Notes:** The diff-based toast heuristic is fragile — e.g., two guests acting simultaneously could produce a misleading toast, since it only compares before/after totals, not per-action acknowledgement.

### 7.3 "Open in YouTube"
**What it does:** Opens a search result's video directly in a new browser tab (bypassing the queue).
**GUI layer:** `apps/host/src-tauri/remote-ui/index.html:1919-1923` (`openInYouTube`), confirm dialog via `showModal`, button rendered at `:1525-1527`.
**Logic layer:** None.
**Notes:** Host GUI has no equivalent — there's no "open in browser" affordance in `ControlPanel.tsx` search results.

### 7.4 Optimistic UI / loading-state tracking
**What it does:** Per-action `Set`s (`loadingActions`, `addedSongs`) drive spinner/disabled states on buttons while a command is in flight, cleared on the next `STATE_UPDATE`.
**GUI layer:** Scattered throughout — e.g. `index.html:1807-1814` (queue-add), `:1925-1935` (move), `:1937-1943` (remove), cleared in bulk at `:2286-2293`.
**Logic layer:** None — purely client-side UX polish; the Host React GUI does the analogous thing with `useState<Set<string>>` in `ControlPanel.tsx:89-97`.
**Notes:** N/A.

---

## 8. Scoring (FAKE)

### 8.1 Post-song "score"
**What it does:** After a song ends, shows a full-screen scoring animation with a number 70-100 (0.5% chance of a special "101 — PERFECT" result), purely for show.
**GUI layer:** `apps/host/src/components/Player.tsx:70-75` — `generateScore()`:
```ts
const generateScore = (): number => {
    const perfectChance = Math.random() < 0.005; // 0.5% chance
    if (perfectChance) return 101;
    return Math.floor(Math.random() * 31) + 70; // 70-100
};
```
called from `handleSongEnded` at `Player.tsx:264-273`; rendered by `apps/host/src/components/ScoringOverlay.tsx:1-155` (three-phase animation: intro → score reveal → exit, 3.5s total, `ScoringOverlay.tsx:13-27`).
**Logic layer:** **None.** There is no audio capture, no microphone permission request, no pitch/pitch-tracking or DSP code anywhere in the Rust backend or either frontend. Confirmed by searching the entire repo for microphone/audio-analysis APIs — none exist.
**Notes:** This is not a partially-implemented feature; it is decorative random-number theater with zero relationship to the user's actual singing. Any product copy, store listing, or UI text implying real vocal scoring is materially misleading and should be flagged as a top audit finding. The overlay only appears on the Host screen (`Player.tsx:418-424`) — guests never see a score at all, consistent with there being nothing real to report.

---

## 9. Cross-Cutting UI Features

### 9.1 Theme toggle (dark/light)
**What it does:** Per-surface, independently-stored dark/light theme toggle. Each of the three UI surfaces has its **own separate** theme state — they do not sync with each other.
**GUI layer:** Host ControlPanel: `apps/host/src/components/ControlPanel.tsx:86,168-172,396-398` (local `useState`, not persisted — resets to `'dark'` on remount). Library: `apps/host/src/components/Library.tsx:36,214-218,231-233` (also local, not persisted). Guest remote-ui: `apps/host/src-tauri/remote-ui/index.html:1167,1192-1208,1344-1345` (defaults from `prefers-color-scheme`, also reacts live to OS theme changes via `matchMedia(...).addEventListener('change', ...)`, `:1197-1201`).
**Logic layer:** None — pure CSS class toggling (`document.documentElement.classList.toggle('light', ...)`).
**Notes:** Neither Host ControlPanel nor Library persists the chosen theme (no `localStorage`); it silently resets to dark every time those components remount (e.g. switching modes). Guest remote-ui doesn't persist an explicit user choice either — it only reads system preference at load and live-updates on system changes, with no manual-override persistence.

### 9.2 Android TV / D-pad spatial navigation
**What it does:** Enables focus-based navigation (arrow keys / D-pad) across the Host GUI for TV/remote use, via `@noriginmedia/norigin-spatial-navigation`.
**GUI layer:** Initialized once at `apps/host/src/App.tsx:15-18` (`init({debug:false, visualDebug:false})`). Applied via `useFocusable`/`FocusContext.Provider` in `App.tsx:40,121` (root), `ControlPanel.tsx:42-66,113,370` (custom `FocusableButton` wrapper + provider), `Player.tsx:90,373` , `Queue.tsx:37-52,55,100`. Global `Escape`/`GoBack` handler collapses the control panel on Android TV back-button press: `App.tsx:69-80`.
**Logic layer:** None — client-side-only library behavior.
**Notes:** Not present in Guest remote-ui or Library mode (`Library.tsx` uses plain `<button>` elements with no `useFocusable` wrapper) — D-pad nav is Host-mode-only, consistent with Host mode being the TV-facing surface.

### 9.3 Mobile responsive layout (Player/Controls tab bar)
**What it does:** On narrow/touch screens, Host mode switches from a side-by-side Player+ControlPanel layout to a two-tab mobile layout.
**GUI layer:** `apps/host/src/App.tsx:37,55-66` (`isMobile` detection via `innerWidth <= 768 || 'ontouchstart' in window`, auto-selects the Controls tab on portrait orientation), `:124-133` (tab bar), `:136,145` (conditional `hidden-mobile` classes).
**Logic layer:** None.
**Notes:** N/A.

### 9.4 Error boundary
**What it does:** Catches uncaught render errors app-wide and shows a fallback screen with the error/stack trace and a reload button.
**GUI layer:** `apps/host/src/components/ErrorBoundary.tsx:13-97`, mounted at the very root in `apps/host/src/main.tsx:7-12` (wraps `<App/>`).
**Logic layer:** None.
**Notes:** N/A.

### 9.5 Help dialog — ORPHANED
**What it does:** A component that would show "Open Logs Folder" and "Report on GitHub" buttons.
**GUI layer:** `apps/host/src/components/HelpDialog.tsx:1-160` — fully implemented, styled, with its own `open_log_folder`/`report_issue` invocations (`:31-45`).
**Logic layer:** Neither Tauri command exists on the Rust side (see 9.6/9.7 below) — and more fundamentally, **the component itself is never imported or rendered anywhere in the codebase.** Confirmed by repo-wide search: `HelpDialog` only appears inside `HelpDialog.tsx` itself (its own interface/definition/export) — no `import HelpDialog` exists in `App.tsx`, `ControlPanel.tsx`, `Player.tsx`, or any other file.
**Notes:** Dead component on top of missing backend commands — a double-broken feature. There is currently no way for a user to reach a Help/Support screen anywhere in the app.

### 9.6 `open_log_folder` command — MISSING BACKEND
**What it does (intended):** Open the app's log directory in the OS file browser.
**GUI layer:** `apps/host/src/components/HelpDialog.tsx:31-37` (`handleOpenLogs`, `invoke('open_log_folder')`).
**Logic layer:** **Does not exist.** Not defined anywhere in `apps/host/src-tauri/src/commands.rs`, and not registered in the `invoke_handler!` list in `apps/host/src-tauri/src/lib.rs:73-95`. Calling it would reject with a "command not found" error at runtime — moot anyway since HelpDialog is never rendered (9.5).
**Notes:** BROKEN (ground truth #8).

### 9.7 `report_issue` command — MISSING BACKEND
**What it does (intended):** Presumably open a browser to a GitHub issue template.
**GUI layer:** `apps/host/src/components/HelpDialog.tsx:39-45` (`handleReportIssue`, `invoke('report_issue')`).
**Logic layer:** **Does not exist**, same as 9.6 — absent from `commands.rs` and `lib.rs`'s `invoke_handler!`.
**Notes:** BROKEN (ground truth #8).

### 9.8 `fetch_song_metadata` command — MISSING BACKEND
**What it does (intended):** A standalone way to fetch a single song's metadata without adding it to a queue/collection.
**GUI layer:** `apps/host/src/lib/commands.ts:20-28` (`fetchSongMetadata` wrapper) — but confirmed via repo-wide search that **no component ever imports or calls `fetchSongMetadata`**. It's dead on the GUI side too, not just missing on the backend.
**Logic layer:** **Does not exist** in `commands.rs`/`lib.rs`'s `invoke_handler!`. (The functionally-equivalent `crate::metadata::fetch_metadata` in `apps/host/src-tauri/src/metadata.rs:16-73` exists and is used internally by `ADD_SONG`/`PLAYLIST_ADD`/`playlist_add_song`, but it is a plain Rust function, not a `#[tauri::command]`, so it isn't reachable via `invoke`.)
**Notes:** BROKEN and unreferenced (ground truth #8) — double-dead, similar to 9.5-9.7.

---

## 10. Song Metadata Fetching (internal, not directly user-facing)

### 10.1 YouTube metadata resolution
**What it does:** Given a YouTube ID, fetches title/channel(as artist)/duration/thumbnail via `rusty_ytdl`, with a 10s timeout and graceful fallback to placeholder metadata (`"YouTube Video <id>"`, `"Unknown Artist"`, duration `0`) on error or timeout.
**GUI layer:** N/A — invoked internally by every "add song" code path, never called directly by the frontend as its own feature (see 9.8 for the *dead* direct-invoke wrapper).
**Logic layer:** `apps/host/src-tauri/src/metadata.rs:16-73` (`fetch_metadata`); called from `commands.rs:186,237,429` (`ADD_SONG`, `PLAYLIST_ADD`, `playlist_add_song`).
**Notes:** N/A.

### 10.2 YouTube URL / ID parsing
**What it does:** Extracts an 11-character video ID from `?v=`, `youtu.be/`, or a bare-ID string.
**GUI layer:** N/A.
**Logic layer:** `apps/host/src-tauri/src/commands.rs:592-618` (`extract_youtube_id`), unit-tested at `:624-638`.
**Notes:** Does not handle `youtube.com/shorts/<id>` or `youtube.com/embed/<id>` URL forms — only `?v=`, `youtu.be/`, and bare 11-char IDs. Any Shorts/embed link pasted by a user (there is no paste-URL entry point today, but `extract_youtube_id` is the single choke point all song-adding goes through) would fail to resolve.

---

## Appendix: Confirmed dead / broken inventory

| Item | Location | Status |
|---|---|---|
| Scoring / pitch detection | `Player.tsx:70-75` | FAKE — `Math.random()`, no audio analysis anywhere |
| `fetch_song_metadata` command | `commands.ts:27`, no Rust impl | BROKEN — missing backend, also unreferenced by any component |
| `open_log_folder` command | `HelpDialog.tsx:33`, no Rust impl | BROKEN — missing backend |
| `report_issue` command | `HelpDialog.tsx:41`, no Rust impl | BROKEN — missing backend |
| `HelpDialog` component | `components/HelpDialog.tsx` | ORPHANED — never imported/rendered anywhere |
| Guest "My Library" import | `App.tsx:254` | BROKEN — `invoke('playlist_import_collection', { json })` passes wrong arg key; Rust expects `data` |
| `renderQueueTab` | `remote-ui/index.html:1545` | DEAD CODE — no nav tab ever activates `'queue'` |
| Seek (`SEEK`) | protocol + `room_state.rs:643` | Backend-complete, zero GUI entry point in either frontend |
| Volume / Mute (`SET_VOLUME`/`TOGGLE_MUTE`) | protocol + `room_state.rs:597-606` | Backend-complete, zero GUI entry point; dead CSS remnants in remote-ui |
| `MOVE_SONG_TO_TOP` / `MOVE_SONG_TO_BOTTOM` | `commands.rs:39-46` | Rust-only, not even in shared TS protocol, no GUI |
| `REORDER_QUEUE` | protocol + `room_state.rs:520` | In shared protocol, backend-complete, no GUI sends it |
| `SET_DISPLAY_NAME` | `commands.rs:53,228-230` | Accepted by backend but only logged (`log::info!`), never persisted/used; no GUI sends it |
| `export_collection` command | `commands.ts:38-40` | Unreferenced wrapper; both GUIs use the file-dialog variant instead |
| `ConnectedClient` / `add_client` / `remove_client` | `room_state.rs:440-447,648-660` | `#[allow(dead_code)]`, unused — real client count is tracked only in `usePeerHost.ts` |
| `RoomStateManager::clone_public_state` / `RoomState::public_state()` | `room_state.rs:663-667,699-701` | Defined but never called; visibility filtering for broadcast is instead done ad hoc in `usePeerHost.ts:28-33` |
