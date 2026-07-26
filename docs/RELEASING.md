# Releasing

Two workflows live in `.github/workflows/`:

| Workflow | Runs on | Produces |
|---|---|---|
| `ci.yml` | every push and PR | nothing — it proves the code is correct |
| `build-release.yml` | push/PR to `main`/`master`, or manual dispatch | Windows installers and an Android APK, as run artifacts |

`build-release.yml` is restored from the version that last worked in this repo (`e767525`/`f0659ad^`, February 2026), with one deliberate change: the Android job's two `npx tauri ...` invocations became `pnpm exec tauri ...`. Everything else is untouched. See "Known state" below for why.

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

The Android job's original failure — `npm error could not determine executable to run` — was diagnosed and fixed after this restore. Root cause: the job ran `npx tauri android ...`, and `npx` on this project resolves against the npm registry rather than the locally installed `@tauri-apps/cli`, because this is a pnpm-managed workspace with no npm lockfile for `npx`'s local-bin check to key off. Reproducible directly: `npx tauri --version` fails with that exact error, `pnpm exec tauri --version` succeeds instantly. The Windows job never hit this because it invokes Tauri through `pnpm --filter ... run tauri:build` — pnpm's own script runner, not `npx` — which is very likely why Windows is this workflow's only recorded success and Android never has been, even six months ago. Fixed by swapping both `npx tauri android ...` calls to `pnpm exec tauri android ...`; nothing else about the job changed.

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
pnpm exec tauri android init --skip-targets-install
pnpm exec tauri android build
```

The repo's own `build.sh` / `build.bat` are a separate, more built-out path (cargo-ndk, keystore signing, highest-installed build-tools detection) — see those scripts directly if you need a signed APK. `build-release.yml` does not use them; it drives everything through the Tauri CLI instead.

## If a build fails

| Symptom | Likely cause |
|---|---|
| `gdk-3.0` / `webkit2gtk` not found | Not applicable to this workflow — it doesn't build Linux |
| `Cannot find module '@karaokenatin/shared'` | The shared-package build step failed or didn't run before the frontend build |
| Android job fails fast (under ~2 minutes) | Matches this workflow's entire history in this repo — see above. Check the job log for the actual first error rather than assuming NDK/Gradle |
| APK/installer missing from artifacts | `if-no-files-found: warn` on some upload steps means a missing file doesn't fail the job — check the "Find APK files" / "Verify build artifacts" step output |
