# ISSUES

> **Status: 22 of the 33 issues below have been resolved.** Each carries a
> `> RESOLVED` note directly under its heading describing what was done. The
> remainder are either genuinely blocked (2.4), deferred by scope (3.5, 3.8,
> 3.11, 3.12), or need hardware to verify. See `task.md` for the backlog view.
>
> Original audit text is preserved so the reasoning behind each finding stays
> readable — do not delete it when closing an item.

Original audit pass: discovery only. Every claim below was read in the source and, where marked **[verified]**, re-checked directly against the code rather than taken from a summary.

Severity key:
- **S1 — Broken**: feature does not work, or crashes/rejects at runtime.
- **S2 — Serious**: security hole, data loss risk, or platform-blocking.
- **S3 — Fragile**: works today, breaks under load / edge cases / maintenance.
- **S4 — Rough edge**: usability, hygiene, confusion.

---

## S1 — Broken

### 1.1 Three Tauri commands are invoked by the GUI but do not exist **[verified]**

> **RESOLVED** — `open_log_folder` and `report_issue` implemented and registered; the `fetch_song_metadata` wrapper deleted. Guarded by `tauri-commands.test.ts`.
The frontend calls three commands that are neither defined in `apps/host/src-tauri/src/` nor registered in the `invoke_handler!` list at `apps/host/src-tauri/src/lib.rs:73-95`. Every call rejects at runtime.

| Command | Call site | Registered? |
|---|---|---|
| `fetch_song_metadata` | `apps/host/src/lib/commands.ts:27` | No |
| `open_log_folder` | `apps/host/src/components/HelpDialog.tsx:33` | No |
| `report_issue` | `apps/host/src/components/HelpDialog.tsx:41` | No |

Both Help dialog buttons are dead. `fetchSongMetadata()` is exported from the commands module and will reject for any caller.

Verification method: `grep "fn <name>" apps/host/src-tauri/src/` returned nothing for all three, and none appear in the `generate_handler!` macro.

### 1.2 Guest Mode playlist import passes the wrong argument name **[verified]**

> **RESOLVED** — routed through the typed wrapper. The sweep it prompted (T6) found a second instance in `lib/commands.ts`; both fixed and now covered by a test that parses every `invoke` against the Rust signatures.
`apps/host/src/App.tsx:254` invokes:

```ts
await invoke('playlist_import_collection', { json });
```

The Rust command signature (`apps/host/src-tauri/src/commands.rs:469-473`) is:

```rust
pub fn playlist_import_collection(data: String, ...) -> Result<String, String>
```

The argument is named `data`, not `json`. Tauri deserializes the invoke payload into the command's named parameters, so `data` is missing and the call fails before the body runs. Importing a playlist from Guest Mode is broken.

Note this is a *different* defect from 1.1 — the command exists and is correctly registered; only the caller is wrong. It is also the harder class to catch, because `invoke` is untyped at the boundary and nothing in `tsc` or `cargo` checks argument names across the FFI line. Worth assuming there are more of these; a systematic sweep of every `invoke` call site against its Rust signature was not completed in this pass.

### 1.3 `packages/shared` is never built, so a clean clone cannot build **[verified]**

> **RESOLVED** — the real cause was worse than "never built": `tsconfig` had no `rootDir`, so output landed at `dist/src/index.js` while `main` pointed at `dist/index.js`. Fixed, plus a `prepare` script and a `build:shared` step in `setup`.
`packages/shared/package.json` declares `"main": "./dist/index.js"` and `"types": "./dist/index.d.ts"`. `dist/` is gitignored (`.gitignore:9`) and is not present in the tree. The root `setup:packages` script runs `pnpm install` in `packages/shared` but never `pnpm build`.

`apps/host` and `apps/web-client` both import `@karaokenatin/shared` at type level (`apps/host/src/hooks/usePeerHost.ts:5`, `useRoomState.ts:3`, `lib/commands.ts:2`, `components/Queue.tsx:1`, `apps/web-client/components/NowPlaying.tsx:1`). There is no Vite alias (`apps/host/vite.config.ts` has no `resolve.alias`) and no Next `transpilePackages` (`apps/web-client/next.config.mjs`), so resolution goes through `main`/`types` — which do not exist until `shared` is built.

