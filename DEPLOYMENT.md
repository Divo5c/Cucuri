# Cucuri — Deployment (Render)

## Build & Start (Render)
- **Build Command:** `npm install`
- **Start Command:** `npm start` (`node server.js`, bindet auf `0.0.0.0:$PORT`)
- **Node:** `22.22.1` (aus `package.json` engines, Render `NODE_VERSION`)
- **Health Check:** `GET /` → `200`

## Environment Variables (Render Dashboard → Environment)

| Variable | Beschreibung | Beispiel / Hinweis |
|---|---|---|
| `PORT` | Von Render gesetzt, nicht manuell | `10000` |
| `MONGO_URI` | MongoDB Atlas Connection String | `mongodb+srv://...` **(secret, nie committen)** |
| `PUBLIC_WORLD_ENABLED` | `false` = nur Divo sieht Welt, `true` = alle | `false` |
| `ALLOW_TEST_BYPASS` | Nur für E2E `Tmp*` Welt-Bypass, **Production `false`/unset** | nicht setzen |
| `CORS_ORIGIN` | Komma-getrennte erlaubte Origins für Production, z.B. Render-Domain | `https://cucuri.onrender.com` |
| `NODE_VERSION` | Pinnt Node | `22.22.1` |

**Niemals committen:** `MONGO_URI`, `TURN_*`, `ADMIN_SECRET` falls vorhanden.

## CORS / HTTPS / WebSocket
- Render terminiert HTTPS, `socket.io` nutzt `wss://` automatisch.
- `server.js` nutzt `CORS_ORIGIN` (komma-getrennt) falls gesetzt, sonst `NODE_ENV=production` → `origin: true` (keine Wildcard), Development → `origin: "*"` (localhost).

## Voice / WebRTC
- Signaling (`voiceRoomsList`, `joinVoiceRoom`, `offer/answer/ICE`, `voicePresence`) funktioniert hinter Render-HTTPS via `wss`.
- STUN/TURN aktuell **nicht** konfiguriert — P2P hinter restriktiven NATs kann fehlschlagen. Für Production TURN (coturn) einrichten und `STUN_URL`/`TURN_URL`/`TURN_USER`/`TURN_PASS` setzen, dann in `public/script.js` `rtcConfig.iceServers` erweitern.

## World Lock (Production)
- `PUBLIC_WORLD_ENABLED=false` (Server + Client `isWorldAllowed` → nur `Divo`).
- Public sieht `Coming Soon` (statt 2400×1800 World), Voice bleibt voll funktional.

## Render Schritte (manuell, 2 Min)
1. GitHub Repo verbinden → Branch `main`
2. `render.yaml` wird automatisch erkannt (oder manuell Servicetyp `Web Service` → `Node`)
3. Env Vars oben setzen
4. Deploy → `https://<service>.onrender.com` → Login → Voice → Coming Soon testen
