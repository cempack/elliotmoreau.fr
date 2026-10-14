import {
  P,
  b4,
  clamp,
  clearDepth,
  draw,
  drawText,
  face,
  foldChar,
  halo,
  inShadow,
  makeCam,
  makeShadow,
  norm,
  pack,
  ramp,
  renderShadow,
  turntable,
  turntableInk,
  type Cam,
  type Face,
  type Raster,
  type Shadow,
  type V3,
} from "@/lib/pixel3d";

/**
 * The music panel's C60, as a pixel object on the globe's turntable: an
 * indigo shell with real thickness, lit from the top left, standing a
 * little turned so its edge and top catch the light. The label is paper
 * with the cover printed on it and the title lettered beside it in the
 * site's capitals; through the window, the two tape packs are real
 * cylinders of wound tape round white hubs, and the far window lets the
 * turntable show through between them. The packs hold what is left of
 * the track and what has played (radii by conserved tape area), and while
 * it plays the hubs turn, each at ω ∝ 1/r. Turning it over is the
 * turntable going round half a turn to side B (the artists on repeat),
 * under a light that stays where it was.
 *
 * It paints only when something changes: still, it costs nothing; playing,
 * the hubs step as often as their teeth visibly move (5 to 12 times a second).
 */

/* ───────── the tape, on the old 172×110 art grid ───────── */

const AW = 172;
const AH = 110;
/** world units per art px: the shell is 10 units across */
const U = 10 / AW;
const HW = AW * U * 0.5;
const HT = AH * U;
/** half the thickness (12 mm on 100.4) */
const HD = 0.59;
/** the shell's corners */
const CH = 4 * U;
const LIFT = 0.02;

const HUB_Y = 68;
const HUB_X = [50, 122] as const;
const HUB_R = 9;
const CORE = 9.5;
const FULL = 31;
const LABEL = { x0: 7, x1: 165, y0: 6, y1: 53 };
const ART = { x0: 7, x1: 54 };
const WIN = { x0: 24, x1: 148, y0: 57, y1: 80, r: 5 };
const BASE = { y: 88, top: [36, 136], bottom: [26, 146] } as const;
const RUN_Y = 101;
const HEAD = { x0: 76, x1: 96, y0: 96, y1: 104 };
const HOLES = [
  [42, 98, 5, 5],
  [60, 99, 3, 3],
  [HEAD.x0, HEAD.y0, HEAD.x1 - HEAD.x0, HEAD.y1 - HEAD.y0],
  [109, 99, 3, 3],
  [125, 98, 5, 5],
] as const;
const SCREWS = [
  [5, 5],
  [AW - 5, 5],
  [5, AH - 5],
  [AW - 5, AH - 5],
  [86, 92],
] as const;
/** tape speed, art px per second: calm, not the real 4.76 cm/s */
const SPEED = 24;

/** tape on each reel for a share played, in art px */
export function reels(f: number) {
  const p = Math.max(0, Math.min(1, f));
  const r = (share: number) => Math.sqrt(CORE * CORE + share * (FULL * FULL - CORE * CORE));
  return { left: r(1 - p), right: r(p) };
}

/** art px → local x, y on side A */
const wx = (px: number) => px * U - HW;
const wy = (py: number) => HT - py * U + LIFT;

const inLabel = (x: number, y: number) => x >= LABEL.x0 && x < LABEL.x1 && y >= LABEL.y0 && y < LABEL.y1;
/** how far inside the window a point is (negative: outside), in art px */
function inWin(x: number, y: number) {
  const r = WIN.r;
  const cx = clamp(x, WIN.x0 + r, WIN.x1 - r);
  const cy = clamp(y, WIN.y0 + r, WIN.y1 - r);
  return r - Math.hypot(x - cx, y - cy);
}
const inHole = (x: number, y: number) => HOLES.some(([hx, hy, w, h]) => x >= hx && x < hx + w && y >= hy && y < hy + h);

/* ───────── inks ───────── */

