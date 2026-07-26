# REPOMAPPING — agent orientation

**Read this before touching the codebase.** It is the operating guide: how things actually work, what will mislead you, and what to check before you edit.

Related docs and when to use them:
- **REPOMAPPING.md** (this file) — how to work in this repo. Rules, traps, verification steps.
- **REPO_MAP.md** — descriptive structure. Module-by-module, runtime flows, file:line detail.
- **FEATURES.md** — what exists, GUI layer vs logic layer.
- **ISSUES.md** / **OPTIMIZATION.md** — known defects and improvement candidates.
- **task.md** — the actionable backlog.
- **REPO_NOTES.md** — audit reasoning, assumptions, open questions.

---

## The one rule that matters most

**A third of the committed code is unreachable in the shipped product.** Not commented out, not flagged — fully written, plausible, wired into `package.json`, and dead.

If you read this repo top-down and assume what exists is what runs, your mental model will be wrong. Trace outward from `usePeerHost.ts` and `lib.rs`, never inward from the directory tree.

| Looks live | Actually |
|---|---|
| `apps/signaling-server/` (Node + socket.io) | **DEAD.** Signaling is Rust — `src-tauri/signaling.rs`. |
| `apps/web-client/` (Next.js guest client) | **ORPHANED.** Guests get `remote-ui/index.html`. |
| `create_room`'s room id + join token (Rust) | **DISCARDED.** `useRoomState.ts:40` ignores the return; `usePeerHost.ts:65-67` generates the real pair in JS. |
| `roomManager.ts` policy (12h TTL, 10-client cap) | **DEAD.** Reads as live policy, governs nothing. |
| `HelpDialog.tsx` (159 lines) | **NEVER RENDERED.** No import anywhere. |
| `public_state()` / `clone_public_state()` in `room_state.rs` | **NEVER CALLED.** Filtering happens in JS instead. |
| `build:signaling-exe` → `src-tauri/binaries/*.exe` | **ORPHANED.** No `externalBin` in `tauri.conf.json`; the directory does not exist. |

**Why:** `src-tauri/src/sidecar.rs` was deleted in commit `1f6e0f0`, the same commit that added Android. Android cannot spawn sidecar processes, so the Node signaling server and yt-dlp were both reimplemented natively in Rust. The old versions were left in the tree. Nearly every "why is this here?" traces back to that migration.

**Before extending anything, confirm it is on a live path.** `git log --diff-filter=D` explains more about this project's shape than any doc in it.

---

## Architecture in one pass

One Tauri process is the whole product. It plays video, serves the guest UI, and brokers state.

```
Guest phone ──HTTP──▶ Rust axum server (0.0.0.0, random port 49152-65535)
                       └─ GET /  →  remote-ui/index.html  (include_str!, compiled in)
                       └─ socket.io (socketioxide) → signaling.rs   [peer IDs only]
                                    │
Guest phone ══WebRTC DataChannel════╪══▶ usePeerHost.ts (host React)
   (SDP brokered by PUBLIC 0.peerjs.com — see trap #1)
                                    │
                              invoke('process_command')
                                    │
                            commands.rs → room_state.rs  [RwLock<RoomState>]
                                    │
                          emit('room_state_updated')
                             ╱              ╲
                  useRoomState.ts      usePeerHost.ts
                   (host UI)          (broadcast full STATE_UPDATE to all guests)
```

**Entry points:** Rust `main.rs` → `lib.rs::run()`. Frontend `main.tsx` → `App.tsx` (mode router: `select | host | guest | library`). The web server starts lazily via `start_host_server`, not at boot.

**State model:** single source of truth is `RoomState` in Rust behind a `parking_lot::RwLock`. Every mutation broadcasts the *complete* state to every peer. `STATE_PATCH` exists in the protocol and is never used.

---

## Traps

Ordered by how much damage they cause.

### 1. PeerJS is not local
`new Peer({ config: { iceServers } })` with no `host`/`port`/`path` defaults to the **public `0.peerjs.com` cloud broker**. The WebRTC handshake for every session leaves the LAN. The local socket.io signaling only exchanges peer IDs — never SDP.

So: **the app cannot connect a guest without internet**, despite being a LAN app. Three review passes read that config and missed it because they checked what the object contained, not what it omitted. When reviewing any library config here, ask what the defaults do.

Sites: `usePeerHost.ts:52`, `remote-ui/index.html:2229`, `usePeerClient.ts:35`.

### 2. The Tauri FFI boundary is unchecked
`invoke('name', {args})` is type-checked by **neither** `tsc` nor `cargo`. Two failure modes, both live in the code right now:
- **Missing command** — `fetch_song_metadata`, `open_log_folder`, `report_issue` are invoked but never registered in `generate_handler!` (`lib.rs:73-95`).
- **Wrong argument name** — `App.tsx:254` passes `{ json }`; `commands.rs:470` expects `data`. Fails silently before the body runs.

**Rule: when you add or edit an `invoke` call, open the Rust signature and check the name, the argument names, and the types. Every time.** Nothing else will catch you.

### 3. `packages/shared` must be built before anything compiles
`main`/`types` point at `dist/`, which is gitignored and **not built by `setup:packages`**. There is no Vite alias and no Next `transpilePackages`. A clean clone fails at `tsc`.

If you hit a mysterious "cannot find module `@karaokenatin/shared`": `cd packages/shared && pnpm build`.

