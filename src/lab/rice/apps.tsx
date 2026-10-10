"use client";

import { useEffect, useState } from "react";
import { HeroNameFx } from "@/components/HeroNameFx";
import { PixelPlanet } from "@/components/PixelPlanet";
import { PixelLabel } from "@/components/PixelLabel";
import { PixelGlobe } from "@/components/PixelGlobe";
import { PixelGlyph, GLYPH_PIN, GLYPH_STAR } from "@/components/glyphs";
import { PressAnchor, PressButton, PressLink } from "@/components/ui/Pressable";
import { useToast } from "@/components/Toasts";
import { useSound } from "@/lib/sound";
import { timeAgo } from "@/lib/format";
import { LANG_COLORS, LANG_FALLBACK } from "@/lib/langColors";
import { PLACES, SOCIALS, fmtCoords } from "@/lib/places";
import { useParisTime } from "@/hooks/useParisTime";
import type { GhostPost } from "@/lib/ghost";
import type { ActivityInfo, RepoInfo } from "@/lib/github";
import type { TrackInfo } from "@/lib/spotify";
import { hexOf, mmss, useIntroDone, useMounted, useNow, useReduced } from "./hooks";
import { useRiceCopy } from "./strings";

/* ───────────── shared bits ───────────── */

/** Starship/powerline-style prompt: user ▸ path ▸ command. */
export function Prompt({ path = "~", branch, children }: { path?: string; branch?: string; children?: React.ReactNode }) {
  return (
    <p className="rice-prompt">
      <span className="rice-pl rice-pl-user">elliot</span>
      <span className="rice-pl rice-pl-path">{path}</span>
      {branch && <span className="rice-pl rice-pl-git">{branch}</span>}
      <span className="rice-cmd">{children}</span>
    </p>
  );
}

export function Caret({ blink = true }: { blink?: boolean }) {
  return <span className="rice-caret" data-blink={blink || undefined} aria-hidden />;
}

/** Album art, or a seeded pixel planet when there is none. */
export function Cover({ track, className = "" }: { track: TrackInfo | null; className?: string }) {
  if (track?.image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={track.image} alt="" width={96} height={96} className={`${className} rice-cover`} />;
  }
  return (
    <span className={`${className} rice-cover rice-cover--pixel`} aria-hidden>
      <PixelPlanet seed={track ? track.album || track.title : "silence"} className="h-full w-full" />
    </span>
  );
}

/**
 * cava, in pixel blocks: each column is a block-patterned bar that jumps
 * a whole block at a time (stepped keyframes on transform). Compositor
 * only, frozen flat when nothing plays, a static skyline under reduced
 * motion.
 */
export function Cava({ playing, cols = 28, rows = 12 }: { playing: boolean; cols?: number; rows?: number }) {
  return (
    <div
      className="rice-cava"
      data-playing={playing || undefined}
      style={{ "--rows": rows } as React.CSSProperties}
      aria-hidden
    >
      {Array.from({ length: cols }, (_, i) => {
        const u = i / Math.max(1, cols - 1);
        // static skyline: bass-heavy, a bump in the mids, airy highs
        const level = Math.round(rows * (0.28 + 0.5 * Math.exp(-((u - 0.12) ** 2) / 0.02) + 0.22 * Math.exp(-((u - 0.55) ** 2) / 0.03)));
        return (
          <span
            key={i}
            className={`rice-cava-col k${u < 0.3 ? (i % 2 ? 0 : 2) : u < 0.7 ? (i % 2 ? 2 : 1) : i % 2 ? 1 : 3}`}
            style={
              {
                "--t": `${1.05 + ((i * 53) % 9) / 10}s`,
                "--d": `${-(((i * 37) % 100) / 40)}s`,
                "--rest": `${(100 * (rows - Math.min(rows, level))) / rows}%`,
              } as React.CSSProperties
            }
          >
            <i />
          </span>
        );
      })}
    </div>
  );
}

