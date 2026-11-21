# Prickly Panic leaderboard API

A Cloudflare Worker with a D1 database. It runs the world leaderboard (weekly and all-time) and
sends web push "someone beat your score" pings. Live at
https://prickly-panic-api.abhi270702.workers.dev

## First deploy

Run from this folder:

```bash
npm install
npx wrangler login          # sign in to the Cloudflare account in the browser
npm run keys                # makes secrets.local.json + .dev.vars (gitignored); skips if they already exist
npm run db:remote           # creates the tables in the live D1 database
npm run secrets             # uploads PLAYER_SECRET, ADMIN_TOKEN, VAPID_PRIVATE_JWK
npm run deploy
```

Keep `secrets.local.json` safe. If `PLAYER_SECRET` is lost or changed, every player gets a new
identity, and if the VAPID key changes, everyone has to turn pings on again.

## Local development

```bash
npm run db:local && npm run dev      # API on http://localhost:8787
```

When the game is served from `localhost`, it talks to this local API automatically.

## Cheat checks

A score is only accepted against a run ticket issued when the run started. It must satisfy
`score = plants + close calls`, and the run must have lasted at least 0.45 s per plant.
Rejected runs stay in the `runs` table with a reason.

To review recent runs, or to remove a player from the boards (ADMIN_TOKEN is in `secrets.local.json`):

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://prickly-panic-api.abhi270702.workers.dev/admin/recent
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"player":"<id>"}' https://prickly-panic-api.abhi270702.workers.dev/admin/ban
```
