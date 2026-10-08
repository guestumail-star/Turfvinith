# Turf Scorecards – Vercel + MongoDB

Spectators: live score auto-refresh (4 sec). Scorer (admin): login pannina mattum score update panna mudiyum.

## Vercel Environment Variables
| Name | Value |
|---|---|
| MONGODB_URI | MongoDB Atlas connection string |
| MONGODB_DB_NAME | turf_scorecards |
| ADMIN_ID | scorer login ID |
| ADMIN_PASSWORD | scorer password |
| ADMIN_SECRET | random long string |

Atlas > Network Access la `0.0.0.0/0` allow pannanum (Vercel IP fixed illa).

## Local run
```bash
npm install
npm run dev
```
- **Client:** http://localhost:5173 (Vite)
- **Server:** http://localhost:3001 (API; Vite proxies `/api` to here)

Env vars: `.env` or `.env.local` at repo root (or in `server/`).

Project layout: `client/` (frontend), `server/` (API).
