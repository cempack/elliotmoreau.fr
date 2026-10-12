# Deploying elliotmoreau.fr on Railway

This moves the site from Vercel to Railway: one long-running Next.js server
(`next start`) with a persistent volume for the SQLite database. The mail
bridge (Proton Mail Bridge) is a second service, set up afterwards with
[docs/MAIL-SETUP.md](./MAIL-SETUP.md).

Plan on about 30 minutes, plus DNS propagation. Do the steps in order: the
site runs on a `*.up.railway.app` address first, and the domain only moves
once that works.

## How it fits together

```
Cloudflare (DNS + proxy) ──► Railway service "web"  (npm run start, $PORT)
                                   │
                                   └── volume "/data"  ──  /data/emos.db (SQLite)
```

- **Build** (`npm run build`): runs without the volume (Railway mounts
  volumes only at run time), so every page is prerendered from the built-in
  starting content (`src/lib/places.ts`, `src/content/now.ts`). The build
  never opens the database.
- **Boot** (`src/instrumentation.ts` → `src/server/boot.ts`): opens
  `/data/emos.db` (creating, migrating and seeding it on the very first
  boot), then marks every page stale, so each page's next visit renders from
  the database. The deploy log says so (see step 4).
- **Health** (`/api/health`): returns 200 with
  `{"ok":true,"db":true,"smtp":…,"imap":…,"admin":…}` once the database
  opens, 503 otherwise. Railway waits for it before switching traffic, so a
  deploy with a broken volume never goes live.
- **Edits** from the admin panel refresh every page at once. Pages also
  refresh on their own every 5 minutes.

What's in the repo for this: the `start` script binds to `$PORT`
(`next start -p ${PORT:-3000}`), `engines` pins Node 22 (Railpack reads it),
and the health and boot code above. Vercel Analytics is gone (it only works
on Vercel).

> **Why there is no `railway.json`.** Railway's Config as Code
> (`railway.json` / `railway.toml`) is deprecated: new services can't use it,
> and existing files stop being read on 2026-12-01. The few settings it would
> hold (healthcheck path, start command, replicas) are set once in the
> dashboard below. Railway's replacement, Infrastructure as Code
> (`.railway/railway.ts`, applied with `railway config apply`), is optional
> and not used here.

## 0. Before you start

- A Railway account on the **Hobby** plan or above (volumes, backups and
  custom domains need a paid plan; Hobby allows 2 custom domains per
  service).
- Admin access to the GitHub repo `cempack/elliotmoreau.fr` and to the
  Cloudflare zone `elliotmoreau.fr`.
- `openssl` on your machine, for secrets.
- Optional: the Railway CLI (`npm i -g @railway/cli`, then `railway login`),
  for logs and `railway ssh`.
