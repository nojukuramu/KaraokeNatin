# Build Environment Setup Required

## Windows Desktop Build

### Issue
The Rust compiler requires `link.exe` which is part of the Microsoft Visual C++ Build Tools.

### Error
```
error: linker `link.exe` not found
```

### Solution
Install **Visual Studio Build Tools 2022** with "Desktop development with C++" workload:

1. Download from: https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022
2. Run the installer
3. Select "Desktop development with C++"
4. Install

Alternatively, if you have Visual Studio installed, ensure the C++ build tools are installed.

### After Installation
Run `cargo check` in the `apps/host/src-tauri` directory to verify the Rust backend compiles correctly.

---

## Android Build

### Prerequisites
1. **Android Studio** with SDK 24+ (Android 7.0 Nougat)
2. **Android NDK** (install via Android Studio → SDK Manager → SDK Tools → NDK)
3. **Java 17+** (bundled with Android Studio or install separately)
4. **Rust Android targets**:
   ```powershell
   rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android i686-linux-android
   ```

### Environment Variables
Set these in your system or shell environment:
```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:NDK_HOME = "$env:ANDROID_HOME\ndk\<version>"
```

### Initialize Android Project
```powershell
cd apps/host
npx tauri android init
```

This generates the `src-tauri/gen/android/` directory with Gradle project files.

### Build
```powershell
# Debug
pnpm tauri android build --debug

# Release
pnpm tauri android build
```

### Run on Device/Emulator
```powershell
pnpm tauri android dev
```

---

**Note**: This app supports both Windows desktop and Android (phone, tablet, and TV). The Rust code is pure native — no external binaries like yt-dlp are needed.
