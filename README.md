# elliotmoreau.fr — emOS

Personal site of Elliot Moreau, built as **emOS**: a small personal operating
system made of glass and pixels. Liquid Glass chrome over a pixel-art valley
whose sky follows the real time in Paris; every page is an app that opens
from the dock as a window; Spotlight, a real Terminal, a flingable mini
player, a boot + lock screen. Bilingual (EN at `/`, FR at `/fr`).

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
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` / `SPOTIFY_REFRESH_TOKEN` | Now playing (menu bar, mini player, Now app) |
| `GHOST_API_URL` / `GHOST_CONTENT_KEY` | Latest posts (Writing app, Desktop, Spotlight) |
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
  app/[lang]/          one static build per locale (en, fr)
    layout.tsx         <html lang>, fonts, providers, OS shell, pre-paint script
    page.tsx           Desktop  ·  work/ writing/ atlas/ now/ contact/  ·  not-found
    opengraph-image    generated share cards (+ per app), icon / apple-icon
  app/sitemap.ts robots.ts manifest.ts
  proxy.ts             EN unprefixed (rewrite to /en), FR at /fr, saved choice
  i18n/                config, server getDict, client I18nProvider, dict/<area>.ts
  components/os/       the shell: Wallpaper, Glass, MenuBar (+ panels), Dock,
                       AppWindow (+ view transitions), MiniPlayer, Terminal,
                       Intro (boot/lock), Spotlight commands, sky (Paris time)
  components/apps/     one folder per app (home = Desktop + scroll story)
  components/ui/       primitives: CommandPalette, Sheet, SplitText, Marquee,
                       Cursor, Pressable, IntroGate
  lib/motion.ts        house springs (physics-defined so gesture velocity is
                       handed off), project() momentum, rubberband()
  lib/data.ts          server data for every app (Ghost, GitHub, Spotify)
  content/now.ts       hand-written /now content — edit me
```

## Design system — Nocturne

Tokens live in `src/app/globals.css` (`@theme`): ink 950→500, warm paper
text (`label`, `label-2`, `label-3`, all ≥4.5:1), one loud **signal** lime,
plus **ion**, **lilac**, **ember**, **flare**. Type is Inter (optical
sizing) + JetBrains Mono, with a size-specific scale (`text-display` …
`text-caption`) whose tracking tightens and leading closes as size grows.
Materials: `glass-thin`, `glass`, `glass-thick`, and the refracting
`<Glass>` (Chromium) — opaque under reduced transparency, solid under more
contrast.

Motion follows Apple's fluid-interface rules: respond on press, 1:1
tracking, interruptible springs (critically damped unless thrown), velocity
handoff, momentum projection, rubber-banding, symmetric enter/exit. Reduced
motion swaps all of it for short cross-fades and instant snaps.

## Edit me

- `src/content/now.ts` — what you're building / reading / your setup.
- `src/i18n/dict/*.ts` — every visible string, EN + FR.
- `src/lib/places.ts` — places for the Atlas, socials, email.
- `public/pgp.asc` — PGP key served on the Mail app.