Consequence: `pnpm run setup && pnpm run build:host` fails at the `tsc` step on a fresh clone. Anyone who has built before has a stale `dist/` on disk masking it.

### 1.4 `SEARCH` is an undeclared protocol message **[verified]**

> **RESOLVED** — `SEARCH`/`SEARCH_RESULTS` declared, along with `MOVE_SONG_TO_TOP`/`MOVE_SONG_TO_BOTTOM` and the missing `addedBy` fields. Compile-time exhaustiveness guards now fail the build if a union member is added without registering it.
`remote-ui/index.html` sends `{ type: 'SEARCH', query }`, and `apps/host/src/hooks/usePeerHost.ts:122-138` handles it specially with a comment acknowledging it is "not a standard ClientCommand", replying `{ type: 'SEARCH_RESULTS', results }`.

Neither `SEARCH` nor `SEARCH_RESULTS` exists in `packages/shared/src/p2p-protocol.ts` nor in the Rust `ClientCommand` enum in `commands.rs`. Guest search works only because it bypasses the typed protocol entirely. The type guards `isClientCommand` / `isHostBroadcast` do not cover it, so it is invisible to every consumer that trusts the shared types.

> Note: an earlier exploration pass concluded "zero type drift" on the basis that all TS packages import from `packages/shared`. That is true of the TS apps but wrong as an overall verdict — the drift is in `remote-ui` (vanilla JS, no types at all) and in this out-of-band pair.

---

## S2 — Serious

### 2.1 Join-token authentication is bypassable, and the shipped guest client bypasses it **[verified]**

> **RESOLVED** — verification is unconditional; the token travels in the QR URL and `remote-ui` reads it from `?t=`. Room *resolution* still falls back to the first active room, but no longer implies authorisation. Regression covered by `verify_room_rejects_an_empty_token`.
`apps/host/src-tauri/src/signaling.rs:220-276` resolves the target room, then chooses whether to verify:

```rust
let room_res = if data.room_id.as_deref().unwrap_or("") == "default"
    || data.room_id.as_deref().unwrap_or("").is_empty() {
    state.get_room(&room_id).ok_or("Room not found".to_string())   // no token check
} else {
    state.verify_room(&room_id, &data.join_token)
};
```

All three of `roomId: ""`, `roomId: "default"`, and an absent `roomId` skip `verify_room` and fall through to `get_first_active_room()`. Anyone who can reach the host's HTTP port can join the active room with no token.

This is not theoretical: **`apps/host/src-tauri/remote-ui/index.html:2149` sends `joinToken: ''`** — the actual QR-code guest client takes the bypass path by design. The token scheme is decorative in the shipped product.

Related: `CREATE_ROOM` (`signaling.rs:203-217`) has no authentication at all — any socket.io client that reaches the port can register a room.

Mitigating context: this is a LAN party app, so the threat model is "someone on your Wi-Fi", not the internet. That lowers urgency but does not make the token scheme functional — it should either work or be removed, because right now it reads as protection that isn't there.

### 2.2 Two competing room-credential generators; the Rust one is dead **[verified]**

> **RESOLVED** — credentials now come from `crypto.getRandomValues` with rejection sampling (~128-bit tokens), and hash comparison is constant-time.
- `apps/host/src/hooks/usePeerHost.ts:65-67` generates `roomId` and `joinToken` in JS and emits `CREATE_ROOM` with the hash at line 75. **This is the pair that actually registers with signaling.**
- `apps/host/src-tauri/src/commands.rs:106-126` (`create_room`) independently generates a `room_id` and `join_token` via `generate_room_id()` / `generate_join_token()` (`commands.rs:587`). It is called from `apps/host/src/hooks/useRoomState.ts:40` as bare `await createRoom();` — **the return value is discarded.**

