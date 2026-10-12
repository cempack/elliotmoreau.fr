"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/client";
import { useHydrated } from "@/hooks/env";
import { useHomeTime } from "@/hooks/useHomeTime";
import { useSpotifyStatus } from "@/hooks/useSpotifyStatus";
import { timeAgo } from "@/lib/format";
import { useSound } from "@/lib/sound";
import { GLYPH_NOTE, PixelGlyph } from "@/components/glyphs";
import { EmosLogo } from "../EmosLogo";
import { G_COMMIT, G_PEN } from "@/components/apps/home/desktop/icons";
import { useSiteData } from "../SiteData";
import { Wordmark } from "./Wordmark";
import { playStartupChord } from "./chime";
import { Skyline } from "./Skyline";
import { loc } from "@/lib/content";
import { clockIn, tzForAway } from "@/lib/tz";

/** The lock screen takes over from the boot here (ms from first paint). */
const BOOT_MS = 3800;
/** The unlock: the UI rises away and the veil clears. */
const OUT_MS = 560;
/** The name's boxes (8 px cells; CSS scales them, see intro.css). */
const BOX = { desk: { w: 1040, h: 320 }, phone: { w: 720, h: 184 } };
/** Progress segments light at uneven times, the way real boots stall. */
const SEGMENTS = [
  160, 230, 300, 360, 520, 600, 640, 700, 980, 1040, 1100, 1260, 1300, 1340, 1700, 1760, 1820, 1880, 2160, 2240, 2500,
  2560, 2620, 2900, 2960, 3020, 3180, 3240, 3300, 3380,
];

/**
 * Parsed (and run) as the gate's first child, before any of its pixels:
 * marks returning visitors so CSS hides the boot pre-paint. Mirrors the
 * layout's head script, in case that one fails.
 */
const PREPAINT = `try{if(sessionStorage.getItem("em-intro"))document.documentElement.dataset.intro="done"}catch(e){}`;

/** When the CSS sequence started (performance.now() clock), read off the
    boot screen's own keyframes; cached once known. */
let started: number | null = null;
function sequenceStart() {
  if (started != null) return started;
  const t = document.querySelector(".os-intro-boot")?.getAnimations()[0]?.startTime;
  if (typeof t === "number") return (started = t);
  const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime;
  return (started = fcp ?? performance.now());
}

type Mode = "first" | "relock";
type Phase = "boot" | "lock" | "out";

