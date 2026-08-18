# Running MOONHAUL

## RUN LOCALLY WITHOUT TWITCH

```bash
cp .env.example .env
npm install
npm run dev
```

PowerShell equivalent for the copy step:

```powershell
Copy-Item .env.example .env
```

Open `http://localhost:3000/stream` for the Twitch overlay and `http://localhost:3000/admin` for the supervisor console. Mock chat is ready immediately. Stop with `Ctrl+C`.

## RUN LOCALLY WITH TWITCH

Complete `TWITCH_SETUP.md`, then set these values in `.env`:

```env
CHAT_PROVIDER=twitch
TWITCH_CLIENT_ID=...
TWITCH_CLIENT_SECRET=...
TWITCH_BROADCASTER_ID=...
TWITCH_BOT_USER_ID=...
TWITCH_ACCESS_TOKEN=...
TWITCH_REFRESH_TOKEN=...
TWITCH_BROADCAST_ACCESS_TOKEN=...
TWITCH_BROADCAST_REFRESH_TOKEN=...
```

The `TWITCH_BROADCAST_*` pair belongs to the broadcaster and requires `channel:manage:broadcast` so incident titles can update automatically. It may be left blank only when the broadcaster and bot are the same account and the main token already has that scope.

Start:

```bash
npm run dev
```

Check `http://localhost:3000/api/health` and the Twitch status in `/admin`.

## RUN ON A VPS

Docker Compose:

```bash
cp .env.example .env
nano .env
docker compose up -d --build
docker compose ps
docker compose logs -f moonhaul
```

For a direct HTTP VPS setup, keep `PUBLIC_BASE_URL` as `http://YOUR_VPS_IP:3000`; use an `https://` URL only after putting the admin console behind TLS. The player configuration editor includes `player.command_cooldown_seconds` (5 by default).

Stop, start, and restart:

```bash
docker compose stop
docker compose start
docker compose restart moonhaul
```

Upgrade after pulling new code:

```bash
docker compose up -d --build
```

Non-Docker:

```bash
cp .env.example .env
nano .env
npm ci
npm run build
NODE_ENV=production npm start
```

Run the last command under systemd, Supervisor, or another process manager for automatic restart. Keep `data/` and `backups/` on persistent storage.

## START THE TWITCH STREAM

OBS: add `http://YOUR_HOST:3000/stream` as a 1280×720 Browser Source.

CPU-only Docker stream worker:

```bash
# Set TWITCH_STREAM_KEY in .env first.
docker compose --profile stream up -d --build
docker compose logs -f stream
```

Stop, start, and restart the stream worker:

```bash
docker compose stop stream
docker compose --profile stream start stream
docker compose restart stream
```

Direct Linux execution, with Chromium, Xvfb, and FFmpeg installed:

```bash
TWITCH_STREAM_KEY=... npm run stream
```