const BODY = ramp([[8, 10, 28], [16, 20, 52], [32, 38, 96], [56, 63, 148], [92, 96, 204], [140, 136, 236]]);
const DARK = ramp([[4, 5, 14], [8, 10, 28], [14, 18, 44], [26, 32, 74]]);
const CHROME = ramp([[30, 34, 74], [66, 72, 144], [126, 126, 210], [196, 192, 242], [245, 242, 236]]);
const PAPER = ramp([[150, 146, 180], [196, 192, 214], [228, 224, 230], [247, 244, 238]]);
/** oxide: a warm brown, its outer turn catching the light */
const TAPE = ramp([[20, 10, 14], [40, 20, 22], [66, 34, 30], [104, 58, 40], [150, 92, 56]]);
const FELT = ramp([[40, 30, 70], [80, 64, 128], [120, 104, 180]]);
const INK_C = pack([28, 30, 70]);
const INK_SOFT = pack([104, 100, 150]);
const RULE = pack([206, 200, 222]);
const GLARE = pack([170, 168, 232]);
const AMBER = P.light;

/** the light, as the viewer sees it: from the top left, in front */
const LV = norm([-0.66, 0.68, 0.5]);
const PITCH = 0.36;
const FLOOR_R = 5.55;
/** side A at rest: turned a little, so its right edge shows */
export const YAW_A = -0.38;

/** one flat ink per face: the nearest step of the ramp */
const flat = (rp: number[], lvl: number) => rp[clamp(Math.round(lvl * (rp.length - 1)), 0, rp.length - 1)];

const tone = (rp: number[], lvl: number, x: number, y: number) => {
  const n = rp.length;
  const i = Math.floor(lvl * (n - 1) + b4(x, y));
  return rp[i < 0 ? 0 : i > n - 1 ? n - 1 : i];
};

/* ───────── faces ───────── */

/** a cylinder along z (a pack, a hub), with both caps */
function cylZ(out: Face[], cx: number, cy: number, r: number, half: number, n: number, side: string, cap: string, k: number) {
  const ring = (z: number) => Array.from({ length: n }, (_, i): V3 => [cx + Math.cos((i / n) * Math.PI * 2) * r, cy + Math.sin((i / n) * Math.PI * 2) * r, z]);
  const lo = ring(-half);
  const hi = ring(half);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const am = ((i + 0.5) / n) * Math.PI * 2;
    face(out, [hi[i], hi[j], lo[j], lo[i]], side, { n: [Math.cos(am), Math.sin(am), 0], side: "rim", k, cast: false });
  }
  face(out, hi, cap, { n: [0, 0, 1], side: "cap", k, cast: false });
  face(out, lo, cap, { n: [0, 0, -1], side: "cap", k, cast: false });
}

const outline = (): [number, number][] => [
  [-HW + CH, HT],
  [HW - CH, HT],
  [HW, HT - CH],
  [HW, CH],
  [HW - CH, 0],
  [-HW + CH, 0],
  [-HW, CH],
  [-HW, HT - CH],
];