export default function Gate({ mode, onDone }: { mode: Mode; onDone: () => void }) {
  const hydrated = useHydrated();
  const { muted } = useSound();
  const [phase, setPhase] = useState<Phase>(mode === "first" ? "boot" : "lock");
  const [skipped, setSkipped] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // the boot runs on the clock of its own keyframes: the lock takes over
  // when the boot screen's fade-out actually ends (what the visitor sees,
  // in every engine), with a timer only as a fallback; any input skips it
  useEffect(() => {
    if (phase !== "boot") return;
    const elapsed = performance.now() - sequenceStart();
    const id = window.setTimeout(() => setPhase("lock"), Math.max(0, BOOT_MS - elapsed) + 1200);
    const boot = rootRef.current?.querySelector(".os-intro-boot");
    const ended = (e: Event) => {
      if ((e as AnimationEvent).animationName === "os-boot-out") setPhase("lock");
    };
    boot?.addEventListener("animationend", ended);
    const skip = (e: Event) => {
      if (e instanceof KeyboardEvent && (e.repeat || e.metaKey || e.ctrlKey || e.altKey)) return;
      setSkipped(true);
      setPhase("lock");
    };
    window.addEventListener("keydown", skip, true);
    window.addEventListener("pointerdown", skip, true);
    return () => {
      window.clearTimeout(id);
      boot?.removeEventListener("animationend", ended);
      window.removeEventListener("keydown", skip, true);
      window.removeEventListener("pointerdown", skip, true);
    };
  }, [phase]);

  // while it's up, the menu bar and the dock step away (intro.css); the
  // layout's pre-paint script already set this for a boot on the Desktop
  useEffect(() => {
    const root = document.documentElement;
    if (phase === "out") {
      delete root.dataset.introUp;
      return;
    }
    root.dataset.introUp = mode;
    return () => {
      delete root.dataset.introUp;
    };
  }, [mode, phase]);

  // while locked, the rest of the OS is inert (focus can't leave the lock)
  useEffect(() => {
    if (!hydrated || phase === "out") return;
    const el = rootRef.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const others = Array.from(parent.children).filter((n) => n !== el && !n.hasAttribute("inert"));
    others.forEach((n) => n.setAttribute("inert", ""));
    return () => others.forEach((n) => n.removeAttribute("inert"));
  }, [hydrated, phase]);

  const unlock = (gesture: boolean) => {
    // a tap on the lock counts even if the boot clock is a beat behind
    if (phase === "out") return;
    setPhase("out");
    let off = muted;
    try {
      off ||= localStorage.getItem("em-sound") === "off";
    } catch {}
    if (gesture && !off) playStartupChord();
    // the desktop settles in while the veil clears
    if (mode === "first") window.dispatchEvent(new CustomEvent("em:intro-done"));
    window.setTimeout(() => {
      if (mode === "first") {
        try {
          sessionStorage.setItem("em-intro", "1");
        } catch {}
        document.documentElement.dataset.intro = "done";
      }
      onDone();
    }, OUT_MS);
  };

  return (
    <div
      ref={rootRef}
      className={`os-intro ${mode === "first" ? "em-intro" : ""}`}
      data-mode={mode}
      data-phase={phase}
      data-skip={skipped || undefined}
      data-live={hydrated || undefined}
    >
      {!hydrated && mode === "first" && <script dangerouslySetInnerHTML={{ __html: PREPAINT }} />}
      <LockScreen phase={phase} onUnlock={unlock} />
      {mode === "first" && <BootScreen />}
    </div>
  );
}

/* ───────────────────────── boot ───────────────────────── */

function BootScreen() {
  const { t } = useI18n();
  const s = t.system.intro;
  const { repos, posts } = useSiteData();
  const hydrated = useHydrated();
  const lines = s.boot.map((l) =>
    l
      .replace("{repos}", repos.length ? String(repos.length) : "")
      .replace("{posts}", posts.length ? String(posts.length) : "")
      .replace(/\s{2,}/g, " ")
  );
  return (
    <div className="os-intro-boot" aria-hidden>
      <div className="os-boot-center">
        <div className="os-boot-mark">
          <div className="os-boot-hero">
            <Wordmark desk={BOX.desk} phone={BOX.phone} live={hydrated} />
          </div>
        </div>
        <span className="os-boot-bar">
          {SEGMENTS.map((d, i) => (
            <i key={i} style={{ "--d": `${d}ms` } as React.CSSProperties} />
          ))}
        </span>
        <ol className="os-boot-log">
          {lines.map((l, i) => (
            <li key={i} style={{ "--i": i } as React.CSSProperties}>
              <span className="os-boot-ok">[ OK ]</span> {l}
            </li>
          ))}
        </ol>
      </div>
      <p className="os-boot-foot">
        <span>{s.version}</span>
        <span className="os-boot-skip">{s.skip}</span>
        <span className="os-boot-skip os-boot-skip--touch">{s.skipTouch}</span>
      </p>
    </div>
  );
}

/* ───────────────────────── lock screen ───────────────────────── */

const dateFormat = (lang: string) =>
  new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
  });

/** Long localized date in Toulouse, after mount only (hydration-safe). */
function useHomeDate(lang: string) {
  const [date, setDate] = useState<string | null>(null);
  useEffect(() => {
    const fmt = dateFormat(lang);
    const tick = () => setDate(fmt.format(new Date()));
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 60_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [lang]);
  return date;
}

const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? "");

