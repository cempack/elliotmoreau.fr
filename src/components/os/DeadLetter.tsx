"use client";

import { animate, type AnimationPlaybackControls } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { project, rubberband, spring } from "@/lib/motion";
import { PixelLabel } from "@/components/PixelLabel";
import { Envelope } from "@/components/apps/contact/Envelope";

/**
 * When a search finds nothing, the words become a letter to Elliot in
 * Toulouse: Mail's own pixel envelope, the subject line as long as the
 * query, the query and the address under it, a France airmail stamp and
 * an uninked postmark ring with the visitor's own date and time.
 *
 * Flick it up and it posts: the ring inks over the stamp in two stepped
 * frames, the envelope keeps flying at its release velocity, and Mail
 * opens with the search as the subject. Sideways and down it resists, so
 * it only wants to go up, toward the mailbox. Short of the threshold it
 * springs back. Grabbing it mid-flight catches it, but the ink stays: a
 * posted letter can't be un-postmarked. Enter plays the same flight.
 */

export function DeadLetter({
  query,
  active,
  launching,
  post,
  labels,
}: {
  query: string;
  active: boolean;
  /** the palette is posting it (Enter): fly */
  launching: boolean;
  /** hand it to the palette, which closes and runs the send */
  post: () => void;
  labels: { address: string; nothing: string; when: string };
}) {
  const el = useRef<HTMLDivElement>(null);
  const [inked, setInked] = useState(0);
  const g = useRef<{ pid: number; x0: number; y0: number; s: { t: number; x: number; y: number }[] } | null>(null);
  const pos = useRef({ x: 0, y: 0, rot: 0 });
  const flight = useRef<AnimationPlaybackControls[]>([]);
  const sent = useRef(false);

  const apply = () => {
    const n = el.current;
    if (!n) return;
    const { x, y, rot } = pos.current;
    n.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rot}deg)`;
  };
  const stop = () => {
    flight.current.forEach((f) => f.stop());
    flight.current = [];
  };
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** postmark, then away along its own path */
  const fly = (vx: number, vy: number) => {
    stop();
    // the ring inks over the stamp in two stepped frames
    setInked(1);
    window.setTimeout(() => setInked(2), 70);
    if (reduced()) {
      if (el.current) el.current.style.opacity = "0";
      window.setTimeout(post, 150);
      return;
    }
    const p = pos.current;
    const up = Math.min(-900, vy);
    flight.current = [
      animate(p.y, -window.innerHeight, { ...spring.flick, velocity: up, onUpdate: (v) => ((p.y = v), apply()) }),
      animate(p.x, p.x + vx * 0.2, { ...spring.default, velocity: vx, onUpdate: (v) => ((p.x = v), apply()) }),
    ];
    if (!sent.current) {
      sent.current = true;
      window.setTimeout(post, 220);
    }
  };

  // Enter: the same flight, from rest
  useEffect(() => {
    if (launching && !sent.current) {
      const id = window.setTimeout(() => fly(0, -1400), 0);
      return () => window.clearTimeout(id);
    }
    // fly only reads refs and the latest post
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [launching]);
  useEffect(() => () => stop(), []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    stop();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pos.current;
    g.current = { pid: e.pointerId, x0: e.clientX - p.x, y0: e.clientY - p.y, s: [] };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = g.current;
    if (!d || d.pid !== e.pointerId) return;
    const rx = e.clientX - d.x0;
    const ry = e.clientY - d.y0;
    d.s.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
    while (d.s.length > 2 && e.timeStamp - d.s[0].t > 80) d.s.shift();
    const p = pos.current;
    // up is free; sideways and down resist
    p.x = rubberband(rx, 160);
    p.y = ry < 0 ? ry : rubberband(ry, 120);
    if (!reduced() && d.s.length > 1) {
      const a = d.s[0];
      const b = d.s[d.s.length - 1];
      const vx = ((b.x - a.x) / Math.max(8, b.t - a.t)) * 1000;
      // paper in the air: tilts with its sideways speed, at most 6°
      p.rot += (Math.max(-6, Math.min(6, vx / 140)) - p.rot) * 0.35;
    }
    apply();
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = g.current;
    if (!d || d.pid !== e.pointerId) return;
    g.current = null;
    // a tap posts it, like Enter
    if (!d.s.length) {
      fly(0, -1400);
      return;
    }
    let vx = 0;
    let vy = 0;
    if (d.s.length > 1 && e.timeStamp - d.s[d.s.length - 1].t < 60) {
      const a = d.s[0];
      const b = d.s[d.s.length - 1];
      const dt = Math.max(8, b.t - a.t);
      vx = ((b.x - a.x) / dt) * 1000;
      vy = ((b.y - a.y) / dt) * 1000;
    }
    const p = pos.current;
    const box = el.current?.getBoundingClientRect();
    const panel = el.current?.closest(".em-palette-panel")?.getBoundingClientRect();
    const top = box && panel ? box.top - panel.top - p.y : 200;
    const height = panel?.height ?? 400;
    // posted when its path clears the panel's top, or it already went half way up
    if (p.y + project(vy, 0.995) < -top || p.y < -height / 2) {
      fly(vx, vy);
      return;
    }
    stop();
    const back = (v0: number, to: number, set: (v: number) => void, from: number) =>
      animate(from, to, { ...spring.default, velocity: v0, onUpdate: (v) => (set(v), apply()) });
    flight.current = [
      back(vx, 0, (v) => (p.x = v), p.x),
      back(vy, 0, (v) => (p.y = v), p.y),
      back(0, 0, (v) => (p.rot = v), p.rot),
    ];
  };

  const subject = Math.max(3, Math.min(10, Math.round(query.trim().length * 0.36)));

  return (
    <div className="em-dead" data-active={active || undefined}>
      <div
        ref={el}
        className="em-dead-letter"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <Envelope subject={subject} lines={[]} instant className="em-dead-env" />
        <span className="em-dead-address" aria-hidden>
          <span className="em-dead-query">{query.trim()}</span>
          <span>{labels.address}</span>
        </span>
        <span className="em-dead-stamp" aria-hidden>
          <span className="em-dead-stamp-art">
            <PixelLabel text="FR" cell={2} />
          </span>
        </span>
        <span className="em-dead-mark" data-inked={inked || undefined} data-full={inked > 1 || undefined} aria-hidden>
          <span className="em-dead-mark-ring" />
          <span className="em-dead-mark-text">
            {labels.when.split(" ").map((part) => (
              <PixelLabel key={part} text={part} cell={1} />
            ))}
          </span>
        </span>
      </div>
      <p className="em-dead-note">{labels.nothing}</p>
    </div>
  );
}
