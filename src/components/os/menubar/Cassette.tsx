"use client";

import { animate, type AnimationPlaybackControls } from "motion/react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { project, spring, springFrom } from "@/lib/motion";
import type { SpotifyStatus, TrackInfo } from "@/lib/spotify";

/**
 * The music panel as a pixel C60. Side A: the record in hand, its album
 * art dithered onto the label in five inks taken from the art itself,
 * title, artist and album on ruled lines, a big A. Through the hub holes
 * and the window, two reels: the left holds what is left of the track,
 * the right what has played, their radii following conserved tape area
 * (r = √(hub² + f·(full² − hub²))), so they shrink and grow the way real
 * tape does. While it plays the hubs turn, each at a speed ∝ 1/r, so the
 * emptying reel visibly spins faster as the song ends. A three-drum
 * counter shows elapsed time.
 *
 * Side B: "On repeat lately", the top artists with dithered portraits.
 * Drag the cassette sideways to turn it over (a crisp scaleX through
 * edge-on with a dithered shade, never a blurry 3D turn), or use the A/B
 * tab; the turn is projected from the release.
 */

const CW = 150;
const CH = 96;
const C = 2;
const HUB = 6;
const FULL = 30;
const HUB_L = { x: 40, y: 50 };
const HUB_R = { x: 110, y: 50 };
const WIN = { x0: 52, x1: 98, y0: 42, y1: 58 };

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => (B4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;

const INK = {
  shell: hex("#1f2420"),
  shellHi: hex("#2b322d"),
  shellLo: hex("#151916"),
  screw: hex("#5a615a"),
  screwDark: hex("#1a1d1b"),
  label: hex("#c9c4b4"),
  labelLine: hex("#a9a496"),
  labelEdge: hex("#8f8a7d"),
  window: hex("#121614"),
  tape: hex("#3a2a22"),
  tapeHi: hex("#4e3a2e"),
  hole: hex("#0c0e0d"),
  sideA: hex("#b0cc86"),
  sideB: hex("#aea3c8"),
  letter: hex("#3f4842"),
  drum: hex("#0e110f"),
};

/* 5×7 capitals for the big side letter */
const BIG: Record<"A" | "B", string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
};

/** tape on each reel for a share played */
export function reels(f: number) {
  const p = Math.max(0, Math.min(1, f));
  const r = (share: number) => Math.sqrt(HUB * HUB + share * (FULL * FULL - HUB * HUB));
  return { left: r(1 - p), right: r(p) };
}

/** an image dithered into five of its own inks (null if it can't be read) */
function useDithered(src: string | null | undefined, size: number) {
  const [data, setData] = useState<{ src: string; px: Uint8ClampedArray } | null>(null);
  useEffect(() => {
    if (!src) return;
    let dead = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      if (dead) return;
      try {
        const cv = document.createElement("canvas");
        cv.width = size;
        cv.height = size;
        const ctx = cv.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, size, size);
        const d = ctx.getImageData(0, 0, size, size).data;
        // five inks: the mean colour of each luminance fifth
        const lum = (i: number) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        const order = Array.from({ length: size * size }, (_, k) => k * 4).sort((a, b) => lum(a) - lum(b));
        const inks: RGB[] = [];
        for (let b = 0; b < 5; b++) {
          const part = order.slice(Math.floor((b * order.length) / 5), Math.floor(((b + 1) * order.length) / 5));
          const m: RGB = [0, 0, 0];
          part.forEach((i) => {
            m[0] += d[i];
            m[1] += d[i + 1];
            m[2] += d[i + 2];
          });
          inks.push(m.map((v) => v / Math.max(1, part.length)) as RGB);
        }
        const lumas = inks.map((c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]);
        const out = new Uint8ClampedArray(size * size * 4);
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            const l = lum(i);
            let k = 0;
            while (k < 3 && l > lumas[k + 1]) k++;
            const t = lumas[k + 1] === lumas[k] ? 0 : (l - lumas[k]) / (lumas[k + 1] - lumas[k]);
            const c = inks[t > bayer(x, y) ? k + 1 : k];
            out[i] = c[0];
            out[i + 1] = c[1];
            out[i + 2] = c[2];
            out[i + 3] = 255;
          }
        }
        setData({ src, px: out });
      } catch {
        // a CDN that doesn't allow reading its pixels: the plain image stands in
      }
    };
    img.src = src;
    return () => {
      dead = true;
    };
  }, [src, size]);
  return data && data.src === src ? data.px : null;
}

/** a hub with six spokes, three frames (60° symmetry), as a sprite strip;
    painted once per session, in the browser */