/** the shell, the walls inside it, the raised sections, the glass, the tape across the bottom */
function shellFaces() {
  const F: Face[] = [];
  const o = outline().map(([x, y]) => [x, y + LIFT] as [number, number]);
  const at = (z: number) => o.map(([x, y]): V3 => [x, y, z]);
  // the two faces (k: 0 side A, 1 side B)
  face(F, at(HD), "face", { n: [0, 0, 1], k: 0 });
  face(F, at(-HD), "face", { n: [0, 0, -1], k: 1 });
  // the rim, all the way round, with the seam where the halves meet
  for (let i = 0; i < o.length; i++) {
    const [ax, ay] = o[i];
    const [bx, by] = o[(i + 1) % o.length];
    const nn = norm([-(by - ay), bx - ax, 0]);
    face(F, [[ax, ay, HD], [bx, by, HD], [bx, by, -HD], [ax, ay, -HD]], "edge", { n: nn, k: i });
  }
  // the walls you see through the windows
  const IN = HD - 0.09;
  face(F, at(IN), "inner", { n: [0, 0, -1], cast: false, k: 1 });
  face(F, at(-IN), "inner", { n: [0, 0, 1], cast: false, k: 0 });
  // the glass, just inside each face
  const win: [number, number][] = [
    [WIN.x0, WIN.y0],
    [WIN.x1, WIN.y0],
    [WIN.x1, WIN.y1],
    [WIN.x0, WIN.y1],
  ];
  for (const s of [1, -1]) {
    face(F, win.map(([x, y]): V3 => [wx(x), wy(y), s * (HD - 0.03)]), "glass", { n: [0, 0, s], cast: false, k: s > 0 ? 0 : 1 });
    // the raised bottom section: its face, its lit top, its flanks
    const z0 = s * HD;
    const z1 = s * (HD + 0.14);
    const tl: V3 = [wx(BASE.top[0]), wy(BASE.y), 0];
    const tr: V3 = [wx(BASE.top[1]), wy(BASE.y), 0];
    const br: V3 = [wx(BASE.bottom[1]), wy(AH), 0];
    const bl: V3 = [wx(BASE.bottom[0]), wy(AH), 0];
    const z = (p: V3, zz: number): V3 => [p[0], p[1], zz];
    face(F, [z(tl, z1), z(tr, z1), z(br, z1), z(bl, z1)], "base", { n: [0, 0, s], k: s > 0 ? 0 : 1 });
    face(F, [z(tl, z0), z(tr, z0), z(tr, z1), z(tl, z1)], "baseTop", { n: [0, 1, 0], two: true });
    face(F, [z(tr, z1), z(tr, z0), z(br, z0), z(br, z1)], "baseFlank", { n: norm([wy(BASE.y) - wy(AH), wx(BASE.bottom[1]) - wx(BASE.top[1]), 0]), two: true, k: s > 0 ? 0 : 1 });
    face(F, [z(tl, z0), z(tl, z1), z(bl, z1), z(bl, z0)], "baseFlank", { n: norm([-(wy(BASE.y) - wy(AH)), wx(BASE.bottom[1]) - wx(BASE.top[1]), 0]), two: true, k: s > 0 ? 0 : 1 });
  }
  // the tape along the bottom, past the head, and the pressure pad on it
  const tz = 0.17;
  const yb = wy(RUN_Y + 0.6);
  const yt = wy(RUN_Y - 0.6);
  face(F, [[wx(20), yt, tz], [wx(152), yt, tz], [wx(152), yb, tz], [wx(20), yb, tz]], "tape", { n: [0, 0, 1], cast: false });
  face(F, [[wx(152), yt, -tz], [wx(20), yt, -tz], [wx(20), yb, -tz], [wx(152), yb, -tz]], "tape", { n: [0, 0, -1], cast: false });
  for (const s of [1, -1])
    face(F, [[wx(HEAD.x0 + 5), wy(HEAD.y0 + 1), s * 0.12], [wx(HEAD.x1 - 5), wy(HEAD.y0 + 1), s * 0.12], [wx(HEAD.x1 - 5), yt, s * 0.12], [wx(HEAD.x0 + 5), yt, s * 0.12]], "felt", {
      n: [0, 0, s],
      cast: false,
    });
  turntable(F, FLOOR_R, 0, "floor");
  return F;
}

/** the two packs (radii in art px) and the hubs */
function reelFaces(rl: number, rr: number) {
  const F: Face[] = [];
  [rl, rr].forEach((r, h) => {
    const cx = wx(HUB_X[h]);
    const cy = wy(HUB_Y);
    cylZ(F, cx, cy, HUB_R * U, 0.42, 14, "hubRim", "hub", h);
    cylZ(F, cx, cy, r * U, 0.17, 28, "packRim", "pack", h);
  });
  return F;
}

/* ───────── the label: a texture, rebuilt for the size it's seen at ───────── */

export type LabelInfo = {
  /** the cover (or the artist), sampled to n×n packed pixels; null: no picture */
  art: ((n: number) => Uint32Array | null) | null;
  /** the lettering beside it, in the site's capitals; empty: a blank tape's writing lines */
  title: string;
  sub: string;
};

/** words into at most `max` lines of capitals, line i at most cols(i) long, the last cut short with ".." */
function letter(s: string, cols: (i: number) => number, max: number) {
  const words = s.split(/\s+/).filter(Boolean).map((w) => [...w].map(foldChar).join(""));
  const out: string[] = [];
  let line = "";
  for (let w of words) {
    if (line && line.length + 1 + w.length <= cols(out.length)) {
      line += " " + w;
      continue;
    }
    if (line) out.push(line);
    while (w.length > cols(out.length)) {
      out.push(w.slice(0, cols(out.length)));
      w = w.slice(cols(out.length - 1));
    }
    line = w;
  }
  if (line) out.push(line);
  if (out.length > max) {
    out.length = max;
    const c = cols(max - 1);
    out[max - 1] = (out[max - 1].length > c - 2 ? out[max - 1].slice(0, c - 2).trimEnd() : out[max - 1]) + "..";
  }
  return out;
}