function LockScreen({ phase, onUnlock }: { phase: Phase; onUnlock: (gesture: boolean) => void }) {
  const { t, lang } = useI18n();
  const s = t.system.intro;
  const hydrated = useHydrated();
  const { time } = useHomeTime();
  const date = useHomeDate(lang);
  const data = useSiteData();
  const music = useSpotifyStatus(data.spotify);
  const post = data.posts[0];
  const push = data.activity;
  // travelling: the city, its skyline and its time (after mount: the clock is the browser's)
  const away = data.away;
  const awayCity = away ? (away.place ? loc(away.place.name, lang) : away.city) : undefined;
  const awayTz = tzForAway(away);
  const awayTime = hydrated && awayTz && time ? clockIn(awayTz) : null;
  const [pw, setPw] = useState("");
  const [checking, setChecking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // the field takes the keyboard as soon as the lock is up (not on touch:
  // that would throw a keyboard over the screen)
  useEffect(() => {
    if (phase !== "lock" || !hydrated) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    inputRef.current?.focus({ preventScroll: true });
  }, [phase, hydrated]);

  const submit = () => {
    if (checking || phase === "out") return;
    setChecking(true);
    // a beat for "checking", then in
    window.setTimeout(() => onUnlock(true), 380);
  };

  const notes: { key: string; glyph: typeof GLYPH_NOTE; kicker: string; text: string; when?: string }[] = [];
  if (music.track) {
    notes.push({
      key: "music",
      glyph: GLYPH_NOTE,
      kicker: music.playing ? s.notes.playing : s.notes.played,
      text: `${music.track.title} · ${music.track.artist}`,
    });
  }
  if (post) {
    notes.push({ key: "post", glyph: G_PEN, kicker: s.notes.post, text: post.title, when: hydrated ? timeAgo(post.published_at, lang) : "" });
  }
  if (push) {
    notes.push({
      key: "push",
      glyph: G_COMMIT,
      kicker: fill(s.notes.push, { repo: push.repo }),
      text: push.message,
      when: hydrated ? timeAgo(push.createdAt, lang) : "",
    });
  }

  return (
    <div className="os-intro-lock" role="dialog" aria-modal="true" aria-label={s.lock}>
      <div className="os-lock-veil" />
      {awayCity && <Skyline city={awayCity} />}
      <div className="os-lock-ui">
        <div className="os-lock-when">
          <p className="os-lock-date">{date ?? " "}</p>
          <p className="os-lock-time tabular" suppressHydrationWarning>
            {time ?? "--:--"}
          </p>
          {awayCity && (
            <p className="os-lock-away">
              <span className="os-lock-away-city">{fill(s.away, { city: awayCity })}</span>
              {awayTime && (
                <span className="os-lock-away-time tabular" suppressHydrationWarning>
                  {fill(s.awayTime, { time: awayTime })}
                </span>
              )}
            </p>
          )}
        </div>

        {notes.length > 0 && (
          <ul className="os-lock-notes" aria-label={s.notes.label}>
            {notes.map((n) => (
              <li key={n.key} className="os-lock-note">
                <PixelGlyph cells={n.glyph} size={14} className="os-lock-note-glyph" />
                <span className="os-lock-note-body">
                  <span className="os-lock-note-kicker">
                    {n.kicker}
                    {n.when && (
                      <span className="os-lock-note-when" suppressHydrationWarning>
                        {n.when}
                      </span>
                    )}
                  </span>
                  <span className="os-lock-note-text">{n.text}</span>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="os-lock-auth" data-checking={checking || undefined}>
          <span className="os-lock-avatar" aria-hidden>
            <EmosLogo className="os-lock-logo" />
          </span>
          <p className="os-lock-name">{s.name}</p>
          <div className="os-lock-field">
            <input
              ref={inputRef}
              type="password"
              className="os-lock-input"
              aria-label={s.password}
              placeholder={s.placeholder}
              autoComplete="off"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              disabled={!hydrated || checking}
            />
            <button type="button" className="os-lock-go" aria-label={s.unlock} onClick={submit} disabled={!hydrated}>
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
                <path d="M3 8h9M8.5 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="square" />
              </svg>
            </button>
          </div>
          <button type="button" className="os-lock-tap" onClick={submit} disabled={!hydrated}>
            {s.unlockTouch}
          </button>
          <p className="os-lock-hint">{s.hint}</p>
        </div>
      </div>
    </div>
  );
}
