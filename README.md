# Between

Multiplayer **Between** card game — React client, NestJS + Socket.IO server, Google (or guest) auth.

## Rules (this build)

- Host creates a room (2–6 players); game type is Between only.
- Host starts when ready; game continues until the host ends it.
- Everyone starts at **0** points; balances **can go negative**.
- At start (and whenever the board hits **0**), every player antes **10** onto the board. If the board is not zero, no ante is collected on new deals.
- Seats are shuffled at start; each player gets **two private cards** (only they can see them).
- On your turn you **bet** that the next draw falls strictly between your two cards, or **skip**.
- **Max bet** is the current board amount.
- Win → take that amount **from the board**. Lose → that amount is added **to the board**.
- If a win clears the board to 0: everyone antes 10 again, all cards are dropped, the clearer **serves** the new deal, and the next seat bets first.
- After a lose or skip, the next player still gets a turn on the same deal.
- When everyone has skipped or failed, new cards are dealt.
- Other players see face-down backs for your hand, plus Betting / Waiting / Done status.
- Consecutive / same-rank pairs have no between — you must skip manually (no auto-skip).
- Users, live games, actions, and final scores are persisted in PostgreSQL.

## Quick start

```bash
npm install
npm run dev
```

- Client: http://localhost:5173  
- API / Socket.IO: http://localhost:3002  

Guest login works out of the box (`ALLOW_DEV_LOGIN=true`).

### Environment

Copy `server/.env.example` → `server/.env` and set at least:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
CLIENT_URL=http://localhost:5173
JWT_SECRET=...
```

### Google OAuth (optional)

1. Create OAuth credentials in Google Cloud Console.
2. In `server/.env` set:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=http://localhost:3002/auth/google/callback
CLIENT_URL=http://localhost:5173
```

3. Add the callback URL to your Google OAuth client.

## Deploy notes (Vercel client)

OAuth lands on `/oauth/callback`. Vercel must rewrite unknown paths to `index.html` (see `client/vercel.json` / root `vercel.json`). Redeploy the client after adding that file.

Production server env should include:

```env
CLIENT_URL=https://cards.sknics.com
GOOGLE_CALLBACK_URL=https://<your-api-host>/auth/google/callback
DATABASE_URL=postgresql://...
```

And Google Cloud OAuth must allow that API callback URL.

## Scripts

| Command | Description |
|--------|-------------|
| `npm run dev` | Run API + client together |
| `npm run dev:server` | NestJS only |
| `npm run dev:client` | Vite only |
| `npm run build` | Build both |

## Stack

- **client/** — React + Vite + Socket.IO client  
- **server/** — NestJS, JWT auth, Passport Google, Socket.IO gateway, in-memory game rooms  
