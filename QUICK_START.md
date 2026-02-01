# KaraokeNatin - Quick Setup Reference

## 🚀 Quick Start (After Prerequisites)

```powershell
# 1. Install dependencies
cd C:\Users\Noju\Projects\KaraokeNatin
npm install

# 2. Build shared types
cd packages\shared
npm run build
cd ..\..

# 3. Download yt-dlp
cd apps\host\src-tauri\binaries
Invoke-WebRequest -Uri "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" -OutFile "yt-dlp.exe"
$targetTriple = rustc --print host-tuple
Rename-Item "yt-dlp.exe" "yt-dlp-$targetTriple.exe"
cd ..\..\..\..

# 4. Run all services (3 separate terminals)
# Terminal 1:
cd apps\signaling-server
npm run dev

# Terminal 2:
cd apps\host
npm run tauri:dev

# Terminal 3:
cd apps\web-client
npm run dev
```

## 📦 Prerequisites Installation

### Node.js
```powershell
# Download from: https://nodejs.org/
# Or with Chocolatey:
choco install nodejs-lts -y
```

### Rust
```powershell
# Download from: https://rustup.rs/
# Or direct link: https://win.rustup.rs/x86_64
```

### Tauri CLI
```powershell
npm install -g @tauri-apps/cli@next
```

## 🔧 Common Commands

```powershell
# Check versions
node --version
npm --version
rustc --version
cargo --version

# Build shared types
cd packages\shared && npm run build

# Run signaling server
cd apps\signaling-server && npm run dev

# Run Tauri host (dev mode)
cd apps\host && npm run tauri:dev

# Run web client
cd apps\web-client && npm run dev

# Build for production
npm run build:signaling
npm run build:host
npm run build:web
```

## 🌐 Access Points

- **Signaling Server:** http://localhost:3001
- **Web Client:** http://localhost:3000
- **Tauri Host:** Desktop application window

## 📝 File Locations

- **Shared Types:** `packages/shared/src/`
- **Signaling Server:** `apps/signaling-server/src/`
- **Host Frontend:** `apps/host/src/`
- **Host Backend:** `apps/host/src-tauri/src/`
- **Web Client:** `apps/web-client/app/`
- **yt-dlp Binary:** `apps/host/src-tauri/binaries/`

## 🐛 Quick Troubleshooting

| Issue | Solution |
|-------|----------|
| Command not found | Restart PowerShell |
| Tauri build fails | Install VS Build Tools with C++ |
| yt-dlp not found | Check binary name includes target triple |
| WebSocket fails | Ensure signaling server is running |
| Port in use | Change PORT in .env or kill process |

## 📚 Full Documentation

See [SETUP_GUIDE.md](./SETUP_GUIDE.md) for detailed step-by-step instructions.
