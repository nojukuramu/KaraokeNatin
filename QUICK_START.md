# Quick Start

Getting KaraokeNatin running from a clean checkout.

## What you are building

One Tauri application. It plays YouTube videos, and it serves a remote-control web page to guests on the same network from a web server embedded in its own Rust backend. There is no separate signaling service, no separate web client, and no downloaded media binaries — YouTube search and metadata run in-process via the pure-Rust `rusty_ytdl` crate.

If you have read older docs describing a Node signaling sidecar, a Next.js web client, or a `yt-dlp.exe` download step, those describe an architecture the project has moved off. See `REPOMAPPING.md`.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 22+ | |
| pnpm | 10+ | **Required.** The workspace uses `workspace:` protocol deps; `npm install` will not work. |
| Rust | 1.77.2+ | via rustup |

**Linux** additionally needs the GTK/WebKit headers Tauri builds against:

```bash
sudo apt-get install -y libgtk-3-dev libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev librsvg2-dev libsoup-3.0-dev pkg-config
```

**Windows** needs the MSVC C++ build tools and the WebView2 runtime (present on Windows 11; the installer bootstraps it otherwise).

**Android** additionally needs `ANDROID_HOME`, `NDK_HOME` and `JAVA_HOME`. Copy `.env.example` to `.env` and fill it in.

## Setup

```bash
pnpm run setup
```

This installs dependencies **and builds `packages/shared`**. That second step is not optional: `apps/host` imports `@karaokenatin/shared` by its package `main`, so without a built `dist/` the typecheck fails with unresolved-module errors. If you hit that later, run `pnpm run build:shared`.

## Run in development

```bash
pnpm run dev:host
```

Starts Vite and the Tauri dev host. The embedded web server does **not** start at launch — it starts lazily when you pick **Host Mode**, which is also when the QR code becomes available.

`./start-dev.sh` (Linux/macOS) and `start-dev.bat` (Windows) do the same with extra environment checking.

## Verify your changes

```bash
pnpm run check      # typecheck + frontend tests + Rust tests
pnpm run test       # frontend tests only
pnpm run test:rust  # Rust tests only
pnpm run lint:rust  # clippy
```

CI runs the same gates — see `.github/workflows/ci.yml`.

## Build

```bash
pnpm run build      # desktop app for the current platform
```

Bundle targets live in `apps/host/src-tauri/tauri.conf.json`: `nsis`/`msi` on Windows, `deb`/`appimage` on Linux.

For Android:

```bash
./build.sh android          # build.bat on Windows
./build.sh android_signed   # with keystore signing
```

`build.sh` selects the highest installed Android build-tools version rather than pinning one.

## Trying it with a phone

1. Start the app and choose **Host Mode**.
2. Scan the QR code with a phone on the same Wi-Fi.
3. The phone opens the remote UI, served by the host itself.

The QR URL carries a join token (`?t=…`) and signaling verifies it on every join, so a device that reaches the port without a valid token is rejected. Don't strip the query string when sharing the link by hand.

## Where things are

| Path | What |
|---|---|
| `apps/host/src/` | React frontend (the host window) |
| `apps/host/src-tauri/src/` | Rust backend: commands, room state, web server, signaling, PeerJS broker |
| `apps/host/src-tauri/remote-ui/` | Guest UI — one self-contained HTML file compiled into the binary |
| `packages/shared/` | Protocol and state types shared across the TypeScript code |

## Troubleshooting

| Symptom | Cause |
|---|---|
| `Cannot find module '@karaokenatin/shared'` | `packages/shared` is not built — run `pnpm run build:shared` |
| `gdk-3.0` / `webkit2gtk` not found while building | Missing Linux system deps, see Prerequisites |
| Guest scans the QR but is rejected | The join token is missing from the URL — check `?t=` survived |
| Guest cannot reach the host at all | Different networks, or client isolation is on at the access point |
| Android build cannot find build-tools | `ANDROID_HOME` unset, or no build-tools installed |

## Further reading

- `REPOMAPPING.md` — how the codebase works, and the traps in it
- `REPO_MAP.md` — module-by-module structure
- `task.md` — the current backlog
