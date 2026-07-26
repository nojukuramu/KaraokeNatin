# Deployment

## What ships

**One artifact: the host application.** Guests install nothing — they scan a QR code and the host serves them the remote UI from its own embedded web server.

Earlier versions of this document described deploying a Next.js web client to Vercel/Netlify and a Node signaling server to Railway/Heroku. Both of those applications have been deleted: signaling is now native Rust inside the host process, and the guest UI is compiled into the host binary. There is nothing to deploy to a cloud provider, and no running cost.

## Desktop

```bash
pnpm run build
```

Or, from `apps/host`: `pnpm tauri build`.

Output lands in `apps/host/src-tauri/target/release/bundle/`.

**Windows**
- `nsis/KaraokeNatin_<version>_x64-setup.exe`
- `msi/KaraokeNatin_<version>_x64_en-US.msi`

**Linux**
- `deb/karaokenatin_<version>_amd64.deb`
- `appimage/karaokenatin_<version>_amd64.AppImage`

Linux builds need the GTK/WebKit development headers listed in `QUICK_START.md`. AppImage builds bundle the media framework, because WebKit relies on GStreamer for playback and a stock system may lack the codecs.

## Android

Prerequisites:
- Android SDK (platform 36) and build-tools
- Android NDK 27
- JDK 21+
- `cargo install cargo-ndk`
- `rustup target add aarch64-linux-android`

```bash
./build.sh android           # unsigned
./build.sh android_signed    # signed with your keystore
```

`build.bat` is the Windows equivalent. Both select the highest installed build-tools version rather than pinning one, so an SDK upgrade does not break the build.

Signing configuration comes from `.env` (see `.env.example`): `KEYSTORE_PATH`, `KEYSTORE_ALIAS`, `KARAOKE_KS_PASS`. Keystores are gitignored — do not commit one.

## Network requirements

The host binds `0.0.0.0` on a random port in 49152–65535 and advertises its LAN address via the QR code.

- **Guests must be on the same network as the host.** Access points with client isolation — common on venue and guest Wi-Fi — block guest-to-host traffic entirely, and no amount of configuration in the app works around it.
- **Internet is needed for YouTube playback and search**, since the app streams from YouTube. Everything else — the guest UI, signaling, and the WebRTC handshake — is served locally and works without it.
- Beyond allowing the app to accept LAN connections (Windows prompts on first run), no firewall configuration is needed.

## Security notes

- Guests authenticate with a join token carried in the QR URL, verified on every join. Sharing that URL shares access, and so does sharing a photo of the QR code.
- LAN traffic is plain HTTP. On Android this requires `cleartextTrafficPermitted`; the reasoning and what it would take to remove that requirement are documented in `gen/android/app/src/main/res/xml/network_security_config.xml`.
- Media and commands travel peer-to-peer over WebRTC; the host relays only the signaling handshake, locally.
- The threat model is "someone else on your Wi-Fi", not the public internet. **Do not port-forward the host.** Nothing in it is hardened for internet exposure.

## System requirements

| | Minimum |
|---|---|
| Windows | 10 1803+, WebView2 runtime, 4 GB RAM |
| Linux | glibc 2.31+, GTK 3, WebKit2GTK 4.1, 4 GB RAM |
| Android | 7.0 (API 24), arm64-v8a, 2 GB RAM |
| Guest devices | Any browser with WebRTC — no install |
