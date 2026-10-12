"use client";

import { AnimatePresence, animate, m, useMotionValue, type AnimationPlaybackControls } from "motion/react";
import { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { PixelLabel } from "@/components/PixelLabel";
import { useI18n } from "@/i18n/client";
import { spring, springFrom } from "@/lib/motion";
import { tzOffset } from "@/lib/sun";
import { fill as fillIn } from "./mail";
import { DIGITS } from "./glyphs";
import { dieCells, diePath, markAt, type Mark } from "./postmark";

/**
 * Under the envelope, a small franking machine: what Send does, shown.
 * It isn't a second control. Its readings are all real: the date and time
 * wheels show the Toulouse time it will print, the notched scale fills as
 * the letter does (the last notch turns red when a mail app would cut
 * it), and the die window previews the postmark itself. One caption says
 * what it is for, with the visitor's own time against Toulouse's.
 *
 * Send (or ⌘↵) pulls its lever: it bottoms out, the machine jolts, the
 * die strikes the envelope, and the lever springs back. With nothing
 * written it only goes half way and the machine shakes its head, as the
 * status line says why. Reduced motion: no travel, it just strikes.
 */

export type MeterHandle = {
  /** pull the lever from rest: it strikes (or, with nothing written, refuses) */
  pull: () => void;
};

const digitPath = (d: string) =>
  (DIGITS[d] ?? DIGITS["0"])
    .flatMap((row, y) => [...row].map((v, x) => (v === "1" ? `M${x} ${y}h1v1h-1z` : "")))
    .join("");

const ROLL = springFrom(0.22);

function Wheel({ d, reduced }: { d: string; reduced: boolean }) {
  return (
    <span className="app-contact-meter-wheel" aria-hidden>
      <AnimatePresence initial={false} mode="popLayout">
        <m.svg
          key={d}
          viewBox="0 0 5 7"
          shapeRendering="crispEdges"
          className="app-contact-meter-digit"
          initial={reduced ? false : { y: "-120%" }}
          animate={{ y: "0%" }}
          exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { y: "120%" }}
          transition={ROLL}
        >
          <path d={digitPath(d)} />
        </m.svg>
      </AnimatePresence>
    </span>
  );
}

/** The postmark the die prints, in one ink. */
export const DieMark = memo(function DieMark({ mark, flamme = true, className = "" }: { mark: Mark; flamme?: boolean; className?: string }) {
  const grid = useMemo(() => dieCells(mark, { flamme }), [mark, flamme]);
  return (
    <svg viewBox={`0 0 ${grid.w} ${grid.h}`} shapeRendering="crispEdges" className={className} aria-hidden focusable="false">
      <path d={diePath(grid)} fill="currentColor" />
    </svg>
  );
});

/** the visitor's place name from their time zone (never their location) */
function zoneName(tz: string) {
  if (!tz.includes("/") || tz.startsWith("Etc/")) return null;
  return tz.split("/").pop()!.replace(/_/g, " ");
}

const NOTCHES = 10;
const TRAVEL = 64;

export const Meter = forwardRef<
  MeterHandle,
  {
    /** nothing written: the lever only goes half way */
    empty: boolean;
    /** how full: the mailto link against its safe length, or the letter against its limit */
    load: number;
    tooLong: boolean;
    /** what the scale measures, when it isn't the mail link */
    scale?: { load: string; full: string };
    reduced: boolean;
    onStrike: (ink: number) => void;
    onRefuse: () => void;
  }
