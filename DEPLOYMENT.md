# KaraokeNatin - Deployment Guide

## 📦 What to Ship

### 1. 🖥️ Desktop Application (Host)
**For**: Karaoke venue owner or home user with TV/projector

**Build Command**:
```powershell
# From project root:
build.bat windows

# Or manually:
cd apps\host
pnpm tauri build
```

**Output**:
- NSIS: `src-tauri\target\release\bundle\nsis\KaraokeNatin_0.2.0_x64-setup.exe`
- MSI: `src-tauri\target\release\bundle\msi\KaraokeNatin_0.2.0_x64_en-US.msi`

**Distribution**:
- Share the `.exe` or `.msi` installer file
- User installs it on their Windows PC
- App runs locally, no internet required (except for YouTube)

---

### 2. 📱 Android Application (Host - Phone & TV)
**For**: Android phone/tablet host or Android TV

**Prerequisites**:
- Android SDK with platform 36 and build-tools 36
- Android NDK 27
- Java JDK 21+
- [cargo-ndk](https://github.com/nickelc/cargo-ndk) (`cargo install cargo-ndk`)
- Rust Android targets (`rustup target add aarch64-linux-android`)

**Build Command**:
```powershell
# From project root:
build.bat android

# Or manually:
cd apps\host\src-tauri
cargo ndk -t arm64-v8a -o gen/android/app/src/main/jniLibs build --release --lib --features tauri/custom-protocol
cd gen\android
.\gradlew.bat assembleArm64Release -x rustBuildArm64Release -x rustBuildUniversalRelease
```

**Sign the APK**:
```powershell
build.bat sign
```

**Output**:
- Unsigned: `src-tauri/gen/android/app/build/outputs/apk/arm64/release/app-arm64-release-unsigned.apk`
- Signed: `KaraokeNatin-arm64-release.apk` (project root, after signing)

**Distribution**:
- Share the `.apk` for sideloading on phones/tablets
- For Android TV: DPAD navigation is built in

---

### 3. 📱 Web Client (Remote Control Website)
**For**: Karaoke singers accessing from their phones

**Build Command**:
```powershell
cd C:\Users\Noju\Projects\KaraokeNatin\apps\web-client
pnpm build
```

**Output**: `/.next` folder (Next.js production build)

**Deployment Options**:

#### Option A: Vercel (Recommended - Free)
```powershell
# Install Vercel CLI
npm i -g vercel

# Deploy
cd apps/web-client
vercel --prod
```
Result: `https://karaoke-natin.vercel.app`

#### Option B: Netlify
- Connect GitHub repo
- Build command: `cd apps/web-client && pnpm build`
- Publish directory: `apps/web-client/.next`

#### Option C: Self-hosted
```powershell
cd apps/web-client
pnpm build
pnpm start
```
Run on VPS with PM2 or Docker

---

### 3. ☁️ Signaling Server
**For**: Backend service that connects hosts and clients

**Build Command**:
```powershell
cd C:\Users\Noju\Projects\KaraokeNatin\apps\signaling-server
pnpm build
```

**Deployment Options**:

#### Option A: Railway (Recommended - Free Tier)
1. Create account at https://railway.app
2. Click "New Project" → "Deploy from GitHub"
3. Select your repo
4. Set root directory: `apps/signaling-server`
5. Railway auto-detects Node.js

#### Option B: Heroku
```powershell
heroku create karaoke-signaling
git subtree push --prefix apps/signaling-server heroku main
```

#### Option C: DigitalOcean/AWS/VPS
```bash
# On server
git clone <your-repo>
cd apps/signaling-server
npm install
npm start
```

Use PM2 for process management:
```bash
npm i -g pm2
pm2 start dist/index.js --name signaling-server
pm2 save
```

---

## 🔧 Configuration After Deployment

### Update Web Client Environment
Create `apps/web-client/.env.production`:
```env
NEXT_PUBLIC_SIGNALING_SERVER_URL=https://your-signaling-server.railway.app
```

### Update Desktop App
Edit `apps/host/src/lib/usePeerHost.ts`:
```typescript
const SIGNALING_SERVER_URL = 'https://your-signaling-server.railway.app';
```

Then rebuild the desktop app.

---

## 🚀 Recommended Deployment Strategy

### For Public Use:

1. **Deploy Signaling Server** → Railway (free, always online)
   - URL: `https://karaoke-signaling.railway.app`

2. **Deploy Web Client** → Vercel (free, global CDN)
   - URL: `https://karaoke-natin.vercel.app`

3. **Build Desktop App** → GitHub Releases
   - Upload `.msi` installer
   - Users download and install on their PCs

### For Private/Local Use:

1. **Skip cloud deployment**
2. **Run signaling server locally**:
   ```powershell
   # On host PC
   cd apps/signaling-server
   pnpm start
   ```

3. **Access web client via local network**:
   ```powershell
   cd apps/web-client
   pnpm build
   pnpm start
   # Access at http://192.168.1.X:3000
   ```

4. **Desktop app** connects to `localhost:3001`

---

## 📊 System Requirements

### Desktop Application
- **OS**: Windows 10/11
- **RAM**: 4GB minimum
- **Storage**: 500MB
- **Network**: Internet for YouTube, local network for P2P

### Android Application
- **OS**: Android 7.0+ (API 24)
- **Architecture**: arm64-v8a (most modern Android devices)
- **RAM**: 2GB minimum
- **Network**: Internet for YouTube, local Wi-Fi for P2P

### Web Client Users
- **Device**: Any smartphone/tablet with modern browser
- **Browser**: Chrome, Safari, Firefox, Edge (last 2 versions)
- **Network**: Same WiFi network as desktop host

### Signaling Server
- **Platform**: Any Node.js 18+ environment
- **Memory**: 256MB minimum
- **Bandwidth**: ~1KB per connection (very light)

---

## 🔐 Security Notes

1. **Join Tokens**: Automatically generated and expire after 12 hours
2. **Local P2P**: All video/audio stays on local network (not through server)
3. **HTTPS**: Required for web client in production (WebRTC requirement)
4. **CORS**: Configure in signaling server for your domain

---

## 📝 Summary

| Component | Type | Where to Deploy | Cost |
|-----------|------|-----------------|------|
| **Desktop App** | Installer | User's PC (Windows) | Free |
| **Android App** | APK | Phone/Tablet/Android TV | Free |
| **Web Client** | Website | Vercel/Netlify | Free |
| **Signaling Server** | Backend | Railway/Heroku | Free Tier |

**Total Cost**: $0 for basic deployment! 🎉
