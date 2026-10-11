"use client";

import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { animate, m, useMotionValue, type AnimationPlaybackControls } from "motion/react";
import { clamp, project, spring } from "@/lib/motion";
import { bounce, visibleIcon } from "@/components/os/dock/launch";
import { useI18n } from "@/i18n/client";
import { useSound } from "@/lib/sound";
import { PixelGlyph } from "@/components/glyphs";
import { Envelope } from "./Envelope";
import { G_DOWN } from "./glyphs";

/**
 * The envelope on its stage, and the one gesture this app is about.
 *
 * Pick the envelope up and it follows the pointer 1:1 from where you
 * grabbed it, lifted out of the window into a layer above the Dock. A
 * ring lights up around Mail in the Dock (the tab bar on phones). Let go
 * and the release velocity is projected (`project()`): if it lands in the
 * Dock, or the throw is clearly headed there, the envelope seals as it
 * flies along an arc into the icon, carrying the release velocity into
 * the spring, and the icon bounces as it lands. Otherwise it springs back
 * to its place, with a little bounce only if it was thrown.
 *
 * Pressing Send does the same from rest: the envelope folds where it
 * stands, hops, and flies the same arc. Reduced motion: no gesture and no
 * flight; it seals in place.
 */

export type StageHandle = {
  /** fold, then fly into the Dock; resolves through `onLand` */
  send: () => void;
  /** a fresh letter comes back onto the stage */
  reset: () => void;
};

type Pt = { x: number; y: number };
type Target = { x: number; y: number; w: number; h: number; bounceEl: HTMLElement | null; tab: boolean };
type Sample = Pt & { t: number };

/** eight pixels thrown out from the icon on delivery (px offsets) */
const BURST = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
  const r = i % 2 ? 30 : 40;
  return [Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r)] as const;
});

/** Mail's icon in the visible Dock or tab bar, in viewport px. */
function dockTarget(): Target {
  const slot = visibleIcon("contact");
  const icon =
    slot?.querySelector<HTMLElement>("[data-dock-icon]") ?? slot?.querySelector<HTMLElement>("[data-dock-bounce]") ?? slot;
  const bounceEl = slot?.querySelector<HTMLElement>("[data-dock-bounce]") ?? null;
  const tab = !slot?.querySelector("[data-dock-icon]");
  if (icon) {
    const r = icon.getBoundingClientRect();
    if (r.width > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, bounceEl, tab };
  }
  return { x: window.innerWidth / 2, y: window.innerHeight - 40, w: 48, h: 48, bounceEl: null, tab };
}

/** px/s over the last ~90ms of samples; 0 if the pointer had come to rest. */
function velocity(s: Sample[], now: number): Pt {
  if (s.length < 2) return { x: 0, y: 0 };
  const last = s[s.length - 1];
  if (now - last.t > 80) return { x: 0, y: 0 };
  let i = s.length - 2;
  while (i > 0 && last.t - s[i].t < 90) i--;
  const a = s[i];
  const dt = (last.t - a.t) / 1000;
  if (dt <= 0) return { x: 0, y: 0 };
  return { x: (last.x - a.x) / dt, y: (last.y - a.y) / dt };
}

/**
 * Would letting go here send it? `ptr` is the pointer, `c` the envelope's
 * visual center and `half` its visual half-size, `v` the release velocity.
 */
