"use client";

import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { animate, m, useMotionValue, type AnimationPlaybackControls } from "motion/react";
import { clamp, project, rubberband, spring, springFrom } from "@/lib/motion";
import { bounce, visibleIcon } from "@/components/os/dock/launch";
import { menubarBottom } from "@/components/os/window/dock";
import { useI18n } from "@/i18n/client";
import { useSound } from "@/lib/sound";
import { PixelGlyph } from "@/components/glyphs";
import type { Phase } from "./Compose";
import { Envelope } from "./Envelope";
import { G_DOWN } from "./glyphs";
import { activationFresh } from "./mail";
import type { Mark } from "./postmark";

/**
 * The envelope on its stage, and the one gesture this app is about.
 *
 * Pick the envelope up and it follows the pointer 1:1 from where you
 * grabbed it, lifted out of the window into a layer above the Dock, with
 * rubber-banding at the top and sides of the screen. A ring lights up
 * around Mail in the Dock (the tab bar on phones). Held over the Dock, it
 * folds shut in your hand and hovers just above the icon (position only,
 * so a quick move elsewhere never folds it). Let go and the release
 * velocity is projected (`project()`): if it lands on Mail, or the throw is
 * clearly headed there, it flies an arc into the icon that starts at the
 * exact speed it left your hand, and the icon bounces as it lands.
 * Otherwise it springs home, with a little bounce only if it was thrown,
 * and it can be caught again on the way. Delivered, the sealed letter
 * comes back to the stage with its postmark.
 *
 * Touch: hold the envelope still for a moment to lift it (as iOS does for
 * drag and drop), so a scroll that starts on it stays a scroll.
 *
 * Pressing Send does the same from rest: the envelope folds where it
 * stands and leaves as the seal stamps. When the browser would no longer
 * open the mail app (a long drag outlives the gesture), nothing pretends:
 * the letter seals and stays, waiting for a click. Reduced motion: no
 * gesture and no flight; it seals in place.
 */

export type StageHandle = {
  /** fold, then fly into the Dock; resolves through `onLand` */
  send: () => void;
  /** the mail app was just opened by a click: the sealed letter makes the trip */
  deliver: (from?: Element | null) => void;
  /** back to writing: the letter opens again (or a fresh one comes back) */
  reset: () => void;
};

type Pt = { x: number; y: number };
type Target = { x: number; y: number; w: number; h: number; bounceEl: HTMLElement | null; tab: boolean };
type Sample = Pt & { t: number };
type Carry = { w: number; h: number; sealed: boolean; stamp: boolean };
type Gesture = {
  id: number;
  touch: boolean;
  el: HTMLElement;
  /** grab point in the envelope's unscaled box */
  ox: number;
  oy: number;
  w: number;
  h: number;
  sx: number;
  sy: number;
  last: Pt;
  /** carried (touch: lifted) */
  moved: boolean;
  timer: number;
  samples: Sample[];
  target: Target;
  armed: boolean;
  /** the menu bar's bottom edge: the envelope rubber-bands below it */
  ceiling: number;
};

/** touch: hold this long, within LIFT_SLOP px, to pick the envelope up */
const LIFT_MS = 260;
const LIFT_SLOP = 8;
const DRAG_SLOP = 4;
/** the launch goes out a little before the envelope is all the way in */
const LAUNCH_AT = 0.8;
const ARRIVE_AT = 0.965;
/** flight response (s): critically damped, so it never overshoots the icon */
const FLIGHT = 0.5;
/** px the "held over the Dock" zone grows once armed, so its edge doesn't chatter */
const HYSTERESIS = 28;

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

/** The menu bar's height in px (`--menubar-h`, in rem). */
/** the menu bar's real bottom edge (top inset included): the held envelope rubber-bands below it */
const ceiling = () => menubarBottom();

/**
 * px/s over the last ~100ms of samples (from the oldest sample inside that
 * window, so a long still hold before the flick doesn't water it down);
 * 0 if the pointer had come to rest.
 */
