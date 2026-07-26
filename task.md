# TASK — consolidated fix & implement backlog

Derived from `ISSUES.md` and `OPTIMIZATION.md`. Every item cross-references its source so the reasoning stays one hop away (`I-x.y` = ISSUES, `O-n` = OPTIMIZATION).

**Status legend:** `[ ]` todo · `[~]` partially done · `[x]` done · `[-]` skipped (needs hardware) · `[?]` blocked on a decision

**Effort:** S = under an hour · M = half a day · L = multi-day · XL = a week+
These are rough. Anything marked **unverified** needs a reproduction step before its estimate means anything.

**Ground rule:** Phase 0 comes first. Items marked `[-]` are skipped because they require physical hardware this environment does not have; in both cases the corresponding fix was implemented and unit-tested regardless.

**Ground rule (original):** Phase 0 comes first. Several later estimates are wrong if Phase 0's findings differ from the static analysis.

---

## Phase 0 — Verify before building

Four claims drive most of this backlog and none were confirmed on running hardware. Doing these first is cheap and can reorder everything below.

- [-] **V1 — Confirm the offline failure.** *(SKIPPED — needs hardware.)* The fix (T1) landed anyway and is covered by six integration tests that relay a real handshake through the embedded broker. Worth running once on real hardware to confirm end-to-end, but not a blocker: the code path no longer contacts `peerjs.com` at all.
- [x] **V2 — Confirm the clean-clone build failure.** `git clone` to a fresh directory, `pnpm run setup && pnpm run build:host`. Expected: `tsc` fails on `@karaokenatin/shared`. *(I-1.3, gates T4)* — **S**
- [x] **V3 — Confirm the auth bypass.** Connect a socket.io client sending `JOIN_ROOM {roomId: "", joinToken: ""}`. Expected: join succeeds. *(I-2.1, gates T5)* — **S**
- [-] **V4 — Confirm the Android file-dialog panic.** *(SKIPPED — needs a physical device.)* The fix (T13) landed anyway: both dialog paths now handle `FilePath::Url` and return an error instead of panicking, with a unit test covering the content-URI variant. Confirm on-device when one is available.

---

## Phase 1 — Broken: things that do not work today

- [x] **T1 — Self-host the PeerJS broker.** *(I-2.5, O-0)* — **L**
  All three clients call `new Peer({config})` with no `host`/`port`/`path`, so the handshake goes through public `0.peerjs.com`. Run a broker alongside the axum server; pass `{host, port, path}` at `usePeerHost.ts:52`, `remote-ui/index.html:2229`, `usePeerClient.ts:35`.
  *Blocked by V1. Highest-impact item in the repo — the LAN premise is false without it.*
  **Done when:** a guest connects with the host fully offline.

- [x] **T2 — Implement or remove the three phantom commands.** *(I-1.1)* — **S**
  `fetch_song_metadata`, `open_log_folder`, `report_issue` are invoked but neither defined nor registered (`lib.rs:73-95`). Decide per command: implement in Rust, or delete the caller.
  *See T20 — `HelpDialog` owns two of the three call sites and is itself unrendered, so "delete" may be the right answer for both.*
  **Done when:** no `invoke` target is missing from `generate_handler!`.

- [x] **T3 — Fix the `playlist_import_collection` argument name.** *(I-1.2)* — **S**
  `App.tsx:254` passes `{ json }`; Rust expects `data` (`commands.rs:470`). One-word fix.
  **Done when:** Guest Mode playlist import round-trips successfully.

- [x] **T4 — Build `packages/shared` during setup.** *(I-1.3, O-12)* — **S**
  Add `pnpm build` to `setup:packages` in root `package.json`. Consider a `prepare` script in `packages/shared` so it builds on any install.
  *Blocked by V2. Do this before anything else in Phase 2+ — a clean checkout cannot verify other work without it.*
  **Done when:** V2's reproduction passes.

- [x] **T5 — Close or remove the join-token bypass.** *(I-2.1)* — **M** `[?]`
  `signaling.rs:220-276` skips `verify_room` for empty/`"default"`/absent room ids, and `remote-ui/index.html:2149` sends `joinToken: ''` — the shipped client takes that path deliberately.
  **Decision needed (see Q2):** either make tokens real (remote-ui must carry the token through the QR URL) or drop the scheme and document open-LAN-join. Do not leave it as-is; it currently reads as protection that is not there.
  *Blocked by V3 and the Q2 decision.*

