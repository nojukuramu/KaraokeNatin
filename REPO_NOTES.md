# REPO NOTES

Running notes from the audit pass. Assumptions, gotchas, things that had to be reverse-engineered, and open questions. Companion to REPO_MAP.md / FEATURES.md / ISSUES.md / OPTIMIZATION.md.

Audit date: 2026-07-26. Commit at time of audit: `5e3b31c`. Branch: `claude/workflow-agent-architecture-txoz4x`.

---

## How this audit was conducted

Deliberately **not** from the READMEs. The docs were read last, and only to diff them against the code — which turned out to be the right call, since several of them describe an architecture the project abandoned months ago (see "The yt-dlp ghost" below).

Everything load-bearing was read in the source. Claims that carried real weight — the auth bypass, the missing Tauri commands, the build-path gaps — were re-verified directly rather than trusted from a first read. Two of those re-checks changed the conclusion, which is noted in place below.

No code was run. There is no test suite to run (ISSUES 4.9), and nothing was built, so **every claim here is static analysis**. Anything requiring a device or a running process is flagged as unverified where it appears.

---

## The single most important thing to understand about this repo

**Roughly a third of the committed code is not reachable in the shipped product.** Not commented out, not behind a flag — fully written, plausible-looking, wired into the root `package.json`, and dead.

Specifically:
- `apps/signaling-server/` — a complete Node + socket.io signaling server. Replaced by a native Rust implementation. Still a mandatory step in the top-level `build` script.
- `apps/web-client/` — a complete Next.js guest client. Replaced by `remote-ui/index.html`. Referenced only by a dev-only `console.log`.
- The Rust `create_room` command's credential generation — computed, returned, and discarded by the caller.

If you read this repo top-down and assume what is present is what runs, you will build an entirely wrong mental model. I did, initially: the first pass over the networking layer described the Node server's room lifecycle (12h TTL, `MAX_CLIENTS_PER_ROOM = 10`, 5-minute cleanup sweep) as though it were live policy. It is dead code. The correction came from following what the host *actually connects to* rather than what exists.

**The reliable technique on this codebase: trace outward from `usePeerHost.ts` and `lib.rs`, not inward from the directory tree.**

---

## Reverse-engineered: which signaling server is real

Not documented anywhere. Resolved by following the connection:

