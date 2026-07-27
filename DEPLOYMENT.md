# InkChain Deployment Notes

## Recommended first global host

Deploy this as one Node web service. The production server serves both:

- the built React client from `client/dist`
- the Socket.IO game server

That keeps room codes, QR links, and sockets on the same public origin.

## GitHub migration checklist

1. Create a new GitHub repository.
2. Copy this project into the repository root.
3. Run `npm install`.
4. Commit the source files, `package-lock.json`, `.env.example`, and `.github/workflows/ci.yml`.
5. Do not commit `node_modules`, `dist`, or `.env`.
6. Push to `main` and confirm the GitHub Actions CI build passes.

## Production commands

Use these settings on a Node host such as Render, Railway, Fly.io, or a VPS:

```bash
npm ci
npm run build
npm start
```

Set the service start command to:

```bash
npm start
```

Set `PORT` only if your host does not provide one automatically.

## Environment variables

`ALLOWED_ORIGINS` is optional for early testing. For a public app, set it to your hosted URL:

```text
ALLOWED_ORIGINS=https://your-app.example.com
```

Leave `VITE_SERVER_URL` unset when the client and server are hosted together. Set it only if the client is hosted separately from the Socket.IO server.

`REDIS_URL` is optional locally, but recommended for public hosting. On Render, add a Redis instance, copy its internal Redis URL, and set it as:

```text
REDIS_URL=redis://...
```

## Scaling note

Rooms are stored in server memory and, when `REDIS_URL` is set, mirrored to Redis. Redis helps rooms survive server restarts and free-tier instance replacements. Before running multiple web instances, also configure sticky WebSocket sessions if your host requires them.

## Render free-tier connectivity note

The client sends periodic room heartbeats and can resync/rejoin after a dropped Socket.IO connection. This helps with normal mobile network changes and Render connection interruptions. If a free Render instance spins down, restarts, or is replaced, Redis-backed room storage gives players a better chance to recover the same room after refreshing.