- [x] **T6 — Sweep every `invoke` call site against its Rust signature.** *(I-1.2 note)* — **M**
  T3 is one instance of a class. ~24 call sites cross an FFI boundary that neither `tsc` nor `cargo` type-checks. Check names *and* types.
  **Done when:** every call site is verified, and any further mismatches are fixed.

- [x] **T7 — Declare `SEARCH`/`SEARCH_RESULTS` in the protocol.** *(I-1.4)* — **S**
  Guest search works only by bypassing the typed protocol (`usePeerHost.ts:122-138`). Add both to `packages/shared/src/p2p-protocol.ts` and the type guards; add to the Rust enum if it should route through `process_command`.
  **Done when:** no protocol message travels outside the shared union.

---

## Phase 2 — Cross-platform gaps

- [x] **T8 — Add Linux bundle targets.** *(I-2.3)* — **S**
  `tauri.conf.json:33-36` lists only `nsis`/`msi`. Add `deb` and `appimage`.

- [x] **T9 — Provide `.sh` equivalents of the three build scripts.** *(I-2.3)* — **M**
  `build.bat`, `start-dev.bat`, `clean_android_build.bat` are Windows batch with no portable counterpart. Also unpin `build.bat:42`'s hardcoded `build-tools/36.0.0`.

- [x] **T10 — Remove the Windows `.exe` prerequisite from the top-level build.** *(I-2.3, I-3.1)* — **S**
  Root `build` runs `build:signaling-exe`, which pkg-builds a Windows sidecar into a directory that does not exist, for a sidecar `tauri.conf.json` no longer declares. Drop the step.
  *Pairs with T15.*

- [x] **T11 — Restore CI.** *(I-4.9)* — **M**
  `.github/workflows/build-release.yml` was actively maintained then deleted in `f0659ad`. With T8–T10 done, a matrix build across Windows/Linux/Android becomes possible.
  *See Q4 — confirm the deletion was not deliberate.*

- [~] **T12 — Scope the Android network security config.** *(I-2.4)* — **S**
  **Half done, and the remaining half is blocked on a real constraint.**
  Done: removed the `<certificates src="user" />` trust anchor. Free reduction in MITM surface, nothing needed it.
  Not done: cleartext is still permitted globally. Android's `<domain>` matches only exact literal hostnames/IPs — no CIDR, and `includeSubdomains` is ignored for IP literals — so 10/8, 172.16/12 and 192.168/16 cannot be expressed, and the host's LAN IP is only known at runtime. A stricter config was written and reverted: denying cleartext by default breaks *every* guest connection, and shipping an app that cannot do its one job is not a security win.
  **To actually close this**, pick one: serve the host over HTTPS with a self-signed cert pinned in the client, or validate at the call site that the destination is RFC1918/loopback before issuing a cleartext request. Then flip the base-config and mean it.

- [x] **T13 — Handle Android content URIs in file dialogs.** *(I-3.9)* — **M**
  `commands.rs:502,531` call `.as_path().unwrap()`; Android returns content URIs where `as_path()` is `None`. Return an error instead of panicking, and read via the plugin's URI-aware API.
  *Blocked by V4.*

