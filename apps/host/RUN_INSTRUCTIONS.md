# Running the Host Application - Fixed Instructions

## The Issue
The Tauri host needs TWO separate processes:
1. **Vite dev server** (frontend)
2. **Tauri dev** (Rust backend + window)

## How to Run (2 Terminals)

### Terminal 1: Start Vite Dev Server
```powershell
cd C:\Users\Noju\Projects\KaraokeNatin\apps\host
pnpm dev
```
Wait for Vite to show: `➜  Local:   http://localhost:5173/`

### Terminal 2: Start Tauri
```powershell
cd C:\Users\Noju\Projects\KaraokeNatin\apps\host
pnpm tauri dev
```

## Full System (4 Terminals Total)

1. **Signaling Server**: `pnpm run dev:signaling` (from root)
2. **Web Client**: `pnpm run dev:web` (from root)
3. **Host Vite**: `cd apps/host && pnpm dev`
4. **Host Tauri**: `cd apps/host && pnpm tauri dev`

## Alternative: Use the Root Scripts (Keep Separate)

The root `package.json` has a `dev:host` script, but it tries to do both at once which causes conflicts. Better to run them separately.