So the Rust credentials are computed and thrown away, and the JS ones are authoritative. The JS generators use `Math.random().toString(36).substring(2,15)` (`usePeerHost.ts:209-215`) — not a CSPRNG. Given 2.1 this barely matters today, but it is a trap for anyone who later "fixes" the token check and assumes the credentials are strong.

### 2.3 The entire release build path is Windows-only **[verified]**

> **RESOLVED** — `deb`/`appimage` targets added, POSIX build scripts written, the Windows sidecar step dropped from the top-level build, and the pinned Android build-tools version replaced with highest-installed detection.
Cross-platform target is Android + Windows + Linux. Linux cannot be built at all from the committed tooling:

- `apps/host/src-tauri/tauri.conf.json:33-36` sets `bundle.targets: ["nsis", "msi"]` — Windows installers only. No `deb`, `appimage`, or `rpm`.
- Root `package.json:15` `build` = `build:signaling-exe && build:host`, and `build:signaling-exe` (`apps/signaling-server/package.json`) runs `pkg --targets node18-win-x64 --output ../host/src-tauri/binaries/signaling-server-x86_64-pc-windows-msvc.exe`. A Windows `.exe` is a hard prerequisite of the top-level build.
- `build.bat`, `start-dev.bat`, `clean_android_build.bat` are Windows batch: `@echo off`, `setlocal enabledelayedexpansion`, `goto`, `xcopy /e /i /y`, `rmdir /s /q`, `powershell -NoExit`, `timeout /t`, and explicit `gradlew.bat` / `apksigner.bat` / `zipalign.exe` invocations. There is no `.sh` equivalent anywhere in the repo.
- `build.bat:42` hardcodes `%ANDROID_HOME%\build-tools\36.0.0` — pinned build-tools version, breaks on any other install.

Note the sidecar `.exe` produced by `build:signaling-exe` is **also orphaned**: `tauri.conf.json` declares no `externalBin`, and `src-tauri/binaries/` does not exist in the tree. The build step produces an artifact nothing consumes (see 3.1).

### 2.4 Android cleartext + user CA trust is broader than the LAN use case needs **[verified]**

> **PARTLY RESOLVED** — the `user` CA trust anchor is removed. Cleartext remains permitted: Android cannot express private IP ranges in a `domain-config`, and denying it by default breaks every guest connection. See `task.md` T12 for what would actually close it.
- `gen/android/app/build.gradle.kts:20` sets `manifestPlaceholders["usesCleartextTraffic"] = "true"` in `defaultConfig`, so it applies to **release** as well as debug (the `release` block at line 39 does not override it).
- `gen/android/app/src/main/res/xml/network_security_config.xml` sets `cleartextTrafficPermitted="true"` in `base-config` — unscoped, i.e. cleartext to *every* domain, not just the local subnet — and additionally adds `<certificates src="user" />` to the trust anchors.

Cleartext on a LAN with no TLS is defensible. Trusting user-installed CAs app-wide is not required by anything in this app and widens MITM exposure on the guest's device. A `domain-config` scoped to private ranges would cover the actual need.

### 2.5 The WebRTC handshake is brokered by the public `peerjs.com` cloud — the app cannot work offline **[verified]**

> **RESOLVED** — `peer_server.rs` embeds a PeerJS-compatible broker in the host web server; both clients point at it. Six integration tests connect two real WebSocket clients and assert the handshake relays. *(The empirical offline test, V1, still has not been run on hardware.)*
Both peers construct PeerJS with only an ICE config and **no `host` / `port` / `path` option**:

- `apps/host/src/hooks/usePeerHost.ts:52-59`
- `apps/host/src-tauri/remote-ui/index.html:2229-2237`
- `apps/web-client/lib/usePeerClient.ts:35-42`

With no broker specified, PeerJS defaults to its public cloud PeerServer (`0.peerjs.com`). So the host and every guest register their peer IDs with, and exchange SDP through, a third-party server on the public internet.

The locally-served socket.io signaling (`signaling.rs`) only exchanges room metadata and peer IDs — **it does not carry the WebRTC offer/answer.** That means:

