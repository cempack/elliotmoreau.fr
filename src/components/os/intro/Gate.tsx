"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/client";
import { useHydrated } from "@/hooks/env";
import { useSound } from "@/lib/sound";
import { useSiteData } from "../SiteData";
import { Wordmark } from "./Wordmark";
import { playStartupChord } from "./chime";
import { Arrival } from "./Arrival";
import { T } from "./flight";
import { rememberArrival } from "../intro-script";

/** The boot screen starts fading here (ms from first paint): see intro.css. */
const BOOT_MS = 3460;
/** Hydrated by then, a first visit arrives from space instead of reading the boot's text. */
const ARRIVE_BEFORE_MS = 2400;
/** The boot holds at least this long (from first paint) before the arrival takes over: the
    pixel name has finished scanning in and sits a beat, then space fades up over it. */
const BOOT_HOLD_MS = 1400;
/** The Desktop has come in by then: the gate leaves the page. */
const OUT_MS = 1400;
/** The name's boxes (8 px cells; CSS scales them, see intro.css). */
const BOX = { desk: { w: 1040, h: 320 }, phone: { w: 720, h: 184 } };
/** Progress segments light at uneven times, the way real boots stall. */
const SEGMENTS = [
  160, 230, 300, 360, 520, 600, 640, 700, 980, 1040, 1100, 1260, 1300, 1340, 1700, 1760, 1820, 1880, 2160, 2240, 2500,
  2560, 2620, 2900, 2960, 3020, 3180, 3240, 3300, 3380,
];
const SETTLE = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * Parsed (and run) as the gate's first child, before any of its pixels:
 * marks returning visitors so CSS hides the boot pre-paint, only if the
 * layout's head script (intro-script.ts) didn't run.
 */
const PREPAINT = `try{var d=document.documentElement;if(!d.dataset.intro&&!d.dataset.introUp&&sessionStorage.getItem("em-intro"))d.dataset.intro="done"}catch(e){}`;

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

/** A Restart (or a power-on after Shut Down) left a note: this boot shows its text, the old way. */
let restarted: boolean | null = null;
function wasRestart() {
  if (restarted != null) return restarted;
  try {
    restarted = sessionStorage.getItem("em-boot") === "restart";
    sessionStorage.removeItem("em-boot");
  } catch {
    restarted = false;
  }
  return restarted;
}

/**
 * The shell's own entrance once the gate clears, piece by piece in one
 * order: the menu bar drops in, then the Dock rises (Dock.tsx), then the
 * widgets and the icons (DesktopScene.tsx), each answering the same
 * `em:intro-done` on its own beat after `delay`. After the boot's text the
 * wallpaper settles into place; after the flight, which lands on the bare
 * wallpaper, today's clouds drift in over it instead of appearing.
 */
function arrive(delay: number, settle: boolean) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.dispatchEvent(new CustomEvent("em:intro-done", { detail: { delay } }));
  if (reduced) return;
  // after the boot's text, the wallpaper settles in; after the flight it is already exactly in place
  if (settle)
    document
      .querySelector<HTMLElement>(".os-wallpaper")
      ?.animate([{ scale: "1.07" }, { scale: "1" }], { duration: 1500, easing: SETTLE, fill: "backwards" });
  else {
    const sky = document.querySelector<HTMLElement>(".os-wallpaper-weather");
    const side = Number(sky?.dataset.side) || 1;
    sky?.animate([{ opacity: 0, translate: `${-2.5 * side}% 0` }, { opacity: 1, translate: "0 0" }], {
      duration: 2200,
      delay: delay + 200,
      easing: "cubic-bezier(0.33, 0, 0.2, 1)",
      fill: "backwards",
    });
  }
  for (const el of document.querySelectorAll<HTMLElement>(".os-menubar")) {
    el.animate([{ translate: "0 -100%", opacity: 0 }, { translate: "0 0", opacity: 1 }], {
      duration: 760,
      delay: delay + 200,
      easing: SETTLE,
      fill: "backwards",
    });
  }
}

/**
 * The first arrival on the Desktop: from space down to Toulouse (or, when
 * the page hydrates late or after a Restart, the boot's text), straight
 * onto the Desktop, which then comes in piece by piece. No lock screen:
 * the gate clears into the Desktop itself. Any key or tap skips ahead.
 */
