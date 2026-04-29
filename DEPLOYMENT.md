# Deployment Notes

`Sunshard Siege` ships as a single Node service:

- HTTP serves the browser client
- WebSocket upgrades on `/ws` power realtime multiplayer

That makes deployment straightforward and keeps the original multiplayer infrastructure unchanged.

## Recommended platform: Render

This repo is already configured for Render through [render.yaml](./render.yaml).

Why Render fits this project well:

- one public HTTPS URL for the website and socket traffic
- clean support for the existing single-service architecture
- no need to split frontend and backend hosting
- good fit for small-room friend testing

## Render flow

1. Push the repo to GitHub.
2. Create a new Render Web Service from that repository.
3. Let Render apply the included `render.yaml`.
4. Wait for the first deploy to finish.
5. Open the generated public URL.
6. Create a room and share the invite link from the in-game UI.

## Local and production start command

```bash
PORT=3000 HOST=0.0.0.0 node server/index.mjs
```

If your host injects `PORT`, let it do so and avoid hardcoding the value.

## Container option

Build:

```bash
docker build -t sunshard-siege .
```

Run:

```bash
docker run -p 3000:10000 sunshard-siege
```

## Host requirements

- Node 24+ or Docker
- inbound HTTP/HTTPS
- WebSocket upgrades
- a public URL or custom domain

## Reverse proxy notes

If you deploy behind Nginx, Caddy, or another proxy:

- forward normal HTTP traffic to the Node app
- allow WebSocket upgrades on `/ws`
- terminate TLS at the proxy or hosting edge

## Current limits

- room and run state are in memory only
- a deploy or restart resets active rooms
- the app currently assumes a single running server instance

That is perfectly fine for the current phase: fast iteration, friend testing, and proving the full multiplayer game loop before investing in persistence or horizontal scaling.
