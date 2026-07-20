# KapMarkets Lead Gen

Static landing page + Express backend that saves leads to Postgres.

## Local run
```
npm install
DATABASE_URL=postgres://... npm start
```
Visit http://localhost:3000

## Deploy on Railway

1. Push this whole folder to your GitHub repo (root of the repo, not a subfolder —
   `package.json` and `server.js` must sit at the top level).
2. In Railway: **New Project → Deploy from GitHub repo** → select this repo.
   Railway detects `package.json` and runs `npm start` automatically.
3. Add Postgres: in the same Railway project, click **+ New → Database → Add PostgreSQL**.
   Railway auto-creates a `DATABASE_URL` variable and injects it into your app's environment
   — you don't need to copy/paste it manually.
4. Add one more variable on the app service (Settings → Variables):
   - `ADMIN_KEY` — any secret string you pick. Lets you view captured leads at
     `https://your-app.up.railway.app/api/leads?key=YOUR_ADMIN_KEY`
5. Deploy. Railway gives you a live URL under Settings → Networking → Generate Domain.

## Viewing leads
Open `/api/leads?key=YOUR_ADMIN_KEY` in a browser once deployed — returns JSON of every
captured lead, newest first. Good enough to check for now; hook up a real dashboard later
if volume picks up.

## Common Railway deploy failures
- **"No start command could be found"** — means `package.json` wasn't at the repo root.
  Move it up a level.
- **App crashes on boot referencing DATABASE_URL** — Postgres plugin wasn't added to the
  project, or wasn't linked to this service. Check Settings → Variables on the app service.
- **Health check failing** — Railway pings `/`, which is served as a static file here, so
  this should pass once the app boots at all.
