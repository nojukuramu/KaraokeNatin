# CLAUDE.md

**Read `REPOMAPPING.md` before making changes.** It covers how this repo actually works, which code paths are live versus dead, and the traps that reliably mislead readers. The rest of this file is the short version.

## Non-negotiables

1. **A third of the committed code is unreachable.** `apps/signaling-server/` and `apps/web-client/` are dead; signaling is Rust (`src-tauri/signaling.rs`) and guests get `src-tauri/remote-ui/index.html`. Confirm a path is live before extending it — see the table in REPOMAPPING.md.
2. **`invoke()` is type-checked by neither `tsc` nor `cargo`.** When you add or edit one, open the Rust signature and verify the command name, argument names, and types. Missing commands and wrong argument names both exist in the tree right now.
3. **New `#[tauri::command]` must be registered** in `generate_handler!` at `src-tauri/src/lib.rs`.
4. **Protocol changes touch four places:** `packages/shared/src/p2p-protocol.ts`, the Rust `ClientCommand` enum in `commands.rs`, `remote-ui/index.html` (vanilla JS, not type-checked), and possibly `apps/web-client/`. Only some will fail to compile.
5. **Two GUI surfaces, one backend.** A user-facing feature usually needs both `apps/host/src/components/ControlPanel.tsx` (host) and `remote-ui/index.html` (guest).
6. **pnpm only.** Docs saying `npm install` are stale.
7. **`packages/shared` must be built** (`cd packages/shared && pnpm build`) or imports fail to resolve.

## Docs

| File | Use for |
|---|---|
| `REPOMAPPING.md` | How to work here — rules, traps, where things live |
| `REPO_MAP.md` | Structure: modules, entry points, runtime flows |
| `FEATURES.md` | What exists, GUI layer vs logic layer |
| `ISSUES.md` | Known defects with severity |
| `OPTIMIZATION.md` | Improvement candidates, ranked |
| `task.md` | The actionable backlog |
| `REPO_NOTES.md` | Audit reasoning, assumptions, open questions |

The READMEs, `QUICK_START.md`, `DEPLOYMENT.md`, and `RUN_INSTRUCTIONS.md` describe an architecture the project has moved off. Treat their claims as hypotheses to check against code.

## Before finishing

State what you actually verified. There is no test suite, no linter, and no CI, so nothing else will catch a regression.