function velocity(s: Sample[], now: number): Pt {
  if (s.length < 2) return { x: 0, y: 0 };
  const last = s[s.length - 1];
  if (now - last.t > 80) return { x: 0, y: 0 };
  let i = s.length - 2;
  while (i > 0 && last.t - s[i - 1].t <= 100) i--;
  const a = s[i];
  const dt = (last.t - a.t) / 1000;
  if (dt <= 0) return { x: 0, y: 0 };
  return { x: (last.x - a.x) / dt, y: (last.y - a.y) / dt };
}

/**
 * Held over the Dock (position only): `ptr` is the pointer, `c` the
 * envelope's visual center and `half` its visual half-size. `slack` widens
 * the zone once armed.
 */
function overDock(ptr: Pt, c: Pt, half: Pt, t: Target, slack = 0) {
  const top = t.y - t.h / 2;
  // the envelope itself touches the icon
  const pad = 16 + slack;
  if (Math.abs(c.x - t.x) < half.x + t.w / 2 + pad && Math.abs(c.y - t.y) < half.y + t.h / 2 + pad) return true;
  // phones: held over the Mail tab
  if (t.tab) return ptr.y > top - 70 - slack && Math.abs(ptr.x - t.x) < 80 + slack;
  // over the Dock, or just above it
  const reach = Math.max(200, window.innerWidth * 0.16);
  return ptr.y > Math.max(top - 110, window.innerHeight * 0.6) - slack && Math.abs(ptr.x - t.x) < reach + slack;
}

