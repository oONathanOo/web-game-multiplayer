# Multiplayer Web Game Starter

This workspace is set up as a genre-agnostic multiplayer starter that runs with the Node runtime already available in this environment. It gives us the hard parts we need before choosing the actual game:

- authoritative server simulation
- raw WebSocket networking
- room creation and joining
- shareable invite links
- shared client/server protocol helpers
- fixed-tick update loop
- browser sandbox for testing movement and sync
- built-in tests with `node --test`

## Project layout

- `server/` contains the HTTP server, WebSocket transport, and room/game state management
- `client/` contains the browser UI and sandbox renderer
- `shared/` contains protocol helpers and gameplay constants shared by both sides
- `tests/` contains unit tests for protocol and room management

## Running it

This machine currently has `node`, but no package manager on the shell path, so the starter is intentionally dependency-free.

Run the server:

```bash
node server/index.mjs
```

Run it with watch mode while iterating:

```bash
node --watch server/index.mjs
```

Then open [http://localhost:3000](http://localhost:3000).

Run tests:

```bash
node --test
```

## Current multiplayer foundation

- `GET /health` reports room and connection counts
- `WS /ws` handles realtime messages
- players can create rooms, join rooms, leave rooms, and toggle ready state
- room URLs like `/?room=AB23` auto-join and can be copied from the UI
- the server owns the truth for player positions
- clients send directional input only
- snapshots are broadcast on a fixed tick for all room members

## Public access

The networking model is already compatible with a public `.io`-style deployment:

- the same Node server serves both the webpage and the realtime socket endpoint
- the browser automatically connects back to the current host at `/ws`
- once this app is running behind a public HTTPS URL, players on different devices and different networks can join with the same browser link

The remaining external step is hosting it on a public machine or container service. This repo now includes:

- `Dockerfile` for container-based deployment
- `render.yaml` for one-click Render setup
- `Procfile` for simple process-based hosts
- `DEPLOYMENT.md` with generic public-hosting instructions

## Recommended host: Render

Render is the best fit for this starter because it supports public web services and inbound WebSocket connections on the same app, which matches this project's architecture.

Files included for that path:

- `render.yaml` creates a Render web service from this repo
- `Dockerfile` runs the app on Render's expected container port
- `/health` is already available for Render health checks

Once the repo is on GitHub, deployment is:

1. Create a new Web Service on Render.
2. Point it at this repository.
3. Render will detect `render.yaml` and provision the service.
4. Use the generated `onrender.com` URL as your game link.
5. Create a room and share the invite link from the in-app copy button.

If you use Render's free web-service plan, expect cold starts after idle periods. Upgrade the instance later if you want the link to feel more like a permanent `.io` game.

Once hosted, the invite flow is:

1. Open the public site.
2. Create a room.
3. Copy the invite link from the control panel.
4. Send that link to friends.

## Where we can go next

Once you pick the game type, we can plug in:

- actual rules and win conditions
- collision, projectiles, or abilities
- matchmaking or public lobbies
- persistence, accounts, or progression
- reconnection tokens and session recovery
- deployment packaging and production hosting
