"use client";

import { animate, m, useMotionValue, useTransform, type AnimationPlaybackControls } from "motion/react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { PixelLabel } from "@/components/PixelLabel";
import { springFrom } from "@/lib/motion";
import { useSound } from "@/lib/sound";
import { ART_H, ART_W, drunkenBishop, groups, hexBytes, normalizeFp, type KeyInfo } from "./pgp";

/**
 * The key as a wax seal: a brass signet ring over a slab of lilac wax,
 * and the impression in the wax is the drunken bishop's walk over the
 * real fingerprint (17 × 9 cells, raised where the bishop went, moss
 * where it started, ember where it stopped). Under it, the key ID's last
 * eight digits and the year the key was made.
 *
 * Hold the ring down (pointer, or Space; Enter presses all the way): it
 * lowers, and while it's held the wax takes the impression ring by ring
 * from the edge in; let go and it lifts. A short press leaves a shallow
 * impression, and the next one fills it in. The full impression is there
 * from the start: nothing is hidden behind the press. Tap the wax to see
 * which groups of the fingerprint walked over that cell.
 *
 * Beside the facts, "Check a fingerprint" compares one pasted from
 * elsewhere, on this device only: groups go moss up to the first
 * mismatch as you type; with all 40 digits in, a second impression is
 * struck in grey wax with every differing cell outlined, and a plain
 * verdict follows. The verdict is exact hex equality; the art only helps.
 */

/** art px per board cell, the rim around the board, the room drips take below */
const C = 4;
const RIM = 4;
const SW = ART_W * C + RIM * 2;
const SH = ART_H * C + RIM * 2;
const DRIP = 8;
/** the ring, and the room above the slab it hovers in */
const RW = 48;
const RH = 30;
const ABOVE = 36;
/** where the bezel's face sits in the ring art */
const FACE_Y = 7;

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const WAX = {
  lilac: { base: hex("#aea3c8"), hi: hex("#d5cde6"), lo: hex("#776c96"), full: hex("#bcb2d5"), edge: hex("#8c81aa") },
  grey: { base: hex("#8d928d"), hi: hex("#b9bdb8"), lo: hex("#5d635d"), full: hex("#9aa09a"), edge: hex("#737873") },
};
const MOSS = hex("#b0cc86");
const EMBER = hex("#e0bd6e");
const FLARE = hex("#e2786b");
const SHADOW = hex("#090b0a");

/** ring of a cell, from the middle (0) to the edge (4) */
const ringOf = (x: number, y: number) => Math.max(Math.ceil(Math.abs(x - (ART_W - 1) / 2) / 2), Math.abs(y - (ART_H - 1) / 2));
export const FULL = 5;

/** the slab's outline, on the 8 px grid (2 art px), from the fingerprint so every key pours its own */
function slabShape(bytes: Uint8Array) {
  const b = (i: number) => bytes[i % bytes.length] ?? 0;
  const inset = (i: number) => (b(i) >> (i % 5)) % 3 === 0 ? 2 : 0;
  const top = Array.from({ length: SW / 2 }, (_, i) => inset(i));
  const bottom = Array.from({ length: SW / 2 }, (_, i) => inset(i + 7));
  const left = Array.from({ length: SH / 2 }, (_, i) => inset(i + 13));
  const right = Array.from({ length: SH / 2 }, (_, i) => inset(i + 3));
  const d1 = 8 + (b(5) % 10) * 2;
  const d2 = 44 + (b(11) % 10) * 2;
  const drips = [
    { x: d1, len: 4 + (b(2) % 2) * 2 },
    { x: d2, len: 6 + (b(9) % 2) * 2 },
  ];
  return (x: number, y: number) => {
    if (x < 0 || x >= SW || y < 0) return false;
    if (y >= SH) {
      // the drips: four wide, rounded at the end
      return drips.some((d) => x >= d.x && x < d.x + 4 && y < SH + d.len && (y < SH + d.len - 1 || (x > d.x && x < d.x + 3)));
    }
    // corners cut, edges uneven by a cell here and there
    const cx = Math.min(x, SW - 1 - x);
    const cy = Math.min(y, SH - 1 - y);
    if (cx + cy < 3) return false;
    return y >= top[x >> 1] && y < SH - bottom[x >> 1] && x >= left[y >> 1] && x < SW - right[y >> 1];
  };
}

