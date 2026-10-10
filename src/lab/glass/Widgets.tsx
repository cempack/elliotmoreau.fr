"use client";

import { useState } from "react";
import {
  GLYPH_CODE,
  GLYPH_MAIL,
  GLYPH_NOTE,
  GLYPH_PIN,
  GLYPH_PLAY,
  GLYPH_STAR,
  PixelGlyph,
  type Cells,
} from "@/components/glyphs";
import { PixelGlobe } from "@/components/PixelGlobe";
import { PixelPlanet } from "@/components/PixelPlanet";
import { PressAnchor, PressButton, PressLink } from "@/components/ui/Pressable";
import { useParisTime } from "@/hooks/useParisTime";
import { timeAgo } from "@/lib/format";
import { LANG_COLORS, LANG_FALLBACK } from "@/lib/langColors";
import { HOME, PLACES, fmtCoords } from "@/lib/places";
import { useSound } from "@/lib/sound";
import type { HomeData } from "@/lib/data";
import type { RepoInfo } from "@/lib/github";
import { Arrow, Cover, Eq, ExpandIcon, GLYPH_MOON, GLYPH_SUN, ParisClock } from "./bits";
import { useHydrated } from "./env";
import { useSpotify } from "./live";
import { doingAt, phaseOf, useGlassCopy } from "./strings";

export type WidgetId = "writing" | "listening" | "time" | "work" | "atlas";

const BLOG = "https://blog.elliotmoreau.fr";

/* ───────────────────────── shared pieces ───────────────────────── */

export function CardHead({
  glyph,
  label,
  meta,
  expandable = true,
}: {
  glyph: Cells;
  label: string;
  meta?: React.ReactNode;
  expandable?: boolean;
}) {
  return (
    <div className="g-head">
      <span className="g-head-glyph">
        <PixelGlyph cells={glyph} size={14} />
      </span>
      <span className="g-head-label">{label}</span>
      {meta && <span className="g-head-meta">{meta}</span>}
      {expandable && (
        <span className="g-head-expand" aria-hidden>
          <ExpandIcon />
        </span>
      )}
    </div>
  );
}

function LangDot({ lang }: { lang: string }) {
  return <span className="g-langdot" style={{ background: LANG_COLORS[lang] ?? LANG_FALLBACK }} aria-hidden />;
}

function Ago({ iso }: { iso: string }) {
  const { lang } = useGlassCopy();
  const hydrated = useHydrated();
  if (!hydrated) return null;
  return <>{timeAgo(iso, lang)}</>;
}

const fmtDur = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const byStars = (repos: RepoInfo[]) => [...repos].sort((a, b) => b.stars - a.stars);

/* ───────────────────────── widget heads (used by panel titles) ───────────────────────── */

export function useWidgetMeta() {
  const c = useGlassCopy();
  const { hour } = useParisTime();
  const day = hour != null && hour >= 7 && hour < 20;
  return {
    writing: { glyph: GLYPH_NOTE, label: c.writing },
    listening: { glyph: GLYPH_PLAY, label: c.listening },
    time: { glyph: day ? GLYPH_SUN : GLYPH_MOON, label: c.localTime },
    work: { glyph: GLYPH_CODE, label: c.work },
    atlas: { glyph: GLYPH_PIN, label: c.atlas },
  } satisfies Record<WidgetId, { glyph: Cells; label: string }>;
}

/* ───────────────────────── faces (the bento cards) ───────────────────────── */