`apps/host/src/hooks/usePeerHost.ts:70-72`
```ts
const port = await invoke<number>('get_server_port');
const socketInstance = io(`http://localhost:${port}`);
```

`get_server_port` returns the port of the **Rust** axum server (`src-tauri/web_server.rs`), which mounts socketioxide handlers from `src-tauri/signaling.rs`. So signaling is in-process Rust. The Node server in `apps/signaling-server/` is never started by the app.

**Why it exists** — found in git history, and this is the piece that makes the whole architecture make sense:

```
commit 1f6e0f0 "GRRR"  — deletes src-tauri/src/sidecar.rs, adds gen/android/**
```

Android cannot spawn sidecar processes. The Node signaling server was shipped as a bundled sidecar `.exe`; that model died the moment Android became a target, so signaling was reimplemented natively in Rust. Same story for yt-dlp → `rusty_ytdl`. The Node app and the `build:signaling-exe` pkg step are both fossils of the pre-Android design.

This also explains an otherwise baffling detail: `apps/signaling-server/package.json` still builds a Windows `.exe` into `src-tauri/binaries/`, a directory that does not exist, for a sidecar that `tauri.conf.json` no longer declares in `externalBin`. The artifact is produced and consumed by nothing.

**Gotcha for future work:** `git log --diff-filter=D` was far more informative than the CHANGELOG here. Two deleted files (`sidecar.rs`, `.github/workflows/build-release.yml`) explain more about the current shape of the project than any doc in the repo.

---

## Reverse-engineered: which guest client is real

Also undocumented. There are two full guest clients and the QR code decides.

`get_qr_url` (`network.rs`) returns `http://<local-ip>:<port>/`, and the Rust web server serves `remote-ui/index.html` at `GET /`. So **guests get `remote-ui/index.html`** — a 2378-line single-file vanilla-JS app embedded via `include_str!`.

`apps/web-client` (Next.js) is only reachable by manually visiting `localhost:3000`, and the app's only reference to it is a `console.log` at `usePeerHost.ts:86` labelled "(dev)". On a guest's phone `localhost:3000` is the phone itself — so even the logged URL is not usable by a real guest.

`remote-ui` additionally runs in two modes distinguished by a `mode=inapp` URL param (`index.html:1177`): embedded as an iframe inside the host app's own Guest Mode (bridging to Rust via `window.parent.postMessage`), or standalone over P2P. Same file, two quite different execution contexts. Worth knowing before editing it — a change can affect both paths.

---

## The finding that changed the picture: PeerJS is not local

This one arrived late and reframed everything else, so it is worth recording how it was missed initially.

Three separate passes over the networking layer all noted the ICE/STUN configuration and correctly reported "STUN-only, no TURN". Every one of them read `new Peer({ config: { iceServers: [...] } })` and focused on the array. Nobody asked what the **absent** arguments meant.

PeerJS takes `host` / `port` / `path` to point at a broker. With none supplied it defaults to the public cloud PeerServer at `0.peerjs.com`. So the WebRTC offer/answer for every session — host and all three clients — is relayed through a third-party internet service. The local socket.io signaling in `signaling.rs` only exchanges room metadata and peer ids; it never carries SDP.

Consequence: **the LAN app cannot connect a guest without internet access.** Not degraded — non-functional. This makes `README.md:27` ("no internet required") wrong about the architecture itself rather than merely about the CDN assets, and it makes `peerjs.com` an unmonitored single point of failure for every install simultaneously.

**The methodological lesson**, which generalizes past this repo: reviewing a config object for what it contains is not the same as reviewing it for what it omits. Library defaults are invisible in a diff and invisible in a grep. The `iceServers` array was right there and drew all the attention; the missing `host` key was the actual finding.

Filed as ISSUES 2.5 and OPTIMIZATION #0. Still worth a five-minute empirical check — run the host with the network unplugged and try to connect a phone. The code reading is unambiguous, but that test would settle it beyond argument.

---

## A bug class worth sweeping for: `invoke` argument names

`App.tsx:254` calls `invoke('playlist_import_collection', { json })`. The Rust parameter is named `data` (`commands.rs:470`). The call fails before the command body runs.

Nothing catches this. `tsc` sees `invoke` as accepting an arbitrary payload; `cargo` sees a well-formed command. The FFI boundary is the one place in this codebase where **neither** compiler is looking, and it is crossed by roughly two dozen call sites.

I found this one because FEATURES.md work happened to trace the Guest Mode import path end to end. **A systematic sweep of every `invoke` call site against its Rust signature was not done and should be** — this is exactly the kind of defect that appears in ones and twos rather than alone. The three missing commands (ISSUES 1.1) are the same boundary failing in the other direction.

---

## The yt-dlp ghost

`QUICK_START.md:15-19` and `apps/host/README.md:48-56` tell you to download yt-dlp binaries. `licenses/yt-dlp-LICENSE.txt` and `licenses/yt-dlp-THIRD_PARTY_LICENSES.txt` (4473 lines) are committed.

None of it is used. `Cargo.toml:37` pulls `rusty_ytdl` (pure Rust), and `CHANGELOG.md:29` records the migration. **No external process is spawned anywhere in the Rust code** — I checked specifically for this, expecting to find `Command::new` given the docs, and there is none.

This was the first strong signal that the docs describe a previous architecture. After finding it, I stopped treating any doc claim as evidence.

---

## Things that look like bugs but are not

Worth recording so the next person doesn't re-flag them:

- **`std::thread::spawn` + a fresh tokio runtime** in `start_host_server` (`commands.rs:551`) looks wrong for an async app. It is deliberate — it keeps the axum server off Tauri's executor. The *actual* problem there is the 500 ms sleep used as a readiness signal (ISSUES 3.10), not the thread.
- **Rust redefining `ClientCommand` / `RoomState`** in `commands.rs` and `room_state.rs` is not type duplication in the bad sense — it is the serde boundary, and it is unavoidable across the FFI line. The real drift is elsewhere (see below).
- **The focus-deferral globals** in `useRoomState.ts` (`_isInputFocused`, `_flushCallback`, `_pendingState`) look like sloppy module-level mutable state. The intent is legitimate: don't re-render the queue out from under someone typing. The design has a real failure mode (ISSUES 3.7) but it is solving a real problem, not an accident.
- **`0.0.0.0` binding** (`web_server.rs:83`) is correct and necessary — guests on the LAN must reach it. Not a finding.

---

## Where the type drift actually is

An early pass concluded "zero type drift" because every TypeScript package genuinely does import from `packages/shared` with no redeclarations. That is true and it is the wrong conclusion, because it only surveys the typed languages.

The drift lives in the two places types cannot reach:

1. **`remote-ui/index.html` is vanilla JS with no type checking**, and constructs protocol messages as string literals. It is a full protocol implementation that no compiler validates.
2. **`SEARCH` / `SEARCH_RESULTS`** exist in neither `packages/shared/src/p2p-protocol.ts` nor the Rust `ClientCommand` enum. `usePeerHost.ts:122-138` handles them out-of-band, with a comment admitting it: `// Handle SEARCH command separately (not a standard ClientCommand)`.

So guest search — a core feature — travels a path that is invisible to the type system on both ends. This is the concrete cost of having three implementations of one protocol, and it is why OPTIMIZATION #4 and #9 are framed around the protocol boundary specifically.

**Lesson for this repo:** "do the types line up" is the wrong question. The right one is "how many implementations of this protocol exist, and how many are type-checked?" Answer: three, and one.

---

## Assumptions made

Stated explicitly because they shape conclusions elsewhere:

1. **Threat model is the local network.** This is a party app on a LAN. The auth bypass (ISSUES 2.1) is assessed as S2 rather than critical on that basis. If this were ever exposed to the internet, several S2/S3 items become critical.
2. **`gen/android/**` is Tauri-generated scaffolding**, not hand-maintained. It is checked in, which is unusual, so some of it may have been hand-edited — the `network_security_config.xml` and manifest permissions in particular look intentional rather than generated. Not confirmed.
3. **`main` is the reference branch.** The audit branch is one commit ahead (`5e3b31c`, a changelog edit).
4. **Single-host, single-room in practice.** `get_first_active_room()` and the empty-`roomId` path hardcode this, even though `RoomManager` is a `HashMap` implying multi-room. Assumed the single-room reading is the intended product.
5. **The last-known-good release is v0.2.0**, per `CHANGELOG.md` — though root `package.json` says `0.2.0-beta` and `apps/host/package.json` says `0.2.0`, so this is assumed rather than established.

---

## Verification notes

Where a claim would have been easy to get wrong, this is what was actually done:

| Claim | How it was checked |
|---|---|
| Three commands don't exist | `grep "fn <name>"` across `src-tauri/src/`, plus reading the `generate_handler!` list at `lib.rs:73-95`. Both negative. |
| Auth bypass is real | Read `signaling.rs:220-276` in full. Confirmed all three input shapes (`""`, `"default"`, absent) reach `get_room` without `verify_room`. |
| The bypass is actually taken | `grep joinToken` across all clients → `remote-ui/index.html:2149` sends `joinToken: ''`. This is what turned a theoretical hole into a shipped one. |
| Rust room credentials are dead | Read the call site at `useRoomState.ts:40`: `await createRoom();` — return discarded. |
| Cleartext applies to release | Read `build.gradle.kts` in full; the setting is in `defaultConfig` and the `release` block does not override it. Also found the `<certificates src="user" />` trust anchor an initial pass had missed. |
| `shared` is never built | Confirmed no `dist/`, `dist/` gitignored, `setup:packages` has no build step, and neither `vite.config.ts` nor `next.config.mjs` aliases the package. |
| No tests / no CI | `git ls-files` filtered for test and lint patterns — empty. `.github/` absent; found in history that it was deleted in `f0659ad`. |

Two initial conclusions were wrong and were corrected by re-checking: the Node signaling server being live, and "zero type drift". Both are documented above rather than quietly fixed, because the *reason* they were wrong is itself useful information about this codebase.

---

## Open questions

Ordered by how much they'd change the recommendations.

1. **Are `apps/signaling-server` and `apps/web-client` intended to return?** If there is a planned internet-hosted mode, they are dormant infrastructure and should be documented as such. If not, they are ~1000 lines of misleading dead code that should be deleted. Everything in OPTIMIZATION #4 depends on the answer.

2. **Is the join token meant to be real security?** Current state is neither open-by-design nor secure — it looks like auth and isn't. Either is a fine answer; the ambiguity is the problem.

3. **Android TV (D-pad) or Android phone (touch) as the primary mobile target?** The UI hedges — spatial navigation and touch handling coexist, neither clearly primary (ISSUES 4.5). This decides whether list virtualization must preserve focus semantics (TV) or not (phone), which materially changes OPTIMIZATION #2.

4. **Was deleting `.github/workflows/build-release.yml` deliberate?** It was actively maintained (8 commits) then removed in `f0659ad` ("Update!"). Combined with the Windows-only local build, there is currently no reproducible release path on any platform.

5. **Has the Android build been run since the committed Vite bundle under `gen/android/app/src/main/assets/assets/` was last updated?** If that stale bundle is being picked up, the shipped APK's frontend may not match `apps/host/src/`. This is checkable by rebuilding and diffing; not done in this pass.

6. **Does `local-ip-address` pick the right interface on Android** when Wi-Fi and mobile data are both active? If it returns the mobile interface, the QR code is unreachable. Requires a device to test.

---

## Loose ends not chased

Called out so the gaps in this pass are explicit:

- `apps/host/src/index.css` is 1794 lines and was only skimmed. There may be dead selectors and duplicated theming.
- `remote-ui/index.html` was read for protocol and feature surface, not line-by-line for logic bugs. At 2378 lines it likely has its own crop.
- `Cargo.lock` was not audited for known-vulnerable transitive crates, and `pnpm-lock.yaml` was not audited for npm advisories. Neither `cargo audit` nor `pnpm audit` was run.
- The two `error_log*.txt` files were read for content (Tauri v1→v2 migration errors, now historical) but not correlated against current code to confirm every warning listed is resolved.