- [x] **T14 — Trim the Android manifest permissions.** *(I-2.6)* — **S**
  `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `CHANGE_WIFI_STATE`, `FOREGROUND_SERVICE` have no consumers. `RECORD_AUDIO` on a non-recording app is a Play Store review flag.
  *Keep `WAKE_LOCK` — T21 will use it. Keep `CAMERA` if the QR scanner ships.*

---

## Phase 3 — Structural cleanup

- [x] **T15 — Delete or document the dead Node signaling server.** *(I-3.1, O-4)* — **S** `[?]`
  `apps/signaling-server/` is never launched; the Rust `signaling.rs` is live. Its `roomManager.ts` policy (12h TTL, 10-client cap) reads as live behaviour and is not.
  *Blocked on Q1.*

- [x] **T16 — Delete or wire up the orphaned Next.js client.** *(I-3.2, O-4)* — **S** `[?]`
  `apps/web-client/` is a complete second guest client reachable only via a dev-only `console.log`. Also drop `tsconfig.tsbuildinfo` from git.
  *Blocked on Q1.*

- [ ] **T17 — Rebuild remote-ui as a typed bundle.** *(I-1.4, O-4)* — **XL**
  The 2378-line single-file vanilla-JS client cannot import shared types, which is *why* it drifted. Build it with Vite importing `@karaokenatin/shared`, emit one self-contained HTML, keep the `include_str!` embed.
  *Subsumes T18. Do after T7 stabilizes the protocol.*

- [x] **T18 — Vendor the remote-ui CDN dependencies.** *(I-4.1, O-3)* — **S**
  socket.io, PeerJS, qrcodejs, lucide (`@latest`, unpinned) and Google Fonts load from CDNs on every guest page load. Embed them.
  *Do this standalone if T17 is deferred — it is cheap and independently valuable. Note it does not deliver offline operation on its own; T1 is the blocker there.*

- [x] **T19 — Move guest-visibility filtering into Rust.** *(I-3.4)* — **S**
  `room_state.rs` already has `public_state()`/`clone_public_state()`; neither is called. Filtering happens in JS at `usePeerHost.ts:28-32`. Enforce the trust boundary in the core.

- [x] **T20 — Render or delete `HelpDialog`.** *(I-3.3)* — **S**
  159 lines, never imported. Its two buttons call two of T2's phantom commands.

- [x] **T21 — Purge committed build artifacts.** *(I-4.8, O-10)* — **S**
  `git rm --cached` the `.apk.idsig` (262 KB), both `error_log*.txt`, `tsconfig.tsbuildinfo`, and `gen/android/**`; add `gen/` to `.gitignore`.
  *Priority within this: the committed Vite bundle at `gen/android/app/src/main/assets/assets/index-DXbmAp6d.js` is stale and an Android build may ship it instead of fresh output.*

---

## Phase 4 — Missing features

- [x] **T22 — Build volume, mute, and seek UI.** *(I-3.3)* — **M**
  `SET_VOLUME`, `TOGGLE_MUTE`, `SEEK` are complete in the protocol and the Rust enum with zero UI in any client. For a karaoke app, no volume control is the most conspicuous gap in the product. Backend work is already done.

- [x] **T23 — Acquire a wake lock during playback.** *(I-4.4)* — **S**
  The screen sleeps mid-song on Android/Android TV. `WAKE_LOCK` is already in the manifest; nothing acquires it. Use `navigator.wakeLock` in the webview, released when playback stops.

- [x] **T24 — Add P2P reconnection and liveness.** *(I-3.6)* — **L**
  No heartbeat, no retry. `PING`/`PONG` exist in the protocol and nothing sends them. A phone that sleeps or briefly drops Wi-Fi silently stops updating and needs a manual reload — the normal case at a party.

- [x] **T25 — Expose remaining backend-only queue commands.** *(I-3.3)* — **S**
  `MOVE_SONG_TO_TOP`, `MOVE_SONG_TO_BOTTOM`, `REORDER_QUEUE`, `SET_DISPLAY_NAME` are unreachable from any UI. `SET_DISPLAY_NAME` matters most — guests are currently anonymous.

- [x] **T26 — Decide what scoring should be.** *(FEATURES.md §8)* — **?** `[?]`
  `Player.tsx:70-75` is `Math.random()` — no audio analysis. Either implement real pitch detection (XL, needs mic capture, and would justify `RECORD_AUDIO` in T14), or keep it and label it in-app as a party gimmick. Silently fake is the one option to avoid.
  *Product decision — see Q5.*

---

## Phase 5 — Performance

Ordering matters here; see O-"Suggested sequence".

- [x] **T27 — Fix list keys.** *(I-4.6, O-6)* — **S**
  Index keys on lists that reorder by design break reconciliation and lose D-pad focus. Songs have stable `id`s. *Prerequisite for T28/T29 doing what they claim.*

- [ ] **T28 — Virtualize playlist and queue lists.** *(attempted, not landed)* *(I-3.8, O-2)* — **L**
  `ControlPanel.tsx:794`, `Library.tsx:504`, `Queue.tsx:107` render every row unvirtualized. Largest rendering cost in the app, worst on the Android TV target.
  *Complication: virtualized rows unmount, so spatial-navigation focus registration must be reconciled with windowing. Answer to Q3 changes how hard this is.*
  *Cheap partial win if deferred: `loading="lazy"` + explicit dimensions on thumbnails.*

- [ ] **T29 — Memoize the ControlPanel render path.** *(not started; gated on T28)* *(O-5)* — **M**
  829 lines, 17 `useState`, inline handlers so every child prop is a fresh reference. Consolidate the six parallel `Set` states into a reducer.
  *Do after T28 — memoizing a component whose cost is 300 unvirtualized rows moves little.*

- [~] **T30 — Replace full-state broadcast with `STATE_PATCH`.** *(I-3.5, O-1)* — **L**
  **Done for the case that dominates traffic.** Player progress ticks (~every 5s) now send `STATE_PATCH` with the `player` subtree instead of the whole room. `player` is self-contained, so replacing it wholesale cannot desync anything else — which is why this needed no sequence numbers. 8 tests pin the merge contract.
  **Still open:** queue and collection mutations still send full state. Patching those does *not* have the self-containment property and would need sequence numbers plus a resync path; doing it without those trades a bandwidth problem for a consistency problem.
  Every mutation serializes the entire `RoomState` to every peer (~34 KB × 8 guests for one "move song up"). `STATE_PATCH` is defined and never used.
  *Requires sequence numbers and a resync path, or it trades bandwidth for desync. **Do not attempt before T33.***

- [x] **T31 — Bound the YouTube search cache.** *(O-7)* — **S**
  `youtube.rs:37-39` has no eviction — unbounded growth over a long-running host session. Add an LRU cap. Also rate-limit guest-initiated searches, which currently have none.

- [x] **T32 — Replace the server-start sleep with a real signal.** *(I-3.10, O-8)* — **S**
  `commands.rs:544-566` sleeps 500 ms and returns with no proof the listener bound. Bind on the calling thread, hand the port back over a channel. Removes fixed startup latency and a race.

---

## Phase 6 — Engineering hygiene

- [x] **T33 — Add protocol round-trip tests.** *(I-4.9, O-9)* — **M**
  No tests exist anywhere. Start where the value is highest: `ClientCommand`/`HostBroadcast` round-trips between the TS types and the Rust enum. Would have caught T7; will catch the next one.
  ***Hard prerequisite for T30.***

- [x] **T34 — Add linting.** *(I-4.9)* — **S**
  No ESLint, Prettier, clippy, or rustfmt config. `clippy` would surface much of I-4.10 automatically.

- [x] **T35 — Reconcile the documentation with the code.** *(I-4.7)* — **M**
  yt-dlp download instructions for a dependency migrated to `rusty_ytdl` (plus 4473 lines of stale license files); `C:\Users\Noju\...` paths in three docs; `npm install` in a pnpm-only repo; `0.2.0-beta` vs `0.2.0` vs CHANGELOG.
  *Do last — docs should describe the post-fix state.*

- [x] **T36 — Tidy Rust hygiene.** *(I-4.10)* — **M**
  `SCREAMING_CASE` enum variants (use serde renames), swallowed `fs::copy` error at `room_state.rs:121`, discarded socket emits, `Any` CORS on a `0.0.0.0` listener, and the `peer_id: socket.id` placeholder at `signaling.rs:253` that never propagates the guest's real PeerJS id.

- [ ] **T37 — Finish or remove multi-room scaffolding.** *(I-3.11)* — **M** `[?]`
  `RoomManager` is a `HashMap` implying multi-room; `get_first_active_room()` hardcodes single-room. `add_client`/`remove_client` sit behind `#[allow(dead_code)]`. *Blocked on Q1's scope answer.*

---

## Open decisions blocking work

These gate `[?]` items. Each is a product call, not a technical one.

- ~~**Q1**~~ **ANSWERED: delete both**, conditional on neither being used by the Windows or Android build. Verified (no `externalBin`, no Rust reference, absent from build.bat and the Android gradle config) and deleted.
- ~~**Q2**~~ **ANSWERED: make tokens real.** Done in T5.
- ~~**Q3**~~ **ANSWERED: both equally.** T28 must therefore preserve spatial-navigation focus across row unmounting.
- ~~**Q4**~~ Superseded: CI restored in T11 as `.github/workflows/ci.yml`. A release/packaging workflow is still absent and is worth adding separately.
- ~~**Q5**~~ **ANSWERED: measure mic input completeness** (coverage, not pitch). Done in T26; `RECORD_AUDIO` is therefore retained in the manifest.

---

## Suggested order

```
Phase 0 (V1-V4)  ─ verify first, it is cheap and can reorder everything
   │
   ├─ T4  ──────── nothing else is verifiable on a clean checkout
   ├─ T3, T2, T7 ─ small, isolated, unblock the protocol
   ├─ T27 ──────── prerequisite for the perf work
   ├─ T33 ──────── prerequisite for T30
   │
   ├─ T1  ──────── the big one; needs V1
   ├─ T18 ──────── cheap, visible, independent
   │
   ├─ T8-T11 ───── cross-platform build, unblocks CI
   ├─ T28 → T29 ── in that order, or the effort is wasted
   ├─ T30 ──────── only with T33 in place
   │
   ├─ T22, T23 ─── the two most visible product gaps
   └─ T17 ──────── after the protocol settles
```

Independent, pick up anytime: T6, T12, T13, T14, T19, T20, T21, T31, T32, T34, T36.
Do T35 last.