>(function Meter({ empty, load, tooLong, scale, reduced, onStrike, onRefuse }, ref) {
  const { t, lang } = useI18n();
  const c = t.contact;
  const k = c.meter;
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 10_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, []);
  // what the die prints: Toulouse's minute (a new object only when it turns)
  const minute = now ? Math.floor(now.getTime() / 60_000) : 0;
  const shown = useMemo(() => (minute ? markAt(new Date(minute * 60_000)) : { dd: "--", mo: "--", yy: "--", hh: "00", mi: "00" }), [minute]);

  // the visitor's own time, only when it isn't Toulouse's
  const you = useMemo(() => {
    if (!now) return null;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const gap = tzOffset(now, tz) - tzOffset(now);
    if (!tz || gap === 0) return null;
    const time = new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
    const h = Math.floor(Math.abs(gap) / 60);
    const mins = Math.abs(gap) % 60;
    const n = mins ? `${h} h ${String(mins).padStart(2, "0")}` : `${h} h`;
    return fillIn(gap < 0 ? k.behind : k.ahead, { place: zoneName(tz) ?? k.yourTime, time, n });
  }, [now, lang, k]);

  // the lever
  const ly = useMotionValue(0);
  const jolt = useMotionValue(0);
  const shake = useMotionValue(0);
  const anims = useRef<AnimationPlaybackControls[]>([]);
  const cbs = useRef({ onStrike, onRefuse, empty, reduced });
  useEffect(() => {
    cbs.current = { onStrike, onRefuse, empty, reduced };
  });
  const stop = () => {
    anims.current.forEach((a) => a.stop());
    anims.current = [];
  };
  useEffect(() => () => stop(), []);

  /** bottomed out: jolt, strike, and back up with a little bounce */
  const strike = () => {
    cbs.current.onStrike(1);
    if (cbs.current.reduced) {
      ly.set(0);
      return;
    }
    anims.current.push(
      animate(jolt, [0, 2, 0], { duration: 0.16, times: [0, 0.3, 1], ease: "easeOut" }),
      animate(ly, 0, { ...spring.flick, velocity: -270, delay: 0.06 })
    );
  };

  const pull = () => {
    stop();
    if (cbs.current.empty) {
      // nothing to send: say why at once; the lever only gets half way and the machine shakes its head
      cbs.current.onRefuse();
      if (cbs.current.reduced) return;
      anims.current.push(
        animate(ly, TRAVEL / 2, {
          ...spring.snappy,
          onComplete: () => {
            anims.current.push(
              animate(ly, 0, spring.default),
              animate(shake, [0, -3, 3, -2, 2, 0], { duration: 0.32, ease: "easeInOut" })
            );
          },
        })
      );
      return;
    }
    if (cbs.current.reduced) return strike();
    anims.current.push(animate(ly, TRAVEL, { ...spring.snappy, onComplete: strike }));
  };
  useImperativeHandle(ref, () => ({ pull }));

  // any letter lights the first notch; the last one is kept for "too long"
  const lit = tooLong ? NOTCHES : empty ? 0 : Math.min(NOTCHES - 1, Math.max(1, Math.ceil(load * (NOTCHES - 1))));
  const pct = Math.min(100, Math.round(load * 100));
  const digits = `${shown.hh}${shown.mi}`;
  const dateLine = `${shown.dd}.${shown.mo}.${shown.yy}`;

  return (
    <section className="app-contact-meter" aria-label={k.label}>
      <m.div className="app-contact-meter-body" style={{ y: jolt, x: shake }}>
        <div className="app-contact-meter-counter">
          <span className="app-contact-meter-date" aria-hidden>
            <PixelLabel text={dateLine} cell={1} />
          </span>
          <span className="app-contact-meter-wheels" aria-hidden>
            <Wheel d={digits[0]} reduced={reduced} />
            <Wheel d={digits[1]} reduced={reduced} />
            <span className="app-contact-meter-colon" />
            <Wheel d={digits[2]} reduced={reduced} />
            <Wheel d={digits[3]} reduced={reduced} />
          </span>
          <span
            className="app-contact-meter-scale"
            role="meter"
            aria-label={scale?.load ?? k.load}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-valuetext={tooLong ? (scale?.full ?? k.full) : `${pct}%`}
          >
            {Array.from({ length: NOTCHES }, (_, i) => (
              <i key={i} data-on={i < lit || undefined} data-cut={(tooLong && i === NOTCHES - 1) || undefined} />
            ))}
          </span>
        </div>
        <div className="app-contact-meter-die" role="img" aria-label={fillIn(k.prints, { date: `${shown.dd}/${shown.mo}`, time: `${shown.hh}:${shown.mi}` })}>
          <DieMark mark={shown} className="app-contact-meter-mark" />
        </div>
        {/* the lever moves when Send is pressed; it isn't a control of its own */}
        <div className="app-contact-meter-lever" aria-hidden>
          <span className="app-contact-meter-slot" />
          <m.span className="app-contact-meter-handle" style={{ y: ly }}>
            <span className="app-contact-meter-knob" />
          </m.span>
        </div>
      </m.div>
      <p className="app-contact-meter-caption">
        <span>{k.caption}</span>
        {you && (
          <>
            {" "}
            <span className="tabular app-contact-meter-you" title={k.zoneNote}>
              {you}
            </span>
          </>
        )}
      </p>
    </section>
  );
});
