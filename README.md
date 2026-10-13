# elliotmoreau.fr — emOS

Personal site of Elliot Moreau, a student at Epitech in Toulouse, built as **emOS**: the site works like my
Omarchy desktop. A waybar-style top bar whose workspaces appear as you open apps, bordered tiled
windows over a pixel-art valley whose sky follows the time in Toulouse, every
page an app, Spotlight, a Terminal, a right-click menu that knows where you
are, and a first visit that arrives from space:
through the clouds, down the Garonne, landing pixel for pixel on the wallpaper
(Restart plays the pixel-name boot; Shut Down turns the screen off). Bilingual (EN at `/`, FR at `/fr`).

Stack: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 ·
`motion` · Lenis. Deploys on Vercel.

## Run

```bash
npm install
cp .env.example .env.local   # optional tokens, see below
npm run dev                  # http://localhost:3000
npm run build && npm start   # production check
npm run lint
```

Without tokens, local and preview builds show **sample data** (posts, repos,
Spotify, last push) so every app is designable; production never does — a
missing source renders its designed empty state instead
(`src/lib/data.ts`, `src/lib/fixtures.ts`). Set `EM_NO_FIXTURES=1` to see
the empty states locally.

## Env

| Var | Used for |
| --- | --- |
| `GITHUB_TOKEN` | Projects + last push (higher rate limit, README screenshots) |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` / `SPOTIFY_REFRESH_TOKEN` | Now playing (top bar, Now app) |
| `GHOST_API_URL` / `GHOST_CONTENT_KEY` | Latest posts (the Blog app, Desktop, Spotlight) |
| `GHOST_ADMIN_KEY` | Newsletter subscribe (server-side only) |
| `NEXT_PUBLIC_BLOG_URL` | Links out to the blog |

### Spotify refresh token

The refresh-token flow runs entirely server-side (`src/lib/spotify.ts`).

1. https://developer.spotify.com/dashboard → **Create app**, redirect URI
   `http://127.0.0.1:3000/callback`, tick **Web API**.
2. Copy the Client ID / Secret into `.env.local`.
3. Open (replace `CLIENT_ID`):
   `https://accounts.spotify.com/authorize?client_id=CLIENT_ID&response_type=code&redirect_uri=http%3A%2F%2F127.0.0.1%3A3000%2Fcallback&scope=user-read-currently-playing%20user-read-recently-played%20user-top-read`
4. Accept, copy `code` from the redirect URL, then:
   ```bash
   curl -X POST https://accounts.spotify.com/api/token \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "grant_type=authorization_code&code=XXXX&redirect_uri=http://127.0.0.1:3000/callback&client_id=CLIENT_ID&client_secret=CLIENT_SECRET"
   ```
5. Put `refresh_token` in `SPOTIFY_REFRESH_TOKEN`.

## Map

```
src/
  app/[lang]/            one static build per locale (en, fr), ISR every 5 min
    layout.tsx           <html lang>, fonts, providers, OS shell, pre-paint script, base metadata
    page.tsx             Desktop (+ Person JSON-LD)  ·  work/ blog/ atlas/ now/ contact/
    opengraph-image.tsx  localized share cards (one per app), icon / icon1 / icon2 / apple-icon
    not-found.tsx        the 404 app, for notFound() inside a locale
  app/global-not-found.tsx  the 404 for every unmatched address (own <html>, same shell)
  app/sitemap.ts robots.ts manifest.ts
  app/api/               newsletter (Ghost Admin), spotify/status (live now playing),
                         hit (the page-view beacon), oops (crash reports), admin/
                         (passkeys, the panel's RPC, the sources' icons)
  server/                SQLite (content, mail, admin auth, stats): content/ holds
                         places, status, /now, live overrides, Projects' notes and
                         the words edited from admin (Texts, laid over i18n/dict);
                         stats/ counts visits without cookies (a daily-salted visitor
                         hash, country from the time zone), read by the admin's Stats
                         dashboard (visits, sources, a map, live, filters)
  proxy.ts               EN unprefixed (rewrite to /en), FR at /fr, saved choice
  i18n/                  config, server getDict + appMetadata, client I18nProvider,
                         dict/<area>.ts (meta.ts = titles, descriptions, share cards),
                         base.ts (the strings as written, before admin edits)
  components/os/         the shell: Wallpaper, Glass, MenuBar (+ panels), Dock,
                         AppWindow (+ view transitions), Terminal, Intro (boot
                         with the pixel name, lock screen), Spotlight commands,
                         sky (Toulouse time), context/ (the right-click menu:
                         useContextMenu(ref, build) per app, the OS menu elsewhere)
  components/apps/       one folder per app (home = the Desktop, notfound)
  components/ui/         primitives: CommandPalette, Sheet, SplitText, Marquee,
                         Pressable
  components/            pixel bits: PixelLabel, PixelWordmark, Monogram, glyphs
  lib/motion.ts          house springs (physics-defined so gesture velocity is
                         handed off), project() momentum, rubberband()
  lib/data.ts            server data for every app (Ghost, GitHub, Spotify),
                         sample fallbacks in lib/fixtures.ts
  lib/og.tsx             share cards + app icons (ImageResponse; fonts in assets/og)
  lib/ttfx.ts pixelword.ts   the pixel wordmark: glyphs, bands, living field
  content/now.ts         hand-written /now content — edit me
```

## Design system — Moss

Tokens live in `src/app/globals.css` (`@theme`), taken from my Omarchy
theme: near-black greens (ink 950→500), warm paper text (`label`,
`label-2`, `label-3`, all ≥4.5:1), a **signal** moss accent, plus **ion**
(sage), **lilac**, **ember**, **flare**. Type is Inter (optical sizing) +
JetBrains Mono (the top bar, titles, the lock screen). Surfaces are
`<Glass>`: a dark, mostly opaque tint with a little blur and a thin even
border, like a Hyprland window; opaque under reduced transparency, solid
under more contrast.

Motion follows Apple's fluid-interface rules: respond on press, 1:1
tracking, interruptible springs (critically damped unless thrown), velocity
handoff, momentum projection, rubber-banding, symmetric enter/exit. Reduced
motion swaps all of it for short cross-fades and instant snaps.

## Edit me

- `src/content/now.ts` — what you're building / reading / drafting.
- `src/i18n/dict/*.ts` — every visible string, EN + FR (`meta.ts` holds the
  page titles and descriptions used by search results and share cards).
  Or change them live from the admin panel's Texts section: an edit there
  is stored in the database and wins over the file until it's reset.
- `src/lib/places.ts` — places for the Atlas, socials, email.
- `public/pgp.asc` — PGP key served on the Mail app.
