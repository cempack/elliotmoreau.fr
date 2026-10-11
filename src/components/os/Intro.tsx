"use client";

import "./intro.css";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { m } from "motion/react";
import { useI18n } from "@/i18n/client";
import { IntroGate, useIntroFinish } from "@/components/ui/IntroGate";
import { PixelLabel } from "@/components/PixelLabel";
import { useParisTime } from "@/hooks/useParisTime";
import { useHydrated } from "@/hooks/env";
import { useSound } from "@/lib/sound";
import { fmtCoords } from "@/lib/places";
import { EmMark } from "./intro/Mark";
import { Padlock, SkyGlyph } from "./intro/pixels";
import { playStartupChord } from "./intro/chime";
import { restartOS } from "./menubar/util";

/**
 * CONTRACT (owner: boot/terminal agent)
 * Once-per-session boot → lock screen, built on IntroGate (SSR-visible,
 * skipped by any input, hidden pre-paint for returning visitors, never
 * under reduced motion, ≤ 2.4s total). Boot: pixel emOS mark + progress.
 * Lock screen: huge Paris clock + date over the wallpaper, "Elliot Moreau",
 * a hint to unlock; unlock = the glass lifts away (spring) revealing the
 * desktop; optional startup chime if sound is on and a gesture unlocked it.
 *
 * How it plays: the whole boot → lock sequence is CSS keyframes, so it
 * runs from the first server-rendered paint, before hydration. JS only
 * ends it on the same clock (measured from first paint). When IntroGate
 * finishes, by timer or by any input, the page is interactive at once and
 * a pointer-transparent copy of the last frame takes over to perform the
 * exit: the lock screen's glass sheet lifts up and away on a spring while
 * the desktop settles in underneath (or the boot screen fades through, if
 * input came that early).
 */

/** Boot screen hands over to the lock screen here (ms from first paint). */
const SPLIT_MS = 960;
/** Auto unlock; the lift then runs ~0.45s, so ≤ 2.4s end to end. */
const AUTO_MS = 1940;
/** Mirrors the CSS failsafe that hides a never-hydrated intro. */
const FAILSAFE_MS = 4500;

const PARIS = fmtCoords(48.8566, 2.3522);

/**
 * Parsed (and run) as the gate's first child, before any of its pixels:
 * marks returning visitors so CSS hides the intro pre-paint. Mirrors the
 * layout's head script, as a belt-and-braces copy in case that one fails.
 */
const PREPAINT = `try{if(sessionStorage.getItem("em-intro"))document.documentElement.dataset.intro="done"}catch(e){}`;

/**
 * When the CSS sequence started, on the performance.now() clock. Read off
 * the boot screen's own keyframes (the HTML can stream in after first
 * paint), falling back to first contentful paint. Cached: once the gate
 * hides, its animations are gone.
 */
let started: number | null = null;
function sequenceStart() {
  if (started != null) return started;
  const anim = document.querySelector(".os-intro-boot")?.getAnimations()[0];
  const t = anim?.startTime;
  if (typeof t === "number") return (started = t);
  const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime;
  if (fcp != null) return (started = fcp);
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  return (started = nav?.responseEnd ?? performance.now());
}

/**
 * Restart emOS: forget this session's intro, power the display down and
 * reload into the boot. One path for the About panel, Spotlight, the
 * Terminal's `reboot` and the Desktop (menubar/util).
 */
export const rebootOS = restartOS;

type ExitFrom = "boot" | "lock";
/** The lock screen's clock and date, frozen at the moment of unlock. */
type Snapshot = { time: string; date: string };
type ExitState = { from: ExitFrom; snap: Snapshot };

