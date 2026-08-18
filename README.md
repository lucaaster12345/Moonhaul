# MOONHAUL

MOONHAUL is a persistent collaborative Twitch idle game about the city machine that physically hauls the Moon across the sky. Twitch chat operates four departments, individual workers persist across restarts, and spectacular failures permanently alter the world instead of ending the game.

The MVP is deliberately light: one Node.js service, one SQLite database, a React control room, Server-Sent Events for live updates, and an optional CPU-only Chromium/FFmpeg stream worker.

```text
            ◯ MOON                 ACTIVE ORDER
            │                      CABLE SLIP DETECTED
            │ CABLE                TYPE !BRACE
       ╔════╩════╗                 00:38 REMAINING
       ║ WINCH III║
       ╚═════════╝                 HEAT      ███████░
                                   TENSION   ███████░
```

## What is implemented

- Continuous 1-second simulation with bounded offline progression and a skeleton-crew autopilot.
- Persistent Moon, machine, resources, shifts, workers, contribution history, scars, event history, configuration, processed message IDs, audit logs, and snapshot metadata.
- A pure, seeded game engine that runs without Twitch, HTTP, React, or a database.
- Whitelisted commands, stamina, per-player cooldowns, veteran bonuses capped at 50%, duplicate-message protection, message limits, and a short-window contribution cap.
- Four stations: Winch, Boiler, Cooling, and Signal Room.
- Fifteen data-driven events, timed command windows, unique-player thresholds, weighted voting, prerequisites, cooldowns, failures, rewards, follow-up metadata, and catastrophic recovery.
- A 1280×720 Twitch/OBS overlay with a paused-shift telemetry screen.
- Accepted Twitch commands receive a threaded chat confirmation and a short-lived overlay confirmation; rejected commands are surfaced on the overlay.
- Authenticated admin UI with live controls, state/config/event editors, worker administration, mock chat, load bots, chaos buttons, audit history, snapshots, and protected two-stage wipe.
- Current Twitch EventSub WebSocket input, Twitch Chat API output, and automatic incident-aware channel titles behind a provider adapter.
- Docker deployment and an optional no-GPU stream worker using Xvfb, Chromium software rendering, FFmpeg, and `libx264`.

## Architecture

```text
Twitch EventSub ─┐
                 ├─ ChatProvider → normalized message → command pipeline
Admin mock chat ─┘                                      │
                                                       ▼
React UI ← SSE ← Fastify API ← GameEngine → SQLite (WAL)
                    │                    └→ events / scars / milestones
                    └→ snapshots, admin audit, configuration
```

- `packages/game-engine` — deterministic simulation, commands, configuration, and event definitions.
- `packages/database` — SQLite migration and transactional repository.
- `packages/chat` — `MockChatProvider` and `TwitchChatProvider`.
- `server` — Fastify API, authentication, SSE, ticking, backups, and service lifecycle.
- `src` — lightweight React Twitch overlay and admin console.
- `scripts` — migration, fast simulation, and CPU-only Twitch stream worker.

## Requirements

- Node.js 22.13 or newer.
- npm.
- No Twitch account in mock mode.
- Docker is optional.
- The optional native stream worker needs Linux packages supplied by `docker/stream.Dockerfile`, or local Chromium, Xvfb, and FFmpeg equivalents.

## Quick local setup

```bash
cp .env.example .env
npm install
npm run dev
```

On PowerShell, copy the environment file with:

```powershell
Copy-Item .env.example .env
```

Open:

- `http://localhost:3000/stream` — Twitch/OBS overlay
- `http://localhost:3000/admin` — supervisor console

The root URL redirects to `/stream`; the removed public website pages return 404.

The example admin login is `admin` / `change-me`. Change `ADMIN_PASSWORD` and `SESSION_SECRET` before exposing the service.

Development runs the game API on port 3001 and the Vite UI on port 3000 with an internal proxy. Production uses one Fastify process on port 3000.

## Mock chat

Mock mode is the default. In `/admin`, open the Overview and use the Mock Chat Injector:

```text
user ID:      10001
display name: RatKing
message:      !haul
```

The command passes through the same normalization, duplicate checking, command parsing, stamina, cooldown, game-engine, persistence, and live-update pipeline used by Twitch. The same panel can spawn up to 500 simulated workers; they choose normal work commands or active-event choices.

## Twitch integration

Set `CHAT_PROVIDER=twitch` and fill the Twitch variables in `.env`. MOONHAUL receives `channel.chat.message` through EventSub WebSockets, sends compact `!help`, `!status`, and `!join` responses through `POST /helix/chat/messages`, and updates the channel title through `PATCH /helix/channels` as incidents activate and deactivate; it does not use legacy IRC. See [TWITCH_SETUP.md](./TWITCH_SETUP.md) for the current flow, scopes, IDs, token validation, and troubleshooting.

## Commands

