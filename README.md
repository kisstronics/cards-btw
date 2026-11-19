# Between

Multiplayer **Between** card game — React client, NestJS + Socket.IO server, Google (or guest) auth.

## Rules (this build)

- Host creates a room (2–6 players); game type is Between only.
- Host starts when ready; game continues until the host ends it.
- At start (and whenever the board hits **0**), every player antes **10** onto the board.
- Seats are shuffled at start; each player gets **two private cards** (only they can see them).
- On your turn you **bet** that the next draw falls strictly between your two cards, or **skip**.
- Bet amount cannot exceed the current board amount (or your chips).
- Win → take that amount **from the board**. Lose → that amount is added **to the board**.
- If a win clears the board to 0: everyone antes 10 again, all cards are dropped, the clearer **serves** the new deal, and the next seat bets first.
- After a lose or skip, the next player still gets a turn on the same deal.
- When everyone has skipped or failed, new cards are dealt.
- Other players see face-down backs for your hand, plus Betting / Waiting / Done status.
- Consecutive / same-rank pairs have no between — you must skip manually (no auto-skip).

## Quick start

```bash
npm install
npm run dev
```

- Client: http://localhost:5173  
- API / Socket.IO: http://localhost:3001  

Guest login works out of the box (`ALLOW_DEV_LOGIN=true`).

### Google OAuth (optional)

1. Create OAuth credentials in Google Cloud Console.
2. Copy `server/.env.example` → `server/.env` and set:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=http://localhost:3001/auth/google/callback
CLIENT_URL=http://localhost:5173
```

3. Add the callback URL to your Google OAuth client.

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
