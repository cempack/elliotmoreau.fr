"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { sleeveGrid } from "@/components/apps/now/Cover";
import { useReduced } from "@/hooks/env";
import { CELL, pack, pixelLoop, type PixelLoop } from "@/lib/pixel3d";
import { useSound } from "@/lib/sound";
import type { SpotifyStatus, TrackInfo } from "@/lib/spotify";
import { makeCassette, picturePixels, type Cassette3D, type LabelInfo, type Side } from "./cassette/scene";

/**
 * The music panel as a C60 on the globe's turntable (the scene is in
 * cassette/scene.ts): side A is the song, its cover printed on the label
 * and its title lettered beside it, the packs through the window holding
 * what is left and what has played, the hubs turning while it plays; last
 * played, it is wound to the end. Side B is the artists on repeat lately.
 * Turn it over by dragging it round (1:1, thrown or let go to the nearer
 * side), a tap, Space/Enter or the switch under it ("This song" / "On
 * repeat"). Under the tape, the words in full: the title, the artist and
 * album, or the tracklist.
 *
 * Motion costs nothing between polls: the scene paints only when something
 * changes (the hubs step 5 to 12 times a second while it plays, only while the
 * panel is open and on screen), and the counter's drums roll once a second.
 * React renders on a poll or a turn.
 */

/* ───────── the counter ───────── */

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** one drum of the counter: it only ever rolls forward, one step */
function setDrum(cell: Element, v: number, mod: number, roll: boolean) {
  const el = cell as HTMLElement;
  const strip = el.firstElementChild as HTMLElement | null;
  if (!strip) return;
  const prev = el.dataset.v === undefined ? -1 : Number(el.dataset.v);
  if (prev === v) return;
  el.dataset.v = String(v);
  const at = (i: number) => `translateY(${(-i * 100) / (mod + 1)}%)`;
  const wraps = prev === mod - 1 && v === 0;
  if (!roll || !(v === prev + 1 || wraps)) {
    strip.style.transition = "none";
    strip.style.transform = at(v);
    return;
  }
  strip.style.transition = "";
  // past the last digit it rolls onto the spare 0, then quietly back to the first
  strip.style.transform = at(wraps ? mod : v);
  if (wraps)
    strip.addEventListener(
      "transitionend",
      () => {
        if (el.dataset.v !== "0") return;
        strip.style.transition = "none";
        strip.style.transform = at(0);
      },
      { once: true }
    );
}

/** elapsed m:ss on drums, built for the current shape (9:59 → 10:00) */
function writeCounter(host: HTMLElement | null, s: number, roll: boolean) {
  if (!host) return;
  const txt = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const mods = [...txt].map((ch, i) => (ch === ":" ? 0 : i === txt.length - 2 ? 6 : 10));
  const shape = mods.join(",");
  if (host.dataset.shape !== shape) {
    host.dataset.shape = shape;
    host.replaceChildren(
      ...mods.map((mod) => {
        const cell = document.createElement("span");
        if (!mod) {
          cell.className = "os-tape-colon";
          cell.textContent = ":";
          return cell;
        }
        cell.className = "os-tape-drum";
        const strip = document.createElement("span");
        strip.textContent = Array.from({ length: mod + 1 }, (_, i) => i % mod).join("\n");
        cell.append(strip);
        return cell;
      })
    );
    roll = false;
  }
  [...txt].forEach((ch, i) => {
    if (mods[i]) setDrum(host.children[i], Number(ch), mods[i], roll);
  });
}

/* ───────── the component ───────── */

type Labels = {
  showB: string;
  showA: string;
  sides: string;
  sideA: string;
  sideB: string;
  repeat: string;
  progress: string;
};

