# KaraokeNatin Signaling Server

Socket.io-based signaling server for WebRTC peer discovery and room management.

## Features

- Room creation and matchmaking
- Cryptographic join token validation (SHA-256)
- Automatic room cleanup (12-hour TTL)
- Connection capacity limits (10 clients per room)
- Host/client disconnect handling

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Run production build
npm start
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

- `PORT` - Server port (default: 3001)
- `CORS_ORIGIN` - Allowed CORS origin (default: *)

## Architecture

See [../../brain/implementation_plan.md](../../brain/implementation_plan.md) for protocol details.