export function WritingFace({ data }: { data: HomeData }) {
  const c = useGlassCopy();
  const [p, ...rest] = data.posts;
  return (
    <>
      <CardHead glyph={GLYPH_NOTE} label={c.writing} meta={c.t("latest")} />
      {p ? (
        <div className="g-w">
          <span className="g-w-planet" aria-hidden>
            <PixelPlanet seed={p.slug} className="g-w-planet-cv" />
          </span>
          <div className="g-w-meta">
            {p.tags[0] && <span className="g-tag">{p.tags[0].name}</span>}
            <span>
              {p.reading_time} {c.minRead}
            </span>
            <span className="g-w-ago">
              <Ago iso={p.published_at} />
            </span>
          </div>
          <h3 className="g-w-title">{p.title}</h3>
          <p className="g-w-excerpt">{p.excerpt}</p>
          {rest.length > 0 && (
            <ul className="g-w-also">
              {rest.slice(0, 2).map((r) => (
                <li key={r.slug}>
                  <PixelPlanet seed={r.slug} className="g-w-also-planet" />
                  <span className="g-trunc">{r.title}</span>
                  <span className="g-w-also-meta">
                    {r.reading_time} min
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="g-empty">{c.writingSub}</p>
      )}
    </>
  );
}

export function ListeningFace() {
  const c = useGlassCopy();
  const { status, track, playing } = useSpotify();
  return (
    <>
      <CardHead
        glyph={GLYPH_PLAY}
        label={c.listening}
        meta={
          track ? (
            <span className="g-live" data-on={playing || undefined}>
              {playing ? c.nowPlaying : c.lastPlayed}
            </span>
          ) : undefined
        }
      />
      {track ? (
        <div className="g-l">
          <Cover image={track.image} seed={`${track.title}${track.artist}`} className="g-l-cover" />
          <div className="g-l-text">
            <div className="g-l-title g-trunc">{track.title}</div>
            <div className="g-l-artist g-trunc">{track.artist}</div>
          </div>
          <Progress playing={playing} progressMs={track.progressMs} durationMs={track.durationMs} />
          {status && status.artists.length > 0 && (
            <div className="g-l-repeat">
              <span className="g-l-repeat-k">
                <Eq playing={playing} />
                {c.topArtists}
              </span>
              <span className="g-l-repeat-v g-trunc">
                {status.artists
                  .slice(0, 3)
                  .map((a) => a.name)
                  .join(", ")}
              </span>
            </div>
          )}
        </div>
      ) : (
        <p className="g-empty">{c.t("nothingPlaying")}</p>
      )}
    </>
  );
}

/** Track progress: a still bar, or one that keeps moving while playing. */
function Progress({ playing, progressMs, durationMs }: { playing: boolean; progressMs: number; durationMs: number }) {
  const frac = durationMs > 0 ? Math.min(1, progressMs / durationMs) : 0;
  const remaining = Math.max(1, (durationMs - progressMs) / 1000);
  return (
    <div className="g-progress">
      <div className="g-progress-track">
        <span
          key={`${progressMs}-${durationMs}`}
          className="g-progress-fill"
          data-playing={playing || undefined}
          style={{ "--from": frac, animationDuration: `${remaining}s` } as React.CSSProperties}
        />
      </div>
      {durationMs > 0 && <span className="g-progress-time g-tnum">{fmtDur(durationMs)}</span>}
    </div>
  );
}

export function TimeFace() {
  const c = useGlassCopy();
  const { hour } = useParisTime();
  const day = hour != null && hour >= 7 && hour < 20;
  return (
    <>
      <CardHead glyph={day ? GLYPH_SUN : GLYPH_MOON} label={c.localTime} />
      <div className="g-t" data-day={day || undefined}>
        <ParisClock className="g-t-time" />
        <div className="g-t-phase" suppressHydrationWarning>
          {hour == null ? c.inFrance : `${phaseOf(hour, c.lang)} ${c.inFrance}`}
        </div>
      </div>
    </>
  );
}

export function WorkFace({ data }: { data: HomeData }) {
  const c = useGlassCopy();
  const sorted = byStars(data.repos);
  const f = sorted[0];
  const total = data.repos.reduce((s, r) => s + r.stars, 0);
  return (
    <>
      <CardHead glyph={GLYPH_CODE} label={c.work} meta={c.workSub} />
      {f ? (
        <div className="g-k">
          <div className="g-k-feat">
            <h3 className="g-k-name">{f.name}</h3>
            <p className="g-k-desc">{f.description}</p>
            <div className="g-k-meta">
              {f.language && (
                <span>
                  <LangDot lang={f.language} />
                  {f.language}
                </span>
              )}
              <span>
                <PixelGlyph cells={GLYPH_STAR} size={11} className="g-star" />
                {f.stars}
              </span>
            </div>
          </div>
          <div className="g-k-stats">
            <div>
              <span className="g-num">{data.repos.length}</span>
              <span className="g-num-k">{c.t("projects")}</span>
            </div>
            <div>
              <span className="g-num">{total}</span>
              <span className="g-num-k">{c.t("starsTotal")}</span>
            </div>
          </div>
        </div>
      ) : (
        <p className="g-empty">{c.workSub}</p>
      )}
    </>
  );
}

export function AtlasFace({ globe, snapshot }: { globe: boolean; snapshot?: string | null }) {
  const c = useGlassCopy();
  const been = PLACES.filter((p) => p.status === "been");
  const next = PLACES.filter((p) => p.status === "want");
  return (
    <>
      <CardHead
        glyph={GLYPH_PIN}
        label={c.atlas}
        meta={`${been.length} ${c.been.toLowerCase()} · ${next.length} ${c.want.toLowerCase()}`}
      />
      <div className="g-a">
        <p className="g-a-sub">{c.atlasSub}</p>
        <ul className="g-a-chips">
          {been.slice(0, 5).map((p) => (
            <li key={p.id} data-status="been">
              {p.name[c.lang]}
            </li>
          ))}
          {next.slice(0, 3).map((p) => (
            <li key={p.id} data-status="want">
              {p.name[c.lang]}
            </li>
          ))}
        </ul>
        <div className="g-a-globe" aria-hidden>
          {globe ? (
            <PixelGlobe places={PLACES} selectedId="france" onSelect={() => {}} />
          ) : snapshot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={snapshot} alt="" className="g-a-snap" />
          ) : null}
        </div>
      </div>
    </>
  );
}

export function NewsletterCard() {
  const c = useGlassCopy();
  const { blip } = useSound();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "exists" | "invalid" | "error">("idle");

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

  const msg =
    state === "done"
      ? c.t("nlDone")
      : state === "exists"
        ? c.t("nlExists")
        : state === "invalid"
          ? c.t("nlInvalid")
          : state === "error"
            ? c.t("nlError")
            : null;

  return (
    <>
      <CardHead glyph={GLYPH_MAIL} label="Newsletter" expandable={false} />
      <div className="g-n">
        <p className="g-n-title">{c.newsletter}</p>
        <p className="g-n-sub">{c.newsletterSub}</p>
        {state === "done" || state === "exists" ? (
          <p className="g-n-msg" data-ok aria-live="polite">
            {msg}
          </p>
        ) : (
          <form onSubmit={submit} className="g-n-form">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (state === "invalid" || state === "error") setState("idle");
              }}
              placeholder={c.emailPh}
              aria-label={c.newsletter}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="g-input"
            />
            <PressButton type="submit" className="g-btn g-btn--primary g-btn--sm" disabled={state === "sending"}>
              {state === "sending" ? c.t("sending") : c.subscribe}
            </PressButton>
          </form>
        )}
        {msg && state !== "done" && state !== "exists" && (
          <p className="g-n-msg" aria-live="polite">
            {msg}
          </p>
        )}
      </div>
    </>
  );
}

/* ───────────────────────── details (inside the expanded panel) ───────────────────────── */

export function WritingDetail({ data }: { data: HomeData }) {
  const c = useGlassCopy();
  const [p, ...rest] = data.posts;
  if (!p) return <p className="g-empty">{c.writingSub}</p>;
  return (
    <div className="g-d">
      <div className="g-d-hero g-d-hero--writing">
        {p.feature_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.feature_image} alt="" className="g-d-feature" />
        ) : (
          <div className="g-d-feature g-d-feature--pixel" aria-hidden>
            <PixelPlanet seed={p.slug} className="g-d-feature-planet" />
          </div>
        )}
      </div>
      <div className="g-w-meta">
        {p.tags[0] && <span className="g-tag">{p.tags[0].name}</span>}
        <span>
          {p.reading_time} {c.minRead}
        </span>
        <span>
          <Ago iso={p.published_at} />
        </span>
      </div>
      <h3 className="g-d-title">{p.title}</h3>
      <p className="g-d-lede">{p.excerpt}</p>
      <div className="g-d-actions">
        <PressAnchor href={p.url} target="_blank" rel="noreferrer" className="g-btn g-btn--primary">
          {c.t("readOn")}
          <Arrow />
        </PressAnchor>
        <PressAnchor href={BLOG} target="_blank" rel="noreferrer" className="g-btn g-btn--clear">
          {c.allPosts}
        </PressAnchor>
      </div>
      {rest.length > 0 && (
        <>
          <h4 className="g-d-sub">{c.t("also")}</h4>
          <ul className="g-d-list">
            {rest.map((r) => (
              <li key={r.slug}>
                <a href={r.url} target="_blank" rel="noreferrer" className="g-d-row">
                  <PixelPlanet seed={r.slug} className="g-d-row-planet" />
                  <span className="g-d-row-main">
                    <span className="g-d-row-title">{r.title}</span>
                    <span className="g-d-row-sub">{r.excerpt}</span>
                  </span>
                  <span className="g-d-row-meta">
                    {r.reading_time} min
                    <Arrow />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function ListeningDetail() {
  const c = useGlassCopy();
  const { status, track, playing } = useSpotify();
  if (!track) return <p className="g-empty">{c.t("nothingPlaying")}</p>;
  return (
    <div className="g-d">
      <div className="g-d-track">
        <Cover image={track.image} seed={`${track.title}${track.artist}`} className="g-d-cover" />
        <div className="g-d-track-text">
          <span className="g-live" data-on={playing || undefined}>
            {playing ? c.nowPlaying : track.playedAt ? c.lastPlayed : c.t("paused")}
          </span>
          <h3 className="g-d-title g-d-title--track">{track.title}</h3>
          <p className="g-d-lede">
            {track.artist}
            {track.album && <span className="g-d-album"> · {track.album}</span>}
          </p>
          <Progress playing={playing} progressMs={track.progressMs} durationMs={track.durationMs} />
          <div className="g-d-actions">
            <PressAnchor href={track.url} target="_blank" rel="noreferrer" className="g-btn g-btn--primary">
              {c.t("openSpotify")}
              <Arrow />
            </PressAnchor>
          </div>
        </div>
      </div>
      {status && status.artists.length > 0 && (
        <>
          <h4 className="g-d-sub">{c.topArtists}</h4>
          <ol className="g-d-artists">
            {status.artists.map((a, i) => (
              <li key={a.name}>
                <span className="g-d-rank g-tnum">{i + 1}</span>
                <Cover image={a.image} seed={a.name} className="g-d-artist-cover" />
                <span className="g-d-artist-name">{a.name}</span>
              </li>
            ))}
          </ol>
        </>
      )}
      {status?.recent && status.now && status.recent.title !== status.now.title && (
        <>
          <h4 className="g-d-sub">{c.t("recentTrack")}</h4>
          <p className="g-d-lede">
            {status.recent.title} · {status.recent.artist}
          </p>
        </>
      )}
    </div>
  );
}

export function TimeDetail() {
  const c = useGlassCopy();
  const { hour } = useParisTime();
  const day = hour != null && hour >= 7 && hour < 20;
  return (
    <div className="g-d g-d--time" data-day={day || undefined}>
      <div className="g-d-sky" aria-hidden>
        <PixelGlyph cells={day ? GLYPH_SUN : GLYPH_MOON} size={84} className={day ? "g-sun" : "g-moon"} />
      </div>
      <ParisClock seconds className="g-d-clock" />
      <p className="g-d-phase" suppressHydrationWarning>
        {hour == null ? c.inFrance : `${phaseOf(hour, c.lang)} ${c.inFrance}`}
      </p>
      <dl className="g-d-facts">
        <div>
          <dt>{c.t("probably")}</dt>
          <dd suppressHydrationWarning>{hour == null ? "…" : doingAt(hour, c.lang)}</dd>
        </div>
        <div>
          <dt>{c.t("homeBase")}</dt>
          <dd>
            {HOME.name[c.lang]} <span className="g-d-coords g-tnum">{fmtCoords(HOME.lat, HOME.lon)}</span>
          </dd>
        </div>
        <div>
          <dt>{c.t("bestTime")}</dt>
          <dd>{c.t("bestTimeVal")}</dd>
        </div>
      </dl>
    </div>
  );
}

export function WorkDetail({ data }: { data: HomeData }) {
  const c = useGlassCopy();
  const total = data.repos.reduce((s, r) => s + r.stars, 0);
  const a = data.activity;
  return (
    <div className="g-d">
      <div className="g-d-stats">
        <div>
          <span className="g-num">{data.repos.length}</span>
          <span className="g-num-k">{c.t("repoCount")}</span>
        </div>
        <div>
          <span className="g-num">{total}</span>
          <span className="g-num-k">{c.stars}</span>
        </div>
        {a && (
          <div className="g-d-stats-push">
            <span className="g-num-k">
              {c.lastPush} · <Ago iso={a.createdAt} />
            </span>
            <span className="g-d-push-msg">“{a.message}”</span>
            <span className="g-num-k">{a.repo}</span>
          </div>
        )}
      </div>
      <ul className="g-d-list">
        {data.repos.map((r) => (
          <li key={r.name}>
            <a href={r.url} target="_blank" rel="noreferrer" className="g-d-row">
              <PixelPlanet seed={r.name} className="g-d-row-planet" />
              <span className="g-d-row-main">
                <span className="g-d-row-title">{r.name}</span>
                <span className="g-d-row-sub">{r.description}</span>
                <span className="g-d-row-tags">
                  {r.language && (
                    <span>
                      <LangDot lang={r.language} />
                      {r.language}
                    </span>
                  )}
                  <span>
                    <PixelGlyph cells={GLYPH_STAR} size={10} className="g-star" />
                    {r.stars}
                  </span>
                  <span>
                    <Ago iso={r.pushedAt} />
                  </span>
                </span>
              </span>
              <span className="g-d-row-meta">
                <Arrow />
              </span>
            </a>
          </li>
        ))}
      </ul>
      <div className="g-d-actions">
        <PressLink href="/work" className="g-btn g-btn--primary">
          {c.allWork}
          <Arrow />
        </PressLink>
      </div>
    </div>
  );
}

export function AtlasDetail() {
  const c = useGlassCopy();
  const { blip } = useSound();
  const [sel, setSel] = useState<string>("france");
  const place = PLACES.find((p) => p.id === sel) ?? PLACES[0];
  const pick = (id: string) => {
    if (id === sel) return;
    setSel(id);
    blip("select");
  };
  return (
    <div className="g-d g-d--atlas">
      <div className="g-d-globe" data-no-drag>
        <PixelGlobe places={PLACES} selectedId={sel} onSelect={pick} />
      </div>
      <div className="g-d-place" aria-live="polite">
        <span className="g-tag" data-status={place.status}>
          {place.home ? c.home : place.status === "been" ? c.been : c.want}
        </span>
        <h3 className="g-d-title">{place.name[c.lang]}</h3>
        <p className="g-d-lede">
          <span className="g-d-region">{place.region[c.lang]}</span>
          <span className="g-d-coords g-tnum">{fmtCoords(place.lat, place.lon)}</span>
        </p>
      </div>
      {(["been", "want"] as const).map((s) => (
        <div key={s}>
          <h4 className="g-d-sub">{s === "been" ? c.been : c.want}</h4>
          <div className="g-d-places">
            {PLACES.filter((p) => p.status === s).map((p) => (
              <PressButton
                key={p.id}
                className="g-place-btn"
                data-status={p.status}
                aria-pressed={p.id === sel}
                onClick={() => pick(p.id)}
              >
                {p.name[c.lang]}
              </PressButton>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
