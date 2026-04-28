# Deployment Notes

This project is ready for a single public server that handles both:

- HTTP requests for the browser client
- WebSocket upgrades on `/ws` for realtime multiplayer

That means it can work like a typical `.io` game once it is reachable at a public HTTPS URL.

## Recommended platform: Render

This repo is now preconfigured for Render with [render.yaml](./render.yaml), which defines a public web service that:

- builds from the included `Dockerfile`
- exposes the app as one internet-facing URL
- uses `/health` for health checks
- works with the existing WebSocket endpoint at `/ws`

### Why Render for this project

- it matches the current single-service architecture well
- it provides a public HTTPS domain out of the box
- it supports WebSocket traffic for the same service that serves the browser client
- it works with the `render.yaml` file already added to this repo

### Render deployment flow

1. Push this project to a GitHub repository.
2. Sign in to Render and create a new Web Service from that repo.
3. Let Render apply the `render.yaml` settings.
4. Wait for the first deploy to finish.
5. Open the generated `onrender.com` URL and test room creation.

### Free-plan note

Render's free web services can spin down after idle time, which is fine for early friend-testing but not ideal for a polished always-on game link.

## What the host must support

- Node 24 or newer, or Docker
- inbound HTTP/HTTPS traffic
- WebSocket upgrades
- a public URL or domain name
- a `PORT` environment variable if the platform assigns one dynamically

## Option A: Run as a Node process

On a public machine or host:

```bash
PORT=3000 HOST=0.0.0.0 node server/index.mjs
```

If the hosting platform injects `PORT`, do not hardcode it. The server already reads `PORT` and `HOST`.

## Option B: Run as a container

Build:

```bash
docker build -t web-game-multiplayer .
```

Run:

```bash
docker run -p 3000:10000 web-game-multiplayer
```

## Reverse proxy notes

If you place this behind a proxy or load balancer:

- forward normal HTTP traffic to the Node app
- allow WebSocket upgrades on `/ws`
- terminate TLS at the proxy or platform edge

## Share flow

After deployment:

1. Open the public site in a browser.
2. Create a room.
3. Use the in-app `Copy Invite Link` button.
4. Send the resulting `https://your-domain/?room=AB23` link to friends.

## Current architecture limits

- room state is in memory only and resets when the server restarts
- this is a single-instance server; multiple app replicas would need shared room/state infrastructure
- there is no login, persistence, or reconnect token system yet

For a small first multiplayer game, a single public server is usually a perfectly good place to start.