const dateFormat = (lang: string) =>
  new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Paris",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function Intro() {
  const { lang } = useI18n();
  const [exit, setExit] = useState<ExitState | null>(null);
  const { muted } = useSound();
  const mutedRef = useRef(muted);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    if (document.documentElement.dataset.intro === "done") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    sequenceStart();

    // remember whether a real gesture (not the timer) ends the intro
    let gesture = false;
    const onInput = (e: Event) => {
      if (e instanceof KeyboardEvent && (e.key === "Escape" || e.repeat)) return;
      gesture = true;
    };
    const stopListening = () => {
      window.removeEventListener("pointerdown", onInput, true);
      window.removeEventListener("keydown", onInput, true);
    };
    window.addEventListener("pointerdown", onInput, true);
    window.addEventListener("keydown", onInput, true);

    const onDone = () => {
      stopListening();
      const elapsed = performance.now() - sequenceStart();
      // the gate hides itself synchronously (html[data-intro=done]): mount
      // the exit copy in the same frame so nothing flashes in between
      if (elapsed < FAILSAFE_MS - 150) {
        const now = new Date();
        const snap = { time: timeFormat.format(now), date: dateFormat(lang).format(now) };
        flushSync(() => setExit({ from: elapsed < SPLIT_MS ? "boot" : "lock", snap }));
      }
      let off = mutedRef.current;
      try {
        off ||= localStorage.getItem("em-sound") === "off";
      } catch {}
      if (gesture && !off) playStartupChord();
    };
    window.addEventListener("em:intro-done", onDone, { once: true });
    return () => {
      stopListening();
      window.removeEventListener("em:intro-done", onDone);
    };
  }, [lang]);

  return (
    <>
      <IntroGate className="os-intro" maxMs={2600}>
        <Sequence />
      </IntroGate>
      {exit && <Exit from={exit.from} snap={exit.snap} onDone={() => setExit(null)} />}
    </>
  );
}

/** The gate's content: lock screen underneath, boot screen on top. */
function Sequence() {
  const finish = useIntroFinish();
  // the script only belongs in server HTML (a client-made one never runs)
  const hydrated = useHydrated();
  useEffect(() => {
    // the keyframes started at first paint, not at hydration: finish on
    // their clock so a slow hydrate never stretches the intro
    const elapsed = performance.now() - sequenceStart();
    const id = window.setTimeout(finish, Math.max(60, AUTO_MS - elapsed));
    return () => window.clearTimeout(id);
  }, [finish]);

  return (
    <>
      {!hydrated && <script dangerouslySetInnerHTML={{ __html: PREPAINT }} />}
      <LockScreen />
      <BootScreen />
    </>
  );
}

/* ───────────────────────── boot ───────────────────────── */

/** Progress segments light at uneven times, the way real boots stall. */
const SEGMENTS = [110, 150, 190, 230, 320, 350, 375, 470, 520, 555, 640, 700, 760];

function BootScreen({ still = false }: { still?: boolean }) {
  const { t } = useI18n();
  const lines = t.system.intro.boot;
  return (
    <div className={`os-intro-boot ${still ? "is-still" : ""}`}>
      <div className="os-intro-boot-center">
        <EmMark animate={!still} />
        <span className="os-intro-bar" aria-hidden>
          {SEGMENTS.map((d, i) => (
            <i key={i} style={{ "--d": `${d}ms` } as React.CSSProperties} />
          ))}
        </span>
        <p className="os-intro-log">
          {lines.map((l, i) => (
            <span key={l} style={{ "--i": i } as React.CSSProperties}>
              {l}…
            </span>
          ))}
        </p>
      </div>
      <p className="os-intro-boot-foot">{t.system.intro.version}</p>
    </div>
  );
}

/* ───────────────────────── lock screen ───────────────────────── */