function paintWax(
  ctx: CanvasRenderingContext2D,
  bytes: Uint8Array,
  { tone, depth, lit, diff }: { tone: keyof typeof WAX; depth: number; lit: number | null; diff?: Set<number> | null }
) {
  const W = SW + 1;
  const H = SH + DRIP + 1;
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const put = (x: number, y: number, c: RGB) => {
    const o = (y * W + x) * 4;
    d[o] = c[0];
    d[o + 1] = c[1];
    d[o + 2] = c[2];
    d[o + 3] = 255;
  };
  const p = WAX[tone];
  const inside = slabShape(bytes);
  const { grid, start, end } = drunkenBishop(bytes);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!inside(x, y)) {
        // a hard pixel shadow, one down and right
        if (inside(x - 1, y - 1)) put(x, y, SHADOW);
        continue;
      }
      // poured wax: flat, lit on its upper-left edge, shaded on the lower-right
      let c = p.base;
      if (!inside(x, y - 1) || !inside(x - 1, y)) c = p.hi;
      else if (!inside(x, y + 1) || !inside(x + 1, y)) c = p.edge;
      const bx = x - RIM;
      const by = y - RIM;
      if (bx >= 0 && by >= 0 && bx < ART_W * C && by < ART_H * C) {
        const cx = Math.floor(bx / C);
        const cy = Math.floor(by / C);
        const i = cy * ART_W + cx;
        const lx = bx % C;
        const ly = by % C;
        const isStart = cx === start.x && cy === start.y;
        const isEnd = cx === end.x && cy === end.y;
        if ((grid[i] || isStart) && ringOf(cx, cy) >= FULL - depth) {
          // raised where the bishop walked: a one-cell bevel
          if (lx === 0 || ly === 0) c = p.hi;
          else if (lx === C - 1 || ly === C - 1) c = p.lo;
          else c = isStart ? MOSS : isEnd ? EMBER : grid[i] >= 3 ? p.full : p.base;
        }
        const ring = (lit === i && MOSS) || (diff?.has(i) && FLARE);
        if (ring && (lx === 0 || ly === 0 || lx === C - 1 || ly === C - 1)) c = ring;
      }
      put(x, y, c);
    }
  ctx.putImageData(img, 0, 0);
}

/** One slab of wax with its impression. */
export function Wax({
  bytes,
  tone = "lilac",
  depth = FULL,
  lit = null,
  diff = null,
  className = "",
  onCell,
}: {
  bytes: Uint8Array;
  tone?: keyof typeof WAX;
  depth?: number;
  lit?: number | null;
  diff?: Set<number> | null;
  className?: string;
  onCell?: (i: number | null) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (ctx) paintWax(ctx, bytes, { tone, depth, lit, diff });
  }, [bytes, tone, depth, lit, diff]);
  return (
    <canvas
      ref={ref}
      width={SW + 1}
      height={SH + DRIP + 1}
      className={`app-contact-wax ${className}`}
      aria-hidden
      onClick={
        onCell
          ? (e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const x = ((e.clientX - r.left) / r.width) * (SW + 1) - RIM;
              const y = ((e.clientY - r.top) / r.height) * (SH + DRIP + 1) - RIM;
              const cx = Math.floor(x / C);
              const cy = Math.floor(y / C);
              onCell(cx >= 0 && cy >= 0 && cx < ART_W && cy < ART_H ? cy * ART_W + cx : null);
            }
          : undefined
      }
    />
  );
}