type Tex = { w: number; h: number; px: Uint32Array };

/**
 * One side's label at `tpx` art px a texel: the picture on the left, the
 * lettering on writing lines beside it, the side's letter top right in
 * amber. 0 is bare paper (lit when drawn).
 */
function labelTex(info: LabelInfo, side: "A" | "B", tpx: number): Tex {
  const w = Math.max(8, Math.round((LABEL.x1 - LABEL.x0) / tpx));
  const h = Math.max(6, Math.round((LABEL.y1 - LABEL.y0) / tpx));
  const px = new Uint32Array(w * h);
  const an = Math.round((ART.x1 - ART.x0) / tpx);
  const art = info.art?.(an) ?? null;
  if (art) for (let y = 0; y < Math.min(an, h); y++) for (let x = 0; x < an; x++) px[y * w + x] = art[y * an + x] || 1;
  // the writing: ruled lines, the title lettered on them (the artist under it when it fits),
  // the side's letter in amber at the end of the first
  const x0 = (art ? an : 0) + 4;
  const fit = (x1: number) => Math.max(1, Math.floor((x1 - x0 + 1) / 4));
  const step = 7;
  const n = Math.max(1, Math.min(3, Math.floor((h - 1) / step)));
  const top = Math.max(1, Math.round((h - n * step) / 2) + 1);
  const lx = w - 6;
  // the first line stops short of the letter
  const cols = (i: number) => fit(i === 0 ? lx - 3 : w - 3);
  const title = info.title ? letter(info.title, cols, n) : [];
  const lines = title.map((s) => ({ s, c: INK_C }));
  if (info.sub && lines.length < n) {
    const sf = [...info.sub.trim()].map(foldChar).join("");
    const c = cols(lines.length);
    lines.push({ s: sf.length > c ? sf.slice(0, c - 2).trimEnd() + ".." : sf, c: INK_SOFT });
  }
  for (let i = 0; i < n; i++) {
    const base = top + i * step + 5;
    for (let x = x0; x < w - 2; x++) if (!px[base * w + x]) px[base * w + x] = RULE;
    const ln = lines[i];
    if (ln) drawText(px, w, h, ln.s, x0, base - 5, ln.c);
  }
  drawText(px, w, h, side, lx, top, AMBER);
  return { w, h, px };
}

/* ───────── the scene ───────── */

export type Side = "A" | "B";

