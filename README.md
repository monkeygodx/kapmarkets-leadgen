[README-2.md](https://github.com/user-attachments/files/30186258/README-2.md)
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
5. Add Square variables (Settings → Variables):
   - `SQUARE_ACCESS_TOKEN` — from your Square Developer Dashboard → Applications → your app → Credentials.
     Use the **Production** access token once you're ready to take real payments, or the
     **Sandbox** token for testing (pair with `SQUARE_ENV=sandbox`).
   - `SQUARE_LOCATION_ID` — Square Dashboard → Locations, or via the Locations API.
   - `SQUARE_ENV` — set to `sandbox` while testing, `production` when live. Defaults to `production` if unset.
   - `PUBLIC_URL` — your live domain, e.g. `https://kapmarkets.com`. Used to build the redirect
     link Square sends buyers back to after payment. Must not have a trailing slash.
6. Deploy. Railway gives you a live URL under Settings → Networking → Generate Domain.

## Before you take real money — edit these

- **`server.js` → `PRODUCTS` object** — replace the placeholder e-book names and
  `priceCents` values (e.g. `2700` = $27.00) with your real titles and prices.
- **`public/index.html` → pricing section** — the `[E-Book N Title]` and description
  placeholders need to match what you set in `PRODUCTS` above (cosmetic only — the actual
  price charged always comes from the server, not this markup).
- **`public/index.html` → results section** — swap the placeholder stat cards and
  `placehold.co` images for real screenshots and real numbers.
- **`public/download.html` → `DOWNLOAD_LINKS` object** — point each product ID at the
  actual file buyers should receive (a direct link to a PDF/zip hosted somewhere like
  S3, Cloudflare R2, or even a Railway-served static file). Right now these are dummy
  `example.com` links and won't work.

## How the purchase flow works

1. Buyer clicks a "Buy Now" button → browser calls `POST /api/checkout` with the product ID.
2. Server creates a Square-hosted payment link via the Checkout API, saves a `pending`
   order row, and returns the checkout URL.
3. Browser redirects to Square's hosted payment page (you never touch card data).
4. After payment, Square redirects back to `/download.html?order=<ref>`.
5. That page calls `/api/orders/<ref>/verify`, which asks Square's Orders API directly
   whether the order was actually paid — this is the real check, not just trusting the
   redirect happened — and shows the download link only once confirmed.

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
