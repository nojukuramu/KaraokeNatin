# Releasing

Two workflows live in `.github/workflows/`:

| Workflow | Runs on | Produces |
|---|---|---|
| `ci.yml` | every push and PR | nothing — it proves the code is correct |
| `build-release.yml` | push/PR to `main`/`master`, or manual dispatch | Windows installers and an Android APK, as run artifacts |

`build-release.yml` is restored verbatim from the version that last worked in this repo (`e767525`/`f0659ad^`, February 2026) rather than rewritten, so its behavior below is exactly what it always did — nothing added, nothing hardened.

## What it does

Two independent jobs, `build-windows` and `build-android`. Each installs dependencies, builds `packages/shared`, builds the host frontend, then builds for its platform:

| Platform | Steps | Artifact |
|---|---|---|
| Windows | `pnpm --filter @karaokenatin/host run tauri:build` | `windows-nsis-installer` (`.exe`), `windows-msi-installer` (`.msi`) |
| Android | `tauri android init` then `tauri android build` | `android-apk-universal`, `android-apk-all` |

Both are uploaded as workflow run artifacts (Actions tab → the run → Artifacts), not published anywhere. There is no tagging step, no GitHub Release, no signing. That's not a gap introduced here — the original never had any of that either.

## Known state, from this repo's own CI history

This exact file has one confirmed successful run: [21795050307](https://github.com/nojukuramu/KaraokeNatin/actions/runs/21795050307) (2026-02-08), Windows job green, producing real `.exe`/`.msi` artifacts (now expired — GitHub keeps run artifacts 90 days).

**The Android job has never succeeded in this repository's Actions history**, including in that same run — it failed in under 90 seconds, before reaching the NDK/Gradle steps. Every other recorded `build-release.yml` run failed on both jobs. Neither `v0.1.3-beta` nor `v0.2.0-beta` was built by this workflow — no workflow file existed in the repo when either was tagged, so those releases were built and uploaded locally.

None of that is a reason not to run it — it's restored because you asked for the exact known config rather than a rewrite, and because Windows is proven to work from it. If the Android job fails again, that's consistent with its entire history here, not a regression from this restore.

## Running it

Push to `main`/`master`, open a PR against them, or use **Actions → Build Release → Run workflow** for a manual run. Artifacts appear on the run's summary page once each job finishes.

## Local builds

To reproduce a step locally rather than iterating on GitHub:

```bash
pnpm install --frozen-lockfile
pnpm --filter @karaokenatin/shared run build
pnpm --filter @karaokenatin/host run build
pnpm --filter @karaokenatin/host run tauri:build   # Windows/desktop
```

```bash
cd apps/host
npx tauri android init --skip-targets-install
npx tauri android build
```

The repo's own `build.sh` / `build.bat` are a separate, more built-out path (cargo-ndk, keystore signing, highest-installed build-tools detection) — see those scripts directly if you need a signed APK. `build-release.yml` does not use them; it drives everything through the Tauri CLI instead.

## If a build fails

| Symptom | Likely cause |
|---|---|
| `gdk-3.0` / `webkit2gtk` not found | Not applicable to this workflow — it doesn't build Linux |
| `Cannot find module '@karaokenatin/shared'` | The shared-package build step failed or didn't run before the frontend build |
| Android job fails fast (under ~2 minutes) | Matches this workflow's entire history in this repo — see above. Check the job log for the actual first error rather than assuming NDK/Gradle |
| APK/installer missing from artifacts | `if-no-files-found: warn` on some upload steps means a missing file doesn't fail the job — check the "Find APK files" / "Verify build artifacts" step output |