1. **No internet → no guest can ever connect.** Not degraded: non-functional. `README.md:27`'s "Works over Wi-Fi, no internet required once songs are loaded" is wrong about the core architecture, not just about the CDN assets in 4.1.
2. **`peerjs.com` is an unmonitored single point of failure** for the entire product. If it is down, rate-limits, or disappears, every install stops working simultaneously with no fallback and no diagnostic beyond a PeerJS error.
3. Room ids and peer ids of every session transit a third party.

This is the most consequential finding in the audit, because the project's central premise is LAN-local operation. Self-hosting the broker is well-supported — PeerJS accepts `{host, port, path}`, and `peerjs-server` could be embedded alongside the existing axum server so the handshake stays on the LAN. Fixing this also removes the largest external dependency behind 4.1 and 4.2.

**Verification note:** confirmed by reading all three `new Peer(...)` call sites; none passes a broker option. Not confirmed by running the app with the network disconnected — that test would settle it definitively and is the single highest-value thing to try next.

### 2.6 Android manifest requests permissions the code never uses **[verified]**

> **RESOLVED** — `MODIFY_AUDIO_SETTINGS`, `CHANGE_WIFI_STATE` and `FOREGROUND_SERVICE` removed. `RECORD_AUDIO` is retained and now genuinely used by mic-coverage scoring; `WAKE_LOCK` is retained and now acquired during playback.
`gen/android/app/src/main/AndroidManifest.xml` declares `CAMERA` (:11), `RECORD_AUDIO` (:16), `MODIFY_AUDIO_SETTINGS` (:17), `CHANGE_WIFI_STATE` (:7-8), `FOREGROUND_SERVICE` (:21-22), `WAKE_LOCK` (:23). No foreground service is implemented, no audio is recorded (scoring is `Math.random()` — see FEATURES.md), and no Wi-Fi state is changed.

`RECORD_AUDIO` + `CAMERA` on a karaoke app that does not record is exactly the combination that triggers Play Store review friction and user distrust. `CAMERA` may be reachable via the html5-qrcode scanner in `GuestMode.tsx` on the host build, but `RECORD_AUDIO` has no consumer at all.

Separately: `WAKE_LOCK` is declared but unused, which is a real functional gap — see 4.4.

---

## S3 — Fragile

### 3.1 A dead Node signaling server still ships in the build **[verified]**

> **RESOLVED** — `apps/signaling-server/` deleted after verifying it is referenced by neither build.
There are two signaling implementations. The live one is Rust: the host connects to `io('http://localhost:${port}')` where `port` comes from `invoke('get_server_port')` (`usePeerHost.ts:70-72`) — that is the axum + socketioxide server in `src-tauri/web_server.rs` + `signaling.rs`.

`apps/signaling-server/` (Node) is never launched by the host. Git history explains it: `src-tauri/src/sidecar.rs` was deleted in commit `1f6e0f0`, the same commit that added Android support — sidecar processes cannot be spawned on Android, so signaling was reimplemented natively. The Node app was left behind.

It is still wired into root `package.json` as `dev:signaling`, `build:signaling`, `build:signaling-exe`, and is a hard step in the top-level `build`. Its `roomManager.ts` logic (12h TTL, `MAX_CLIENTS_PER_ROOM = 10`, 5-minute cleanup sweep) is dead code that reads like live policy — an auditor or contributor will reasonably mistake it for the running behaviour.

### 3.2 The Next.js web client is orphaned **[verified]**

> **RESOLVED** — `apps/web-client/` deleted.
`apps/web-client` is a complete second guest client. Nothing builds, bundles, or serves it. Its only reference in the app is a dev-only `console.log` at `apps/host/src/hooks/usePeerHost.ts:86` constructing `http://localhost:3000/room/...` — and `localhost:3000` is meaningless on a guest's phone regardless.

Guests actually reach `remote-ui/index.html`, served at `GET /` by the Rust web server, via the QR code (`get_qr_url`). So the repo maintains two full guest UIs implementing the same protocol, one of which is unreachable. Every protocol change needs three edits (shared types, remote-ui, web-client) and only one of them is testable through the app.

`apps/web-client/tsconfig.tsbuildinfo` is also committed — a build artifact.

