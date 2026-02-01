# KaraokeNatin - P2P Karaoke System

A local-network karaoke application using P2P/WebRTC "G-Cast" model with Tauri v2 Host and Next.js Web Client.

## Architecture

- **Host (Desktop)**: Tauri v2 (Rust/React) - Media player & state authority
- **Client (Mobile/Web)**: Next.js/Tailwind - Remote control interface
- **Signaling**: Node.js + Socket.io - Discovery & matchmaking
- **P2P**: WebRTC (PeerJS) - Low-latency command transmission

## Project Structure

```
KaraokeNatin/
├── apps/
│   ├── signaling-server/    # Socket.io signaling server
│   ├── host/                 # Tauri v2 desktop application
│   └── web-client/           # Next.js remote control
└── packages/
    └── shared/               # Shared TypeScript types
```

## Development

See [implementation_plan.md](brain/implementation_plan.md) for detailed architecture and development roadmap.

## Quick Start

```bash
# Install dependencies (requires Node.js)
npm install

# Run signaling server
npm run dev:signaling

# Run Tauri host (in separate terminal)
npm run dev:host

# Run web client (in separate terminal)
npm run dev:web
```

## Documentation

- [Implementation Plan](brain/implementation_plan.md) - Full technical specification
- [Task Tracking](brain/task.md) - Development progress
