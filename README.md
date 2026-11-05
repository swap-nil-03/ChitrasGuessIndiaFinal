# ChitraGuess India

A multiplayer Indian drawing-and-guessing game MVP built with React, Vite, TypeScript, Express, Socket.IO and SQLite.

## Requirements

- Node.js 22 LTS (tested locally with Node 22.23.4)
- npm 10+
- Windows 10/11, macOS or Linux

## Install and run on Windows

From PowerShell in the project root:

```powershell
npm.cmd install
npm.cmd run dev
```

Open `http://localhost:5173` on the laptop.

### Test from a phone on the same Wi-Fi

The Vite frontend is configured to listen on `0.0.0.0`. The browser client automatically uses the same hostname as the frontend and port `3001` for the Socket.IO backend. For example, if Vite displays `http://192.168.0.7:5173`, the phone will connect to `http://192.168.0.7:3001`.

1. Connect the phone and laptop to the same non-guest Wi-Fi network.
2. Start the app using `npm.cmd run dev` from the repository root.
3. In an Administrator PowerShell window, allow the backend port through Windows Firewall (Private networks only):

   ```powershell
   New-NetFirewallRule -DisplayName "ChitraGuess API 3001" -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow -Profile Private
   ```

4. On the laptop, run `ipconfig` and confirm the Wi-Fi IPv4 address. Use that address in the phone browser, e.g. `http://192.168.0.7:5173`.
5. Before opening the game on the phone, test `http://192.168.0.7:3001/health`. It should return JSON with `status: "ok"`.
6. If the health endpoint does not open, check the Windows Firewall rule, confirm the server terminal says it is listening on port 3001, and disable router/AP client isolation or guest Wi-Fi isolation.

If the laptop's LAN IP changes, the automatic same-hostname connection continues to work as long as you open the frontend using the new IP.

### Optional fixed backend URL

Copy `client/.env.example` to `client/.env.local` and set `VITE_SERVER_URL=http://YOUR-LAPTOP-LAN-IP:3001`. Restart Vite after changing Vite environment variables. Usually this is not required because the app derives the backend hostname from the frontend URL.

## Production build

```powershell
npm.cmd run build
```

The server build is generated in `server/dist`; the frontend build is generated in `client/dist`.

## Render deployment

Use two Render services connected to the same GitHub repository.

### Backend Web Service

- Root Directory: `server`
- Build Command: `npm install && npm run build`
- Start Command: `npm start`
- Instance: Free for testing
- Environment:
  - `NODE_ENV=production`
  - `CLIENT_ORIGIN=https://YOUR-FRONTEND.onrender.com`
  - `NODE_VERSION=22.23.4`
  - Optional `PORT` is provided by Render automatically.
- Health Check Path: `/health`

### Frontend Static Site

- Root Directory: `client`
- Build Command: `npm install && npm run build`
- Publish Directory: `dist`
- Environment:
  - `VITE_SERVER_URL=https://YOUR-BACKEND.onrender.com`

After deploying the frontend, set the exact frontend origin in the backend's `CLIENT_ORIGIN` environment variable and redeploy the backend.

**Free-tier warning:** Render free web services use an ephemeral filesystem and spin down after inactivity. SQLite data in this MVP is temporary and can be lost after restarts, spin-downs or redeploys. Free instances are intended for testing, not production. Do not store personal or important user data in this beta.

## Security included in this beta update

- Helmet HTTP security headers and disabled `X-Powered-By`.
- HTTP request rate limiting and a JSON body size limit.
- Exact production frontend-origin allowlist for HTTP and Socket.IO CORS.
- Socket.IO payload size limit, per-event payload checks and per-socket event throttling.
- Server-side checks for room membership, game phase, drawer identity, selected words and scoring.
- Name/chat sanitization and bounded message lengths.
- Seven-character random room codes and room/player capacity limits.
- Socket.IO connection-state recovery plus a 90-second reconnect grace period so short mobile network drops do not immediately remove the host or close a room.
- Active drawing stroke history replay after a recovered socket reconnects.
- `/health` and `/api/health` endpoints.

This is a beta hardening pass, not a security audit or guarantee against attacks. Reconnect recovery only works for short interruptions within the configured recovery window and same server process; refreshing/closing the tab may still lose the client-side connection state on some browsers. The 90-second grace period delays player cleanup but does not provide durable accounts or cross-server recovery. Before a wider public launch, add persistent shared state, abuse reporting/moderation, stronger IP-level abuse controls, monitoring, backups and professional penetration testing. The in-memory room state is single-process only.

## Gameplay and mobile updates

- Drawing rounds are now 120 seconds (previously 80 seconds).
- Hints are delayed and reveal only a limited number of characters; the drawer does not see the hint.
- Mobile portrait layout has a fixed bottom guess bar so players can submit guesses without losing the drawing; the chat message list scrolls internally rather than scrolling the whole page.
- Mobile landscape layout places drawing and chat side-by-side.
- Share Room uses the native share sheet where supported, otherwise copies a share URL and room code. The URL pre-fills the room code on the join screen.
- Browser Back is intercepted while a room is active; use the in-game Leave Room button to exit. A page-close confirmation is requested where the browser supports it.
- Expanded popular Hindi/Marathi movie and song title lists, plus an Indian States & Cities category containing state/city pairs.

## Important limitations

- Maximum 8 players per room.
- Game rooms and active state live in server memory; restarting the backend ends active games.
- SQLite history is temporary on Render Free.
- One backend instance only; this version is not horizontally scalable.
- Android APK generation is not included in this package; the web app is mobile responsive/PWA-ready.

## v4 gameplay and language improvements
- The final leaderboard appears in a fixed result dialog as soon as the last round ends. The host can choose **Play Again**; every player can choose **Exit**.
- Each player earns points once when their accepted answer is correct. The drawer receives a small teamwork bonus for each correct guess.
- On portrait phones, live chat is placed above the drawing board and newest messages are shown first.
- The **Everyday Objects** category includes familiar rooms, household items, roads, vehicles and nature words.
- Hindi and Marathi Devanagari aliases are supported for many common objects and Indian movie, song, festival, city, culture and cricket answers. English guesses remain supported.
