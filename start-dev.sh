#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# KaraokeNatin - Start Development Environment (Linux/macOS)
# POSIX counterpart to start-dev.bat.
# ============================================================
# start-dev.bat opens three terminal windows: a web-client dev server,
# the host's Vite dev server, and `tauri dev`. The web-client terminal is
# NOT reproduced here: apps/web-client was removed as dead code (see
# REPOMAPPING.md) and the root "dev:web" script no longer exists. This
# script instead launches only what's still live:
#   1. The host's Vite dev server (apps/host, port 5173)
#   2. `pnpm tauri dev` for the host app
#
# start-dev.bat's closing message also claimed a separate "Signaling
# Server (Port 3001)". That's stale: signaling is handled in-process by
# the Rust axum server on its own random port (see
# apps/host/src-tauri/src/signaling.rs and web_server.rs), not a
# standalone service. This script's summary reflects that instead.
# ============================================================

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_DIR="${PROJECT_ROOT}/apps/host"

echo "Starting KaraokeNatin Development Environment..."
echo

# --- Configuration Loading ---
# start-dev.bat itself doesn't load .env (only build.bat does), but doing
# so here is harmless and keeps this script consistent with build.sh /
# clean_android_build.sh.
if [ -f "${PROJECT_ROOT}/.env" ]; then
    echo "Loading configuration from .env file..."
    set -a
    # shellcheck disable=SC1091
    source "${PROJECT_ROOT}/.env"
    set +a
fi

command -v pnpm >/dev/null 2>&1 || { echo "ERROR: pnpm is not installed or not on PATH."; exit 1; }

# Find a terminal emulator so each process gets its own window, matching
# start-dev.bat's use of separate `start "title" ...` windows. Falls back
# to background jobs (logged to a file) if none is available, e.g. in a
# headless/CI shell.
TERMINAL=""
for candidate in gnome-terminal konsole xterm x-terminal-emulator; do
    if command -v "$candidate" >/dev/null 2>&1; then
        TERMINAL="$candidate"
        break
    fi
done

launch_in_terminal() {
    local title="$1"
    local workdir="$2"
    local cmd="$3"
    case "$TERMINAL" in
        gnome-terminal)
            gnome-terminal --title="$title" -- bash -lc "cd '$workdir' && $cmd; exec bash"
            ;;
        konsole)
            konsole --new-tab -p tabtitle="$title" -e bash -lc "cd '$workdir' && $cmd; exec bash" &
            ;;
        xterm|x-terminal-emulator)
            "$TERMINAL" -T "$title" -e bash -lc "cd '$workdir' && $cmd; exec bash" &
            ;;
    esac
}

if [ -n "$TERMINAL" ]; then
    echo "[1/2] Launching Host Vite Dev Server in a new terminal (${TERMINAL})..."
    launch_in_terminal "KaraokeNatin - Host (Vite)" "$HOST_DIR" "pnpm dev"

    sleep 3

    echo "[2/2] Launching Host Tauri Application in a new terminal (${TERMINAL})..."
    launch_in_terminal "KaraokeNatin - Host (Tauri)" "$HOST_DIR" "pnpm tauri dev"

    echo
    echo "==============================================================="
    echo "Terminals launched!"
    echo "==============================================================="
else
    LOG_FILE="/tmp/karaokenatin-vite-dev.log"
    echo "No terminal emulator found (tried gnome-terminal, konsole, xterm)."
    echo "Falling back to a background process for Vite; its output goes to ${LOG_FILE}"
    echo

    echo "[1/2] Launching Host Vite Dev Server in the background..."
    (cd "$HOST_DIR" && pnpm dev) >"$LOG_FILE" 2>&1 &
    VITE_PID=$!
    trap 'kill "$VITE_PID" 2>/dev/null || true' EXIT

    sleep 3

    echo "[2/2] Launching Host Tauri Application (foreground; Ctrl+C stops both)..."
    echo
    (cd "$HOST_DIR" && pnpm tauri dev)
fi

echo
echo "Processes:"
echo "  1. Host Vite Dev Server (Port 5173)"
echo "  2. Host Tauri Application - includes the embedded web server"
echo "     (random port 49152-65535) and in-process signaling."
echo
echo "The QR code in the Host app will point to: http://YOUR_IP:<port>"
echo "Clients on your local network can scan and connect!"