function headedForDock(ptr: Pt, c: Pt, half: Pt, v: Pt, t: Target) {
  const vh = window.innerHeight;
  const top = t.y - t.h / 2;
  const reach = t.tab ? Infinity : Math.max(240, window.innerWidth * 0.2);
  // held over the Dock (or just above it)
  if (ptr.y > Math.max(top - 110, vh * 0.6) && Math.abs(ptr.x - t.x) < reach) return true;
  // the envelope itself touches the icon
  if (Math.abs(c.x - t.x) < half.x + t.w / 2 + 16 && Math.abs(c.y - t.y) < half.y + t.h / 2 + 16) return true;
  // thrown: where the release velocity would carry it
  const p = { x: ptr.x + project(v.x), y: ptr.y + project(v.y) };
  if (v.y > 150 && p.y > top - 20 && Math.abs(p.x - t.x) < reach) return true;
  // a fast flick aimed at the icon
  const speed = Math.hypot(v.x, v.y);
  if (speed > 900 && v.y > 0) {
    const ang = Math.abs(Math.atan2(v.y, v.x) - Math.atan2(t.y - c.y, t.x - c.x));
    if (Math.min(ang, Math.PI * 2 - ang) < 0.6) return true;
  }
  return false;
}

export function Stage({
  ref,
  subject,
  lines,
  lifted,
  interactive,
  reduced,
  coarse,
  originRef,
  onThrow,
  onLand,
}: {
  ref?: React.Ref<StageHandle>;
  subject: number;
  lines: number[];
  lifted: boolean;
  /** the gesture is live (compose phase, motion allowed) */
  interactive: boolean;
  reduced: boolean;
  coarse: boolean;
  /** where the envelope leaves from when the stage is scrolled away */
  originRef: React.RefObject<HTMLElement | null>;
  /** the gesture decided to send */
  onThrow: () => void;
  /** the envelope reached the Dock (or sealed in place, reduced) */
  onLand: () => void;
}) {
  const { t } = useI18n();
  const c = t.contact;
  const { blip } = useSound();

  const slotRef = useRef<HTMLDivElement>(null);
  const [sealed, setSealed] = useState(false);
  const [instant, setInstant] = useState(false);
  const [gone, setGone] = useState(false);
  const [carry, setCarry] = useState<{ w: number; sealed: boolean } | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [armed, setArmed] = useState(false);
  const [held, setHeld] = useState(false);
  const [burst, setBurst] = useState<{ x: number; y: number; id: number } | null>(null);
  const burstTimer = useRef(0);
  const pendingFlight = useRef(false);

  // in-slot envelope: hop on tap, rise back in on reset
  const slotY = useMotionValue(0);
  const slotO = useMotionValue(1);
  // the carried / flying envelope (top-left in viewport px)
  const fx = useMotionValue(0);
  const fy = useMotionValue(0);
  const fs = useMotionValue(1);
  const fr = useMotionValue(0);
  const fo = useMotionValue(1);
  // scale about the grab point while carried, about the center in flight
  const fox = useMotionValue(0.5);
  const foy = useMotionValue(0.5);

  const gesture = useRef<{
    id: number;
    ox: number;
    oy: number;
    w: number;
    h: number;
    sx: number;
    sy: number;
    moved: boolean;
    samples: Sample[];
    target: Target;
  } | null>(null);
  const anims = useRef<AnimationPlaybackControls[]>([]);
  const stopAll = () => {
    for (const a of anims.current) a.stop();
    anims.current = [];
  };
  useEffect(
    () => () => {
      stopAll();
      window.clearTimeout(burstTimer.current);
    },
    []
  );

  const cbs = useRef({ onThrow, onLand, blip });
  useEffect(() => {
    cbs.current = { onThrow, onLand, blip };
  });

  /** Fly from `from` (center, viewport px) at scale `s0` into the Dock. */
  const fly = (from: Pt, v: Pt, s0: number, w: number, h: number, tg: Target, duration: number) => {
    stopAll();
    const T = { x: tg.x, y: tg.y };
    const dist = Math.hypot(T.x - from.x, T.y - from.y);
    const lead = { x: v.x * 0.16, y: v.y * 0.16 };
    const lm = Math.hypot(lead.x, lead.y);
    const maxL = Math.max(80, dist * 0.5);
    if (lm > maxL) {
      lead.x *= maxL / lm;
      lead.y *= maxL / lm;
    }
    const P0 = from;
    const P1 = { x: from.x + lead.x, y: from.y + lead.y };
    const P2 = { x: T.x, y: T.y - clamp(dist * 0.42, 90, 260) };
    const P3 = T;
    const L = (dist + Math.hypot(P1.x - P0.x, P1.y - P0.y) + Math.hypot(P2.x - P1.x, P2.y - P1.y) + Math.hypot(P3.x - P2.x, P3.y - P2.y)) / 2;
    const v0 = Math.hypot(v.x, v.y) / Math.max(1, L);
    const s1 = (tg.w * 0.8) / w;
    let landed = false;
    const land = () => {
      if (landed) return;
      landed = true;
      bounce(tg.bounceEl, tg.tab ? 7 : 16);
      // delivered: a little puff of pixels around the icon
      setBurst({ x: T.x, y: T.y, id: performance.now() });
      window.clearTimeout(burstTimer.current);
      burstTimer.current = window.setTimeout(() => setBurst(null), 700);
      cbs.current.blip("success");
      cbs.current.onLand();
    };
    const a = animate(0, 1, {
      type: "spring",
      visualDuration: duration,
      bounce: 0,
      velocity: v0,
      onUpdate: (p) => {
        const q = clamp(p, 0, 1);
        const u = 1 - q;
        const bx = u * u * u * P0.x + 3 * u * u * q * P1.x + 3 * u * q * q * P2.x + q * q * q * P3.x;
        const by = u * u * u * P0.y + 3 * u * u * q * P1.y + 3 * u * q * q * P2.y + q * q * q * P3.y;
        const tx = 3 * u * u * (P1.x - P0.x) + 6 * u * q * (P2.x - P1.x) + 3 * q * q * (P3.x - P2.x);
        const ty = 3 * u * u * (P1.y - P0.y) + 6 * u * q * (P2.y - P1.y) + 3 * q * q * (P3.y - P2.y);
        const tl = Math.hypot(tx, ty) || 1;
        fx.set(bx - w / 2);
        fy.set(by - h / 2);
        fr.set(clamp((tx / tl) * 24, -24, 24) * u);
        fs.set(s0 + (s1 - s0) * q * q * (3 - 2 * q));
        fo.set(q < 0.86 ? 1 : Math.max(0, 1 - (q - 0.86) / 0.12));
        if (q >= 0.965) land();
      },
      onComplete: () => {
        land();
        setCarry(null);
        setTarget(null);
      },
    });
    anims.current.push(a);
  };

  /** Send from rest (the button): fold where it stands, then fly. */
  const startFromSlot = () => {
    const slot = slotRef.current;
    const tg = dockTarget();
    const r = slot?.getBoundingClientRect();
    const vh = window.innerHeight;
    const visible = !!r && r.width > 0 && r.top < vh - 40 && r.bottom > 40;
    let from: Pt;
    let s0 = 1;
    let w = r?.width ?? 240;
    let h = r?.height ?? 220;
    if (r && visible) {
      from = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    } else {
      const o = originRef.current?.getBoundingClientRect();
      from = o ? { x: o.left + o.width / 2, y: o.top + o.height / 2 } : { x: window.innerWidth / 2, y: vh / 2 };
      w = Math.max(w, 120);
      h = Math.max(h, 110);
      s0 = 0.32;
    }
    fx.set(from.x - w / 2);
    fy.set(from.y - h / 2);
    fs.set(s0);
    fr.set(0);
    fo.set(1);
    fox.set(0.5);
    foy.set(0.5);
    setCarry({ w, sealed: true });
    setGone(true);
    setTarget(tg);
    fly(from, { x: 0, y: -760 }, s0, w, h, tg, 0.58);
  };

  useImperativeHandle(ref, () => ({
    send: () => {
      if (reduced || !slotRef.current) {
        setInstant(true);
        setSealed(true);
        cbs.current.onLand();
        return;
      }
      setInstant(false);
      if (sealed) {
        startFromSlot();
        return;
      }
      pendingFlight.current = true;
      setSealed(true);
    },
    reset: () => {
      stopAll();
      pendingFlight.current = false;
      setCarry(null);
      setTarget(null);
      setArmed(false);
      setInstant(!!reduced);
      setSealed(false);
      setGone(false);
      if (!reduced) {
        slotY.set(28);
        slotO.set(0);
        anims.current.push(animate(slotY, 0, spring.gentle), animate(slotO, 1, { duration: 0.25 }));
      }
    },
  }));

  const onSealed = () => {
    if (!pendingFlight.current) return;
    pendingFlight.current = false;
    startFromSlot();
  };

  /** the carried envelope's visual center and half-size at scale `sc` */
  const visual = (g: { ox: number; oy: number; w: number; h: number }, sc: number) => {
    const px = fx.get() + g.ox;
    const py = fy.get() + g.oy;
    return {
      c: { x: px + (g.w / 2 - g.ox) * sc, y: py + (g.h / 2 - g.oy) * sc },
      half: { x: (g.w / 2) * sc, y: (g.h / 2) * sc },
    };
  };

  /* ── the gesture ── */
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || gone || carry || (e.pointerType === "mouse" && e.button !== 0)) return;
    const r = e.currentTarget.getBoundingClientRect();
    const now = e.timeStamp;
    gesture.current = {
      id: e.pointerId,
      ox: e.clientX - r.left,
      oy: e.clientY - r.top,
      w: r.width,
      h: r.height,
      sx: e.clientX,
      sy: e.clientY,
      moved: false,
      samples: [{ x: e.clientX, y: e.clientY, t: now }],
      target: dockTarget(),
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    setHeld(true); // respond on pointer-down
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    g.samples.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
    if (g.samples.length > 12) g.samples.shift();
    if (!g.moved) {
      if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 4) return;
      g.moved = true;
      stopAll();
      fs.set(1.04);
      fr.set(0);
      fo.set(1);
      fox.set(g.ox / g.w);
      foy.set(g.oy / g.h);
      setCarry({ w: g.w, sealed: false });
      setTarget(g.target);
    }
    fx.set(e.clientX - g.ox);
    fy.set(e.clientY - g.oy);
    const v = velocity(g.samples, e.timeStamp);
    // lean into the motion, like something held by one corner
    fr.set(clamp(v.x / 90, -10, 10));
    // it shrinks as it nears the Dock, so the Dock stays in sight
    const ptr = { x: e.clientX, y: e.clientY };
    const near = clamp(1 - (Math.hypot(ptr.x - g.target.x, ptr.y - g.target.y) - 80) / 460, 0, 1);
    const sc = 1.04 - 0.5 * near * near * (3 - 2 * near);
    fs.set(sc);
    const vis = visual(g, sc);
    const a = headedForDock(ptr, vis.c, vis.half, v, g.target);
    setArmed((was) => (was === a ? was : a));
  };

  const release = (e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    setHeld(false);
    setArmed(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);

    if (!g.moved) {
      if (cancelled) return;
      // a tap: a little hop says "pick me up"
      stopAll();
      anims.current.push(
        animate(slotY, [0, -14, 0], { duration: 0.46, times: [0, 0.4, 1], ease: ["easeOut", [0.6, 0, 0.85, 0.5]] })
      );
      return;
    }

    const v = cancelled ? { x: 0, y: 0 } : velocity(g.samples, e.timeStamp);
    const vis = visual(g, fs.get());
    const ptr = { x: fx.get() + g.ox, y: fy.get() + g.oy };
    if (!cancelled && headedForDock(ptr, vis.c, vis.half, v, g.target)) {
      // re-anchor about the center without a visual jump, then fly
      fox.set(0.5);
      foy.set(0.5);
      fx.set(vis.c.x - g.w / 2);
      fy.set(vis.c.y - g.h / 2);
      setCarry({ w: g.w, sealed: true });
      setGone(true);
      setSealed(true);
      setInstant(true);
      cbs.current.onThrow();
      fly(vis.c, v, fs.get(), g.w, g.h, dockTarget(), 0.5);
      return;
    }

    // home: back to the slot, carrying the release velocity
    const slot = slotRef.current?.getBoundingClientRect();
    const hx = slot ? slot.left : vis.c.x - g.w / 2;
    const hy = slot ? slot.top : vis.c.y - g.h / 2;
    const thrown = Math.hypot(v.x, v.y) > 500;
    const sp = thrown ? spring.flick : spring.default;
    stopAll();
    let done = 0;
    const finish = () => {
      if (++done < 2) return;
      setCarry(null);
      setTarget(null);
    };
    anims.current.push(
      animate(fx, hx, { ...sp, velocity: v.x, onComplete: finish }),
      animate(fy, hy, { ...sp, velocity: v.y, onComplete: finish }),
      animate(fs, 1, spring.default),
      animate(fr, 0, spring.default)
    );
  };

  const canThrow = interactive && !reduced;
  const showSlot = !carry && !gone;

  return (
    <div
      className="app-contact-stage"
      data-held={held || undefined}
      data-carry={carry ? "" : undefined}
      data-gone={gone || undefined}
    >
      <div className="app-contact-stage-floor" aria-hidden />
      <div
        ref={slotRef}
        className="app-contact-slot"
        data-throwable={canThrow || undefined}
        data-cursor={canThrow && !carry ? c.cursorThrow : undefined}
        onPointerDown={canThrow ? onPointerDown : undefined}
        onPointerMove={canThrow ? onPointerMove : undefined}
        onPointerUp={canThrow ? (e) => release(e, false) : undefined}
        onPointerCancel={canThrow ? (e) => release(e, true) : undefined}
        onLostPointerCapture={canThrow ? (e) => release(e, true) : undefined}
        role="img"
        aria-label={c.envelopeLabel}
      >
        <span className="app-contact-socket" aria-hidden />
        <m.div
          className="app-contact-slot-env"
          style={{ y: slotY, opacity: slotO, visibility: showSlot || (reduced && gone) ? "visible" : "hidden" }}
        >
          <Envelope
            subject={subject}
            lines={lines}
            lifted={lifted}
            sealed={sealed}
            instant={instant}
            onSealed={onSealed}
          />
        </m.div>
      </div>

      <p className="app-contact-stage-hint" aria-hidden={!canThrow || undefined}>
        {gone ? (
          <span className="app-contact-stage-out">{c.outbox}</span>
        ) : (
          <>
            <PixelGlyph cells={G_DOWN} size={10} />
            <span>{coarse ? c.flickHint : c.throwHint}</span>
          </>
        )}
      </p>

      {(carry || burst) &&
        createPortal(
          <div className="app-contact-air" aria-hidden>
            {burst && (
              <span key={burst.id} className="app-contact-burst" style={{ left: burst.x, top: burst.y }}>
                {BURST.map(([dx, dy], i) => (
                  <i key={i} style={{ "--dx": `${dx}px`, "--dy": `${dy}px` } as React.CSSProperties} />
                ))}
              </span>
            )}
            {carry && (
              <m.div
                className="app-contact-flyer"
                data-held={held || undefined}
                style={{ x: fx, y: fy, scale: fs, rotate: fr, opacity: fo, originX: fox, originY: foy, width: carry.w }}
              >
                <Envelope subject={subject} lines={lines} sealed={carry.sealed} />
              </m.div>
            )}
            {carry && target && (
              <span
                className="app-contact-target"
                data-armed={armed || undefined}
                style={{
                  left: target.x - target.w / 2,
                  top: target.y - target.h / 2,
                  width: target.w,
                  height: target.h,
                }}
              >
                {!target.tab && <span className="app-contact-target-pill">{c.dropHint}</span>}
              </span>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