### 4. Three implementations of one protocol, one type-checked
| Implementation | Typed? |
|---|---|
| `packages/shared/src/*.ts` | yes — the nominal source of truth |
| `remote-ui/index.html` | **no** — vanilla JS, string literals |
| `apps/web-client/` | yes, but orphaned |
| Rust `ClientCommand` enum | yes, but a hand-maintained mirror across serde |

A protocol change needs edits in up to four places and only some will fail to compile. This already drifted: `SEARCH`/`SEARCH_RESULTS` are handled out-of-band at `usePeerHost.ts:122-138` and exist in **neither** the shared union nor the Rust enum.

**Rule: changing the protocol means touching `packages/shared`, `remote-ui/index.html`, and `commands.rs` together.** Grep for the message name across all of them before you finish.

### 5. Build tooling is Windows-only
`tauri.conf.json` bundles `nsis`/`msi` only — no Linux target. All three build scripts are `.bat`. Root `build` requires a Windows `.exe` sidecar for a sidecar that no longer exists.

On Linux or macOS the top-level build will not work. Build `apps/host` directly and expect gaps.

### 6. `gen/android/` holds a stale committed frontend bundle
`gen/android/app/src/main/assets/assets/index-DXbmAp6d.js` is checked-in Vite output. An Android build may pick it up instead of a fresh build, producing an APK whose frontend does not match `src/`. If Android behaviour disagrees with the source, suspect this first.

### 7. The docs describe an architecture that no longer exists
READMEs, `QUICK_START.md`, `DEPLOYMENT.md`, and `RUN_INSTRUCTIONS.md` still tell you to download yt-dlp binaries (migrated to `rusty_ytdl`), reference `C:\Users\Noju\...`, and say `npm install` in a pnpm-only repo. `README.md:27` claims offline operation, which trap #1 contradicts.

**Treat every doc claim as a hypothesis to verify against code.** The audit docs listed at the top are current; the rest are not.

---

## Where things live

| I need to change… | Go to |
|---|---|
| A guest-visible control | `remote-ui/index.html` (2378 lines, single file, no build step) |
| A host-window control | `apps/host/src/components/ControlPanel.tsx` (829 lines) |
| Video playback | `apps/host/src/components/Player.tsx` (YouTube IFrame API lives here, host-only) |
| Queue / playlist logic | `src-tauri/src/room_state.rs` — the real state, not the React copies |
| A new backend operation | `src-tauri/src/commands.rs` **+ register in `lib.rs:73-95`** |
| Protocol messages | `packages/shared/src/p2p-protocol.ts` + `commands.rs` enum + `remote-ui` (trap #4) |
| Room join / socket handling | `src-tauri/src/signaling.rs` (**not** `apps/signaling-server/`) |
| HTTP routes, port binding | `src-tauri/src/web_server.rs` |
| YouTube search / metadata | `src-tauri/src/youtube.rs`, `metadata.rs` (pure Rust, no subprocess) |
| Android manifest / gradle | `src-tauri/gen/android/` (committed, see trap #6) |

**Two GUI surfaces, one backend.** A user-facing feature usually needs work in *both* `ControlPanel.tsx` (host) and `remote-ui/index.html` (guest). Check whether a feature should exist in one or both before implementing.

**`remote-ui` runs in two modes** selected by `?mode=inapp` (`index.html:1177`): standalone in a phone browser over P2P, or inside an iframe in the host app's Guest Mode bridging to Rust via `window.parent.postMessage`. **An edit there affects both paths.**

---

## Conventions

- **Package manager: pnpm only.** Workspace-protocol deps; `npm install` will not work regardless of what `QUICK_START.md` says.
- **No test suite, no linter, no CI.** Nothing catches regressions. Manual verification is the only gate — say plainly what you did and did not verify.
- **`strict` TypeScript everywhere**, and `apps/host` also sets `noUnusedLocals`/`noUnusedParameters` — an unused variable fails the build.
- **Rust:** `parking_lot` locks (not `std::sync`), `thiserror`-free — commands return `Result<T, String>`. Enum variants are `SCREAMING_CASE` to match the wire protocol, which is why clippy would be noisy.
- **Don't add dependencies casually.** `@tauri-apps/plugin-shell` is declared in `package.json`, absent from `Cargo.toml` and capabilities, and imported nowhere — a dead dep that looks available.

---

## Before you finish

1. **Did you cross the FFI boundary?** Re-read the Rust signature. (trap #2)
2. **Did you touch the protocol?** All three implementations updated? (trap #4)
3. **Did you add a `#[tauri::command]`?** Registered in `lib.rs:73-95`?
4. **Does this feature need a guest-side counterpart** in `remote-ui/index.html`?
5. **Did you edit `remote-ui`?** Both `mode=inapp` and standalone still work?
6. **Are you extending something dead?** Check the table at the top.
7. **State the verification you actually ran.** There are no tests to hide behind.

---

## Things that look wrong but are not

Do not "fix" these:

- **`std::thread::spawn` + a fresh tokio runtime** in `start_host_server` (`commands.rs:551`) — deliberate, keeps axum off Tauri's executor. The real bug there is the 500 ms sleep used as a readiness signal.
- **Rust redefining `ClientCommand`/`RoomState`** — that is the serde boundary, unavoidable across FFI. The real drift is in `remote-ui` (trap #4).
- **Module-level mutable globals in `useRoomState.ts`** (`_isInputFocused`, `_flushCallback`, `_pendingState`) — they solve a real problem: don't re-render the queue out from under someone typing. The design has a failure mode, but it is not an accident.
- **`0.0.0.0` binding** (`web_server.rs:83`) — required. Guests on the LAN must reach it.