### 3.3 Implemented features with no way to reach them **[verified]**

> **RESOLVED** — volume, mute and seek now have UI *and* the Player effects that apply them (both halves were missing). `MOVE_SONG_TO_TOP` exposed as "play next". `HelpDialog` is rendered. `SET_DISPLAY_NAME` and `MOVE_SONG_TO_BOTTOM` remain UI-less.
Several capabilities are complete in the shared protocol *and* the Rust `ClientCommand` enum, but no UI in any of the three clients ever emits them. Verified by grepping `apps/host/src/`, `remote-ui/index.html`, and `apps/web-client/` for each — zero handler references:

| Command | Status |
|---|---|
| `SET_VOLUME` | No slider or control anywhere. Only dead CSS remains (`remote-ui/index.html:319-343`). |
| `TOGGLE_MUTE` | No mute button anywhere. |
| `SEEK` | No scrub bar or seek affordance anywhere. |
| `REORDER_QUEUE` | Superseded in practice by `MOVE_SONG_UP`/`DOWN`, which do have UI. |
| `SET_DISPLAY_NAME` | Guests are never prompted for a name. |

For a karaoke app, **no volume control and no mute** is a conspicuous gap rather than a tidy-up item — it is the control users reach for most after play/pause, and the backend already supports it. The work remaining is UI only.

Separately, `HelpDialog.tsx` (159 lines) is **never imported or rendered anywhere** — confirmed by grep across `apps/host/src/`. It is a fully built component, unreachable, whose two buttons call the two commands that do not exist (1.1). Likewise `renderQueueTab` in `remote-ui/index.html:1545` is unreachable — no nav tab ever activates `'queue'`; the queue renders inline under "Playing". And `exportCollection` / `fetchSongMetadata` in `lib/commands.ts` are exported but called by nothing.

### 3.4 Guest visibility filtering happens on the client, not in Rust **[verified]**

> **RESOLVED** — Rust emits `room_state_public` with personal collections stripped; the frontend filter is gone.
`room_state.rs` provides `public_state()` / `clone_public_state()` — methods that exist precisely to strip personal collections before data leaves the host. **Neither is ever called.** Instead `usePeerHost.ts:28-32` filters personal playlists in JavaScript before broadcasting.

The filtering is currently correct, so this is not an active leak. But the trust boundary is enforced in the wrong layer: the Rust core hands full state including personal collections to the frontend, and a single mistake in that `.filter()` — or any future code path that broadcasts state without going through it — leaks private playlists to every guest. The safe version already exists and is dead.

### 3.5 Full-state broadcast on every mutation
`STATE_PATCH` is defined in `packages/shared/src/p2p-protocol.ts` but never emitted. Every command — including a single "move song up" — causes the complete `RoomState` (entire queue plus all public playlist collections, each song carrying title/artist/thumbnail/duration) to be cloned in Rust, serialized, and sent to every connected peer. See `commands.rs:308-310` and `usePeerHost.ts:38`.

With a 200-song library and 8 guests this is a large payload per keystroke-level action, over WebRTC, on phones. See OPTIMIZATION.md for sizing.

### 3.6 No P2P reconnection or liveness detection

> **PARTLY RESOLVED** — the host now answers `PING` with `PONG`, drops peers on `error`, and sweeps channels reporting `!conn.open`. Guest-side automatic reconnection is still absent.
- `apps/web-client/lib/usePeerClient.ts:99-101` handles `conn.on('close')` by logging. No retry.
- No heartbeat between host and guests. A `PING`/`PONG` pair exists in the shared protocol but nothing sends `PING` on an interval.
- On `HOST_DISCONNECTED` the web client alerts and redirects (`usePeerClient.ts:66-68`).

A guest whose phone sleeps or briefly drops Wi-Fi — the normal case at a party — silently stops receiving updates and must manually reload. Commands sent on a dead channel fail without user-visible feedback.