/* the signet ring: brass, seen three-quarter from the front; painted once per session */
let ringUrl: string | null = null;
function ringArt() {
  if (ringUrl) return ringUrl;
  const cv = document.createElement("canvas");
  cv.width = RW;
  cv.height = RH;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(RW, RH);
  const put = (x: number, y: number, c: RGB) => {
    const o = (y * RW + x) * 4;
    img.data[o] = c[0];
    img.data[o + 1] = c[1];
    img.data[o + 2] = c[2];
    img.data[o + 3] = 255;
  };
  const ell = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
  const cx = RW / 2;
  const B = { face: hex("#f0d48a"), shine: hex("#fff1c4"), rim: hex("#b8954f"), lit: hex("#e0bd6e"), dark: hex("#a0803f"), deep: hex("#6e5a2e") };
  for (let y = 0; y < RH; y++)
    for (let x = 0; x < RW; x++) {
      const left = x < cx;
      // the hoop under the bezel: a two-tone band
      if (y > FACE_Y + 2 && ell(x, y, cx, 18, 13, 11) && !ell(x, y, cx, 18.5, 9, 8)) {
        put(x, y, ell(x, y + 1, cx, 18, 13, 11) ? (left ? B.lit : B.dark) : B.deep);
      }
      // the bezel's side, a few px thick
      for (let k = 1; k <= 3; k++) if (ell(x, y - k, cx, FACE_Y, 19, 5) && !ell(x, y, cx, FACE_Y, 19, 5)) put(x, y, left ? B.lit : B.dark);
      // its oval face, catching the light top-left
      if (ell(x, y, cx, FACE_Y, 19, 5)) {
        const edge = !ell(x, y - 1, cx, FACE_Y, 19, 5) || !ell(x - 1, y, cx, FACE_Y, 19, 5) || !ell(x + 1, y, cx, FACE_Y, 19, 5) || !ell(x, y + 1, cx, FACE_Y, 19, 5);
        put(x, y, edge ? B.rim : x < cx - 6 && y < FACE_Y ? B.shine : B.face);
      }
    }
  ctx.putImageData(img, 0, 0);
  ringUrl = cv.toDataURL();
  return ringUrl;
}
const noop = () => () => {};

export function Seal({
  info,
  reduced,
  labels,
  onLit,
}: {
  info: KeyInfo;
  reduced: boolean;
  labels: { press: string; seal: string };
  /** the fingerprint groups that walked over the tapped cell, or null */
  onLit: (groups: Set<number> | null) => void;
}) {
  const { blip } = useSound();
  const ring = useSyncExternalStore(noop, ringArt, () => null);
  const [depth, setDepth] = useState(FULL);
  const [lit, setLit] = useState<number | null>(null);
  const [fade, setFade] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const ry = useMotionValue(0);
  const contact = useRef(1);
  // the ring's shadow on the wax only shows as it comes down
  const shadowO = useTransform(ry, (v) => 0.6 * Math.min(1, v / contact.current));
  const shadowS = useTransform(ry, (v) => 0.5 + 0.5 * Math.min(1, v / contact.current));
  const st = useRef({ holding: false, auto: false, timer: 0, depth: FULL, anim: null as AnimationPlaybackControls | null });
  const { by } = useMemo(() => drunkenBishop(info.bytes), [info.bytes]);
  useEffect(() => {
    st.current.depth = depth;
  }, [depth]);
  useEffect(() => {
    const s = st.current;
    return () => {
      window.clearInterval(s.timer);
      s.anim?.stop();
    };
  }, []);

  const lift = () => {
    const s = st.current;
    s.holding = false;
    s.auto = false;
    window.clearInterval(s.timer);
    s.anim?.stop();
    s.anim = animate(ry, 0, springFrom(0.2));
  };
  /** the ring is down: the wax takes the impression ring by ring while it's held */
  const touch = () => {
    const s = st.current;
    blip("tick");
    navigator.vibrate?.(8);
    if (s.depth >= FULL) {
      s.depth = 0;
      setDepth(0);
    }
    window.clearInterval(s.timer);
    s.timer = window.setInterval(
      () => {
        if (!s.holding && !s.auto) return window.clearInterval(s.timer);
        s.depth = Math.min(FULL, s.depth + 1);
        setDepth(s.depth);
        if (s.depth >= FULL) {
          window.clearInterval(s.timer);
          if (s.auto) lift();
        }
      },
      s.auto ? 60 : 80
    );
  };
  const press = (auto = false) => {
    const s = st.current;
    if (reduced) {
      // no travel: a fresh impression fades in
      s.depth = FULL;
      setDepth(FULL);
      setFade((f) => f + 1);
      blip("tick");
      return;
    }
    s.holding = !auto;
    s.auto = auto;
    const w = wrap.current?.getBoundingClientRect().width ?? SW * 4;
    const k = w / SW;
    contact.current = (ABOVE + SH / 2 - FACE_Y) * k;
    s.anim?.stop();
    s.anim = animate(ry, contact.current, { ...springFrom(0.3), onComplete: touch });
  };

  const year = info.created.getFullYear();

  return (
    <figure className="app-contact-seal" aria-label={labels.seal}>
      <div ref={wrap} className="app-contact-seal-stage">
        <m.span className="app-contact-seal-shadow" style={{ opacity: shadowO, scale: shadowS }} aria-hidden />
        <Wax
          key={fade}
          bytes={info.bytes}
          depth={depth}
          lit={lit}
          className={fade ? "app-contact-wax--fresh" : ""}
          onCell={(i) => {
            const next = i === lit || i == null || !by[i]?.size ? null : i;
            setLit(next);
            onLit(next == null ? null : by[next]);
          }}
        />
        <m.button
          type="button"
          className="app-contact-seal-ring"
          style={{ y: ry }}
          aria-label={labels.press}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            press();
          }}
          onPointerUp={() => st.current.holding && lift()}
          onPointerCancel={() => st.current.holding && lift()}
          onKeyDown={(e) => {
            if (e.key === " " && !e.repeat) {
              e.preventDefault();
              press();
            } else if (e.key === "Enter" && !e.repeat) {
              e.preventDefault();
              press(true);
            }
          }}
          onKeyUp={(e) => {
            if (e.key === " ") {
              e.preventDefault();
              if (st.current.holding) lift();
            }
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {ring && <img src={ring} alt="" draggable={false} />}
        </m.button>
      </div>
      <figcaption className="app-contact-seal-band" aria-hidden>
        <PixelLabel text={`${info.keyId.slice(-8)}  ${year}`} cell={2} />
      </figcaption>
    </figure>
  );
}