export function makeCassette(reduced: boolean, hooks: { side?: (s: Side) => void; settle?: (s: Side) => void } = {}) {
  const still = shellFaces();
  let reelF: Face[] = [];
  let reelKey = "";
  const F: Face[] = [];
  const st = {
    yaw: YAW_A,
    v: 0,
    target: YAW_A as number | null,
    held: false,
    from: YAW_A,
    side: "A" as Side,
    spin: [0, 0],
    clock: { pos: 0, total: 0, run: false, at: 0 },
    S: null as Shadow | null,
    shadowYaw: NaN,
    cam: null as Cam | null,
    L: LV,
  };
  let label: Record<Side, LabelInfo> = { A: { art: null, title: "", sub: "" }, B: { art: null, title: "", sub: "" } };
  let tex: Record<Side, Tex> | null = null;
  let texKey = "";
  let version = 0;

  const restOf = (y: number) => YAW_A + Math.PI * Math.round((y - YAW_A) / Math.PI);
  const sideOf = (y: number): Side => (Math.cos(y - YAW_A) >= 0 ? "A" : "B");
  const pos = (t: number) => {
    const c = st.clock;
    return Math.min(c.total, c.pos + (c.run ? t - c.at : 0) * 1000);
  };

  function build(t: number) {
    const c = st.clock;
    const r = reels(c.total ? pos(t) / c.total : 0);
    // half-px steps: the packs are rebuilt only when they visibly change
    const rl = Math.round(r.left * 2) / 2;
    const rr = Math.round(r.right * 2) / 2;
    const key = `${rl}:${rr}`;
    if (key !== reelKey) {
      reelF = reelFaces(rl, rr);
      reelKey = key;
    }
    F.length = 0;
    for (const f of reelF) F.push(f);
    for (const f of still) F.push(f);
    return { rl, rr };
  }

  function shade(f: Face, u: number, v: number, x3: number, y3: number, z3: number, x: number, y: number): number {
    const S = st.S;
    const L = st.L;
    const cam = st.cam as Cam;
    /** art px a cell spans */
    const pc = 1 / (cam.scale * U);
    const lam = Math.max(0, f.n[0] * L[0] + f.n[1] * L[1] + f.n[2] * L[2]);
    switch (f.mat) {
      case "floor":
        return turntableInk(x3, z3, FLOOR_R, x, y, cam.scale, inShadow(S, x3, y3, z3, 0.02), false);
      case "face":
      case "base": {
        // art px on this face, as you'd read it from its own side
        const X = (f.k === 0 ? x3 + HW : HW - x3) / U;
        const Y = (HT + LIFT - y3) / U;
        const lip = inWin(X, Y);
        if (f.mat === "face" && lip > 0) return 0;
        if (Y >= BASE.y && inHole(X, Y)) return 0;
        const l = lam;
        if (f.mat === "face" && inLabel(X, Y)) {
          const T = tex?.[f.k === 0 ? "A" : "B"];
          if (T) {
            const tx = clamp(Math.floor(((X - LABEL.x0) / (LABEL.x1 - LABEL.x0)) * T.w), 0, T.w - 1);
            const ty = clamp(Math.floor(((Y - LABEL.y0) / (LABEL.y1 - LABEL.y0)) * T.h), 0, T.h - 1);
            const c = T.px[ty * T.w + tx];
            if (c === AMBER || c === INK_C || c === INK_SOFT) return c;
            if (c && c !== RULE) {
              // the picture, printed: as light as the paper it's on
              const k = 0.5 + 0.62 * l;
              return pack([c & 255, (c >>> 8) & 255, (c >>> 16) & 255], k);
            }
            if (c === RULE) return l > 0.5 ? RULE : PAPER[1];
          }
          // the paper: lit along its top and left, its lower edge in shade
          if (Y < LABEL.y0 + pc || X < LABEL.x0 + pc) return PAPER[3];
          if (Y >= LABEL.y1 - pc || X >= LABEL.x1 - pc) return PAPER[0];
          return flat(PAPER, 0.3 + 0.75 * l);
        }
        // the plastic: lit from above, a shade under the label's edge, the window's lips
        let lvl = 0.1 + 0.62 * l;
        if (f.mat === "face") {
          if ((Y >= LABEL.y1 && Y < LABEL.y1 + pc && X > LABEL.x0 && X < LABEL.x1 + pc) || (X >= LABEL.x1 && X < LABEL.x1 + pc && Y > LABEL.y0 && Y < LABEL.y1)) lvl -= 0.22;
          if (lip > -pc * 1.6) {
            // shadow under the top and left lips, light on the bottom and right
            const below = Y > (WIN.y0 + WIN.y1) / 2;
            const right = X > WIN.x1 - WIN.r;
            return below || right ? flat(BODY, lvl + 0.22) : DARK[1];
          }
          // grip ribs down both ends, the write-protect tabs along the top
          if ((X < 4 || X > AW - 4) && Y > 58 && Y < 86) return Math.floor(Y / Math.max(1.5, pc)) % 2 ? DARK[2] : flat(BODY, lvl + 0.2);
          if (Y < 3 && ((X > 14 && X < 22) || (X > AW - 22 && X < AW - 14))) return DARK[2];
        } else {
          lvl += 0.06;
          // the openings' lips
          for (const [hx, hy, hw] of HOLES) if (X >= hx && X < hx + hw && Y < hy && Y >= hy - pc) return DARK[1];
        }
        for (const [sx, sy] of SCREWS) {
          const d = Math.hypot(X - sx, Y - sy);
          if (d < Math.max(2.4, pc * 1.1)) return d < Math.max(1, pc * 0.5) ? DARK[1] : flat(CHROME, 0.25 + 0.6 * l);
        }
        return flat(BODY, lvl);
      }
      case "edge": {
        const l = lam;
        // grip ribs on the ends
        if (Math.abs(f.n[0]) > 0.9) {
          const Y = (HT + LIFT - y3) / U;
          if (Y > 58 && Y < 86 && Math.floor(Y / Math.max(1.5, pc)) % 2) return DARK[2];
        }
        return flat(BODY, 0.1 + 0.75 * l + (f.n[1] > 0.5 ? 0.15 : 0));
      }
      case "baseTop":
        // its top catches the light; its flanks, too thin to read, keep the face's ink
        return flat(BODY, 0.35 + 0.8 * lam);
      case "baseFlank":
        // too thin to read on their own: the face's ink, so they don't fray its edge
        return flat(BODY, 0.16 + 0.62 * Math.max(0, f.k === 0 ? L[2] : -L[2]));
      case "inner": {
        const X = (f.k === 0 ? x3 + HW : HW - x3) / U;
        const Y = (HT + LIFT - y3) / U;
        if (inWin(X, Y) > 0) return 0;
        return Y > HUB_Y + 8 ? DARK[0] : DARK[1];
      }
      case "glass": {
        const X = (f.k === 0 ? x3 + HW : HW - x3) / U;
        const Y = (HT + LIFT - y3) / U;
        if (inWin(X, Y) <= 0) return 0;
        // two streaks of glare across it, dotted so the reels show through
        const s = X - WIN.x0 + (Y - WIN.y0) * 1.3;
        const on = (s > 30 && s < 35) || (s > 39 && s < 41) || (s > 103 && s < 106);
        return on && b4(x, y) < 0.5 + 0.4 * lam ? GLARE : 0;
      }
      case "pack":
      case "packRim": {
        if (f.mat === "packRim") return tone(TAPE, 0.15 + 0.55 * lam, x, y);
        const h = f.k;
        const dx = x3 - wx(HUB_X[h]);
        const dy = y3 - wy(HUB_Y);
        const d = Math.hypot(dx, dy) / U;
        const R = h === 0 ? rlNow : rrNow;
        // wound tape: faint rings, the outer turn catching the light, a sheen on the upper left
        if (R - d < pc) return TAPE[3];
        let lvl = 0.25 + 0.35 * lam;
        if (Math.floor(d / Math.max(2, pc * 1.4)) % 2) lvl -= 0.12;
        const a = Math.atan2(dy, f.n[2] > 0 ? -dx : dx);
        if (a > 1.9 && a < 2.7 && d > HUB_R + 2) lvl += 0.25;
        return tone(TAPE, lvl, x, y);
      }
      case "hubRim":
        return tone(CHROME, 0.3 + 0.6 * lam, x, y);
      case "hub": {
        const h = f.k;
        const dx = x3 - wx(HUB_X[h]);
        const dy = y3 - wy(HUB_Y);
        const d = Math.hypot(dx, dy) / U;
        if (d > HUB_R - Math.max(1.6, pc)) return tone(CHROME, 0.45 + 0.55 * lam, x, y);
        // six drive teeth reaching in from the rim
        const a = Math.atan2(dy, dx) - st.spin[h];
        const sector = Math.PI / 3;
        const off = Math.abs((((a % sector) + sector) % sector) - sector / 2);
        if (d > 3.4 && off * d < Math.max(1.3, pc * 0.75)) return tone(CHROME, 0.3 + 0.5 * lam, x, y);
        return d < 2.2 ? DARK[2] : DARK[0];
      }
      case "tape":
        return TAPE[2];
      case "felt":
        return tone(FELT, 0.3 + 0.5 * lam, x, y);
    }
    return P.flare;
  }

  let rlNow = CORE;
  let rrNow = CORE;

  function frame(R: Raster, t: number, dt: number) {
    // the turn: held, or springing to a side
    if (!st.held && st.target !== null) {
      if (reduced) {
        st.yaw = st.target;
        st.v = 0;
      } else {
        const k = 70;
        st.v += (k * (st.target - st.yaw) - 2 * Math.sqrt(k) * st.v) * Math.min(dt, 1 / 30);
        st.yaw += st.v * Math.min(dt, 1 / 30);
      }
      if (Math.abs(st.target - st.yaw) < 0.002 && Math.abs(st.v) < 0.02) {
        st.yaw = st.target;
        st.v = 0;
        st.target = null;
        hooks.settle?.(sideOf(st.yaw));
      }
    }
    const side = sideOf(st.yaw);
    if (side !== st.side) {
      st.side = side;
      hooks.side?.(side);
    }

    // the hubs turn while it plays, each at ω = v / r
    const turning = st.clock.run && !reduced;
    const { rl, rr } = build(t);
    rlNow = rl;
    rrNow = rr;
    if (turning) {
      st.spin[0] += (SPEED / rl) * dt;
      st.spin[1] += (SPEED / rr) * dt;
    }

    const W = R.w;
    const H = R.h;
    const scale = Math.min(W / 11.8, H / 9.4);
    const cam = makeCam(st.yaw, PITCH, scale, W / 2, H * 0.45, [0, 2.75, 0]);
    st.cam = cam;
    // the light stays with the viewer: turned into the turntable's frame
    const cw = Math.cos(st.yaw);
    const sw = Math.sin(st.yaw);
    st.L = norm([LV[0] * cw - LV[2] * sw, LV[1], LV[0] * sw + LV[2] * cw]);

    // the labels, lettered at about a cell and a quarter a texel
    const tpx = (1.25 / scale) / U;
    const key = `${Math.round(tpx * 8)}:${version}`;
    if (key !== texKey) {
      tex = { A: labelTex(label.A, "A", tpx), B: labelTex(label.B, "B", tpx) };
      texKey = key;
    }

    if (!st.S) st.S = makeShadow(180, st.L, 7, [0, 2.6, 0]);
    if (st.shadowYaw !== st.yaw) {
      st.S = makeShadow(180, st.L, 7, [0, 2.6, 0]);
      renderShadow(st.S, still);
      st.shadowYaw = st.yaw;
    }

    halo(R, W / 2, H * 0.48, Math.min(W * 0.5, H * 0.62));
    clearDepth(R);
    draw(R, F, cam, shade);

    if (st.held || st.target !== null) return 0;
    // the hubs step when their teeth have moved about a cell: five to twelve times a second
    if (turning) return clamp((0.2 * Math.min(rl, rr)) / SPEED, 0.08, 0.2);
    if (st.clock.run) return 1;
    return Infinity;
  }

  return {
    frame,
    /** the label on each side */
    setLabels(a: LabelInfo, b: LabelInfo) {
      label = { A: a, B: b };
      version++;
    },
    /** where the tape is (ms), how long it is, whether it runs; `now` on the loop's clock */
    setClock(c: { pos: number; total: number; run: boolean }, now: number) {
      st.clock = { ...c, at: now };
    },
    side: () => st.side,
    grab() {
      st.held = true;
      st.from = restOf(st.yaw);
      st.v = 0;
      st.target = null;
    },
    /** turn by `d` radians over `ms` */
    turn(d: number, ms: number) {
      st.yaw = clamp(st.yaw + d, st.from - Math.PI * 1.1, st.from + Math.PI * 1.1);
      st.v = d / (Math.max(8, ms) / 1000);
    },
    /** let go: to the side it's thrown towards, one turn at most */
    release(still: boolean) {
      st.held = false;
      if (still) st.v = 0;
      const end = st.yaw + st.v * 0.18;
      st.target = clamp(restOf(end), st.from - Math.PI, st.from + Math.PI);
    },
    /** half a turn, to the other side */
    flip() {
      const base = st.target ?? restOf(st.yaw);
      st.target = base + Math.PI;
    },
    show(s: Side) {
      const base = st.target ?? restOf(st.yaw);
      if (sideOf(base) !== s) st.target = base + Math.PI;
    },
  };
}

export type Cassette3D = ReturnType<typeof makeCassette>;

/** a picture as n×n packed pixels (null when it can't be read: no CORS) */
export function picturePixels(img: CanvasImageSource, n: number): Uint32Array | null {
  try {
    const c = document.createElement("canvas");
    c.width = c.height = n;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return null;
    g.drawImage(img, 0, 0, n, n);
    const d = g.getImageData(0, 0, n, n).data;
    const out = new Uint32Array(n * n);
    for (let i = 0; i < n * n; i++) out[i] = pack([d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]);
    return out;
  } catch {
    return null;
  }
}