export default function Gate({ onDone }: { onDone: () => void }) {
  const hydrated = useHydrated();
  const { muted } = useSound();
  const [phase, setPhase] = useState<"boot" | "out">("boot");
  const [skipped, setSkipped] = useState(false);
  // the arrival from space: "on" while it plays, "done" once it has faded
  const [arrival, setArrival] = useState<"off" | "on" | "done">("off");
  const rootRef = useRef<HTMLDivElement>(null);
  const out = useRef(false);

  /** the gate clears: the Desktop comes in `delay` ms on, as the cover lifts */
  const clear = (delay: number, settle = true) => {
    if (out.current) return;
    out.current = true;
    setPhase("out");
    arrive(delay, settle);
    // a Restart was asked for with a click: the chord, if the browser still lets this page play sound
    let off = muted;
    try {
      off ||= localStorage.getItem("em-sound") === "off";
    } catch {}
    if (wasRestart() && !off) playStartupChord({ onlyIfAllowed: true });
    window.setTimeout(() => {
      rememberArrival();
      document.documentElement.dataset.intro = "done";
      onDone();
    }, OUT_MS);
  };
  const clearRef = useRef(clear);
  useEffect(() => {
    clearRef.current = clear;
  });

  // a first visit that hydrates early enough arrives from space (Arrival.tsx);
  // late, after a Restart, or with reduced motion, the boot plays as it always has
  // (a skip during the hold clears the gate: the timer goes with it)
  useEffect(() => {
    if (!hydrated || phase !== "boot" || wasRestart()) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const since = performance.now() - sequenceStart();
    if (since > ARRIVE_BEFORE_MS) return;
    const id = window.setTimeout(() => setArrival((a) => (a === "off" ? "on" : a)), Math.max(16, BOOT_HOLD_MS - since));
    return () => window.clearTimeout(id);
    // decided once, at hydration; only a skip (phase) cancels it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, phase === "boot"]);

  // the boot runs on the clock of its own keyframes: the Desktop comes in
  // as the boot screen starts to fade (what the visitor sees, in every
  // engine), with a timer only as a fallback; any input skips ahead
  useEffect(() => {
    if (phase !== "boot") return;
    const arriving = arrival === "on";
    const elapsed = performance.now() - sequenceStart();
    // (an arrival that never lands, a canvas that never drew, still ends on the Desktop)
    const id = window.setTimeout(() => clearRef.current(160), arriving ? T.end + 3000 : Math.max(0, BOOT_MS - elapsed) + 600);
    const boot = rootRef.current?.querySelector(".os-intro-boot");
    const fading = (e: Event) => {
      if (!arriving && (e as AnimationEvent).animationName === "os-boot-out") clearRef.current(160);
    };
    boot?.addEventListener("animationstart", fading);
    const skip = (e: Event) => {
      if (e instanceof KeyboardEvent && (e.repeat || e.metaKey || e.ctrlKey || e.altKey)) return;
      setSkipped(true);
      clearRef.current(60);
    };
    window.addEventListener("keydown", skip, true);
    window.addEventListener("pointerdown", skip, true);
    return () => {
      window.clearTimeout(id);
      boot?.removeEventListener("animationstart", fading);
      window.removeEventListener("keydown", skip, true);
      window.removeEventListener("pointerdown", skip, true);
    };
  }, [phase, arrival]);

  // while it's up, the menu bar and the dock wait out of sight (intro.css);
  // the layout's pre-paint script already set this for a boot on the Desktop
  useEffect(() => {
    const root = document.documentElement;
    if (phase === "out") {
      delete root.dataset.introUp;
      return;
    }
    root.dataset.introUp = "first";
    return () => {
      delete root.dataset.introUp;
    };
  }, [phase]);

  // while it covers the screen, the OS underneath is inert (a tap can't reach a hidden icon)
  useEffect(() => {
    if (!hydrated || phase === "out") return;
    const el = rootRef.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const others = Array.from(parent.children).filter((n) => n !== el && !n.hasAttribute("inert"));
    others.forEach((n) => n.setAttribute("inert", ""));
    return () => others.forEach((n) => n.removeAttribute("inert"));
  }, [hydrated, phase]);

  return (
    <div
      ref={rootRef}
      className="os-intro em-intro"
      data-phase={phase}
      data-skip={skipped || undefined}
      data-live={hydrated || undefined}
      // once an arrival has played, the boot's text never shows again (not even as a skip fades)
      data-arrival={arrival !== "off" || undefined}
    >
      {!hydrated && <script dangerouslySetInnerHTML={{ __html: PREPAINT }} />}
      <BootScreen />
      {arrival === "on" && <Arrival skipped={skipped} onLand={() => clear(120, false)} onGone={() => setArrival("done")} />}
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