/** Elapsed / total, ticking locally between polls. */
export function TrackProgress({ track, playing }: { track: TrackInfo; playing: boolean }) {
  const now = useNow(1000, playing);
  const [base, setBase] = useState<{ key: string; at: number } | null>(null);
  const key = `${track.title}|${track.progressMs}|${playing}`;
  if (now !== null && (!base || base.key !== key)) setBase({ key, at: now });
  const elapsed = playing && base && now !== null ? now - base.at : 0;
  const pos = Math.min(track.durationMs, track.progressMs + elapsed);
  const pct = track.durationMs ? pos / track.durationMs : 0;
  return (
    <div className="rice-prog">
      <span>{mmss(pos)}</span>
      <span
        className="rice-prog-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={Math.round(track.durationMs / 1000)}
        aria-valuenow={Math.round(pos / 1000)}
        aria-label={track.title}
      >
        <i style={{ transform: `scaleX(${pct})` }} />
      </span>
      <span>{mmss(track.durationMs)}</span>
    </div>
  );
}

/* ───────────── workspace 1 ───────────── */

export function HeroWin() {
  const { r } = useRiceCopy();
  return (
    <>
      <HeroNameFx className="rice-hero-fx" />
      <div className="rice-vim" aria-hidden>
        <span className="rice-vim-mode">NORMAL</span>
        <span className="rice-vim-file">~/hello.fx</span>
        <span className="rice-vim-fill" />
        <span className="rice-vim-hint">{r.replayHint}</span>
        <span className="rice-vim-pos">utf-8 · 1:1</span>
      </div>
    </>
  );
}

const CMD = "whoami";
const CMD_MS = 65;
const OUT_MS = 8;
const GAP_MS = 160;

