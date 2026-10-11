"use client";

import { AnimatePresence, animate, m, useMotionValue, type AnimationPlaybackControls } from "motion/react";
import { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { PixelLabel } from "@/components/PixelLabel";
import { useI18n } from "@/i18n/client";
import { project, rubberband, spring, springFrom } from "@/lib/motion";
import { tzOffset } from "@/lib/sun";
import { fill as fillIn } from "./mail";
import { dieCells, diePath, markAt, type Mark } from "./postmark";

/**
 * Under the envelope, a small franking machine. Its readings are all real:
 * the date and time wheels show the Toulouse time it will print, the
 * notched scale shows how full the mail link is against what mail apps
 * reliably accept (the last notch turns red when it would be cut), and
 * the die window previews the postmark itself. A plate under it repeats
 * Elliot's reply habits and keeps the way to his key; one line gives the
 * visitor's own time against Toulouse's, from their time zone.
 *
 * The lever franks and sends. Grab it and it tracks 1:1 down its slot,
 * resisting past the end; let go past 60% of its travel (projected) or
 * with a downward flick and it bottoms out: the machine jolts, the die
 * strikes the envelope, and the lever springs back up with a small
 * bounce, since it was thrown. Anything less and it springs back. With
 * nothing written it only goes half way, and the machine shakes its head.
 * Send and ⌘↵ pull it too; on a keyboard it is the "Frank and send"
 * button. Reduced motion: no travel, it commits like a button.
 */

export type MeterHandle = {
  /** pull the lever from rest; `commit` false only plays it (the letter already left by hand) */
  pull: (commit?: boolean) => void;
};

/** 5 × 7 digits for the wheels */
const DIGITS: Record<string, string[]> = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
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
    /** mailto length over the safe limit */
    load: number;
    tooLong: boolean;
    /** the letter is out: the lever rests */
    disabled: boolean;
    reduced: boolean;
    onStrike: (ink: number) => void;
    onRefuse: () => void;
  }
>(function Meter({ empty, load, tooLong, disabled, reduced, onStrike, onRefuse }, ref) {
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
  const g = useRef<{ pid: number; y0: number; start: number; s: { t: number; y: number }[]; moved: boolean } | null>(null);
  const cbs = useRef({ onStrike, onRefuse, empty, disabled, reduced });
  useEffect(() => {
    cbs.current = { onStrike, onRefuse, empty, disabled, reduced };
  });
  const stop = () => {
    anims.current.forEach((a) => a.stop());
    anims.current = [];
  };
  useEffect(() => () => stop(), []);

  /** bottomed out: jolt, strike, and back up with a little bounce */
  const strike = (v: number, commit: boolean) => {
    const ink = Math.max(0.75, Math.min(1, 0.75 + v / 4000));
    if (commit) cbs.current.onStrike(ink);
    if (cbs.current.reduced) {
      ly.set(0);
      return;
    }
    anims.current.push(
      animate(jolt, [0, 2, 0], { duration: 0.16, times: [0, 0.3, 1], ease: "easeOut" }),
      animate(ly, 0, { ...spring.flick, velocity: -Math.min(600, v * 0.3), delay: 0.06 })
    );
  };
  /** nothing to send: the lever stops half way and the machine shakes its head */
  const refuse = (v = 0) => {
    cbs.current.onRefuse();
    if (cbs.current.reduced) return;
    anims.current.push(
      animate(ly, 0, { ...spring.default, velocity: -v }),
      animate(shake, [0, -3, 3, -2, 2, 0], { duration: 0.32, ease: "easeInOut" })
    );
  };

  const pull = (commit = true) => {
    stop();
    if (commit && cbs.current.empty) {
      // say why at once; the lever only gets half way
      if (cbs.current.reduced) return refuse();
      cbs.current.onRefuse();
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
    if (cbs.current.reduced) return strike(0, commit);
    anims.current.push(animate(ly, TRAVEL, { ...spring.snappy, onComplete: () => strike(900, commit) }));
  };
  useImperativeHandle(ref, () => ({ pull }));

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || disabled || reduced) return;
    e.preventDefault();
    stop();
    e.currentTarget.setPointerCapture(e.pointerId);
    g.current = { pid: e.pointerId, y0: e.clientY - ly.get(), start: e.clientY, s: [{ t: e.timeStamp, y: e.clientY }], moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = g.current;
    if (!d || d.pid !== e.pointerId) return;
    const raw = e.clientY - d.y0;
    if (Math.abs(e.clientY - d.start) > 4) d.moved = true;
    d.s.push({ t: e.timeStamp, y: e.clientY });
    while (d.s.length > 2 && e.timeStamp - d.s[0].t > 80) d.s.shift();
    // 1:1 down the slot; past the end (half way, with nothing written) it resists
    const end = empty ? TRAVEL / 2 : TRAVEL;
    ly.set(raw < 0 ? -rubberband(-raw, 40) : raw > end ? end + rubberband(raw - end, 40) : raw);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = g.current;
    if (!d || d.pid !== e.pointerId) return;
    g.current = null;
    // a press without travel is a button press
    if (!d.moved) {
      pull();
      return;
    }
    let v = 0;
    const a = d.s[0];
    const b = d.s[d.s.length - 1];
    if (d.s.length > 1 && e.timeStamp - b.t < 60) v = ((b.y - a.y) / Math.max(8, b.t - a.t)) * 1000;
    const y = ly.get();
    if (empty) {
      refuse(v);
      return;
    }
    if (y + project(v, 0.998) > TRAVEL * 0.6 || v > 600) {
      anims.current.push(animate(ly, TRAVEL, { ...spring.snappy, velocity: Math.max(v, 300), onComplete: () => strike(Math.max(v, 300), true) }));
      return;
    }
    anims.current.push(animate(ly, 0, { ...spring.default, velocity: v }));
  };

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
            aria-label={k.load}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-valuetext={tooLong ? k.full : `${pct}%`}
          >
            {Array.from({ length: NOTCHES }, (_, i) => (
              <i key={i} data-on={i < lit || undefined} data-cut={(tooLong && i === NOTCHES - 1) || undefined} />
            ))}
          </span>
        </div>
        <div className="app-contact-meter-die" role="img" aria-label={fillIn(k.prints, { date: `${shown.dd}/${shown.mo}`, time: `${shown.hh}:${shown.mi}` })}>
          <DieMark mark={shown} className="app-contact-meter-mark" />
        </div>
        <div className="app-contact-meter-lever">
          <span className="app-contact-meter-slot" aria-hidden />
          <m.button
            type="button"
            className="app-contact-meter-handle"
            style={{ y: ly }}
            aria-label={k.frank}
            aria-disabled={disabled || undefined}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onClick={(e) => {
              // pointers are handled above (but under reduced motion it is just a button); this is the keyboard's press
              if (disabled || (e.detail !== 0 && !reduced)) return;
              pull();
            }}
          >
            <span className="app-contact-meter-knob" aria-hidden />
          </m.button>
        </div>
      </m.div>
      <div className="app-contact-meter-plate">
        <p>{c.replyNote}</p>
        <p>{c.langNote}</p>
        <p>
          <a href="#pgp" className="app-contact-delivery-link">
            {k.key}
          </a>
          {you && (
            <>
              <span aria-hidden> · </span>
              <span className="tabular" title={k.zoneNote}>
                {you}
              </span>
            </>
          )}
        </p>
      </div>
    </section>
  );
});