let hubUrl: string | null = null;
function hubSprite() {
  if (hubUrl) return hubUrl;
  const n = HUB * 2 + 1;
  const cv = document.createElement("canvas");
  cv.width = n * 3;
  cv.height = n;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  for (let f = 0; f < 3; f++) {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const dx = x + 0.5 - n / 2;
        const dy = y + 0.5 - n / 2;
        const r = Math.hypot(dx, dy);
        if (r > HUB) continue;
        const a = Math.atan2(dy, dx) - (f * Math.PI) / 9;
        const spoke = Math.abs(Math.sin(a * 3)) < 0.32 && r > 1.6 && r < HUB - 0.8;
        const rim = r > HUB - 1;
        ctx.fillStyle = rim ? "#d8d3c4" : spoke ? "#bdb8aa" : r < 1.6 ? "#d8d3c4" : "#0c0e0d";
        ctx.fillRect(f * n + x, y, 1, 1);
      }
    }
  }
  hubUrl = cv.toDataURL();
  return hubUrl;
}
const noSubscribe = () => () => {};
const useHubSprite = () => useSyncExternalStore(noSubscribe, hubSprite, () => null);

function drawCassette(
  ctx: CanvasRenderingContext2D,
  side: "A" | "B",
  r: { left: number; right: number },
  art: Uint8ClampedArray | null,
  portraits: (Uint8ClampedArray | null)[]
) {
  const img = ctx.createImageData(CW, CH);
  const d = img.data;
  const put = (x: number, y: number, c: RGB) => {
    if (x < 0 || y < 0 || x >= CW || y >= CH) return;
    const o = (y * CW + x) * 4;
    d[o] = c[0];
    d[o + 1] = c[1];
    d[o + 2] = c[2];
    d[o + 3] = 255;
  };
  // the shell: smoked ink, bevelled, corners cut
  for (let y = 0; y < CH; y++) {
    for (let x = 0; x < CW; x++) {
      const cut = Math.min(x, CW - 1 - x) + Math.min(y, CH - 1 - y) < 3;
      if (cut) continue;
      const edge = x === 0 || y === 0 || x === CW - 1 || y === CH - 1;
      put(x, y, edge ? INK.shellLo : x === 1 || y === 1 ? INK.shellHi : INK.shell);
    }
  }
  // four screws
  for (const [sx, sy] of [
    [5, 5],
    [CW - 8, 5],
    [5, CH - 8],
    [CW - 8, CH - 8],
  ]) {
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) put(sx + x, sy + y, (x === 1) !== (y === 1) || (x === 1 && y === 1) ? INK.screwDark : INK.screw);
  }
  // the label, its side stripe, ruled lines
  for (let y = 7; y < 63; y++) {
    for (let x = 9; x < CW - 9; x++) {
      const edge = y === 7 || y === 62 || x === 9 || x === CW - 10;
      put(x, y, edge ? INK.labelEdge : y < 11 ? (side === "A" ? INK.sideA : INK.sideB) : INK.label);
    }
  }
  if (side === "A") {
    for (const ly of [20, 27, 34]) for (let x = 43; x < 126; x++) put(x, ly, INK.labelLine);
    // the album art, five inks of itself
    if (art) {
      for (let y = 0; y < 26; y++)
        for (let x = 0; x < 26; x++) {
          const o = (y * 26 + x) * 4;
          put(13 + x, 13 + y, [art[o], art[o + 1], art[o + 2]]);
        }
    }
  } else {
    for (let x = 13; x < 124; x++) put(x, 18, INK.labelLine);
    portraits.forEach((px, k) => {
      const ox = 13 + (k % 3) * 38;
      const oy = 20 + Math.floor(k / 3) * 11;
      for (let y = 0; y < 10; y++)
        for (let x = 0; x < 10; x++) {
          const o = (y * 10 + x) * 4;
          // no portrait: a blank square on the label, ruled like a photo corner
          put(ox + x, oy + y, px ? [px[o], px[o + 1], px[o + 2]] : x === 0 || y === 0 || x === 9 || y === 9 ? INK.labelLine : INK.label);
        }
    });
  }
  // the big side letter
  BIG[side].forEach((row, y) => {
    for (let x = 0; x < 5; x++) if (row[x] === "#") for (let k = 0; k < 4; k++) put(128 + x * 2 + (k & 1), 13 + y * 2 + (k >> 1), INK.letter);
  });
  // the window between the hubs, with the edges of both tape packs in it
  for (let y = WIN.y0; y < WIN.y1; y++) {
    for (let x = WIN.x0; x < WIN.x1; x++) {
      const rim = y === WIN.y0 || y === WIN.y1 - 1 || x === WIN.x0 || x === WIN.x1 - 1;
      const dl = Math.hypot(x + 0.5 - HUB_L.x, y + 0.5 - HUB_L.y);
      const dr = Math.hypot(x + 0.5 - HUB_R.x, y + 0.5 - HUB_R.y);
      const onTape = dl < r.left || dr < r.right;
      const tapeEdge = Math.abs(dl - r.left) < 0.8 || Math.abs(dr - r.right) < 0.8;
      put(x, y, rim ? INK.shellHi : onTape ? (tapeEdge || bayer(x, y) < 0.12 ? INK.tapeHi : INK.tape) : INK.window);
    }
  }
  // hub holes (the hubs themselves are animated sprites on top)
  for (const h of [HUB_L, HUB_R]) {
    for (let y = -HUB - 1; y <= HUB + 1; y++)
      for (let x = -HUB - 1; x <= HUB + 1; x++) {
        const dd = Math.hypot(x + 0.5, y + 0.5);
        if (dd <= HUB + 1) put(h.x + x, h.y + y, dd > HUB + 0.2 ? INK.labelEdge : INK.hole);
      }
  }
  // the counter's three drums under the label
  for (let k = 0; k < 3; k++)
    for (let y = 65; y < 73; y++) for (let x = 0; x < 6; x++) put(63 + k * 8 + x, y, INK.drum);
  // the bottom ridge and its five guide holes
  for (let y = 76; y < CH - 2; y++) {
    const inset = Math.max(0, 20 - (y - 76));
    for (let x = 14 + inset; x < CW - 14 - inset; x++) put(x, y, y === 76 ? INK.shellHi : INK.shell);
  }
  [30, 52, 75, 98, 120].forEach((hx, k) => {
    const s = k === 2 ? 2 : 3;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) put(hx - (s >> 1) + x, 86 + y, INK.hole);
  });
  ctx.putImageData(img, 0, 0);
}