/** `whoami`, typed once; the answer streams out, then the two CTAs land. */
export function Whoami() {
  const { intro, ctaWork, ctaHello } = useRiceCopy();
  const ready = useIntroDone();
  const reduced = useReduced();
  const [t, setT] = useState(-1);
  const name = "Elliot Moreau";
  const out = `${name} — ${intro}`;
  const total = CMD.length * CMD_MS + GAP_MS + out.length * OUT_MS;

  useEffect(() => {
    if (!ready) return;
    if (reduced) {
      queueMicrotask(() => setT(Infinity));
      return;
    }
    let raf = 0;
    const t0 = performance.now() + 380;
    const tick = (now: number) => {
      const e = now - t0;
      if (e >= total) {
        setT(Infinity);
        return;
      }
      setT(e);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // `total` changes with the language; the typing must not restart for it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, reduced]);

  const typedCmd = t === Infinity ? CMD.length : Math.max(0, Math.min(CMD.length, Math.floor(t / CMD_MS)));
  const outT = t - CMD.length * CMD_MS - GAP_MS;
  const shown = t === Infinity ? out.length : Math.max(0, Math.min(out.length, Math.floor(outT / OUT_MS)));
  const done = t === Infinity;
  const nameShown = Math.min(shown, name.length);

  return (
    <div className="rice-term">
      <Prompt>
        {CMD.slice(0, typedCmd)}
        {typedCmd < CMD.length && <Caret blink={false} />}
      </Prompt>
      <p className="rice-term-out" aria-hidden>
        <span className="rice-term-name">{name.slice(0, nameShown)}</span>
        <span>{out.slice(name.length, Math.max(name.length, shown))}</span>
        {shown > 0 && shown < out.length && <Caret blink={false} />}
        <span className="rice-ghost">
          {shown < name.length && <span className="rice-term-name">{name.slice(nameShown)}</span>}
          {out.slice(Math.max(name.length, shown))}
        </span>
      </p>
      <p className="sr-only">
        {name}. {intro}
      </p>
      <div className="rice-term-next" data-on={done || undefined}>
        <Prompt>
          open ./work ./hello <Caret />
        </Prompt>
        <div className="rice-ctas">
          <PressLink href="/work" className="rice-cta">
            <span aria-hidden>→</span> {ctaWork}
          </PressLink>
          <PressLink href="/contact" className="rice-cta rice-cta--ghost">
            <span aria-hidden>@</span> {ctaHello}
          </PressLink>
        </div>
      </div>
    </div>
  );
}

export function NowPlayingWin({ track, playing }: { track: TrackInfo | null; playing: boolean }) {
  const { r, lastPlayed } = useRiceCopy();
  return (
    <div className="rice-np">
      <div className="rice-np-head">
        <Cover track={track} className="rice-np-cover" />
        <div className="rice-np-meta">
          <p className="rice-np-status">
            <span className="rice-dot" data-on={playing || undefined} />
            {playing ? r.playing : track ? lastPlayed : r.paused}
          </p>
          <p className="rice-np-title">{track?.title ?? r.nothing}</p>
          {track && <p className="rice-np-artist">{track.artist}</p>}
          {track?.album && <p className="rice-np-album">{track.album}</p>}
        </div>
      </div>
      <Cava playing={playing} />
      {track && <TrackProgress track={track} playing={playing} />}
    </div>
  );
}

const PALETTE = ["#232a2e", "#e67e80", "#a7c080", "#dbbc7f", "#7fbbb3", "#d699b6", "#83c092", "#d3c6aa"];

function LiveTime() {
  const { time } = useParisTime({ seconds: true });
  return <span suppressHydrationWarning>{time ?? "--:--:--"}</span>;
}

export function Neofetch({ repos }: { repos: RepoInfo[] }) {
  const { r } = useRiceCopy();
  const counts = new Map<string, number>();
  for (const repo of repos) if (repo.language) counts.set(repo.language, (counts.get(repo.language) ?? 0) + 1);
  const langs = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l);
  const rows: [string, React.ReactNode][] = [
    ["OS", "elliotmoreau.fr"],
    ["Host", "Vercel"],
    ["Kernel", "Next.js 16"],
    ["WM", "Hyprland"],
    ["Shell", "zsh"],
    ["Terminal", "ghostty"],
    ["Theme", "Dos Moos"],
    ["Font", "JetBrains Mono"],
    ["Uptime", r.uptime],
    ["Langs", langs.slice(0, 4).join(", ") || "TypeScript"],
    ["Location", r.location],
    ["Time", <LiveTime key="t" />],
  ];
  return (
    <div className="rice-fetch">
      <div className="rice-fetch-logo" aria-hidden>
        <PixelPlanet seed="dos-moos" className="rice-fetch-planet" />
        <PixelLabel text="DOS MOOS" cell={2} className="rice-fetch-mark" />
      </div>
      <div className="rice-fetch-info">
        <p className="rice-fetch-user">
          <span>elliot</span>@<span>moreau</span>
        </p>
        <p className="rice-fetch-rule" aria-hidden>
          ──────────────
        </p>
        <dl>
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="rice-fetch-pal" aria-hidden>
          {PALETTE.map((c) => (
            <i key={c} style={{ background: c }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ───────────── workspace 2 ───────────── */

export function Projects({ repos }: { repos: RepoInfo[] }) {
  const { lang, allWork, stars } = useRiceCopy();
  const mounted = useMounted();
  const total = repos.reduce((s, x) => s + x.stars, 0);
  const onKey = (e: React.KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const rows = [...e.currentTarget.querySelectorAll<HTMLElement>(".rice-ls-row")];
    const i = rows.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    e.preventDefault();
    rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))]?.focus();
  };
  return (
    <div className="rice-ls">
      <Prompt path="~/projects">ls -la --sort=time</Prompt>
      <p className="rice-ls-total">
        total {repos.length} <span aria-hidden>·</span> <span className="rice-y">★ {total}</span> {stars}
      </p>
      <ul className="rice-ls-list" onKeyDown={onKey}>
        {repos.slice(0, 7).map((repo, i) => (
          <li key={repo.name}>
            <a className="rice-ls-row" href={repo.url} target="_blank" rel="noopener noreferrer">
              <span className="rice-ls-perm" aria-hidden>
                drwxr-xr-x
              </span>
              <span className="rice-ls-star">
                <PixelGlyph cells={GLYPH_STAR} size={10} /> {repo.stars}
              </span>
              <span className="rice-ls-date">{mounted ? timeAgo(repo.pushedAt, lang) : "—"}</span>
              <span className="rice-ls-name">
                {repo.name}
                <span aria-hidden>/</span>
                {i === 0 && <span className="rice-ls-head">HEAD</span>}
              </span>
              <span className="rice-ls-lang">
                <i style={{ background: LANG_COLORS[repo.language] ?? LANG_FALLBACK }} />
                {repo.language || "—"}
              </span>
              <span className="rice-ls-desc">{repo.description}</span>
              {repo.topics.length > 0 && (
                <span className="rice-ls-topics">{repo.topics.slice(0, 4).map((t) => `#${t}`).join("  ")}</span>
              )}
            </a>
          </li>
        ))}
      </ul>
      <PressLink href="/work" className="rice-more">
        <span className="rice-more-cmd">cd ~/projects</span> <span className="rice-more-c"># {allWork} →</span>
      </PressLink>
    </div>
  );
}

export function Notes({ posts }: { posts: GhostPost[] }) {
  const { minRead, allPosts, writingSub } = useRiceCopy();
  return (
    <div className="rice-notes">
      <p className="rice-notes-sub">{writingSub}</p>
      <ul>
        {posts.map((p) => (
          <li key={p.slug}>
            <a className="rice-note" href={p.url} target="_blank" rel="noopener noreferrer">
              <span className="rice-note-meta">
                <time dateTime={p.published_at}>{p.published_at.slice(0, 10)}</time>
                {p.tags[0] && <span className="rice-note-tag">#{p.tags[0].name.toLowerCase()}</span>}
                <span>
                  {p.reading_time} {minRead}
                </span>
              </span>
              <span className="rice-note-title">{p.title}</span>
              {p.excerpt && <span className="rice-note-ex">{p.excerpt}</span>}
            </a>
          </li>
        ))}
      </ul>
      <a className="rice-more" href="https://blog.elliotmoreau.fr" target="_blank" rel="noopener noreferrer">
        <span className="rice-more-cmd">:e blog.elliotmoreau.fr</span> <span className="rice-more-c">{allPosts} ↗</span>
      </a>
    </div>
  );
}

export function GitLog({ activity, repos }: { activity: ActivityInfo | null; repos: RepoInfo[] }) {
  const { lang, r, building } = useRiceCopy();
  const mounted = useMounted();
  const repo = activity?.repo ?? repos[0]?.name ?? "elliotmoreau.fr";
  const msg = activity?.message ?? repos[0]?.description ?? "";
  const at = activity?.createdAt ?? repos[0]?.pushedAt ?? "";
  const url = activity?.repoUrl ?? repos[0]?.url ?? SOCIALS.github;
  return (
    <div className="rice-git">
      <Prompt path={`~/${repo.length > 18 ? `${repo.slice(0, 16)}…` : repo}`} branch="main">
        git log -1
      </Prompt>
      <p>
        <span className="rice-y">commit {hexOf(repo + msg + at, 10)}</span>{" "}
        <span className="rice-aq">(HEAD → main, origin/main)</span>
      </p>
      <p>
        <span className="rice-k">Author:</span> Elliot Moreau
      </p>
      <p>
        <span className="rice-k">Date:</span> {mounted && at ? timeAgo(at, lang) : "…"}
      </p>
      <p className="rice-git-msg">{msg || r.noPush}</p>
      <p className="rice-git-foot">
        <span className="rice-chip">{building}</span>
        <a href={url} target="_blank" rel="noopener noreferrer" className="rice-link">
          {repo} ↗
        </a>
      </p>
    </div>
  );
}

/* ───────────── workspace 3 ───────────── */

export function GlobeWin({ sel, onSelect }: { sel: string; onSelect: (id: string) => void }) {
  const { r, been, want } = useRiceCopy();
  return (
    <div className="rice-globe">
      <div className="rice-globe-stage">
        <PixelGlobe places={PLACES} selectedId={sel} onSelect={onSelect} />
      </div>
      <div className="rice-globe-foot">
        <span>{r.globeHint}</span>
        <span className="rice-globe-legend">
          <i className="is-been" /> {been} <i className="is-want" /> {want}
        </span>
      </div>
    </div>
  );
}

export function PlacesWin({ sel, onSelect }: { sel: string; onSelect: (id: string) => void }) {
  const { lang, been, want, r } = useRiceCopy();
  const groups = [
    { k: "been", label: been, items: PLACES.filter((p) => p.status === "been") },
    { k: "want", label: want, items: PLACES.filter((p) => p.status === "want") },
  ];
  return (
    <div className="rice-places">
      <div className="rice-places-stats">
        {groups.map((g) => (
          <p key={g.k}>
            <span className="rice-big">{g.items.length}</span>
            <span className="rice-places-cap">{g.label}</span>
          </p>
        ))}
        <p>
          <span className="rice-big">{PLACES.length}</span>
          <span className="rice-places-cap">{r.places}</span>
        </p>
      </div>
      {groups.map((g) => (
        <div key={g.k} className="rice-places-group">
          <p className="rice-places-h">
            {g.k === "been" ? "## " : "## "}
            {g.label}
          </p>
          <ul>
            {g.items.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="rice-place"
                  data-status={p.status}
                  aria-pressed={sel === p.id}
                  onClick={() => onSelect(p.id)}
                >
                  <i aria-hidden />
                  <span className="rice-place-name">{p.name[lang]}</span>
                  <span className="rice-place-co">{fmtCoords(p.lat, p.lon)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Great-circle distance in km (haversine). */
function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function PlaceInfo({ sel }: { sel: string }) {
  const { lang, been, want, r } = useRiceCopy();
  const p = PLACES.find((x) => x.id === sel) ?? PLACES[0];
  const home = PLACES.find((x) => x.home) ?? PLACES[0];
  const dist = Math.round(km(home, p) / 10) * 10;
  return (
    <div className="rice-pin" aria-live="polite">
      <div className="rice-pin-top">
        <PixelPlanet seed={p.id} className="rice-pin-planet" />
        <span className="rice-chip" data-status={p.status}>
          {p.home ? r.homeBase : p.status === "been" ? been : want}
        </span>
      </div>
      <p className="rice-pin-kicker">
        <PixelGlyph cells={GLYPH_PIN} size={10} /> {r.place}
      </p>
      <p className="rice-pin-name">{p.name[lang]}</p>
      <p className="rice-pin-meta">
        {p.region[lang]} <span aria-hidden>·</span> {fmtCoords(p.lat, p.lon)}
      </p>
      <p className="rice-pin-dist">
        {p.home ? (
          <span className="rice-g">~ {r.homeBase}</span>
        ) : (
          <>
            <span className="rice-big rice-pin-km">{dist.toLocaleString(lang === "fr" ? "fr-FR" : "en-US")}</span>
            <span>{r.kmFromHome}</span>
          </>
        )}
      </p>
    </div>
  );
}

/* ───────────── workspace 4 ───────────── */

function useCopyEmail() {
  const { copied } = useRiceCopy();
  const { notify } = useToast();
  const { blip } = useSound();
  const [done, setDone] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(SOCIALS.email).catch(() => {});
    notify(copied);
    blip("success");
    setDone(true);
    window.setTimeout(() => setDone(false), 1800);
  };
  return { done, copy };
}

export function Mail() {
  const { hello, helloSub, copyEmail, copied, r } = useRiceCopy();
  const { done, copy } = useCopyEmail();
  return (
    <div className="rice-mail">
      <dl className="rice-mail-head">
        <div>
          <dt>{r.to}</dt>
          <dd>
            <a className="rice-mail-addr" href={`mailto:${SOCIALS.email}`}>
              {SOCIALS.email}
            </a>
          </dd>
        </div>
        <div>
          <dt>{r.from}</dt>
          <dd className="rice-mail-dim">{r.you}</dd>
        </div>
        <div>
          <dt>{r.subject}</dt>
          <dd>{hello}</dd>
        </div>
      </dl>
      <p className="rice-mail-body">{helloSub}</p>
      <div className="rice-ctas">
        <PressAnchor className="rice-cta" href={`mailto:${SOCIALS.email}`}>
          <span aria-hidden>✉</span> {r.compose}
        </PressAnchor>
        <PressButton className="rice-cta rice-cta--ghost" onClick={copy} aria-live="polite">
          <span aria-hidden>{done ? "✓" : "⧉"}</span> {done ? copied : copyEmail}
        </PressButton>
      </div>
    </div>
  );
}

const LINKS = [
  { k: "github", href: SOCIALS.github, to: "github.com/cempack" },
  { k: "youtube", href: SOCIALS.youtube, to: "youtube.com/cempack" },
  { k: "mastodon", href: SOCIALS.mastodon, to: "mastodon.social/@cempack" },
  { k: "x", href: SOCIALS.x, to: "x.com/cempack_" },
  { k: "spotify", href: SOCIALS.spotifyUser, to: "open.spotify.com/user/…" },
];

export function Socials() {
  return (
    <div className="rice-links">
      <Prompt path="~/.links">ls -l</Prompt>
      <ul>
        {LINKS.map((l) => (
          <li key={l.k}>
            <a className="rice-link-row" href={l.href} target="_blank" rel="noopener noreferrer">
              <span className="rice-link-perm" aria-hidden>
                lrwxrwxrwx
              </span>
              <span className="rice-link-k">{l.k}</span>
              <span className="rice-link-arrow" aria-hidden>
                →
              </span>
              <span className="rice-link-to">{l.to}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

type SubState = "idle" | "sending" | "done" | "exists" | "invalid" | "error";

export function Newsletter({ latest }: { latest?: GhostPost }) {
  const { newsletter, newsletterSub, subscribe, emailPh, r } = useRiceCopy();
  const { blip } = useSound();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<SubState>("idle");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "sending" || state === "done") return;
    setState("sending");
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; already?: boolean; reason?: string } | null;
      if (json?.ok) {
        setState(json.already ? "exists" : "done");
        blip("success");
      } else setState(json?.reason === "invalid" ? "invalid" : "error");
    } catch {
      setState("error");
    }
  };
  const msg = state === "done" ? r.done : state === "exists" ? r.exists : state === "invalid" ? r.invalid : state === "error" ? r.error : "";
  return (
    <div className="rice-news">
      <p className="rice-news-title">{newsletter}</p>
      <p className="rice-news-sub">{newsletterSub}</p>
      {latest && (
        <a className="rice-news-latest" href={latest.url} target="_blank" rel="noopener noreferrer">
          <span className="rice-k">{r.latest}</span>
          <span className="rice-news-latest-t">{latest.title}</span>
        </a>
      )}
      {state === "done" || state === "exists" ? (
        <p className="rice-news-msg is-ok" role="status">
          ✓ {msg}
        </p>
      ) : (
        <form className="rice-news-form" onSubmit={submit}>
          <label className="rice-news-field">
            <span aria-hidden>❯</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (state === "invalid" || state === "error") setState("idle");
              }}
              placeholder={emailPh}
              aria-label={newsletter}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>
          <PressButton type="submit" className="rice-cta" disabled={state === "sending"}>
            {state === "sending" ? r.sending : subscribe}
          </PressButton>
        </form>
      )}
      {msg && state !== "done" && state !== "exists" && (
        <p className="rice-news-msg" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}

/* ───────────── desktop widgets ───────────── */

/** Conky-style widget painted straight on the wallpaper: the section title. */
export function Conky({
  n,
  id,
  title,
  sub,
  children,
}: {
  n: string;
  id: string;
  title: string;
  sub: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rice-conky" style={{ gridArea: "conky" }}>
      <div className="rice-conky-n" aria-hidden>
        <PixelLabel text={n} cell={15} />
      </div>
      <h2 id={id} className="rice-conky-title">
        {title}
      </h2>
      <p className="rice-conky-sub">{sub}</p>
      {children}
    </div>
  );
}
