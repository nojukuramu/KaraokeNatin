# KaraokeNatin Web Client

Next.js-based remote control interface for KaraokeNatin P2P Karaoke system.

## Features

- QR code join flow
- P2P WebRTC connection via PeerJS
- Real-time playback controls
- Song queue display
- Responsive mobile-first design

## Development

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`

## Environment

The web client connects to:
- Signaling server: `http://localhost:3001`
- Host peer via WebRTC (discovered through signaling)

## Usage

1. Scan QR code from host application
2. Enter your display name
3. Control playback from your device

## Design

Built with:
- Next.js 14 (App Router)
- Tailwind CSS
- PeerJS for WebRTC
- Zustand for state management