- Your current values from Vercel: Vercel → the project → **Settings →
  Environment Variables** (Production), or with the Vercel CLI:
  `vercel env pull .env.vercel --environment=production` (delete that file
  once you've copied what you need; never commit it).

## 1. Create the project from GitHub

1. railway.com → **New Project** → **Deploy from GitHub repo**. Authorize the
   Railway GitHub app for `cempack/elliotmoreau.fr` if asked, then pick the
   repo. Railway creates a service and starts a first build; let it run (it
   will fail its healthcheck or show sample data until steps 2–3 are done,
   which is fine).
2. Open the service → **Settings**:
   - **Service name**: `web` (it becomes `web.railway.internal` on the
     private network; the mail guide refers to it).
   - **Source**: branch `main`. Every push to `main` deploys.
   - **Build**: builder **Railpack** (the default). Leave the build command
     empty (Railpack runs `npm run build`).
   - **Deploy → Start command**: `npm run start`.
   - **Deploy → Healthcheck path**: `/api/health`. Keep the default timeout
     (300 s).
   - **Deploy → Restart policy**: On failure.
   - **Regions / replicas**: one replica, in a European region (Amsterdam is
     closest to Toulouse). Keep it at **one**: the database is a file on one
     volume, and the page cache lives in the server process.

## 2. Add the volume

1. On the project canvas, right-click → **New Volume** (or `⌘K` → "volume").
2. Connect it to **web**, mount path **`/data`**.
3. The default size is plenty (the database is a few hundred kilobytes).
4. Volume → **Backups**: add a **Daily** schedule (kept 6 days) and a
   **Weekly** one (kept a month). Restoring mounts the backup as a new volume
   at `/data` and redeploys.

Good to know: a service with a volume restarts with a few seconds of
downtime on each deploy (Railway never mounts one volume into two running
deployments). That is expected.

## 3. Set the variables

Service **web** → **Variables** → **Raw Editor**, paste, fill in, **Update
Variables**:

```dotenv
# ── core ───────────────────────────────────────────────
DATABASE_PATH=/data/emos.db
SITE_URL=https://elliotmoreau.fr
SESSION_SECRET=
INTERNAL_SECRET=
ADMIN_SETUP_TOKEN=

# ── live data (copy from Vercel) ───────────────────────
GITHUB_TOKEN=
GHOST_API_URL=
GHOST_CONTENT_KEY=
GHOST_ADMIN_KEY=
NEXT_PUBLIC_BLOG_URL=https://blog.elliotmoreau.fr
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REFRESH_TOKEN=

# ── mail: filled in with docs/MAIL-SETUP.md ────────────
# SMTP_HOST= SMTP_PORT= SMTP_USER= SMTP_PASS= SMTP_SECURE=
# IMAP_HOST= IMAP_PORT= IMAP_USER= IMAP_PASS= IMAP_SECURE= IMAP_SENT=
# MAIL_TO= MAIL_FROM=
```

Generate each secret on your machine and paste the output (a different value
for each):

```sh
openssl rand -base64 32   # SESSION_SECRET
openssl rand -base64 32   # INTERNAL_SECRET
openssl rand -base64 24   # ADMIN_SETUP_TOKEN
```

| Variable | Needed for | Notes |
| --- | --- | --- |
| `DATABASE_PATH` | everything | Must sit on the volume: `/data/emos.db`. |
| `SITE_URL` | admin, mail links | The public origin, exactly `https://elliotmoreau.fr` (no trailing slash). Passkeys are bound to it, so the admin panel only works on that domain (not on `*.up.railway.app`). |
| `SESSION_SECRET` | admin | Signs admin sessions. Changing it signs everyone out. |
| `INTERNAL_SECRET` | boot refresh | Lets the server tell itself to refresh pages at boot (and lets you do it by hand, see "Day to day"). Falls back to `SESSION_SECRET` if unset. |
| `ADMIN_SETUP_TOKEN` | first passkey | Asked once, when you register the first passkey. You can delete it afterwards. |
| `GITHUB_TOKEN` | Projects, pushes | Optional: lifts GitHub's 60 requests/hour anonymous limit. A fine-grained token with **public repositories, read-only** access is enough. |
| `GHOST_API_URL`, `GHOST_CONTENT_KEY` | Writing | Ghost Admin → Settings → Integrations → your custom integration. |
| `GHOST_ADMIN_KEY` | newsletter signup | Same integration. Server-only. |
| `NEXT_PUBLIC_BLOG_URL` | blog links | Baked in at build time: change it, then redeploy. |
| `SPOTIFY_*` | music | Same values as on Vercel. |
| `SMTP_*`, `IMAP_*`, `MAIL_*` | Mail | See docs/MAIL-SETUP.md. Without them the site still works and Mail falls back to opening your mail app. |

Railway provides `PORT`, `RAILWAY_ENVIRONMENT_NAME` and
`RAILWAY_VOLUME_MOUNT_PATH` by itself; don't set them. Sample data (shown
when GitHub, Ghost or Spotify can't be reached) is switched off in the
environment named **production**, Railway's default. If you rename that
environment, add `EM_NO_FIXTURES=1`.

## 4. Deploy and check it on the Railway address

1. Saving variables offers to redeploy: accept (or **Deploy** on the
   service). Watch **Build Logs**, then **Deploy Logs**. A good boot shows:

   ```
   [boot] database ready (/data/emos.db)
   [boot] pages marked stale: they now render from the database
   ```

   If you see `DATABASE_PATH (…) is not on a Railway volume`, the volume
   isn't mounted at `/data` (step 2) or `DATABASE_PATH` is wrong.
2. **Settings → Networking → Generate Domain**. You get something like
   `web-production-1234.up.railway.app`.
3. Check health:

   ```sh
   curl -s https://web-production-1234.up.railway.app/api/health
   # {"ok":true,"db":true,"smtp":false,"imap":false,"admin":true}
   ```

   `smtp` and `imap` turn true once mail is configured.
4. Open the site on that address: Desktop, Atlas, Now, Projects, Writing.
   (The admin panel won't let you in here; that's the passkey binding to
   `SITE_URL`, and it works once the domain moves.)

## 5. Move elliotmoreau.fr (Cloudflare)

Today Cloudflare holds the DNS and the apex record points at Vercel. Only
the web records change: **leave MX, SPF, DKIM and DMARC records alone**
(they are Proton's).

1. Railway: service **web** → **Settings → Networking → Custom Domain** →
   `elliotmoreau.fr`. Pick the port Railway suggests (the one the app
   listens on). Railway shows two records: a **CNAME** target (like
   `abc123.up.railway.app`) and a **TXT** record for verification. Both are
   required; without the TXT the domain answers 404.
2. Cloudflare → `elliotmoreau.fr` → **DNS → Records**:
   1. **Add** the TXT record exactly as Railway shows it (name and content).
   2. **Delete** the apex `A` record that points at Vercel (an IP such as
      `76.76.21.21`), and any apex `AAAA` record.
   3. **Add** a `CNAME`: name `@`, target the Railway value, proxy status
      **Proxied** (orange cloud). Cloudflare flattens it at the apex.
   4. `www`: edit the existing record (probably a CNAME to
      `cname.vercel-dns.com`) into a `CNAME` named `www` with target
      `elliotmoreau.fr`, **Proxied**.
3. Cloudflare → **SSL/TLS → Overview**: set the mode to **Full** (not
   "Full (strict)", which doesn't work with Railway behind the proxy, and
   not "Flexible", which loops with `ERR_TOO_MANY_REDIRECTS`). Full is
   zone-wide but only relaxes certificate checks, so other proxied hostnames
   (the blog) keep working; to keep strict mode elsewhere, add a
   Configuration Rule for `elliotmoreau.fr` with SSL = Full instead.
4. Cloudflare → **SSL/TLS → Edge Certificates**: Universal SSL on (the
   default).
5. `www` → apex redirect: Cloudflare → **Rules → Redirect Rules** → create a
   rule from the "Redirect from WWW to root" template (301, keep the path
   and query string).
6. Wait for the green check next to the domain in Railway ("Cloudflare
   proxy detected"). With the record proxied, the switch is usually a matter
   of minutes.
7. Don't add a Cloudflare "Cache Everything" rule: pages must come from the
   server so admin edits show at once. Cloudflare's defaults (cache static
   files only) are right.

## 6. Verify on the real domain

```sh
curl -s https://elliotmoreau.fr/api/health          # {"ok":true,"db":true,…}
curl -sI https://elliotmoreau.fr/atlas | grep -i -E "^(server|x-nextjs-cache)"
```

Expect `server: cloudflare` and an `x-nextjs-cache` header (`HIT`, `MISS` or
`STALE`): that's Next answering from Railway. Then open the site, then the
admin panel (terminal → `sudo`) and register your passkey with
`ADMIN_SETUP_TOKEN`. Edit something (a place's note), save, and reload the
Atlas: it shows at once.

When you're happy:

- Vercel → the project → **Settings → Domains**: remove `elliotmoreau.fr`
  and `www`, so Vercel stops renewing certificates for them.
- Vercel → **Settings → Git**: disconnect the repository (or delete the
  project), so pushes don't build in two places.

## Day to day

- **Deploy**: push to `main`. Railway builds, waits for `/api/health`, then
  switches over (a few seconds of downtime, because of the volume).
- **Roll back**: service → **Deployments** → a previous deployment →
  **Redeploy**.
- **Logs**: service → **Deploy Logs**, or `railway logs`.
- **Refresh every page by hand** (after editing the database outside the
  admin panel):

  ```sh
  curl -X POST -H "Authorization: Bearer $INTERNAL_SECRET" \
    https://elliotmoreau.fr/api/internal/revalidate
  # {"ok":true}
  ```

- **Backups**: the volume's scheduled backups (step 2). Prefer them to
  copying `/data/emos.db` by hand: the database runs in WAL mode, so a plain
  file copy of a running database can miss the latest writes.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Deploy fails at "healthcheck" | Database can't open | Deploy Logs: look for `[health] database:` / `[boot] database failed`. Volume mounted at `/data`? `DATABASE_PATH=/data/emos.db`? |
| Log: `not on a Railway volume` | Volume missing or mounted elsewhere | Step 2; the path must be `/data`. |
| Content resets on every deploy | Same as above: the database lives on the container's disk | Step 2. |
| `ERR_TOO_MANY_REDIRECTS` | Cloudflare SSL mode is Flexible | Set **Full** (step 5.3). |
| Custom domain answers 404 | TXT verification record missing | Add the TXT record from Railway (step 5.2.1). |
| Admin panel refuses the passkey | Browsing a different origin than `SITE_URL` | Use `https://elliotmoreau.fr` exactly; check `SITE_URL`. |
| Sample data in production | Environment isn't named `production` | Add `EM_NO_FIXTURES=1`, redeploy. |
| Log: `pages will pick up the database on their 5-minute refresh` | No `INTERNAL_SECRET` / `SESSION_SECRET` | Set `INTERNAL_SECRET` (step 3). |
| Build fails on `better-sqlite3` | Native module couldn't install | Check the build used Node 22 (`engines` in `package.json`); a prebuilt binary is downloaded for Node 22 on Linux. |
