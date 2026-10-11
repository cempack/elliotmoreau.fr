"use client";

import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { animate, m, useMotionValue, type AnimationPlaybackControls } from "motion/react";
import { clamp, spring, springFrom } from "@/lib/motion";
import { bounce, visibleIcon } from "@/components/os/dock/launch";
import { useI18n } from "@/i18n/client";
import { useSound } from "@/lib/sound";
import type { Phase } from "./Compose";
import { Envelope } from "./Envelope";
import { activationFresh } from "./mail";
import type { Mark } from "./postmark";

/**
 * The envelope on its stage: a live miniature of the letter being written
 * (the subject and each line of the message appear on it as you type).
 * It isn't a control. Send is the one action, and this is what Send looks
 * like: the envelope folds shut where it stands as the franking meter
 * strikes its postmark, then rises and arcs into Mail in the Dock (the tab
 * bar on phones), and the icon bounces as it lands. Delivered, the sealed
 * letter comes back to the stage with its postmark.
 *
 * When the browser would no longer open the mail app, nothing pretends:
 * the letter seals and stays, waiting for a click. Reduced motion: no
 * flight; it seals in place.
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
type Carry = { w: number; h: number; sealed: boolean; stamp: boolean };

/** the launch goes out a little before the envelope is all the way in */
const LAUNCH_AT = 0.8;
const ARRIVE_AT = 0.965;
/** flight response (s): critically damped, so it never overshoots the icon */
const FLIGHT = 0.5;

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

export function Stage({
  ref,
  phase,
  mark,
  markInk,
  subject,
  lines,
  lifted,
  reduced,
  origin,
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
  reduced: boolean;
  /** where the envelope leaves from when the stage is scrolled away */
  origin: () => DOMRect | null;
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
  /** in flight: a clear shield keeps the Dock from reacting to the pointer resting over it */
  const [flying, setFlying] = useState(false);
  const [burst, setBurst] = useState<{ x: number; y: number; id: number } | null>(null);
  const burstTimer = useRef(0);
  /** what happens once the in-slot fold is done */
  const pending = useRef<"fly" | "land" | null>(null);

  // in-slot envelope: rises back in after a trip
  const slotX = useMotionValue(0);
  const slotY = useMotionValue(0);
  const slotO = useMotionValue(1);
  // the flying envelope: top-left in viewport px, scaled about its center
  const fx = useMotionValue(0);
  const fy = useMotionValue(0);
  const fs = useMotionValue(1);
  const fr = useMotionValue(0);
  const fo = useMotionValue(1);

  const anims = useRef<AnimationPlaybackControls[]>([]);
  const stopAll = () => {
    for (const a of anims.current) a.stop();
    anims.current = [];
  };

  const cbs = useRef({ onLand, blip, origin });
  useEffect(() => {
    cbs.current = { onLand, blip, origin };
  });

  useEffect(
    () => () => {
      stopAll();
      window.clearTimeout(burstTimer.current);
    },
    []
  );

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
      if (reduced || carry) return;
      startFromSlot(false, true, from?.getBoundingClientRect());
    },
    reset: () => {
      stopAll();
      pending.current = null;
      const inSlot = !carry && !gone;
      setCarry(null);
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

  /** the in-slot fold is done: leave as the seal stamps (or stay, sealed, when the browser won't open anything) */
  const onFolded = () => {
    const p = pending.current;
    pending.current = null;
    if (p === "fly") startFromSlot(true);
    else if (p === "land") cbs.current.onLand(false);
  };

  const showSlot = !carry && !gone;
  /** the letter is back on the stage after its trip (or never left) */
  const home = !carry && !gone;

  return (
    <div className="app-contact-stage" data-carry={carry ? "" : undefined} data-gone={gone || undefined}>
      <div className="app-contact-stage-floor" aria-hidden />
      <div ref={slotRef} className="app-contact-slot" role="img" aria-label={c.envelopeLabel}>
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
        ) : null}
      </p>

      {(carry || burst) &&
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
              <m.div className="app-contact-flyer" style={{ x: fx, y: fy, scale: fs, rotate: fr, opacity: fo, width: carry.w }}>
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
          </div>,
          document.body
        )}
    </div>
  );
}