### 3.7 Deferred state updates can strand the UI **[verified]**
`apps/host/src/hooks/useRoomState.ts:51-65` and `apps/web-client/lib/useRoomState.ts` suppress incoming `STATE_UPDATE`s while a text input is focused, buffering into `_pendingState` and flushing on blur. The intent (don't yank the queue out from under someone typing) is sound, but:
- it relies on module-level mutable globals (`_isInputFocused`, `_flushCallback`, `_pendingState`) rather than React state;
- if focus is never lost — a guest leaves the search box focused and puts the phone down — the UI stays stale indefinitely;
- only the latest pending state is retained, which is correct for full-state sync but silently couples this design to 3.3.

### 3.8 No virtualization on unbounded lists
Playlist collections render every song: `ControlPanel.tsx:794` and `Library.tsx:504` map `activeCollection.songs` directly, each row containing a thumbnail `<img>` and two focusable buttons. Queue (`Queue.tsx:107`) is likewise unvirtualized. Search results are capped at 10 and are fine.

Collections have no size limit. On an Android TV box — the explicitly supported target — a few hundred songs means a few hundred thumbnail image elements plus spatial-navigation focusable registrations. This is the single largest rendering cost in the app.

### 3.9 `unwrap()` on dialog-returned paths

> **RESOLVED** — both dialog paths handle `FilePath::Url` and return an error instead of panicking. Tested, including the Android content-URI variant.
`commands.rs:502` and `commands.rs:531` call `.as_path().unwrap()` on the `FilePath` returned by the file dialog. On Android, `tauri-plugin-dialog` returns content URIs rather than filesystem paths, which is exactly the case where `as_path()` yields `None` — panicking in the Rust core rather than returning an error to the UI. Collection import/export is therefore the most likely crash on Android. Untested on-device; flagged as inference from the API contract, not observed.

### 3.10 Server-start race

> **RESOLVED** — binding is now synchronous and returns the real port; the 500 ms sleep and both panicking `expect()` calls are gone.
`commands.rs:544-566` (`start_host_server`) spawns an OS thread with its own tokio runtime, then `sleep`s 500 ms and returns, with no signal that the listener is actually bound. `.expect()` is called twice on runtime creation, so failure panics that thread rather than surfacing an error. On a slow or cold Android device 500 ms is a guess; `get_server_port` / `get_qr_url` can be called against a server that has not bound yet.

### 3.11 Multi-room support is half-present
`get_first_active_room()` and the empty-`roomId` path assume exactly one active room. The `RoomManager` is a `HashMap` keyed by room id, and the Node server enforces `MAX_CLIENTS_PER_ROOM`, both implying multi-room. In practice one host process serves one room, and the "standalone" path hardcodes that assumption. The unused-multi-room scaffolding (`add_client` / `remove_client` in `room_state.rs:649-660`, marked `#[allow(dead_code)]`) should either be finished or removed.

### 3.12 Concurrent-edit semantics are last-write-wins with confusing failures
No versioning or conflict resolution. Two guests acting on the same collection serialize through the Rust write lock, so state stays consistent, but the loser gets a bare error string. Deleting a collection another guest is mid-rename produces "not found" with no explanation. Acceptable for a party app; worth knowing before anyone builds on it.

---

## S4 — Rough edges

### 4.1 remote-ui depends on four CDNs — compounding the offline problem **[verified]**

> **RESOLVED** — socket.io, PeerJS, qrcodejs and lucide are vendored at pinned versions and served from the binary; the font stack degrades to system fonts. Read with 2.5: both were needed for offline operation.
> Read together with **2.5**, which is the deeper cause: even with these assets vendored, the app still could not connect guests offline, because the WebRTC handshake itself goes through `peerjs.com`. Fixing 4.1 alone does not deliver offline operation; fixing 2.5 and 4.1 together does.

`remote-ui/index.html` loads, on every page load:
- `https://cdn.socket.io/4.7.2/socket.io.min.js` (:1153)
- `https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js` (:1154)
- `https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js` (:1155)
- `https://unpkg.com/lucide@latest/dist/umd/lucide.js` (:9)
- Google Fonts (:8)

`README.md:27` claims "no internet required once songs are loaded". That is false for the guest client: socket.io and PeerJS are the transport, and without internet the guest UI cannot connect at all. `unpkg.com/lucide@latest` is additionally unpinned — an upstream major release changes the shipped app with no commit here.

Vendoring these into the binary via `include_str!`/`include_bytes!` (the same mechanism already used to embed the HTML) would make the LAN-only claim true.

### 4.2 STUN-only ICE, no TURN
`usePeerHost.ts:54-57`, `apps/web-client/lib/usePeerClient.ts:37-40`, and `remote-ui/index.html:2232-2233` all configure only `stun:stun.l.google.com:19302` and `stun1`. No TURN fallback. On the same LAN this is usually fine; on networks with client isolation (common on guest Wi-Fi and in venues) P2P fails with no fallback path and no diagnostic. Also note this is another external dependency contradicting 4.1.

### 4.3 `postMessage` to the guest iframe uses `'*'` as target origin
`App.tsx` posts bridge replies with `'*'` (e.g. :204, :216). The inbound direction is checked correctly (`event.source !== guestIframeRef.current.contentWindow` at :195). Since the iframe is same-origin app content the practical risk is low, but replies carry the user's personal playlist data, and `'*'` is the wrong default for that.

### 4.4 No wake lock — the screen will sleep mid-party

> **RESOLVED** — `useWakeLock` holds a screen lock while playing and re-acquires on `visibilitychange`.
`WAKE_LOCK` is declared in the manifest (2.6) but never acquired, and there is no `navigator.wakeLock` call anywhere. On Android/Android TV the display sleeps during playback on its default timeout. For a karaoke app running unattended this is a real usability failure, not a nicety.

### 4.5 Touch/pointer handling gaps
- Dropdown dismissal uses `mousedown` listeners (`ControlPanel.tsx:130-145`). `pointerdown` would cover touch reliably.
- Mobile is detected as `window.innerWidth <= 768 || 'ontouchstart' in window` (`App.tsx:57`) on an undebounced `resize` listener.
- No swipe gestures for the mobile tab bar; tabs are tap-only.
- The host UI is designed for a TV/desktop layout; the D-pad spatial navigation and the touch path coexist without either being clearly primary.

### 4.6 List keys use array indices

> **RESOLVED** — search results keyed by url; thumbnails also gained `loading="lazy"`.
`searchResults.map((result, i) => <div key={i}>` and equivalents at `ControlPanel.tsx:501`, `Library.tsx:267`, and elsewhere. Queue and playlist rows reorder by design (move up/down), so index keys cause React to mismatch rows against DOM state — visible as thumbnail flicker and lost focus during reordering, which matters more than usual here because focus is D-pad navigation state.

### 4.7 Documentation contradicts the code

> **RESOLVED** — `QUICK_START.md` and `DEPLOYMENT.md` rewritten, README tree corrected, versions aligned, yt-dlp license files removed.
- `QUICK_START.md:15-19` and `apps/host/README.md:48-56` instruct the user to download `yt-dlp` binaries. `CHANGELOG.md:29` records that yt-dlp was migrated to native Rust (`rusty_ytdl`, `Cargo.toml:37`) and no external binary is used. The `licenses/yt-dlp-LICENSE.txt` and `licenses/yt-dlp-THIRD_PARTY_LICENSES.txt` files (4473 lines) are likewise leftovers.
- `QUICK_START.md:7`, `DEPLOYMENT.md:71`, `RUN_INSTRUCTIONS.md:12` hardcode `C:\Users\Noju\Projects\KaraokeNatin`.
- `QUICK_START.md:8` says `npm install`; the repo is pnpm-only (workspace protocol deps, `pnpm-lock.yaml`).
- Root `package.json` is `0.2.0-beta`; `apps/host/package.json` and `CHANGELOG.md` say `0.2.0`.

### 4.8 Committed artifacts and hygiene
| Path | Note |
|---|---|
| `KaraokeNatin-arm64-release.apk.idsig` | 262 KB, root. `.gitignore:42` lists `KaraokeNatin-*.idsig` but the file was committed **before** the rule, so it stays tracked. |
| `apps/host/src-tauri/error_log.txt`, `error_log_2.txt` | 179 + 251 lines of `cargo check` output from a Tauri v1 → v2 migration (`tauri::api::process` no longer exists). Historical, not current. |
| `apps/host/src-tauri/gen/android/**` | 44 tracked files including `gradle-wrapper.jar` and **built Vite output** (`app/src/main/assets/assets/index-DXbmAp6d.js`, `index-DXLR6tfF.css`). Not in `.gitignore` at all. |
| `apps/web-client/tsconfig.tsbuildinfo` | Build artifact. |

The committed Vite bundle under `gen/android/` is the actively harmful one: it is a stale copy of the frontend that an Android build may pick up instead of a fresh build, producing an APK that silently does not match `src/`.

### 4.9 No tests, no CI, no linter **[verified]**

> **RESOLVED** — 36 Rust tests and 36 frontend tests; CI restored at `.github/workflows/ci.yml`.
No test files of any kind (`grep` for `test|spec|__tests__|vitest|jest` across tracked files returns nothing). No ESLint, Prettier, clippy, or rustfmt config. `.github/` does not exist — and git history shows `.github/workflows/build-release.yml` was touched 8 times and then **deleted** in commit `f0659ad`. A release workflow existed and was removed; combined with 2.3 (Windows-only local build), there is currently no reproducible path to a release artifact on any platform.

### 4.10 Rust hygiene

> **MOSTLY RESOLVED** — migration copy error now logged, dead `get_public` removed. The `SCREAMING_CASE` enum is deliberate (it mirrors the wire protocol) and CORS remains permissive by necessity.
- CORS is `CorsLayer::new().allow_origin(Any)` (`web_server.rs:73-78`) on a server bound to `0.0.0.0`.
- `ClientCommand` enum variants are `SCREAMING_CASE` (`SET_VOLUME`, `ADD_SONG`), which is why the error logs are full of naming warnings. Serde rename attributes would let the Rust side be idiomatic.
- Migration copy errors are swallowed: `if let Ok(_) = fs::copy(...)` at `room_state.rs:121`.
- Socket emit results are discarded throughout `signaling.rs` (`let _ = socket.emit(...)`).
- `signaling.rs:253` sets `peer_id: socket.id.to_string()` with the comment "Using socket ID as temp peer ID" — the guest's real PeerJS id is never propagated to the host in `CLIENT_JOINED`.

---

## Cross-platform summary

| Concern | Windows | Linux | Android |
|---|---|---|---|
| Bundle target configured | ✅ nsis/msi | ❌ none (2.3) | ✅ via gradle |
| Build script provided | ✅ `.bat` | ❌ none (2.3) | ⚠️ `.bat` only |
| Top-level `build` script | ✅ | ❌ requires win `.exe` (2.3) | ❌ same |
| File dialog import/export | ✅ | ✅ | ⚠️ likely panic (3.9) |
| Screen stays awake | n/a | n/a | ❌ no wake lock (4.4) |
| Offline LAN operation | ❌ peerjs.com broker (2.5) + CDN (4.1) | ❌ same | ❌ same |
| Cleartext/CA config | n/a | n/a | ⚠️ over-broad (2.4) |
| Permissions | n/a | n/a | ⚠️ over-requested (2.6) |
| Large-list performance | ok | ok | ❌ worst case (3.8) |

**Untested on-device, flagged as unverified inference:** 3.7 (Android content URIs), 4.4 (sleep behaviour), and whether `local-ip-address` returns the correct interface on Android when both Wi-Fi and mobile data are up (`network.rs`). None of these were run on hardware in this pass.

---

## Open questions

1. Is `apps/signaling-server` meant to come back for an internet-hosted mode, or should it be deleted? Same question for `apps/web-client`. The answer changes whether 3.1/3.2 are "delete" or "wire up".
2. Was the removal of `.github/workflows/build-release.yml` deliberate?
3. Is Android TV (D-pad) or Android phone (touch) the primary mobile target? The UI currently hedges (4.5).
4. Is the join token intended to be real security, or is open-LAN-join the desired UX? Both are defensible; the current state is neither.
