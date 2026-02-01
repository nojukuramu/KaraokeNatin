@echo off
echo Starting KaraokeNatin Development Environment...
echo.

REM Get the current directory (project root)
set PROJECT_ROOT=%~dp0

REM Terminal 1: Web Client (for development/testing only)
echo [1/3] Launching Web Client...
start "KaraokeNatin - Web Client" powershell -NoExit -Command "cd '%PROJECT_ROOT%'; pnpm run dev:web"

REM Wait a bit for stability
timeout /t 2 /nobreak >nul

REM Terminal 2: Host Vite Dev Server
echo [2/3] Launching Host Vite Dev Server...
start "KaraokeNatin - Host (Vite)" powershell -NoExit -Command "cd '%PROJECT_ROOT%apps\host'; pnpm dev"

REM Wait a bit for Vite to start
timeout /t 3 /nobreak >nul

REM Terminal 3: Host Tauri Application (includes embedded web server + signaling server)
echo [3/3] Launching Host Tauri App...
start "KaraokeNatin - Host (Tauri)" powershell -NoExit -Command "cd '%PROJECT_ROOT%apps\host'; pnpm tauri dev"

echo.
echo ===============================================================
echo All terminals launched successfully!
echo ===============================================================
echo.
echo Windows opened:
echo   1. Web Client (Port 3000) - for development testing
echo   2. Host Vite Dev Server (Port 5173)
echo   3. Host Tauri Application - includes:
echo      * Embedded Web Server (Port 8080)
echo      * Signaling Server (Port 3001) - runs automatically!
echo.
echo The QR code in the Host app will point to: http://YOUR_IP:8080
echo Clients on your local network can scan and connect!
echo.
echo Close this window or press any key to exit...
pause >nul