/** Thrown: would the release velocity `v` carry it into the Dock? */
function thrownAtDock(ptr: Pt, c: Pt, v: Pt, t: Target) {
  const top = t.y - t.h / 2;
  if (t.tab) {
    // phones: flicked down so that it would land on the Mail tab
    if (v.y < 250) return false;
    if (ptr.y + project(v.y) < t.y - 60) return false;
    const xAt = ptr.x + ((t.y - ptr.y) * v.x) / v.y;
    return Math.abs(xAt - t.x) < 90;
  }
  const reach = Math.max(200, window.innerWidth * 0.16);
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

/** a short haptic tick on the lift, where the platform has one */
function tick() {
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  try {
    if (ua?.hasBeenActive) navigator.vibrate?.(8);
  } catch {}
}

export function Stage({
  ref,
  phase,
  mark,
  markInk,
  subject,
  lines,
  lifted,
  interactive,
  reduced,
  coarse,
  empty,
  origin,
  onThrow,
  onLand,
}: {
  ref?: React.Ref<StageHandle>;
  phase: Phase;
  /** the franking meter's postmark, once the letter is franked, and its ink */
  mark: Mark | null;
  markInk: number;
  subject: number;
  lines: number[];
  lifted: boolean;
  /** the gesture is live (compose phase, motion allowed) */
  interactive: boolean;
  reduced: boolean;
  coarse: boolean;
  /** nothing written yet: the gesture won't send an empty letter */
  empty: boolean;
  /** where the envelope leaves from when the stage is scrolled away */
  origin: () => DOMRect | null;
  /** the gesture decided to send */
  onThrow: () => void;
  /**
   * Time to hand over to the mail app (or sealed in place). `canOpen` is
   * false when the browser would refuse; returns whether it opened.
   */
  onLand: (canOpen: boolean) => boolean;
}) {
  const { t } = useI18n();
  const c = t.contact;
  const { blip } = useSound();

  const slotRef = useRef<HTMLDivElement>(null);
  /** a small envelope (phones) keeps only the postmark's ring */
  const [small, setSmall] = useState(false);
  useEffect(() => {
    const el = slotRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSmall(e.contentRect.width < 170));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [sealed, setSealed] = useState(false);
  const [instant, setInstant] = useState(false);
  const [gone, setGone] = useState(false);
  const [carry, setCarry] = useState<Carry | null>(null);
  /** springing home: the flyer can be caught */
  const [returning, setReturning] = useState(false);
  /** in flight: a clear shield keeps the Dock from reacting to the pointer resting over it */
  const [flying, setFlying] = useState(false);
  const [target, setTarget] = useState<Target | null>(null);
  const [armed, setArmed] = useState(false);
  const [grip, setGrip] = useState<"slot" | "flyer" | null>(null);
  /** touch: held, not yet lifted */
  const [press, setPress] = useState(false);
  const [burst, setBurst] = useState<{ x: number; y: number; id: number } | null>(null);
  /** mouse over the envelope: a faint ring shows where it goes */
  const [peek, setPeek] = useState<Target | null>(null);
  const burstTimer = useRef(0);
  /** what happens once the in-slot fold is done */
  const pending = useRef<"fly" | "land" | null>(null);

  // in-slot envelope: hop on tap, shake when refused, rise back in after a trip
  const slotX = useMotionValue(0);
  const slotY = useMotionValue(0);
  const slotO = useMotionValue(1);
  // the carried / flying envelope: top-left in viewport px, scaled about its center
  const fx = useMotionValue(0);
  const fy = useMotionValue(0);
  const fs = useMotionValue(1);
  const fr = useMotionValue(0);
  const fo = useMotionValue(1);
  /** 0 → 1 as it settles above the icon, folded */
  const arm = useMotionValue(0);
  /** the touch lift's little pop */
  const pop = useMotionValue(1);
  // the pill rides above the carried envelope
  const px = useMotionValue(0);
  const py = useMotionValue(0);

  const gesture = useRef<Gesture | null>(null);
  const anims = useRef<AnimationPlaybackControls[]>([]);
  const armAnim = useRef<AnimationPlaybackControls | null>(null);
  const stopAll = () => {
    for (const a of anims.current) a.stop();
    anims.current = [];
  };

  const cbs = useRef({ onThrow, onLand, blip, empty, origin });
  useEffect(() => {
    cbs.current = { onThrow, onLand, blip, empty, origin };
  });

  /** where the carried envelope sits for pointer `g.last` (free = as if not armed) */
  const geometry = (g: Gesture) => {
    const P = g.last;
    const T = g.target;
    const near = clamp(1 - (Math.hypot(P.x - T.x, P.y - T.y) - 80) / 460, 0, 1);
    // it shrinks as it nears the Dock, so the Dock stays in sight
    const sFree = (1.04 - 0.6 * near * near * (3 - 2 * near)) * pop.get();
    const a = arm.get();
    const s = sFree + (Math.max(T.w * 1.3, 56) / g.w - sFree) * a;
    const free = { x: P.x + (g.w / 2 - g.ox) * sFree, y: P.y + (g.h / 2 - g.oy) * sFree };
    // armed: centered on the pointer, its bottom edge 0.6 icon above it, so the icon and ring stay in view
    const held = { x: P.x + (g.w / 2 - g.ox) * s, y: P.y + (g.h / 2 - g.oy) * s };
    const above = { x: P.x, y: P.y - T.h * 0.6 - (g.h * s) / 2 };
    const ctr = { x: held.x + (above.x - held.x) * a, y: held.y + (above.y - held.y) * a };
    // rubber-band past the menu bar and the sides of the screen (the bottom is the target: free)
    const hw = (g.w * s) / 2;
    const hh = (g.h * s) / 2;
    const vw = window.innerWidth;
    const top = g.ceiling + hh + 6;
    if (ctr.y < top) ctr.y = top - rubberband(top - ctr.y, window.innerHeight);
    const l = hw + 8;
    const r = vw - hw - 8;
    if (r > l) {
      if (ctr.x < l) ctr.x = l - rubberband(l - ctr.x, vw);
      else if (ctr.x > r) ctr.x = r + rubberband(ctr.x - r, vw);
    }
    return { s, c: ctr, free, half: { x: (g.w / 2) * sFree, y: (g.h / 2) * sFree } };
  };

  const place = (g: Gesture) => {
    const geo = geometry(g);
    fx.set(geo.c.x - g.w / 2);
    fy.set(geo.c.y - g.h / 2);
    fs.set(geo.s);
    px.set(geo.c.x);
    py.set(geo.c.y - (g.h * geo.s) / 2 - 10);
    return geo;
  };

  // the arm spring and the pop move the envelope even while the pointer rests
  const placeRef = useRef(place);
  useEffect(() => {
    placeRef.current = place;
  });
  useEffect(() => {
    const follow = () => {
      const g = gesture.current;
      if (g?.moved) placeRef.current(g);
    };
    const a = arm.on("change", follow);
    const b = pop.on("change", follow);
    return () => {
      a();
      b();
    };
  }, [arm, pop]);

  useEffect(
    () => () => {
      stopAll();
      armAnim.current?.stop();
      window.clearTimeout(burstTimer.current);
      if (gesture.current) window.clearTimeout(gesture.current.timer);
    },
    []
  );

  // touch: once lifted, the page must not scroll under the finger
  useEffect(() => {
    const el = slotRef.current;
    if (!el) return;
    const onTouchMove = (e: TouchEvent) => {
      if (gesture.current?.moved && e.cancelable) e.preventDefault();
    };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, []);

  const springArm = (to: number) => {
    armAnim.current?.stop();
    armAnim.current = animate(arm, to, spring.snappy);
  };

  /** The sealed letter returns to its place on the stage, postmarked. */
  const comeBack = () => {
    setGone(false);
    setInstant(true);
    setSealed(true);
    slotX.set(0);
    slotY.set(26);
    slotO.set(0);
    anims.current.push(
      animate(slotY, 0, { ...spring.gentle, delay: 0.22 }),
      animate(slotO, 1, { duration: 0.3, delay: 0.22, ease: "easeOut" })
    );
  };

  /**
   * Fly from `from` (center, viewport px) at scale `s0` into the Dock.
   * `v` is the release velocity (px/s; zero from rest) and `lead` the
   * curve's first control arm, which sets the direction it leaves in.
   * `deliver`: the mail app is already open (a click did it).
   */
  const fly = (from: Pt, v: Pt, lead: Pt, s0: number, w: number, h: number, tg: Target, deliver = false) => {
    stopAll();
    setFlying(true);
    const T = { x: tg.x, y: tg.y };
    const dist = Math.hypot(T.x - from.x, T.y - from.y);
    const L = { ...lead };
    const lm0 = Math.hypot(L.x, L.y);
    const maxL = Math.max(80, dist * 0.5);
    if (lm0 > maxL) {
      L.x *= maxL / lm0;
      L.y *= maxL / lm0;
    }
    const lm = Math.hypot(L.x, L.y);
    // the curve's speed at q = 0 is 3·|P1 − P0|·dq/dt: start at exactly the speed it left the hand
    // (capped below the spring's natural frequency, so it never overshoots the icon)
    const dq = lm > 1 ? Math.min(9, Math.hypot(v.x, v.y) / (3 * lm)) : 0;
    const P0 = from;
    const P1 = { x: from.x + L.x, y: from.y + L.y };
    const P2 = { x: T.x, y: T.y - clamp(dist * 0.42, 90, 260) };
    const P3 = T;
    const s1 = (tg.w * 0.8) / w;
    let launched = false;
    let arrived = false;
    let opened = deliver;
    const launch = () => {
      if (launched) return;
      launched = true;
      if (!deliver) opened = cbs.current.onLand(true);
    };
    const arrive = () => {
      if (arrived) return;
      arrived = true;
      // only a letter that really went out gets a welcome
      if (!opened) return;
      bounce(tg.bounceEl, tg.tab ? 7 : 16);
      setBurst({ x: T.x, y: T.y, id: performance.now() });
      window.clearTimeout(burstTimer.current);
      burstTimer.current = window.setTimeout(() => setBurst(null), 700);
      cbs.current.blip("success");
    };
    const a = animate(0, 1, {
      ...springFrom(FLIGHT, 0),
      velocity: dq,
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
        if (q >= LAUNCH_AT) launch();
        if (q >= ARRIVE_AT) arrive();
      },
      onComplete: () => {
        launch();
        arrive();
        setCarry(null);
        setTarget(null);
        setFlying(false);
        comeBack();
      },
    });
    anims.current.push(a);
  };

  const slotVisible = (r: DOMRect | undefined): r is DOMRect =>
    !!r && r.width > 0 && r.bottom > 120 && r.top < window.innerHeight - 90;

  /** Leave from rest (Send, or a click that opened the mail app): out of the slot, or from `at` when it's scrolled away. */
  const startFromSlot = (stamp: boolean, deliver = false, at?: DOMRect | null) => {
    const r = slotRef.current?.getBoundingClientRect();
    const tg = dockTarget();
    const vh = window.innerHeight;
    let from: Pt;
    let s0 = 1;
    const w = r?.width || 200;
    const h = r?.height || (w * 30) / 33;
    if (slotVisible(r)) {
      from = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    } else {
      // scrolled away: a small envelope leaves from the button
      const o = at?.width ? at : cbs.current.origin();
      from = o && o.width ? { x: o.left + o.width / 2, y: o.top + o.height / 2 } : { x: window.innerWidth / 2, y: vh / 2 };
      s0 = clamp(60 / w, 0.2, 1);
    }
    fx.set(from.x - w / 2);
    fy.set(from.y - h / 2);
    fs.set(s0);
    fr.set(0);
    fo.set(1);
    setCarry({ w, h, sealed: true, stamp });
    setGone(true);
    setTarget(tg);
    // from rest: it rises first, then arcs down into the icon
    fly(from, { x: 0, y: 0 }, { x: 0, y: -120 }, s0, w, h, tg, deliver);
  };

  useImperativeHandle(ref, () => ({
    send: () => {
      const fresh = activationFresh();
      if (reduced || !slotRef.current) {
        setInstant(true);
        setSealed(true);
        cbs.current.onLand(fresh);
        return;
      }
      if (!fresh) {
        // the browser won't open anything now: seal it where it stands, then offer the click
        pending.current = "land";
        setInstant(false);
        setSealed(true);
        return;
      }
      if (sealed || !slotVisible(slotRef.current.getBoundingClientRect())) {
        // nobody would see the fold: leave at once
        setInstant(true);
        setSealed(true);
        startFromSlot(true);
        return;
      }
      setInstant(false);
      pending.current = "fly";
      setSealed(true);
    },
    deliver: (from) => {
      if (reduced || carry || gesture.current) return;
      startFromSlot(false, true, from?.getBoundingClientRect());
    },
    reset: () => {
      stopAll();
      pending.current = null;
      const inSlot = !carry && !gone;
      setCarry(null);
      setTarget(null);
      setArmed(false);
      setReturning(false);
      setFlying(false);
      setGone(false);
      slotX.set(0);
      if (reduced) {
        setInstant(true);
        setSealed(false);
        slotY.set(0);
        slotO.set(1);
        return;
      }
      // the letter in the slot opens up again; one still out comes back first
      setInstant(false);
      setSealed(false);
      if (!inSlot) {
        slotY.set(28);
        slotO.set(0);
        anims.current.push(animate(slotY, 0, spring.gentle), animate(slotO, 1, { duration: 0.25 }));
      } else {
        anims.current.push(animate(slotY, 0, spring.default), animate(slotO, 1, { duration: 0.2 }));
      }
    },
  }));

  // once per visit, a small hop says the envelope can be picked up
  useEffect(() => {
    if (!interactive || reduced) return;
    try {
      if (sessionStorage.getItem("em-mail-hop")) return;
    } catch {
      return;
    }
    const id = window.setTimeout(() => {
      const r = slotRef.current?.getBoundingClientRect();
      if (!r || r.bottom < 0 || r.top > window.innerHeight || document.hidden) return;
      try {
        sessionStorage.setItem("em-mail-hop", "1");
      } catch {}
      anims.current.push(
        animate(slotY, [0, -12, 0, -4, 0], {
          duration: 0.9,
          times: [0, 0.28, 0.6, 0.78, 1],
          ease: ["easeOut", [0.6, 0, 0.85, 0.5], "easeOut", [0.6, 0, 0.85, 0.5]],
        })
      );
    }, 1600);
    return () => window.clearTimeout(id);
  }, [interactive, reduced, slotY]);

  /** the in-slot fold is done: leave as the seal stamps (or stay, sealed, when the browser won't open anything) */
  const onFolded = () => {
    const p = pending.current;
    pending.current = null;
    if (p === "fly") startFromSlot(true);
    else if (p === "land") cbs.current.onLand(false);
  };

  const hop = () => {
    stopAll();
    anims.current.push(
      animate(slotY, [0, -14, 0], { duration: 0.46, times: [0, 0.4, 1], ease: ["easeOut", [0.6, 0, 0.85, 0.5]] })
    );
  };

  /* ── the gesture ── */

  /** start carrying: the envelope rises out of the window into the air layer */
  const begin = (g: Gesture, lift: boolean) => {
    g.moved = true;
    stopAll();
    armAnim.current?.stop();
    arm.jump(0);
    fr.set(0);
    fo.set(1);
    setCarry({ w: g.w, h: g.h, sealed: false, stamp: false });
    setTarget(g.target);
    setReturning(false);
    setPeek(null);
    if (lift) {
      // iOS-style lift: settle in a touch smaller, then rise toward the finger
      pop.jump(0.94);
      place(g);
      anims.current.push(animate(pop, 1, springFrom(0.3, 0.25)));
      tick();
    } else {
      pop.jump(1);
      place(g);
    }
  };

  const abort = (g: Gesture) => {
    window.clearTimeout(g.timer);
    if (gesture.current === g) gesture.current = null;
    setPress(false);
    setGrip(null);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || gone || carry || gesture.current || (e.pointerType === "mouse" && e.button !== 0)) return;
    const r = e.currentTarget.getBoundingClientRect();
    const touch = e.pointerType !== "mouse";
    const P = { x: e.clientX, y: e.clientY };
    const g: Gesture = {
      id: e.pointerId,
      touch,
      el: e.currentTarget,
      ox: P.x - r.left,
      oy: P.y - r.top,
      w: r.width,
      h: r.height,
      sx: P.x,
      sy: P.y,
      last: P,
      moved: false,
      timer: 0,
      samples: [{ ...P, t: e.timeStamp }],
      target: dockTarget(),
      armed: false,
      ceiling: ceiling(),
    };
    gesture.current = g;
    setGrip("slot"); // respond on pointer-down
    if (touch) {
      // a scroll may start here: only a still hold picks the envelope up
      setPress(true);
      g.timer = window.setTimeout(() => {
        if (gesture.current !== g) return;
        setPress(false);
        try {
          g.el.setPointerCapture(g.id);
        } catch {}
        // the finger is at rest here: velocity counts from the lift, not the press
        g.samples = [{ ...g.last, t: performance.now() }];
        begin(g, true);
      }, LIFT_MS);
    } else {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };

  /** catch the envelope as it springs home */
  const onCatch = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!returning || !carry || gesture.current || (e.pointerType === "mouse" && e.button !== 0)) return;
    stopAll();
    const s = fs.get();
    const { w, h } = carry;
    const ctr = { x: fx.get() + w / 2, y: fy.get() + h / 2 };
    const P = { x: e.clientX, y: e.clientY };
    const g: Gesture = {
      id: e.pointerId,
      touch: e.pointerType !== "mouse",
      el: e.currentTarget,
      ox: w / 2 + (P.x - ctr.x) / s,
      oy: h / 2 + (P.y - ctr.y) / s,
      w,
      h,
      sx: P.x,
      sy: P.y,
      last: P,
      moved: true,
      timer: 0,
      samples: [{ ...P, t: e.timeStamp }],
      target: dockTarget(),
      armed: false,
      ceiling: ceiling(),
    };
    gesture.current = g;
    e.currentTarget.setPointerCapture(e.pointerId);
    setReturning(false);
    setGrip("flyer");
    setTarget(g.target);
    // no jump: carry on from the scale it had in the air
    pop.jump(1);
    const free = geometry(g).s;
    pop.jump(s / free);
    anims.current.push(animate(pop, 1, spring.snappy));
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const P = { x: e.clientX, y: e.clientY };
    // every sample the browser folded into this frame, for an honest release velocity
    const folded = e.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const q of folded.length ? folded : [e.nativeEvent]) g.samples.push({ x: q.clientX, y: q.clientY, t: q.timeStamp });
    if (g.samples.length > 16) g.samples.splice(0, g.samples.length - 16);
    g.last = P;
    if (!g.moved) {
      const d = Math.hypot(P.x - g.sx, P.y - g.sy);
      if (g.touch) {
        // moved before the lift: that's a scroll, not a pick-up
        if (d > LIFT_SLOP) abort(g);
        return;
      }
      if (d < DRAG_SLOP) return;
      begin(g, false);
    }
    const v = velocity(g.samples, e.timeStamp);
    // lean into the motion, like something held by one corner
    fr.set(clamp(v.x / 90, -10, 10) * (1 - arm.get()));
    const geo = place(g);
    // where it is, not how fast it moves: the projection is for the release
    const a = overDock(P, geo.free, geo.half, g.target, g.armed ? HYSTERESIS : 0);
    if (a !== g.armed) {
      // over the Dock it folds shut in your hand and settles above the icon; away again, it opens
      g.armed = a;
      setArmed(a);
      const live = a && !cbs.current.empty;
      springArm(live ? 1 : 0);
      setCarry((k) => (k ? { ...k, sealed: live } : k));
    }
  };

  /** Spring back to the slot with the release velocity. `refused`: nothing written; `seal`: it stays sealed there. */
  const goHome = (w: number, h: number, v: Pt, refused: boolean, seal = false) => {
    const slot = slotRef.current?.getBoundingClientRect();
    const ctr = { x: fx.get() + w / 2, y: fy.get() + h / 2 };
    const hx = slot ? slot.left : ctr.x - w / 2;
    const hy = slot ? slot.top : ctr.y - h / 2;
    const thrown = Math.hypot(v.x, v.y) > 500;
    const sp = thrown ? spring.flick : spring.default;
    stopAll();
    setCarry({ w, h, sealed: seal, stamp: false });
    setReturning(!seal);
    let done = 0;
    const finish = () => {
      if (++done < 2) return;
      if (seal) {
        setInstant(true);
        setSealed(true);
        setGone(false);
      }
      setCarry(null);
      setTarget(null);
      setReturning(false);
      if (refused) {
        // nothing written: a little "no" from the envelope
        cbs.current.blip("tick");
        anims.current.push(animate(slotX, [0, -7, 6, -4, 2, 0], { duration: 0.42, ease: "easeOut" }));
      }
      if (seal) cbs.current.onLand(false);
    };
    anims.current.push(
      animate(fx, hx, { ...sp, velocity: v.x, onComplete: finish }),
      animate(fy, hy, { ...sp, velocity: v.y, onComplete: finish }),
      animate(fs, 1, spring.default),
      animate(fr, 0, spring.default)
    );
  };

  const release = (e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    window.clearTimeout(g.timer);
    setPress(false);
    setGrip(null);
    setArmed(false);
    armAnim.current?.stop();
    try {
      if (g.el.hasPointerCapture(e.pointerId)) g.el.releasePointerCapture(e.pointerId);
    } catch {}

    if (!g.moved) {
      // a tap: a little hop says "pick me up"
      if (!cancelled) hop();
      return;
    }

    const v = cancelled ? { x: 0, y: 0 } : velocity(g.samples, e.timeStamp);
    const geo = geometry(g);
    arm.jump(0);
    const ctr = { x: fx.get() + g.w / 2, y: fy.get() + g.h / 2 };
    const send =
      !cancelled &&
      (overDock(g.last, geo.free, geo.half, g.target, g.armed ? HYSTERESIS : 0) ||
        thrownAtDock(g.last, geo.free, v, g.target));
    if (!send) {
      // home: back to the slot, carrying the release velocity
      goHome(g.w, g.h, v, false);
      return;
    }
    if (cbs.current.empty) {
      goHome(g.w, g.h, v, true);
      return;
    }
    cbs.current.onThrow();
    if (!activationFresh()) {
      // held too long for the browser to open the mail app: it comes back sealed, waiting for a click
      goHome(g.w, g.h, v, false, true);
      return;
    }
    setCarry({ w: g.w, h: g.h, sealed: true, stamp: false });
    setGone(true);
    setSealed(true);
    setInstant(true);
    fly(ctr, v, { x: v.x * 0.16, y: v.y * 0.16 }, fs.get(), g.w, g.h, dockTarget());
  };

  const canThrow = interactive && !reduced;
  const showSlot = !carry && !gone;
  const handlers = {
    onPointerMove,
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => release(e, false),
    onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => release(e, true),
    onLostPointerCapture: (e: React.PointerEvent<HTMLDivElement>) => release(e, true),
  };
  const refuse = armed && empty;
  const ring = carry ? target : canThrow && !gone ? peek : null;
  /** the letter is back on the stage after its trip (or never left) */
  const home = !carry && !gone;

  return (
    <div
      className="app-contact-stage"
      data-held={grip ? "" : undefined}
      data-press={press || undefined}
      data-carry={carry ? "" : undefined}
      data-gone={gone || undefined}
    >
      <div className="app-contact-stage-floor" aria-hidden />
      <div
        ref={slotRef}
        className="app-contact-slot"
        data-throwable={canThrow || undefined}
        onPointerDown={canThrow ? onPointerDown : undefined}
        {...(canThrow ? handlers : {})}
        onContextMenu={canThrow ? (e) => e.preventDefault() : undefined}
        onPointerEnter={
          canThrow ? (e) => e.pointerType === "mouse" && !carry && !gone && setPeek(dockTarget()) : undefined
        }
        onPointerLeave={canThrow ? () => setPeek(null) : undefined}
        role="img"
        aria-label={c.envelopeLabel}
      >
        <span className="app-contact-socket" aria-hidden />
        <m.div
          className="app-contact-slot-env"
          style={{ x: slotX, y: slotY, opacity: slotO, visibility: showSlot || (reduced && gone) ? "visible" : "hidden" }}
        >
          <Envelope
            subject={subject}
            lines={lines}
            lifted={lifted && !reduced}
            sealed={sealed}
            instant={instant}
            mark={mark}
            markInk={markInk}
            markCompact={small}
            markFresh
            onFolded={onFolded}
          />
        </m.div>
      </div>

      <p className="app-contact-stage-hint" data-phase={phase}>
        {phase === "sent" ? (
          home && (
            <span className="app-contact-stage-done">
              <span className="app-contact-stage-out">{c.outbox}</span>
            </span>
          )
        ) : phase === "ready" ? (
          home && (
            <span className="app-contact-stage-done">
              <span className="app-contact-stage-wait">{c.waiting}</span>
            </span>
          )
        ) : phase === "compose" && canThrow ? (
          <span className="app-contact-stage-tip">
            <PixelGlyph cells={G_DOWN} size={14} />
            <span>{coarse ? c.holdHint : c.throwHint}</span>
          </span>
        ) : null}
      </p>

      {(carry || burst || (peek && canThrow && !gone)) &&
        createPortal(
          <div className="app-contact-air" aria-hidden>
            {flying && <div className="app-contact-shield" />}
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
                data-held={grip === "flyer" || grip === "slot" || undefined}
                data-catch={returning || grip === "flyer" || undefined}
                style={{ x: fx, y: fy, scale: fs, rotate: fr, opacity: fo, width: carry.w }}
                onPointerDown={onCatch}
                {...handlers}
              >
                <Envelope
                  subject={subject}
                  lines={lines}
                  sealed={carry.sealed}
                  stamp={carry.stamp}
                  mark={mark}
                  markInk={markInk}
                  markCompact={carry.w < 170}
                />
              </m.div>
            )}
            {/* above the envelope, so the ring always reads */}
            {ring && (
              <span
                className="app-contact-target"
                data-armed={(carry && armed && !empty) || undefined}
                data-peek={!carry || undefined}
                style={{
                  left: ring.x - ring.w / 2,
                  top: ring.y - ring.h / 2,
                  width: ring.w,
                  height: ring.h,
                }}
              />
            )}
            {carry && grip && (
              <m.span
                className="app-contact-pill"
                data-armed={armed || undefined}
                data-refuse={refuse || undefined}
                style={{ x: px, y: py }}
              >
                <span>{refuse ? c.writeFirst : c.dropHint}</span>
              </m.span>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