type Labels = {
  showB: string;
  showA: string;
  repeat: string;
  blank: string;
};

export function Cassette({
  track,
  playing,
  status,
  pos,
  labels,
}: {
  track: TrackInfo | null;
  playing: boolean;
  status: SpotifyStatus | null;
  /** elapsed ms, ticking locally */
  pos: number;
  labels: Labels;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [turn, setTurn] = useState(0);
  const flight = useRef<AnimationPlaybackControls | null>(null);
  const g = useRef<{ pid: number; x0: number; y0: number; t0: number; axis: "x" | "y" | null; s: { t: number; x: number }[] } | null>(null);
  const sprite = useHubSprite();
  const art = useDithered(track?.image, 26);
  const artists = useMemo(() => (status?.artists ?? []).slice(0, 5), [status]);
  const p0 = useDithered(artists[0]?.image, 10);
  const p1 = useDithered(artists[1]?.image, 10);
  const p2 = useDithered(artists[2]?.image, 10);
  const p3 = useDithered(artists[3]?.image, 10);
  const p4 = useDithered(artists[4]?.image, 10);

  const total = track?.durationMs || 0;
  // last played (not playing): wound to the end
  const f = !track ? 0 : !playing && track.playedAt ? 1 : total ? pos / total : 0;
  const r = reels(f);
  const rKey = `${Math.round(r.left * 2)}:${Math.round(r.right * 2)}`;
  const side: "A" | "B" = turn < 0.5 ? "A" : "B";

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    drawCassette(ctx, side, r, art, [p0, p1, p2, p3, p4].slice(0, artists.length));
    // redraw only when the tape visibly moves (half a cell)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side, rKey, art, p0, p1, p2, p3, p4, artists.length]);

  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const settle = (from: number, to: number, v: number, thrown: boolean) => {
    flight.current?.stop();
    if (reduced()) {
      setTurn(to);
      return;
    }
    flight.current = animate(from, to, { ...(thrown ? springFrom(0.4, 0.18) : spring.default), velocity: v, onUpdate: setTurn });
  };
  const flip = () => settle(turn, turn < 0.5 ? 1 : 0, 0, false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    flight.current?.stop();
    g.current = { pid: e.pointerId, x0: e.clientX, y0: e.clientY, t0: turn, axis: null, s: [] };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = g.current;
    if (!d || d.pid !== e.pointerId) return;
    const dx = e.clientX - d.x0;
    if (!d.axis) {
      if (Math.hypot(dx, e.clientY - d.y0) < 10) return;
      d.axis = Math.abs(dx) > Math.abs(e.clientY - d.y0) ? "x" : "y";
      if (d.axis === "x") e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (d.axis !== "x") return;
    const w = wrap.current?.offsetWidth || 300;
    // a drag either way turns it over; across the whole cassette is a full turn
    setTurn(Math.max(-0.15, Math.min(1.15, d.t0 + (d.t0 < 0.5 ? 1 : -1) * (Math.abs(dx) / w))));
    d.s.push({ t: e.timeStamp, x: e.clientX });
    while (d.s.length > 2 && e.timeStamp - d.s[0].t > 80) d.s.shift();
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = g.current;
    if (!d || d.pid !== e.pointerId) return;
    g.current = null;
    if (d.axis !== "x") return;
    const w = wrap.current?.offsetWidth || 300;
    let vx = 0;
    if (d.s.length > 1 && e.timeStamp - d.s[d.s.length - 1].t < 60) {
      const a = d.s[0];
      const b = d.s[d.s.length - 1];
      vx = ((b.x - a.x) / Math.max(8, b.t - a.t)) * 1000;
    }
    const dir = Math.sign(e.clientX - d.x0) || 1;
    const v = ((d.t0 < 0.5 ? 1 : -1) * dir * vx) / w;
    const end = turn + project(v * w) / w;
    settle(turn, end > 0.5 ? 1 : 0, v, Math.abs(vx) > 900);
  };

  const scale = Math.max(0.04, Math.abs(Math.cos(Math.PI * turn)));
  const shade = Math.sin(Math.PI * Math.min(1, Math.max(0, turn)));
  const spin = (rr: number) => ({ animationDuration: `${(rr * 0.07).toFixed(2)}s` });
  const hubStyle = (h: { x: number; y: number }, rr: number): React.CSSProperties => ({
    left: (h.x - HUB - 0.5) * C,
    top: (h.y - HUB - 0.5) * C,
    width: (HUB * 2 + 1) * C,
    height: (HUB * 2 + 1) * C,
    backgroundImage: sprite ? `url(${sprite})` : undefined,
    ...spin(rr),
  });
  const mmss = (ms: number) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.min(9, Math.floor(s / 60))}${String(s % 60).padStart(2, "0")}`;
  };
  const drums = track && total ? mmss(!playing && track.playedAt ? total : pos) : "000";

  return (
    <div className="os-cassette-wrap">
      <div
        ref={wrap}
        className="os-cassette"
        role="button"
        tabIndex={0}
        aria-label={side === "A" ? labels.showB : labels.showA}
        aria-pressed={side === "B"}
        data-playing={playing && side === "A" ? "" : undefined}
        style={{ width: CW * C, height: CH * C, transform: `scaleX(${scale})` }}
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
        <canvas ref={canvas} width={CW} height={CH} className="os-cassette-canvas" aria-hidden />
        <span className="os-cassette-hub" style={hubStyle(HUB_L, r.left)} aria-hidden />
        <span className="os-cassette-hub" style={hubStyle(HUB_R, r.right)} aria-hidden />
        {side === "A" ? (
          <span className="os-cassette-label" aria-hidden>
            {track ? (
              <>
                {!art && track.image && (
                  // the art as is when its pixels can't be read for dithering
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={track.image} alt="" className="os-cassette-art" />
                )}
                {!track.image && <span className="os-cassette-hand">{track.title}</span>}
                <span className="os-cassette-line" style={{ top: 13 * C }}>
                  {track.title}
                </span>
                <span className="os-cassette-line os-cassette-line--2" style={{ top: 20 * C + 1 }}>
                  {track.artist}
                </span>
                {track.album && (
                  <span className="os-cassette-line os-cassette-line--3" style={{ top: 27 * C + 1 }}>
                    {track.album}
                  </span>
                )}
              </>
            ) : (
              <span className="os-cassette-line os-cassette-line--2" style={{ top: 20 * C }}>
                {labels.blank}
              </span>
            )}
          </span>
        ) : (
          <span className="os-cassette-label" aria-hidden>
            <span className="os-cassette-repeat">{labels.repeat}</span>
            {artists.map((a, k) => (
              <span key={a.name} className="os-cassette-artist" style={{ left: (13 + (k % 3) * 38 + 12) * C, top: (20 + Math.floor(k / 3) * 11 - 1) * C }}>
                {a.name}
              </span>
            ))}
          </span>
        )}
        <span className="os-cassette-drums tabular" aria-hidden>
          {[...drums].map((ch, k) => (
            <span key={k}>{ch}</span>
          ))}
        </span>
        <span className="os-cassette-shade" style={{ opacity: shade * 0.85 }} aria-hidden />
      </div>
      <button type="button" className="os-cassette-tab" aria-label={side === "A" ? labels.showB : labels.showA} onClick={flip}>
        <span data-on={side === "A" || undefined}>A</span>
        <span data-on={side === "B" || undefined}>B</span>
      </button>
    </div>
  );
}