/** Long localized date in Paris, after mount only (hydration-safe). */
function useParisDate(lang: string) {
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

function LockScreen({
  still = false,
  unlocking = false,
  snap,
}: {
  still?: boolean;
  unlocking?: boolean;
  /** the exit copy must show the time from its very first frame */
  snap?: Snapshot;
}) {
  const { lang, t } = useI18n();
  const s = t.system.intro;
  const sky = t.shell.control;
  const live = useParisTime();
  const liveDate = useParisDate(lang);
  const time = snap?.time ?? live.time;
  const date = snap?.date ?? liveDate;
  const [hh, mm] = time ? time.split(":") : [null, null];

  return (
    <div className={`os-intro-lock ${still ? "is-still" : ""}`}>
      <div className="os-intro-veil" />
      <m.div
        className="os-intro-lock-ui"
        initial={unlocking ? { opacity: 1, y: 0 } : false}
        animate={unlocking ? { opacity: 0, y: -48 } : { opacity: 1, y: 0 }}
        transition={{ type: "spring", visualDuration: 0.4, bounce: 0, delay: unlocking ? 0.05 : 0 }}
      >
        <span className="os-intro-lockmark">
          <Padlock open={unlocking} />
        </span>

        <div className="os-intro-when">
          <p className="os-intro-date">
            <SkyGlyph />
            <span className="os-intro-date-text">{date ? <span className="os-intro-in">{date}</span> : " "}</span>
          </p>
          <p className="os-intro-clock tabular">
            {hh ? (
              <span className="os-intro-digits os-intro-in">
                {hh}
                <span className="os-intro-colon" aria-hidden>
                  <i />
                  <i />
                </span>
                {mm}
              </span>
            ) : (
              <span className="os-intro-digits">{" "}</span>
            )}
          </p>
          <p className="os-intro-meta">
            <span>{t.shell.clock.paris}</span>
            <span aria-hidden>·</span>
            <span>{PARIS}</span>
            <span aria-hidden>·</span>
            <span className="os-intro-phase os-intro-phase--dawn">{sky.dawn}</span>
            <span className="os-intro-phase os-intro-phase--day">{sky.day}</span>
            <span className="os-intro-phase os-intro-phase--dusk">{sky.dusk}</span>
            <span className="os-intro-phase os-intro-phase--night">{sky.night}</span>
          </p>
        </div>

        <div className="os-intro-user">
          <span className="os-intro-avatar">
            <PixelLabel text="EM" cell={4} />
          </span>
          <p className="os-intro-name">{s.name}</p>
          <p className="os-intro-hint">
            <span className="os-intro-hint-fine">
              <Shimmer text={s.unlock} />
            </span>
            <span className="os-intro-hint-touch">
              <Shimmer text={s.unlockTouch} />
            </span>
          </p>
        </div>
      </m.div>
    </div>
  );
}

/**
 * "slide to unlock" light, transform-only: a soft window sweeps across
 * while the bright copy inside it counter-moves, so the copy stays glued
 * to the text underneath (both measured in the line's container units).
 */
function Shimmer({ text }: { text: string }) {
  return (
    <span className="os-intro-shimmer">
      <span className="os-intro-shimmer-base">{text}</span>
      <span className="os-intro-shimmer-band" aria-hidden>
        <span className="os-intro-shimmer-hi">{text}</span>
      </span>
    </span>
  );
}

/* ───────────────────────── unlock ───────────────────────── */

const LIFT = { type: "spring", visualDuration: 0.5, bounce: 0 } as const;

/**
 * The exit: a pointer-transparent copy of the last intro frame. From the
 * lock screen, the shackle pops, then the whole glass sheet lifts up and
 * away (its lit bottom edge and cast shadow sliding up over the desktop)
 * while a dim layer underneath clears: the desktop settling in.
 */
function Exit({ from, snap, onDone }: { from: ExitFrom; snap: Snapshot; onDone: () => void }) {
  if (from === "boot") {
    return (
      <m.div
        className="os-intro-exit"
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
        onAnimationComplete={onDone}
      >
        <m.div
          className="os-intro-exit-fill"
          initial={{ scale: 1 }}
          animate={{ scale: 1.06 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <BootScreen still />
        </m.div>
      </m.div>
    );
  }
  return (
    <div className="os-intro-exit">
      <m.div
        className="os-intro-settle"
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
      />
      <m.div
        className="os-intro-sheet"
        initial={{ y: "0%" }}
        animate={{ y: "-108%" }}
        transition={{ ...LIFT, delay: 0.07 }}
        onAnimationComplete={onDone}
      >
        <LockScreen still unlocking snap={snap} />
        <span className="os-intro-sheet-edge" aria-hidden />
      </m.div>
    </div>
  );
}
