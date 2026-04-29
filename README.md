# Sunshard Siege

`Sunshard Siege` is a complete multiplayer browser game built on the existing room-based WebSocket stack in this repo.

It is a co-op top-down action roguelite defense game inspired by `Hades`: fast short runs, readable combat, escalating waves, and between-wave upgrades all fit the existing authoritative multiplayer foundation especially well.

## Core concept

Wardens defend the Sunshard relic at the center of a sacred garden. Each run is a five-wave siege:

- survive enemy assaults and keep the relic alive
- fire `Sun Bolts`, dash through danger, drop `Relay Beacons`, plant `Sun Spires`, and trigger `Star Nova`
- collect dropped motes to boost score and sustain the relic
- choose one blessing between waves to shape the run
- defeat the final boss to clear the garden

The signature mechanic is the radiant tether. Every player drags a burning beam from their character back to the relic, or to their active beacon. Enemies that cross that line take damage, so positioning matters as much as aiming.

## Inspiration

- `Hades`

Why this fit:

- its top-down combat language is easy to read in a browser
- short wave-based runs work cleanly with invite-link multiplayer
- upgrade drafting between encounters creates meaningful progression without adding persistence complexity

## What is implemented

### Gameplay systems

- authoritative server-side simulation
- room creation, joining, leaving, and ready-state flow
- countdown, run, intermission, victory, and defeat phases
- five authored waves including a boss finale
- multiple enemy archetypes:
  - `Skulk` rushers
  - `Brute` tanks
  - `Spitter` ranged enemies
  - `Moth` burst divers
  - `Thorn Sovereign` boss
- four player abilities:
  - `Sun Bolt`
  - `Ash Dash`
  - `Relay Beacon`
  - `Sun Spire`
  - `Star Nova`
- blessing draft progression with multiple upgrade choices between waves
- mote pickup economy, score tracking, kills, relic health, and respawns

### Multiplayer relevance

- one shared relic objective for the whole room
- invite links like `/?room=AB23`
- same-origin WebSocket multiplayer on `/ws`
- shared enemy pressure and positioning-based beam damage
- fully playable solo while still designed for co-op rooms

### Visual identity

- custom bright fantasy UI instead of placeholder neon styling
- canvas-rendered environment, relic, players, enemies, projectiles, pickups, and tethers
- game-specific HUD, overlays, ability bar, roster, and run briefing panels

## Controls

- `WASD` or arrow keys: move
- mouse: aim
- hold mouse button: fire `Sun Bolt`
- `Space`: `Ash Dash`
- `E`: `Relay Beacon`
- `R`: `Sun Spire`
- `Q`: `Star Nova`
- `1 / 2 / 3`: choose a blessing during intermission
- `Enter`: toggle ready while in a room

## Project layout

- `server/` contains the HTTP server, WebSocket transport, and room orchestration
- `shared/` contains the protocol, game definitions, and authoritative simulation
- `client/` contains the UI, network client, input handling, and canvas renderer
- `tests/` contains protocol, room-manager, and simulation tests

## Run locally

This project is dependency-free and runs with the Node runtime already available in this environment.

Start the server:

```bash
node server/index.mjs
```

Optional watch mode:

```bash
node --watch server/index.mjs
```

Then open:

- [http://localhost:3000](http://localhost:3000)

Run tests:

```bash
node --test
```

## Multiplayer architecture

The original multiplayer base remains intact:

- `GET /health` exposes basic service health
- `WS /ws` handles realtime room traffic
- the server is authoritative for room state and gameplay state
- the client sends inputs, not gameplay truth
- snapshots are broadcast on a fixed tick to every room member

That means this game can still be deployed with the same `.io` style flow: one public URL for the page and one same-origin WebSocket endpoint for live play.

## Deployment

This repo still includes:

- `Dockerfile`
- `Procfile`
- `render.yaml`
- [DEPLOYMENT.md](./DEPLOYMENT.md)

Render remains a good fit for sharing the game publicly with friends because the app is one combined HTTP + WebSocket service.
