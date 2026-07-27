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

## Scaling note

Rooms are currently stored in server memory. That is fine for a first hosted version with one server instance. Before running multiple instances, add Redis or another shared room store and configure sticky WebSocket sessions if your host requires them.
