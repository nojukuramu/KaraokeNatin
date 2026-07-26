# Releasing

Two workflows live in `.github/workflows/`:

| Workflow | Runs on | Produces |
|---|---|---|
| `ci.yml` | every push and PR | nothing — it proves the code is correct |
| `release.yml` | `v*` tags, or manual dispatch | the installers people download |

## Cutting a release

```bash
# Version lives in three places; keep them in step.
#   package.json, apps/host/package.json, apps/host/src-tauri/tauri.conf.json
git tag v0.3.0
git push origin v0.3.0
```

That builds everything and publishes a GitHub Release with generated notes.

To build artifacts **without** publishing — checking a change builds on all three platforms, say — use **Actions → Release → Run workflow** and leave `publish_release` unchecked. Artifacts are attached to the run for 90 days.

## What comes out

| Platform | Files |
|---|---|
| Windows | `KaraokeNatin_<version>_x64-setup.exe` (NSIS), `KaraokeNatin_<version>_x64_en-US.msi` |
| Linux | `karaokenatin_<version>_amd64.deb`, `karaokenatin_<version>_amd64.AppImage` |
| Android | `KaraokeNatin-arm64-release.apk` |

Android builds arm64 only — it covers essentially every device from the last several years, including Android TV boxes. Add ABIs by extending the `cargo ndk -t` flags and the matching Gradle task if you need 32-bit or x86 emulator builds.

## Android signing

**Without signing secrets the workflow still succeeds**, but emits an APK named `…-unsigned.apk` and logs a warning. Android refuses to install an unsigned APK, so that build is only useful for CI smoke-checking.

To produce installable APKs, add three repository secrets under **Settings → Secrets and variables → Actions**:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | your keystore, base64-encoded |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
| `ANDROID_KEY_ALIAS` | the key alias inside the keystore |

Create a keystore if you don't have one:

```bash
keytool -genkey -v -keystore karaokenatin.keystore \
  -alias karaokenatin -keyalg RSA -keysize 2048 -validity 10000
```

Encode it for the secret:

```bash
base64 -w0 karaokenatin.keystore   # Linux
base64 -i karaokenatin.keystore    # macOS
```

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("karaokenatin.keystore"))  # Windows
```

**Keep the keystore file.** Android identifies an app by its signing key: lose it and you cannot ship an update to anyone who installed the old build — they have to uninstall first, losing their playlists. Back it up somewhere that is not this repository. `*.keystore` and `*.jks` are gitignored, and the workflow deletes its decoded copy from the runner after signing.

## Local builds

The workflows mirror the local scripts, so you can reproduce a failure without pushing:

```bash
pnpm run build        # desktop, current platform
./build.sh android    # unsigned APK
./build.sh android_signed
```

`build.bat` is the Windows equivalent. Both pick the highest installed Android build-tools rather than pinning a version — the workflow does the same, so an SDK update on the runner does not break the build.

## If a release build fails

| Symptom | Cause |
|---|---|
| `gdk-3.0` not found (Linux) | The system-deps step failed or was skipped |
| `Cannot find module '@karaokenatin/shared'` | `build:shared` did not run before the frontend build |
| Gradle cannot find `libapp_lib.so` | `cargo ndk` failed earlier — check that step, not Gradle |
| `apksigner` not found | build-tools not installed by `setup-android` |
| APK installs but shows a blank screen | Stale assets — the workflow clears `assets/` before copying, but a local build may not |