/** "Check a fingerprint": compared here, never sent anywhere. */
export function CheckFingerprint({
  info,
  value,
  onChange,
  labels,
}: {
  info: KeyInfo;
  value: string;
  onChange: (v: string) => void;
  labels: { label: string; placeholder: string; same: string; diff: string; note: string };
}) {
  const q = normalizeFp(value);
  const full = info.fingerprint.length;
  const done = q.length >= full;
  const same = done && q.slice(0, full) === info.fingerprint;
  const theirs = useMemo(() => (done ? hexBytes(q.slice(0, full)) : null), [done, q, full]);
  // every cell the two walks disagree on
  const diff = useMemo(() => {
    if (!theirs) return null;
    const a = drunkenBishop(info.bytes).grid;
    const b = drunkenBishop(theirs).grid;
    const out = new Set<number>();
    a.forEach((n, i) => {
      if (Boolean(n) !== Boolean(b[i])) out.add(i);
    });
    return out;
  }, [theirs, info.bytes]);

  return (
    <div className="app-contact-check">
      <label className="app-contact-label" htmlFor="app-contact-check">
        {labels.label}
      </label>
      <input
        id="app-contact-check"
        className="app-contact-check-input app-contact-mono"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={labels.placeholder}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        inputMode="text"
      />
      <p className="app-contact-check-note">{labels.note}</p>
      {done && theirs && (
        <div className="app-contact-check-result" data-same={same || undefined}>
          <Wax bytes={theirs} tone="grey" diff={same ? null : diff} className="app-contact-wax--small" />
          <p role="status" className="app-contact-check-verdict">
            {same ? labels.same : labels.diff}
          </p>
        </div>
      )}
    </div>
  );
}

/** per group: "ok" up to the first mismatch as it's typed, "bad" for a typed group that differs */
export function groupMatches(fp: string, value: string) {
  const q = normalizeFp(value);
  const gs = groups(fp);
  let broken = false;
  return gs.map((g, i) => {
    const typed = q.slice(i * 4, i * 4 + 4);
    if (broken || !typed) return null;
    if (!g.startsWith(typed)) {
      broken = true;
      return typed.length === 4 || q.length > (i + 1) * 4 ? ("bad" as const) : null;
    }
    return typed.length === 4 ? ("ok" as const) : null;
  });
}
