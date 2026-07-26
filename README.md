# InkChain

A complete browser-based drawing-and-guessing party game foundation for 4–16 players.

## Included

- Room creation with a five-character code
- QR-code joining
- No accounts
- Duplicate-name numbering
- Host and automatic backup co-host
- Host may play or spectate
- Random nouns or player-written prompts
- 30–180 second optional timer
- Auto-submit of in-progress work when time expires
- Black-only or multicolor drawing
- Variable pen thickness and undo
- Ordered passing or randomized passing each turn
- Routing that guarantees every player receives every other booklet exactly once
- Synchronized turns and waiting screen
- Square vector drawing canvas that scales across devices
- Disconnected-player blank contributions
- Active-round reconnect using the same room code and name after disconnection
- Synchronized host-controlled review
- New-round warning when booklets remain unreviewed
- Same room code across rounds
- Empty-room expiration after 15 minutes

## Requirements

- Node.js 20 or newer
- npm

## Run locally

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

The local command serves the built client preview and live Socket.IO server. This avoids a Windows/Vite dev optimizer issue that can otherwise show a blank page in this sandboxed workspace.

The Socket.IO server runs at:

```text
http://localhost:3001
```

## Test on several devices on the same network

Find the development computer's local IPv4 address, then replace `localhost` with it.
For example:

```text
http://192.168.1.50:5173
```

Vite may need to be started with network access:

```bash
npm run dev -w server
npm run dev -w client -- --host 0.0.0.0
```

Also set the client server URL before starting the client:

Windows PowerShell:

```powershell
$env:VITE_SERVER_URL="http://192.168.1.50:3001"
npm run dev -w client -- --host 0.0.0.0
```

The server currently allows `http://localhost:5173` by default. For LAN testing, set:

```powershell
$env:CLIENT_ORIGIN="http://192.168.1.50:5173"
npm run dev -w server
```

## Production build

```bash
npm run build
npm start
```

The production server serves the built React client and Socket.IO game server from one Node process. See `DEPLOYMENT.md` for GitHub migration and global hosting notes.

## Important implementation note

Rooms are stored in the Node server's memory. Restarting the server clears active rooms. This is suitable for local/private testing. Redis can be added later if the app needs multiple server instances or room survival across server process restarts.
