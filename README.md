# 🎤 KaraokeNatin

**Turn any TV, projector, or Android device into a karaoke system with your phone as the remote control!**

KaraokeNatin is a local-network karaoke application that lets you enjoy karaoke parties with your friends and family. No expensive equipment needed — just a computer or Android device connected to a TV and everyone's smartphones.

> **📺 Note**: KaraokeNatin uses YouTube for karaoke video content. Please ensure you comply with [YouTube's Terms of Service](https://www.youtube.com/t/terms) when using this application.

## ✨ Features

### For Singers
- 🎵 **Easy Song Selection** — Browse and queue your favorite karaoke songs from YouTube
- 📱 **Phone as Remote** — Control the karaoke system from your smartphone
- 👥 **Multiple Users** — Everyone at the party can connect their phones and add songs
- 📊 **See What's Playing** — Real-time view of the current song and upcoming queue
- 🎮 **Playback Controls** — Play, pause, skip songs, and adjust volume from your phone
- 🔐 **Simple Connection** — Just scan a QR code to join

### For Hosts
- 🖥️ **Windows & Android** — Run on Windows PCs, Android phones, tablets, or Android TV
- 📺 **Android TV Support** — DPAD navigation for big-screen experience
- 🎬 **YouTube Integration** — Play any karaoke video directly from YouTube
- 🔄 **Automatic Queue** — Songs automatically advance when finished
- 📡 **Local Network** — Works over Wi-Fi, no internet required once songs are loaded
- 🆓 **No Subscription** — Completely free with no recurring costs
- 🌐 **Easy Setup** — Share a QR code for others to join your session

## 📦 Downloads

### Pre-built Releases
Check the [Releases](https://github.com/nojukuramu/KaraokeNatin/releases) page for:
- **Windows** — `.exe` (NSIS) or `.msi` installer
- **Android** — `.apk` for phones, tablets, and Android TV (arm64)

### Build from Source
See [Building](#-building-from-source) below.

## 🚀 Getting Started

### For Singers
1. Connect to the same Wi-Fi network as the karaoke host
2. Scan the QR code shown on the TV screen
3. Enter your name and start adding songs!

### For Hosts
1. Install KaraokeNatin on your Windows PC or Android device
2. Connect it to your TV or projector
3. Launch the app and select **Host Mode**
4. Share the QR code with your guests

## 🔨 Building from Source

### Prerequisites
- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) 10+
- [Rust](https://rustup.rs/) 1.77+
- [cargo-ndk](https://github.com/nickelc/cargo-ndk) (for Android builds)
- [Android SDK](https://developer.android.com/studio) with platform 36, build-tools 36, and NDK 27 (for Android builds)
- [Java JDK](https://www.oracle.com/java/technologies/downloads/) 21+ (for Android builds)

### Quick Build

Use the included build script on Windows:

```powershell
# Build both Android APK + Windows installers
build.bat

# Android only
build.bat android

# Windows only
build.bat windows

# Sign an Android APK
build.bat sign
```

### Manual Build

```powershell
# 1. Install dependencies
pnpm install

# 2. Build shared types
pnpm --filter @karaokenatin/shared build

# 3. Build host frontend
pnpm --filter @karaokenatin/host build

# 4a. Windows — build Tauri desktop app
cd apps/host
pnpm tauri build

# 4b. Android — cross-compile with cargo-ndk, then Gradle
cd apps/host/src-tauri
cargo ndk -t arm64-v8a -o gen/android/app/src/main/jniLibs build --release --lib --features tauri/custom-protocol
cd gen/android
.\gradlew.bat assembleArm64Release -x rustBuildArm64Release -x rustBuildUniversalRelease
```

### Output Locations

| Platform | File | Location |
|----------|------|----------|
| Windows (NSIS) | `KaraokeNatin_0.2.0_x64-setup.exe` | `apps/host/src-tauri/target/release/bundle/nsis/` |
| Windows (MSI) | `KaraokeNatin_0.2.0_x64_en-US.msi` | `apps/host/src-tauri/target/release/bundle/msi/` |
| Android (arm64) | `app-arm64-release-unsigned.apk` | `apps/host/src-tauri/gen/android/app/build/outputs/apk/arm64/release/` |

## 🏗️ Project Structure

```
KaraokeNatin/
├── apps/
│   ├── host/              # Tauri app (Windows + Android host)
│   │   ├── src/           # React frontend (Vite)
│   │   └── src-tauri/     # Rust backend (Tauri v2)
│   ├── signaling-server/  # WebSocket signaling (embedded in host)
│   └── web-client/        # Next.js remote control for phones
├── packages/
│   └── shared/            # Shared TypeScript types & protocols
├── build.bat              # One-click build script
├── start-dev.bat          # Development environment launcher
└── CHANGELOG.md           # Version history
```

## 🤝 Contributing

**We're looking for contributors!** Whether you're a developer, designer, or karaoke enthusiast, we'd love your help.

### Ways to Contribute
- 💻 **Code** — Help us build new features and fix bugs
- 🎨 **Design** — Improve the user interface and experience
- 📝 **Documentation** — Write tutorials, improve guides, or translate
- 🐛 **Testing** — Report bugs and suggest improvements
- 💡 **Ideas** — Share your feature suggestions

### How to Get Started
1. Check our [existing issues](https://github.com/nojukuramu/KaraokeNatin/issues)
2. Fork the repository and make your changes
3. Submit a pull request with a clear description

### Report Issues
Found a bug? [Open an issue](https://github.com/nojukuramu/KaraokeNatin/issues/new) — we appreciate detailed reports and thoughtful suggestions.

## 📄 License

This project is licensed under the MIT License — see [LICENSE](LICENSE) for details.

### Third-Party Licenses

KaraokeNatin uses [rusty_ytdl](https://github.com/Mithronn/rusty_ytdl) for YouTube integration (MIT License). Full attribution details are in the [licenses](licenses/) directory.

## 📚 Resources

- [Changelog](CHANGELOG.md) — Version history
- [Quick Start Guide](QUICK_START.md) — Developer setup
- [Deployment Guide](DEPLOYMENT.md) — Distribution options

---

**Made with ❤️ for karaoke lovers everywhere**
