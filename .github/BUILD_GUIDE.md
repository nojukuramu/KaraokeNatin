# GitHub Actions Build Guide

This repository uses GitHub Actions to automatically build Windows and Android releases.

## How to Build

### Automatic Builds
The workflow automatically runs on:
- Every push to `main` or `master` branch
- Every pull request to `main` or `master` branch

### Manual Builds
1. Go to your repository on GitHub
2. Click on **Actions** tab
3. Select **Build Release** workflow
4. Click **Run workflow** button
5. Wait for the build to complete (~10-15 minutes)

## Downloading Build Artifacts

After the workflow completes:

1. Go to the **Actions** tab in your GitHub repository
2. Click on the latest workflow run
3. Scroll down to the **Artifacts** section
4. Download the artifacts you need:
   - `windows-nsis-installer` - Windows setup executable (.exe)
   - `windows-msi-installer` - Windows MSI installer (.msi)
   - `android-apk-arm64` - Android APK for ARM64 devices (most modern phones)
   - `android-apk-all` - All Android APK variants (ARM64, ARMv7, x86, x86_64)

## Build Artifacts

### Windows Builds
- **NSIS Installer** (`.exe`) - Recommended installer for Windows
- **MSI Installer** (`.msi`) - Alternative Windows installer format

### Android Builds
- **Universal APK** - Works on all Android devices (ARM64, ARMv7, x86, x86_64)
- **Split APKs** - Optimized APKs for specific architectures

## Local Build Paths (If Building Locally)

### Windows (Successful on Windows)
```
apps/host/src-tauri/target/release/bundle/nsis/KaraokeNatin_0.1.0_x64-setup.exe
apps/host/src-tauri/target/release/bundle/msi/KaraokeNatin_0.1.0_x64_en-US.msi
apps/host/src-tauri/target/release/app.exe
```

### Android (Must build on Linux/macOS or via GitHub Actions)
```
apps/host/src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk
```

## Notes

- **Windows builds**: Can be built locally on Windows
- **Android builds**: Due to OpenSSL cross-compilation limitations on Windows, Android builds should be done on Linux (via WSL2, Docker, or GitHub Actions)
- **APK Signing**: The APKs generated are unsigned. For production releases, you'll need to sign them with your Android keystore.

## First Time Setup

The workflow is already configured and ready to use. Just commit and push your code to trigger a build!

```bash
git add .github/workflows/build-release.yml
git commit -m "Add GitHub Actions build workflow"
git push
```

Then check the **Actions** tab on GitHub to see your builds in progress!
