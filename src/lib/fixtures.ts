import type { GhostPost } from "./ghost";
import type { ActivityInfo, DayPush, PushHistory, RepoInfo } from "./github";
import type { DayTrack, SpotifyStatus } from "./spotify";

/**
 * Sample data for local work and preview builds, used only when a live
 * source is unreachable (no tokens in dev). Never served in production
 * (see getSiteData in ./data.ts; EM_NO_FIXTURES=1 shows the empty states).
 */

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

export const FIXTURE_POSTS: GhostPost[] = [
  {
    title: "Ricing a laptop until it feels like mine",
    slug: "ricing-a-laptop",
    excerpt:
      "Notes on building a desktop that gets out of the way, and the details that make it mine.",
    published_at: daysAgo(6),
    reading_time: 7,
    feature_image: null,
    url: "https://blog.elliotmoreau.fr/ricing-a-laptop/",
    tags: [{ name: "Linux", slug: "linux" }],
  },
  {
    title: "What a pixel font taught me about spacing",
    slug: "pixel-font-spacing",
    excerpt: "Designing a 3×5 typeface forces every decision into the open.",
    published_at: daysAgo(19),
    reading_time: 5,
    feature_image: null,
    url: "https://blog.elliotmoreau.fr/pixel-font-spacing/",
    tags: [{ name: "Design", slug: "design" }],
  },
  {
    title: "A week in Ireland with one camera and no plan",
    slug: "ireland-no-plan",
    excerpt: "Cliffs, rain, and the best soup of my life.",
    published_at: daysAgo(41),
    reading_time: 9,
    feature_image: null,
    url: "https://blog.elliotmoreau.fr/ireland-no-plan/",
    tags: [{ name: "Travel", slug: "travel" }],
  },
];

export const FIXTURE_REPOS: RepoInfo[] = [
  {
    name: "elliotmoreau.fr",
    description: "This website: workspaces, tiled windows and a terminal, in Next.js.",
    url: "https://github.com/cempack/elliotmoreau.fr",
    homepage: "https://elliotmoreau.fr",
    language: "TypeScript",
    stars: 12,
    forks: 1,
    pushedAt: daysAgo(0.2),
    topics: ["nextjs", "pixel-art", "portfolio"],
    preview: null,
  },
  {
    name: "omarchy-dos-moos-theme",
    description: "A calm, mossy theme for Omarchy: Hyprland, Waybar, terminal and editor.",
    url: "https://github.com/cempack/omarchy-dos-moos-theme",
    homepage: "",
    language: "Shell",
    stars: 48,
    forks: 4,
    pushedAt: daysAgo(3),
    topics: ["omarchy", "hyprland", "theme"],
    preview: null,
  },
  {
    name: "ttfx",
    description: "Terminal text effects for the browser: decrypt, beams, rings, waves.",
    url: "https://github.com/cempack",
    homepage: "",
    language: "TypeScript",
    stars: 21,
    forks: 2,
    pushedAt: daysAgo(9),
    topics: ["canvas", "animation"],
    preview: null,
  },
  {
    name: "dotfiles",
    description: "Everything that makes my machines feel like home.",
    url: "https://github.com/cempack",
    homepage: "",
    language: "Lua",
    stars: 9,
    forks: 0,
    pushedAt: daysAgo(14),
    topics: ["dotfiles", "neovim"],
    preview: null,
  },
  {
    name: "pixel-planets",
    description: "Seeded micro-planet identicons, dithered and deterministic.",
    url: "https://github.com/cempack",
    homepage: "",
    language: "TypeScript",
    stars: 6,
    forks: 0,
    pushedAt: daysAgo(30),
    topics: ["identicon", "generative"],
    preview: null,
  },
  {
    name: "spotify-now",
    description: "Tiny server-side now-playing endpoint, refresh-token flow.",
    url: "https://github.com/cempack",
    homepage: "",
    language: "Go",
    stars: 4,
    forks: 0,
    pushedAt: daysAgo(55),
    topics: ["spotify", "api"],
    preview: null,
  },
];

export const FIXTURE_SPOTIFY: SpotifyStatus = {
  now: {
    title: "Midnight City",
    artist: "M83",
    album: "Hurry Up, We're Dreaming",
    image: "",
    url: "https://open.spotify.com",
    progressMs: 96_000,
    durationMs: 243_000,
    playing: true,
  },
  recent: null,
  artists: [
    { name: "M83", image: "", url: "" },
    { name: "Justice", image: "", url: "" },
    { name: "Daft Punk", image: "", url: "" },
    { name: "Air", image: "", url: "" },
    { name: "Phoenix", image: "", url: "" },
  ],
};

