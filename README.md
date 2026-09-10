# elliotmoreau.fr

Personal site for Elliot Moreau. Dark, cinematic, bilingual (EN/FR), with a custom
3D travel globe, live Spotify + GitHub sections, and synthesized UI sounds.

Stack: Next.js (App Router) + TypeScript + Tailwind v4 + three.js. Deploys on Vercel.

## Run

```bash
npm install
cp .env.example .env.local   # fill in tokens (see below)
npm run dev                  # http://localhost:3000
```

```bash
npm run build && npm start   # production check
npm run lint                 # eslint
```

## Env

| Var | Used for | Required |
| --- | --- | --- |
| `GITHUB_TOKEN` | `/work` repo list + last-push line (higher rate limit) | No, recommended |
| `SPOTIFY_CLIENT_ID` | Home “Signal” section | Yes for Spotify |
| `SPOTIFY_CLIENT_SECRET` | Home “Signal” section | Yes for Spotify |
| `SPOTIFY_REFRESH_TOKEN` | Home “Signal” section | Yes for Spotify |

Missing tokens degrade gracefully: the Spotify section hides itself and the
GitHub accent line goes quiet; the rest of the site renders finished. `/work`
shows a fallback card linking to the GitHub profile if the API is unreachable.

## Spotify refresh token, step by step

The site uses the refresh-token flow entirely server-side (`src/lib/spotify.ts`);
the browser never sees your secrets.

1. Go to https://developer.spotify.com/dashboard and log in.
2. **Create app**: name it anything (e.g. `elliotmoreau.fr`), set the redirect URI
   to exactly `http://127.0.0.1:3000/callback` (Spotify requires `127.0.0.1`,
   not `localhost`), tick **Web API**, save.
3. Open **Settings** on the app page and copy the **Client ID** and
   **Client Secret** into `.env.local`.
4. Authorize in your browser (replace `CLIENT_ID`):
   `https://accounts.spotify.com/authorize?client_id=CLIENT_ID&response_type=code&redirect_uri=http%3A%2F%2F127.0.0.1%3A3000%2Fcallback&scope=user-read-currently-playing%20user-read-recently-played%20user-top-read`
5. Accept → Spotify redirects to `http://127.0.0.1:3000/callback?code=XXXX`
   (the page won't load — that's fine). Copy `XXXX`.
6. Exchange the code for a refresh token:
   ```bash
   curl -X POST https://accounts.spotify.com/api/token \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "grant_type=authorization_code&code=XXXX&redirect_uri=http://127.0.0.1:3000/callback&client_id=CLIENT_ID&client_secret=CLIENT_SECRET"
   ```
7. Copy `refresh_token` from the JSON into `.env.local` as `SPOTIFY_REFRESH_TOKEN`.
8. Restart `npm run dev`. The “Signal” section appears on Home.

## Deploy (Vercel)

1. Push this repo to GitHub.
2. **Vercel → Add New → Project** → import the repo (defaults are fine).
3. **Settings → Environment Variables**: add the four vars above (all environments).
4. Deploy. Vercel Analytics is already wired (`@vercel/analytics` in `layout.tsx`).

Custom domain: **Settings → Domains** → add `elliotmoreau.fr` (+ `www` if wanted)
and point DNS at Vercel as instructed.

## Notes

- Globe: custom three.js scene (`src/components/Globe.tsx`) — dotted continents
  rasterized from `world-atlas` land polygons, shader ocean/atmosphere, ember
  “been” markers vs glacier “want” rings. Drag to spin, pinch to zoom; the wheel
  always scrolls the page (no wheel handlers on the canvas). Honors
  `prefers-reduced-motion` (no drift, no pulse).
- i18n: `src/lib/i18n.tsx` — EN/FR toggle in the nav, browser default, persisted
  in `localStorage`. Live API text (repos, tracks) is shown verbatim, untranslated.
- Sound: `src/lib/sound.tsx` — tiny WebAudio blips for hover/click/page-change,
  on by default, mute button in the nav, persisted in `localStorage`.
- Palette + backdrop: Dos Moos theme colors (`cempack/omarchy-dos-moos-theme`
  `colors.toml`). The backdrop is a living pixel-night scene (`PixelSky`:
  dithered sky, constellations, moon, moonlit ridges, mist, hamlets,
  fireflies) under a light cinematic grade (`.bg-hills`). Favicon +
  contact avatar = GitHub profile picture.
- Text FX: `src/lib/ttfx.ts` — terminal-style effects in the spirit of
  ttfx/terminaltexteffects (clean-room JS, no binary). Small `TtfxText` label
  moments plus `HeroNameFx`: the hero name lives on an omarchy-landing-style
  pixel field — ambient drifting lattice, pointer + wandering-sprite light,
  full-grid etch effects (decrypt, matrix, beams, rings, spotlights) settling
  into gradient-banded resting type. Click it to restart the loop.
  `?fx=grid-matrix` pins one to try it. Loops pause off-screen; inert under
  `prefers-reduced-motion`.
- Click stamps: `ClickStamps` — every real click stamps a brass sparkle that
  blooms and dissolves, omarchy-landing style.
- Ticker: the band under the hero shows live signals (track, push, repo
  count, CET), not place names.
- Globe: brass been-dots / sage want-rings with expanding pulse rings,
  persistent facing-faded name chips, procedural cloud veil, warm day-side
  light, arcs with travelers.
- PGP key ships at `public/pgp.asc`, served as `/pgp.asc` with copy/download on
  `/contact`.
- Routes: `/`, `/work`, `/contact`, `/api/spotify/status`,
  `/api/github/repos`, `/api/github/activity`. No locale prefixes, no blog.