```text
General: !join !status !help !work
Winch:   !haul !brace !release !grease
Boiler:  !stoke !shovel !dampen
Cooling: !vent !cool !flush
Signal:  !tune !listen !signal
```

Event commands are recognized only while their event is active. `!help boiler`, `!help cooling`, `!help winch`, and `!help signal` return focused help.

## Admin panel

The supervisor console provides:

- pause, resume, and one-tick controls;
- live Moon/machine/resource editing with an audit trail;
- typed, bounded, categorized gameplay-variable editing and reset controls;
- event enable/disable, weights, cooldowns, prerequisites, choices, trigger, and cancel controls;
- worker search, progression/status/inventory edits, temporary disable, reset, and delete;
- manual snapshots, recent errors, connected-client count, database size, and Twitch status;
- deliberate chaos controls for Moon drops, repairs, gravity, rare/catastrophic events, emergency shifts, large/second Moons, and resources.

Admin sessions use a signed, HTTP-only, SameSite cookie. Production cookies are Secure. Login is rate-limited, all state-changing admin calls require a per-session CSRF token, and Twitch secrets never enter browser responses or gameplay configuration.

## Twitch overlay

`/stream` is the only public presentation surface: a fixed, readable 16:9 control-panel composition made entirely with HTML and CSS. It uses no WebGL, 3D renderer, shaders, or particle system. It is suitable as an OBS Browser Source at 1280×720.

To transmit from a Linux host without a GPU, set `TWITCH_STREAM_KEY` and run:

```bash
docker compose --profile stream up -d --build
```

The stream profile captures `/stream` at 15 FPS by default and encodes with CPU `libx264`. The main game container does not include Chromium or FFmpeg.

## Database, restart safety, and backups

SQLite runs in WAL mode with foreign keys, a busy timeout, transactions, migrations, indexes for leaderboard/history paths, and `PRAGMA optimize` on clean shutdown. The database and backups live in `./data` and `./backups`, both persisted by Docker Compose.

On startup, the service migrates, loads the stored world, applies bounded aggregate offline progression, reconnects chat, and resumes ticking. It never resets normal progress.

Use **Create Snapshot** in the admin panel. A consistent timestamped SQLite copy is also created automatically every `backups.interval_hours` and immediately before a wipe.

To restore:

1. Stop MOONHAUL.
2. Copy the selected snapshot over the path in `DATABASE_PATH`.
3. Remove stale `-wal` and `-shm` sidecar files only while the service is stopped.
4. Start MOONHAUL and check `/api/health`.

## Configuration

Balance numbers live in `CONFIG_DEFINITIONS` and are stored in `game_config`. The admin editor includes type, description, current/default value, and numeric limits. Important categories include simulation, Moon, Winch, Boiler, Cooling, player, events, autopilot, and backups.

Environment variables are reserved for secrets and process/deployment settings. They are never exposed in the gameplay editor.

## Simulation and tests

```bash
npm test
npm run simulate -- --hours 24 --players 100 --seed 12345
npm run simulate -- --commands 1000 --players 25
npm run simulate -- --until-catastrophe --players 1 --seed 42
npm run build
```

Simulation output includes ticks, Moon altitude/progress, actions attempted/accepted, events, failures, catastrophes, resource consumption, and average machine condition.

Tests cover ticking, Moon movement, stamina, cooldowns, event activation/voting/resolution, resource consumption, catastrophic recovery, offline progression, player creation, configuration validation, SQLite persistence, duplicate IDs, snapshots, wipe, and mock chat.

## API overview

The overlay uses `/api/state` and `/api/live`; `/api/health` is available for deployment checks. Worker search is admin-authenticated, and all `/api/admin/*` mutation endpoints require authentication and CSRF validation. The removed public website endpoints are no longer exposed.

## VPS deployment

See [RUNNING.md](./RUNNING.md) for exact local, Twitch, Docker Compose, non-Docker, streaming, log, stop, and restart commands. A 2-core, 2–4 GB VPS is appropriate for the main service. The optional browser/encoder process is the CPU-heavy component.

## Troubleshooting

- **Admin login fails:** confirm `.env` was created and restart after changing admin variables.
- **Twitch is disconnected:** validate the user token, scopes, bot/broadcaster IDs, and bot moderation status using `TWITCH_SETUP.md`.
- **Commands are ignored:** messages must begin with a whitelisted `!command`; check cooldown, stamina, duplicate ID, disable status, and contribution cap.
- **The stream worker exits:** verify `TWITCH_STREAM_KEY`, ensure the main health check passes, and inspect `docker compose logs stream`.
- **Port 3000 is occupied:** stop the other service or change `PORT` for production; development expects its web surface on 3000.
- **A snapshot will not restore:** stop the process first and make sure the configured database path points to the copied file.

The machine is expected to crash eventually. The Moon is expected to behave worse.