export const FIXTURE_ACTIVITY: ActivityInfo = {
  type: "PushEvent",
  repo: "elliotmoreau.fr",
  repoUrl: "https://github.com/cempack/elliotmoreau.fr",
  message: "tune the springs until they feel right",
  createdAt: daysAgo(0.1),
};

/** ~90 days of sample pushes: steady weekdays, quiet weekends, a few busy
    stretches. Seeded, so it is the same wall on every render. */
export const FIXTURE_PUSHES: PushHistory = (() => {
  let a = 0x5eed;
  const rnd = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });
  const repos = ["elliotmoreau.fr", "omarchy-dos-moos-theme", "ttfx", "dotfiles"];
  const msgs = [
    "tune the springs until they feel right",
    "relight the city from the real sun",
    "fix the dock overlapping app bottoms",
    "dither the moon phase",
    "tighten the waybar spacing",
    "Safari: rims as real borders",
    "add the sundial",
    "write the French strings",
  ];
  const days: PushHistory["days"] = [];
  for (let k = 0; k < 90; k++) {
    const date = new Date(Date.now() - k * 86_400_000);
    const weekend = [0, 6].includes(date.getUTCDay());
    const busy = Math.sin(k / 9) > 0.55;
    const r = rnd();
    const n = weekend ? (r < 0.75 ? 0 : 1) : r < 0.22 ? 0 : Math.floor(1 + rnd() * (busy ? 8 : 4));
    if (!n) continue;
    days.push({ d: fmt.format(date), n, repo: repos[Math.floor(rnd() * (busy ? 1.5 : repos.length))], msg: msgs[Math.floor(rnd() * msgs.length)] });
  }
  return { days, since: fmt.format(new Date(Date.now() - 89 * 86_400_000)) };
})();

/** A sample body for any sample post (outside production, when Ghost isn't reachable). */
export const FIXTURE_POST_HTML = `
<p>This is sample text: the real post loads from the blog once Ghost is connected. It is here so the reader can be laid out and checked: paragraphs, headings, code, quotes, lists and images.</p>
<h2>Start from the defaults</h2>
<p>Every setup begins the same way. You install the thing, it works, and then you notice the twelve small frictions that make it feel like someone else’s machine. The work is in removing them one at a time, and in knowing when to stop.</p>
<blockquote>The best configuration is the one you stop thinking about.</blockquote>
<p>Here is the part of the config that does most of the work:</p>
<pre><code class="language-bash">#!/usr/bin/env bash
# rebuild the bar after a theme change
pkill waybar
waybar &amp; disown
</code></pre>
<h3>What to keep</h3>
<ul>
<li>One font, at two sizes.</li>
<li>A palette of seven colours, used with intent.</li>
<li>Shortcuts you can say out loud.</li>
</ul>
<p>And what to drop: anything that animates for its own sake, every status icon you never read, and the third terminal multiplexer. See <a href="https://github.com/basecamp/omarchy">Omarchy</a> for a good starting point.</p>
<figure class="kg-card kg-image-card"><img src="https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=1200" alt="A laptop on a desk" width="1200" height="800"><figcaption>The laptop, after.</figcaption></figure>
<h2>Know when to stop</h2>
<p>A setup is done when the next change would be for the screenshot rather than for the work. That moment comes sooner than you think.</p>
`;

/** A sample day (outside production, when Spotify or GitHub can't be reached): plays and pushes over the last hours, relative to `now`. */
export function fixtureDay(now = Date.now()): { tracks: DayTrack[]; pushes: DayPush[] } {
  const H = 3_600_000;
  const plays: [number, string, string][] = [
    [0.2, "Midnight City", "M83"], [0.6, "Lisztomania", "Phoenix"], [1.1, "1901", "Phoenix"], [1.9, "Digital Love", "Daft Punk"],
    [2.4, "Something About Us", "Daft Punk"], [3.2, "Playground Love", "Air"], [4.6, "La femme d’argent", "Air"], [5.3, "Genesis", "Justice"],
    [5.8, "D.A.N.C.E.", "Justice"], [6.7, "Wait", "M83"], [13.5, "Outro", "M83"], [14.1, "Alive", "Daft Punk"],
  ];
  const pushes: [number, string, string][] = [
    [0.4, "elliotmoreau.fr", "tune the springs until they feel right"], [1.3, "elliotmoreau.fr", "the letter crosses the world"],
    [2.1, "elliotmoreau.fr", "rework the cassette"], [5.5, "dotfiles", "waybar: quieter clock"], [6.2, "elliotmoreau.fr", "calmer post rows"],
    [13.8, "omarchy-dos-moos-theme", "warmer ember"],
  ];
  return {
    tracks: plays.map(([h, title, artist]) => ({ at: new Date(now - h * H).toISOString(), title, artist, image: "", url: "" })),
    pushes: pushes.map(([h, repo, msg]) => ({ at: new Date(now - h * H).toISOString(), repo, msg })),
  };
}