const hex = (h: string) => pack([parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
/** a seeded sleeve, for music with no artwork (or artwork that can't be read back) */
const sleeve = (seed: string) => (n: number) => Uint32Array.from(sleeveGrid(seed, n).flat().map(hex));

/** a picture read back for the label (Spotify's CDN allows it), else the seeded sleeve */
function usePicture(src: string | undefined, seed: string) {
  const [img, setImg] = useState<{ src: string; img: HTMLImageElement } | null>(null);
  useEffect(() => {
    if (!src) return;
    let live = true;
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.decoding = "async";
    im.onload = () => live && setImg({ src, img: im });
    im.src = src;
    return () => {
      live = false;
    };
  }, [src]);
  return useMemo(() => {
    const ready = img && img.src === src ? img.img : null;
    const fallback = sleeve(seed);
    return (n: number) => (ready && picturePixels(ready, n)) || fallback(n);
  }, [img, src, seed]);
}

export function Cassette({
  track,
  playing,
  status,
  head,
  foot,
  labels,
}: {
  track: TrackInfo | null;
  playing: boolean;
  status: SpotifyStatus | null;
  /** the kicker, left of the counter */
  head: React.ReactNode;
  /** beside the side switch (Open in Spotify) */
  foot?: React.ReactNode;
  labels: Labels;
}) {
  const reduced = useReduced();
  const { blip } = useSound();
  const [side, setSide] = useState<Side>("A");
  const artists = useMemo(() => (status?.artists ?? []).slice(0, 5), [status]);
  const canFlip = artists.length > 0;
  const total = track?.durationMs ?? 0;
  // last played (not playing, with a date): wound to the end
  const ended = Boolean(track && !playing && track.playedAt);
  const seed = track ? `${track.title} · ${track.artist}` : "silence";

  const stage = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const scene = useRef<{ sc: Cassette3D; loop: PixelLoop } | null>(null);

  const cover = usePicture(track?.image || undefined, seed);
  const top = artists[0];
  const face = usePicture(top?.image || undefined, `artist · ${top?.name ?? ""}`);
  const labelA: LabelInfo = useMemo(() => (track ? { art: cover, title: track.title, sub: track.artist } : { art: null, title: "", sub: "" }), [track, cover]);
  const labelB: LabelInfo = useMemo(() => ({ art: top ? face : null, title: labels.repeat, sub: "" }), [top, face, labels.repeat]);
  const clock = useMemo(
    () => ({ pos: ended ? total : (track?.progressMs ?? 0), total, run: playing && total > 0 }),
    [ended, total, track?.progressMs, playing]
  );
  // the latest of each, for a scene made after they were set
  const latest = useRef({ labelA, labelB, clock, blip });
  useEffect(() => {
    latest.current = { labelA, labelB, clock, blip };
  });

  // the scene and its loop, made once (again if motion is turned off or on)
  useEffect(() => {
    const host = stage.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    let settled: Side = "A";
    const sc = makeCassette(reduced, {
      side: setSide,
      settle: (s) => {
        if (s !== settled) latest.current.blip("tick");
        settled = s;
      },
    });
    // the host's layout size: a panel opening on a scale transform would mislead a bounding box
    const loop = pixelLoop({
      host,
      canvas,
      size: () => [Math.ceil(host.clientWidth / CELL), Math.ceil(host.clientHeight / CELL)],
      frame: sc.frame,
    });
    const { labelA, labelB, clock } = latest.current;
    sc.setLabels(labelA, labelB);
    sc.setClock(clock, loop.clock());
    loop.wake();
    scene.current = { sc, loop };
    setSide("A");
    return () => {
      loop.dispose();
      scene.current = null;
    };
  }, [reduced]);

  useEffect(() => {
    const s = scene.current;
    if (!s) return;
    s.sc.setLabels(labelA, labelB);
    s.loop.wake();
  }, [labelA, labelB]);

  useEffect(() => {
    const s = scene.current;
    if (!s) return;
    s.sc.setClock(clock, s.loop.clock());
    s.loop.wake();
  }, [clock]);

  // the counter: elapsed m:ss on rolling drums, once a second while it plays
  useEffect(() => {
    if (!clock.total) return;
    const t0 = performance.now();
    let shown = -1;
    const write = () => {
      const p = Math.min(clock.total, clock.pos + (clock.run ? performance.now() - t0 : 0));
      const sec = Math.floor(p / 1000);
      if (sec === shown) return;
      writeCounter(counterRef.current, sec, !reduced && sec === shown + 1);
      shown = sec;
      const bar = barRef.current;
      if (bar) {
        bar.setAttribute("aria-valuenow", String(sec));
        bar.setAttribute("aria-valuetext", `${mmss(p)} / ${mmss(clock.total)}`);
      }
    };
    write();
    if (!clock.run) return;
    const id = window.setInterval(() => !document.hidden && write(), 250);
    return () => window.clearInterval(id);
  }, [clock, reduced]);

  const flip = () => {
    if (!canFlip || !scene.current) return;
    scene.current.sc.flip();
    scene.current.loop.wake();
  };
  const show = (s: Side) => {
    if (!canFlip || !scene.current) return;
    scene.current.sc.show(s);
    scene.current.loop.wake();
  };
  // back to side A when there is no side B any more
  useEffect(() => {
    if (!canFlip) scene.current?.sc.show("A");
    scene.current?.loop.wake();
  }, [canFlip]);

  /* dragging it round: sideways turns the turntable, up and down scrolls the panel */
  const g = useRef<{ pid: number; x0: number; y0: number; x: number; t: number; axis: "x" | "y" | null } | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !canFlip) return;
    g.current = { pid: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, t: e.timeStamp, axis: null };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = g.current;
    const s = scene.current;
    if (!d || d.pid !== e.pointerId || !s) return;
    if (!d.axis) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 8) return;
      d.axis = Math.abs(e.clientX - d.x0) > Math.abs(e.clientY - d.y0) ? "x" : "y";
      if (d.axis !== "x") return;
      e.currentTarget.setPointerCapture(e.pointerId);
      s.sc.grab();
    }
    if (d.axis !== "x") return;
    // 1:1: across the whole tape is half a turn
    const w = stage.current?.offsetWidth || 340;
    s.sc.turn(((e.clientX - d.x) / w) * Math.PI, e.timeStamp - d.t);
    d.x = e.clientX;
    d.t = e.timeStamp;
    s.loop.wake();
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = g.current;
    if (!d || d.pid !== e.pointerId) return;
    g.current = null;
    if (d.axis === null) {
      if (e.type === "pointerup") flip();
      return;
    }
    if (d.axis !== "x" || !scene.current) return;
    scene.current.sc.release(e.timeStamp - d.t > 80);
    scene.current.loop.wake();
  };

  return (
    <div className="os-tape-deck">
      <div className="os-tape-head">
        {head}
        {track && total > 0 && playing && (
          <span className="os-tape-time tabular" aria-hidden>
            <span ref={counterRef} className="os-tape-counter" />
            <span className="os-tape-total">{mmss(total)}</span>
          </span>
        )}
      </div>
      {track && total > 0 && (
        <span ref={barRef} className="sr-only" role="progressbar" aria-label={labels.progress} aria-valuemin={0} aria-valuemax={Math.round(total / 1000)} />
      )}

      <div
        ref={stage}
        className="os-tape"
        role="button"
        tabIndex={canFlip ? 0 : -1}
        aria-label={side === "A" ? labels.showB : labels.showA}
        aria-pressed={side === "B"}
        aria-disabled={!canFlip || undefined}
        data-flip={canFlip || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            flip();
          }
        }}
      >
        <canvas ref={canvasRef} className="os-tape-canvas" aria-hidden />
      </div>

      {/* the words in full, under the tape: both sides hold their place, so turning it never moves the panel */}
      <div className="os-tape-words" aria-hidden>
        <div className="os-tape-side" data-on={side === "A" || undefined} key={seed}>
          {track && (
            <>
              <span className="os-tape-title">{track.title}</span>
              <span className="os-tape-artist">
                {track.artist}
                {track.album && track.album !== track.title && <span className="os-tape-album"> · {track.album}</span>}
              </span>
            </>
          )}
        </div>
        {canFlip && (
          <div className="os-tape-side" data-on={side === "B" || undefined}>
            <span className="os-tape-repeat">{labels.repeat}</span>
            <ol className="os-tape-list">
              {artists.map((a, i) => (
                <li key={a.name}>
                  <span className="os-tape-list-k">{i + 1}</span>
                  <span className="os-tape-list-name">{a.name}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      <div className="os-tape-foot">
        {canFlip && (
          <div className="os-tape-sides" role="group" aria-label={labels.sides}>
            <button type="button" aria-pressed={side === "A"} onClick={() => show("A")}>
              {labels.sideA}
            </button>
            <button type="button" aria-pressed={side === "B"} onClick={() => show("B")}>
              {labels.sideB}
            </button>
          </div>
        )}
        {foot}
      </div>
    </div>
  );
}
