# OPTIMIZATION

Improvement candidates ranked by impact. Nothing here has been applied — this is analysis only.

Impact is judged against what this app actually is: a LAN karaoke host running on Windows desktop or an Android TV box, driving a YouTube player, with a handful of phones connected as remotes. That framing matters — it makes some conventional advice (bundle size, SSR, CDN caching) irrelevant, and makes some unglamorous things (payload size on WebRTC, DOM node count on a TV box's weak GPU) decisive.

Ordering is by **impact × confidence ÷ effort**, not by severity of the underlying flaw.

---

## Tier 0 — Architectural, outranks everything below

### 0. Self-host the PeerJS broker
**Where:** `apps/host/src/hooks/usePeerHost.ts:52-59`, `apps/host/src-tauri/remote-ui/index.html:2229-2237`, `apps/web-client/lib/usePeerClient.ts:35-42`

All three clients call `new Peer({ config: { iceServers } })` with **no `host`/`port`/`path`**, so PeerJS falls back to its public cloud broker at `0.peerjs.com`. The WebRTC offer/answer for every session is relayed through a third-party internet service — the local socket.io signaling only exchanges peer ids, not SDP.

**Why this is Tier 0 rather than a Tier 1 perf item:** it is not an optimization of a working system, it is the difference between the product's premise being true or false. A LAN karaoke app that cannot connect a guest without internet is not a LAN app. Every other item on this list optimizes a path that currently depends on an unmonitored external service being reachable.

It is also the largest *latency* item on the guest path — the handshake makes an internet round trip to a shared public broker before two devices on the same Wi-Fi can talk — and the largest availability risk, since `peerjs.com` going down breaks every install at once with no fallback.

**Approach:** run `peerjs-server` (or an equivalent) alongside the existing axum server and pass `{ host: <local-ip>, port: <port>, path: '/peerjs' }` at all three call sites. The infrastructure to serve it is already there — the Rust server is already binding `0.0.0.0` and serving the guest UI. Doing this also removes the dependency behind #3 and reduces the exposure noted in #2's TURN discussion.

**Effort:** moderate — a Rust-side broker or an embedded implementation, plus a one-line config change per client. **Impact:** turns a documented-but-false capability into a real one.

**Caveat:** this should be confirmed empirically first by running the app with the host offline. The code reading is unambiguous, but a five-minute test settles it before anyone commits to the work.

---

## Tier 1 — Do these first

### 1. Replace full-state broadcast with patches
**Where:** `apps/host/src-tauri/src/commands.rs:308-310`, `apps/host/src/hooks/usePeerHost.ts:38`, `packages/shared/src/p2p-protocol.ts`

Every mutation clones and serializes the entire `RoomState` — full queue plus all public collections — and sends it to every peer. `STATE_PATCH` is already defined in the shared protocol and never used.

**Sizing the problem.** A `Song` carries id, title, artist, thumbnail URL, duration, addedBy, youtubeId. Realistically ~200 bytes of JSON. A 150-song library plus a 20-song queue is therefore ~34 KB per broadcast. With 8 guests that is ~270 KB pushed over WebRTC data channels for a single "move song up" — and reordering is exactly the operation users repeat rapidly. On phones this is the difference between a responsive remote and a laggy one.

**Why it is first:** the message type already exists, the transport already exists, and the win compounds with every other guest added. It also decouples ISSUES 3.7 (the focus-deferral hack in `useRoomState.ts`) from correctness — patches make "hold updates while typing" much cheaper to reason about.

**Approach:** emit `STATE_PATCH` for the common single-field mutations (player status, time, queue reorder) and reserve full `STATE_UPDATE` for join and for collection-level changes. Keep a sequence number so a client that misses a patch can request a resync — without that, patches trade a bandwidth problem for a consistency problem.

**Risk:** this is the change most likely to introduce subtle desync bugs, and there are no tests (see Tier 3 #9). Sequence numbers and a resync path are not optional here.

### 2. Virtualize the playlist and queue lists
**Where:** `apps/host/src/components/ControlPanel.tsx:794`, `Library.tsx:504`, `Queue.tsx:107`

Collections are unbounded and render one row per song, each with a thumbnail `<img>` and two buttons registered with the spatial-navigation library. 300 songs ≈ 300 network image requests and ~1200 DOM nodes, plus 600 focusable registrations that `@noriginmedia/norigin-spatial-navigation` must consider on every D-pad move.

**Why it matters here specifically:** the supported target includes Android TV boxes, which have weak GPUs and little memory. This is the single largest rendering cost in the app, and it degrades exactly the interaction (D-pad navigation through a big library) that the TV form factor depends on.

**Approach:** `react-window` on the three list sites. The complication is spatial navigation — virtualized rows unmount as they scroll out, so focus registration has to be reconciled with the windowing. Budget for that; it is the reason this is #2 rather than #1 despite being a bigger raw win.

**Cheaper partial win, if #2 is deferred:** add `loading="lazy"` and explicit `width`/`height` to the thumbnail `<img>` tags. That alone removes the request storm and the layout thrash, for one line per site, without touching focus handling.

### 3. Vendor the remote-ui CDN dependencies
**Where:** `apps/host/src-tauri/remote-ui/index.html:8-9, 1153-1155`

Four CDN script tags plus Google Fonts, loaded on every guest page load. This is filed as a correctness bug in ISSUES.md (4.1) because it breaks the documented offline claim, but it is also the largest *latency* item on the guest path: every phone that scans the QR code makes five external round trips before it can connect — over the venue's internet, which at a party is usually the worst link in the chain.

Vendoring socket.io, PeerJS, qrcodejs, and the icon set into the binary (via `include_str!`, the same mechanism already embedding the HTML) makes guest connect time purely local and removes the `unpkg.com/lucide@latest` unpinned-dependency hazard at the same time.

**Effort:** low. **Impact:** high and immediate on the user-visible "scan QR → usable remote" time.

---

## Tier 2 — Meaningful, moderate effort

### 4. Collapse the three guest-client implementations into one
**Where:** `apps/host/src-tauri/remote-ui/index.html` (2378 lines), `apps/web-client/**`, `packages/shared/src/p2p-protocol.ts`

This is a structural optimization, not a runtime one, but it has the highest long-term leverage in the repo. The same protocol is implemented three times: typed in `packages/shared`, again in vanilla JS in `remote-ui`, and again in React in the orphaned `web-client`. The `SEARCH` drift (ISSUES 1.4) is the predictable result — a message that exists in two implementations and in neither type definition.

Given `remote-ui` is the only client guests actually reach, the pragmatic move is to make it the sole client and delete `web-client`, rather than the reverse. But `remote-ui` being a single 2378-line HTML file with inlined everything is itself the reason it drifted — it cannot import the shared types.

**Suggested direction:** build `remote-ui` as a real (tiny) Vite bundle that imports `@karaokenatin/shared`, emitted to a single self-contained HTML file, still embedded via `include_str!`. That keeps the "one file, no server" deployment property while restoring type checking across the protocol boundary. It also fixes #3 as a side effect, since bundling vendors the deps.

**Why Tier 2:** high value, but it is a real refactor and it should come after the protocol itself stabilizes (#1).

### 5. Memoize the ControlPanel render path
**Where:** `apps/host/src/components/ControlPanel.tsx` (829 lines, 17 `useState` hooks)

Search results live in `App.tsx` state and are drilled into `ControlPanel`, so any host-side state change re-renders the whole panel — including the unvirtualized collection list from #2. Handlers are redefined inline every render, so every child prop is a fresh reference and `React.memo` on children would currently do nothing.

**Approach:** `useCallback` on the handlers, `React.memo` on row components, and consolidate the six parallel `Set` states (`addingToQueue`, `addedToQueue`, `addingToPlaylist`, `addedToPlaylist`, `addingToLibrary`, `addedToLibrary`) into one reducer. The `Set` sextet is the clearest signal that this component has outgrown `useState`.

**Note:** the payoff here is largely gated on #2. Memoizing a component whose main cost is rendering 300 unvirtualized rows moves little. Do #2 first, then this.

### 6. Fix list keys before optimizing reconciliation
**Where:** `ControlPanel.tsx:501`, `Library.tsx:267`, and the other `.map((x, i) => ... key={i})` sites

Index keys on lists that reorder by design (move up/down) defeat React reconciliation and cause DOM reuse across logically different rows. Symptoms: thumbnail flicker on reorder, and — worse on a TV — lost D-pad focus, because focus is attached to a DOM node that now represents a different song.

Songs have stable `id` fields. This is a one-line-per-site change and it is a prerequisite for #2 and #5 doing what they claim.

### 7. Cache and debounce the YouTube search path
**Where:** `apps/host/src-tauri/src/youtube.rs:37-39` (`SEARCH_CACHE`), `ControlPanel.tsx:86`, `Library.tsx:86`

A `SEARCH_CACHE` already exists behind a `RwLock<HashMap>` but has **no eviction policy** — it grows for the process lifetime. On a long-running TV host that is an unbounded memory leak, small per entry but never reclaimed. An LRU with a size cap fixes it.

On the frontend, search fires on submit rather than per keystroke, so there is no debounce emergency — but guest searches arrive over the out-of-band `SEARCH` path (`usePeerHost.ts:122-138`) with no rate limiting at all, so several guests typing simultaneously can each trigger uncached `rusty_ytdl` network calls on the host. Worth a per-connection throttle.

### 8. Replace the server-start sleep with a real signal
**Where:** `apps/host/src-tauri/src/commands.rs:544-566`

`start_host_server` spawns a thread, sleeps 500 ms, and returns. On a fast desktop this wastes half a second of startup on every host-mode entry; on a slow Android device it may return *before* the listener binds, and `get_qr_url` then races it.

Binding the listener on the calling thread and handing the bound port back through a channel is both faster and correct. Low effort, removes a fixed 500 ms from a user-visible path, and eliminates a race.

---

## Tier 3 — Worth doing, lower or deferred payoff

### 9. Add a test harness — specifically around the protocol
There are no tests anywhere. That is a general problem, but the targeted version is: the protocol is the part of this system that is implemented three times, drifts (ISSUES 1.4), and is about to be changed by #1. Round-trip tests over `ClientCommand` / `HostBroadcast` between the TS types and the Rust enum would have caught `SEARCH` and will catch the next one.

This is Tier 3 by ordering only — if #1 is attempted, this becomes a prerequisite, not a follow-up.

### 10. Stop committing build artifacts
`gen/android/**` (44 files including `gradle-wrapper.jar` and a stale Vite bundle), `KaraokeNatin-arm64-release.apk.idsig` (262 KB), two `error_log*.txt`, `tsconfig.tsbuildinfo`. Repo size is not the real cost — the stale committed bundle at `gen/android/app/src/main/assets/assets/index-DXbmAp6d.js` is, because an Android build can pick it up instead of a fresh one and silently ship a frontend that does not match `src/`.

### 11. Make the build reproducible cross-platform
Covered as a defect in ISSUES 2.3. As an optimization: adding `deb`/`appimage` to `tauri.conf.json` bundle targets and providing `.sh` equivalents of the three `.bat` scripts is the difference between "one developer's Windows machine can cut a release" and "CI can". Restoring the deleted `.github/workflows/build-release.yml` is the natural companion.

### 12. Build `packages/shared` in the setup script
One-line fix (`pnpm build` in `setup:packages`), removes the clean-clone build failure (ISSUES 1.2). Listed here rather than Tier 1 only because it costs nothing and blocks nothing else — but it should arguably be done before anything else on this list, since none of the other work can be verified on a fresh checkout without it.

### 13. Reduce lock churn in `process_command`
`commands.rs:154-314` acquires the `RoomStateManager` write lock repeatedly within a single command, and `clone_state()` takes a read lock again to emit. No deadlock risk (`parking_lot`, no nesting, no lock held across `.await`), and contention is low at this scale — one host, a few guests. Consolidating to a single write section per command is tidier and pairs naturally with #1, but on its own the measurable win is near zero. Listed for completeness; do not prioritize it on performance grounds.

---

## Explicitly not worth doing

- **Bundle-size optimization of the host frontend.** It is loaded from local disk inside a WebView. Shaving kilobytes changes nothing.
- **SSR / static optimization of `apps/web-client`.** It is orphaned (ISSUES 3.2). Optimizing it is work on code no user reaches.
- **Replacing PeerJS with raw WebRTC.** Plausible bandwidth and dependency win, but PeerJS is load-bearing across all three clients and the signaling handshake is built around its peer-id model. The cost/benefit is bad until #4 consolidates the clients.
- **Micro-optimizing the Rust YouTube path.** `rusty_ytdl` calls are network-bound; local CPU work there is noise.

---

## Suggested sequence

The dependency order matters more than the ranking:

1. **#12** (build `shared`) — otherwise nothing below is verifiable on a clean checkout.
2. **#9** (protocol tests) and **#6** (list keys) — cheap, and both are prerequisites for the changes that follow.
3. **#3** (vendor CDN deps) — independent, high visible win, low risk.
4. **#2** (virtualize) then **#5** (memoize) — in that order; reversing them wastes the effort.
5. **#1** (state patches) — the biggest win, but do it with #9 in place.
6. **#4** (consolidate clients) — after the protocol has settled.

#7, #8, #10, #11 are independent and can be picked up at any point.
