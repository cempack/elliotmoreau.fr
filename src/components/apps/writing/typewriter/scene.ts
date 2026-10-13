import {
  P,
  box,
  clamp,
  clearDepth,
  draw,
  drawText,
  ease,
  face,
  foldChar,
  glyphOf,
  halo,
  inShadow,
  len,
  lit,
  makeCam,
  makeShadow,
  norm,
  pack,
  prism,
  ramp,
  renderShadow,
  rng,
  sub,
  turntable,
  turntableInk,
  type Cam,
  type Face,
  type Raster,
  type Shadow,
  type V3,
} from "@/lib/pixel3d";

/**
 * The Blog's typewriter: a pixel machine on a turntable, in the Atlas
 * globe's inks, that types a post's title onto a fresh sheet, then its
 * date in red. Each key goes down as its letter strikes, the carriage
 * steps along and flies back at the end of a line, the spools turn, and
 * the bell rings near the margin. A French machine: AZERTY, the full
 * stop on the ; key and the hyphen on the 6.
 */

export type Sheet = { title: string; date: string };

/* the sheet: 60×120 texels, 13 letters a line, a letter 3 texels wide and 4 apart */
const SW = 60;
const SH = 120;
const MARG = 4;
const COLS = 13;
const LINE = 8;
const TOPM = 6;
const PAPER_W = 1.9;
const TEX = PAPER_W / SW;
const PB: V3 = [0, 1.1, -0.47];
const PT: V3 = [0, 2.6, -0.85];
/** how many texels of the sheet show between the platen and the paper's top */
const VIS = len(sub(PT, PB)) / TEX;
/** at most this many lines of title, the last one cut short */
const MAX_LINES = 6;

const carrAt = (col: number) => PAPER_W / 2 - (MARG + col * 4 + 1.5) * TEX;
const deckY = (z: number) => 0.16 + ((1.2 - z) / 1.05) * 0.46;

// AZERTY, front row first
const ROWS = ["WXCVBN,;:!", "QSDFGHJKLM", "AZERTYUIOP", "1234567890"];
const KEYS: { x: number; z: number; deck: number; y: number }[] = [];
const keyOf = new Map<string, number>();
ROWS.forEach((row, r) =>
  [...row].forEach((ch, i) => {
    const z = 1.02 - r * 0.215;
    KEYS.push({ x: (i - 4.5) * 0.245 + 0.1 - r * 0.05, z, deck: deckY(z), y: deckY(z) + 0.12 + r * 0.012 });
    keyOf.set(ch, KEYS.length - 1);
  })
);
keyOf.set(".", keyOf.get(";")!);
keyOf.set("-", keyOf.get("6")!);
keyOf.set("'", keyOf.get("4")!);
keyOf.set("?", keyOf.get(",")!);

/** a title in lines of 13 capitals at most, words kept whole when they fit */
function wrap(s: string) {
  const words = s.split(/\s+/).filter(Boolean).map((w) => [...w].map(foldChar).join(""));
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    if (!line) line = w.slice(0, COLS);
    else if (line.length + 1 + w.length <= COLS) line += " " + w;
    else {
      out.push(line);
      line = w.slice(0, COLS);
    }
  }
  if (line) out.push(line);
  if (out.length > MAX_LINES) {
    out.length = MAX_LINES;
    out[MAX_LINES - 1] = out[MAX_LINES - 1].slice(0, COLS - 3).trimEnd() + "...";
  }
  return out;
}

const BODY = ramp([[8, 10, 28], [16, 20, 52], [32, 38, 96], [56, 63, 148], [92, 96, 204], [140, 136, 236]]);
const DARK = ramp([[4, 5, 14], [8, 10, 28], [14, 18, 44], [26, 32, 74]]);
const CHROME = ramp([[30, 34, 74], [66, 72, 144], [126, 126, 210], [196, 192, 242], [245, 242, 236]]);
const PAPER = ramp([[150, 146, 180], [196, 192, 214], [228, 224, 230], [247, 244, 238]]);
const RIBBON = ramp([[60, 14, 24], [150, 34, 52], [236, 58, 80]]);
const INK_C = pack([28, 30, 70]);
const RED_C = pack([214, 44, 66]);
const L = norm([-0.55, 0.8, 0.45]);
const FLOOR_R = 2.45;

type Step = { t: number; fn: (now: number) => void };
type Tween = { from: number; to: number; t0: number; dur: number };

export function makeTypewriter(reduced: boolean) {
  const sheet = new Uint8Array(SW * SH);
  const st = {
    user: 0,
    vYaw: 0,
    auto: 1,
    dragging: false,
    lastInput: -1e9,
    carr: carrAt(0),
    feed: 0,
    keyDown: -1,
    keyUntil: 0,
    spaceUntil: 0,
    strikeUntil: 0,
    dingUntil: 0,
    spool: 0,
    steps: [] as Step[],
    doneAt: -Infinity,
    S: null as Shadow | null,
    cam: null as Cam | null,
  };
  const anim: { carr: Tween | null; feed: Tween | null } = { carr: null, feed: null };
  const tween = (k: "carr" | "feed", to: number, dur: number, now: number) => {
    if (reduced) {
      st[k] = to;
      anim[k] = null;
      return;
    }
    anim[k] = { from: st[k], to, t0: now, dur };
  };

  function strike(ch: string, line: number, col: number, ink: number, now: number) {
    if (ch === " ") st.spaceUntil = now + 0.09;
    else {
      const g = glyphOf(ch);
      st.keyDown = keyOf.get(ch) ?? -1;
      st.keyUntil = now + 0.09;
      st.strikeUntil = now + 0.06;
      if (g)
        for (let i = 0; i < 15; i++)
          if (g[i] === "1") sheet[(TOPM + line * LINE + ((i / 3) | 0)) * SW + MARG + col * 4 + (i % 3)] = ink;
    }
    tween("carr", carrAt(col + 1), 0.05, now);
    if (col + 1 === COLS - 4) st.dingUntil = now + 0.6;
    st.spool += 0.35;
  }

  /** pull the last sheet out, feed a fresh one, type the title and the date */
  function type(s: Sheet, now: number, seed: number) {
    const steps: Step[] = [];
    let t = now;
    if (st.feed > 0.5) {
      steps.push({ t, fn: (n) => tween("feed", SH + VIS + 4, 0.45, n) });
      t += 0.5;
    }
    steps.push({
      t,
      fn: (n) => {
        sheet.fill(0);
        st.feed = 0;
        anim.feed = null;
        tween("carr", carrAt(0), 0.32, n);
      },
    });
    t += 0.1;
    steps.push({ t, fn: (n) => tween("feed", TOPM + 6, 0.5, n) });
    t += 0.62;
    const lines = [...wrap(s.title), s.date];
    const r = rng(seed * 7919 + 13);
    lines.forEach((ln, li) => {
      const ink = li === lines.length - 1 ? 2 : 1;
      if (li > 0) {
        steps.push({
          t,
          fn: (n) => {
            tween("carr", carrAt(0), 0.3, n);
            tween("feed", TOPM + 6 + li * LINE, 0.22, n);
          },
        });
        t += 0.42;
      }
      [...ln].forEach((ch, c) => {
        t += ch === " " ? 0.15 : 0.07 + r() * 0.08;
        steps.push({ t, fn: (n) => strike(ch, li, c, ink, n) });
      });
      t += 0.12;
    });
    // done: one more return, so the date clears the bail
    t += 0.25;
    steps.push({
      t,
      fn: (n) => {
        tween("carr", carrAt(0), 0.3, n);
        tween("feed", TOPM + 6 + lines.length * LINE, 0.25, n);
      },
    });
    t += 0.35;
    st.steps = steps;
    st.doneAt = t;
    if (reduced) {
      for (const step of steps) step.fn(now);
      st.steps = [];
      st.keyUntil = st.strikeUntil = st.spaceUntil = st.dingUntil = 0;
    }
  }

  function build(now: number) {
    const F: Face[] = [];
    const cx = st.carr;
    // the body, its sloped deck and the hood with its nameplate
    box(F, [-1.5, 0, -0.95], [1.5, 0.62, 0.15], "body");
    face(F, [[-1.5, 0.62, 0.15], [1.5, 0.62, 0.15], [1.5, 0.16, 1.2], [-1.5, 0.16, 1.2]], "body");
    face(F, [[-1.5, 0.16, 1.2], [1.5, 0.16, 1.2], [1.5, 0, 1.2], [-1.5, 0, 1.2]], "body");
    face(F, [[1.5, 0.16, 1.2], [1.5, 0.62, 0.15], [1.5, 0, 0.15], [1.5, 0, 1.2]], "body");
    face(F, [[-1.5, 0.62, 0.15], [-1.5, 0.16, 1.2], [-1.5, 0, 1.2], [-1.5, 0, 0.15]], "body");
    box(F, [-1.25, 0.62, -0.22], [1.25, 0.84, 0.16], "hood");
    // the ribbon spools and the type guide
    for (const sx of [-0.82, 0.82]) prism(F, "y", [sx, 0.87, -0.03], 0.25, 0.03, 14, "chrome", "spool");
    box(F, [-0.06, 1.0, -0.44], [0.06, 1.1, -0.38], "chrome");
    // the keys: a stem and a round cap each, the one being struck down
    KEYS.forEach((k, i) => {
      const down = st.keyDown === i && now < st.keyUntil ? 0.05 : 0;
      box(F, [k.x - 0.018, k.deck, k.z - 0.018], [k.x + 0.018, k.y - 0.02 - down, k.z + 0.018], "dark");
      prism(F, "y", [k.x, k.y - down, k.z], 0.088, 0.02, 8, "chrome", "cap", { on: down > 0 });
    });
    const sd = now < st.spaceUntil ? 0.04 : 0;
    box(F, [-0.8, 0.19 - sd, 1.16], [0.8, 0.24 - sd, 1.27], "chrome");
    // the carriage: rail, platen and its knobs, paper bail, return lever, paper table
    box(F, [-1.45 + cx, 0.62, -0.95], [1.45 + cx, 0.72, -0.3], "dark");
    prism(F, "x", [cx, 0.95, -0.62], 0.2, 1.3, 14, "dark", "dark");
    for (const s of [-1, 1]) prism(F, "x", [cx + s * 1.41, 0.95, -0.62], 0.25, 0.09, 14, "knob", "knobcap");
    box(F, [-1.2 + cx, 1.18, -0.465], [1.2 + cx, 1.215, -0.43], "chrome");
    box(F, [-1.92 + cx, 1.14, -0.36], [-1.32 + cx, 1.19, -0.3], "chrome");
    box(F, [-2.0 + cx, 1.1, -0.38], [-1.88 + cx, 1.24, -0.27], "dark");
    face(F, [[-1.15 + cx, 2.05, -1.12], [1.15 + cx, 2.05, -1.12], [1.15 + cx, 1.05, -0.86], [-1.15 + cx, 1.05, -0.86]], "body", { two: true });
    // the sheet, and the typebar's flash as a letter strikes
    face(F, [[-0.95 + cx, PT[1], PT[2]], [0.95 + cx, PT[1], PT[2]], [0.95 + cx, PB[1], PB[2]], [-0.95 + cx, PB[1], PB[2]]], "paper", { two: true, cast: false });
    if (now < st.strikeUntil) face(F, [[-0.025, 1.08, -0.42], [0.025, 1.08, -0.42], [0.025, 0.84, -0.1], [-0.025, 0.84, -0.1]], "chrome", { two: true, cast: false });
    turntable(F, FLOOR_R, 0, "floor");
    return F;
  }

  function shade(f: Face, u: number, v: number, wx: number, wy: number, wz: number, x: number, y: number): number {
    const S = st.S;
    switch (f.mat) {
      case "floor":
        return turntableInk(wx, wz, FLOOR_R, x, y, (st.cam as Cam).scale, inShadow(S, wx, wy, wz, 0.02), false);
      case "body":
        return lit(BODY, f, L, S, wx, wy, wz, x, y);
      case "dark":
        return lit(DARK, f, L, S, wx, wy, wz, x, y, 0.2, 0.8);
      case "chrome":
        return lit(CHROME, f, L, S, wx, wy, wz, x, y, 0.22, 0.85);
      case "hood": {
        if (f.side === "z+") {
          // EMOS, in the site's capitals, lit amber on the front of the hood
          const T = 0.036;
          const lu = u * f.fw - (f.fw - 15 * T) / 2;
          const lv = v * f.fh - (f.fh - 5 * T) / 2;
          const gx = Math.floor(lu / T);
          const gy = Math.floor(lv / T);
          if (gx >= 0 && gx < 15 && gy >= 0 && gy < 5 && gx % 4 !== 3 && glyphOf("EMOS"[(gx / 4) | 0])?.[gy * 3 + (gx % 4)] === "1") return P.light;
        }
        return lit(BODY, f, L, S, wx, wy, wz, x, y);
      }
      case "knob":
        return lit(f.k % 2 ? DARK : BODY, f, L, S, wx, wy, wz, x, y, 0.2, 0.8);
      case "knobcap":
        return Math.hypot(u - 0.5, v - 0.5) < 0.16 ? lit(CHROME, f, L, S, wx, wy, wz, x, y) : lit(DARK, f, L, S, wx, wy, wz, x, y, 0.25, 0.8);
      case "spool": {
        const d = Math.hypot(u - 0.5, v - 0.5);
        if (d > 0.44) return lit(CHROME, f, L, S, wx, wy, wz, x, y);
        if (d > 0.2) return Math.floor(d * 40) % 3 === 0 ? RIBBON[1] : lit(DARK, f, L, S, wx, wy, wz, x, y, 0.3, 0.7);
        const a = Math.atan2(v - 0.5, u - 0.5) + st.spool;
        return ((a % 2.094) + 2.094) % 2.094 < 0.5 ? lit(CHROME, f, L, S, wx, wy, wz, x, y) : DARK[0];
      }
      case "cap": {
        if (f.side !== "cap") return lit(CHROME, f, L, S, wx, wy, wz, x, y, 0.15, 0.7);
        if (Math.hypot(u - 0.5, v - 0.5) > 0.34) return lit(CHROME, f, L, S, wx, wy, wz, x, y, 0.3, 0.7);
        return f.on ? P.light : lit(DARK, f, L, S, wx, wy, wz, x, y, 0.35, 0.6);
      }
      case "paper": {
        const sy = Math.floor(st.feed - (1 - v) * VIS);
        if (sy < 0 || sy >= SH) return 0;
        const ink = sheet[sy * SW + clamp(Math.floor(u * SW), 0, SW - 1)];
        if (ink === 1) return INK_C;
        if (ink === 2) return RED_C;
        return lit(PAPER, f, L, S, wx, wy, wz, x, y, 0.5, 0.5, 0.01);
      }
    }
    return P.flare;
  }

  /** a frame; true while it wants another */
  function frame(R: Raster, t: number, dt: number) {
    while (st.steps.length && st.steps[0].t <= t) st.steps.shift()!.fn(t);
    for (const k of ["carr", "feed"] as const) {
      const a = anim[k];
      if (!a) continue;
      const p = clamp((t - a.t0) / a.dur, 0, 1);
      st[k] = a.from + (a.to - a.from) * ease(p);
      if (p >= 1) anim[k] = null;
    }
    if (!st.dragging) {
      if (Math.abs(st.vYaw) > 0.001) {
        st.user += st.vYaw * dt;
        st.vYaw *= Math.exp(-dt * 2.5);
      }
      st.auto = clamp(st.auto + (t - st.lastInput > 2.5 ? dt * 0.4 : -dt * 4), 0, 1);
    }
    const W = R.w;
    const H = R.h;
    const yaw = -0.42 + st.user + (reduced ? 0 : 0.3 * Math.sin(t * 0.23)) * st.auto;
    // the whole machine when there's room; on a small stage, closer, on the sheet
    const close = W < 180;
    const scale = close ? Math.min(W / 3.3, H / 2.9) : Math.min(W / 5.15, H / 3.95);
    const cam = makeCam(yaw, 0.46, scale, W / 2, close ? H * 0.6 : H / 2 - scale * 0.02, close ? [0, 1.25, -0.1] : [0, 1.02, 0.12]);
    st.cam = cam;
    const F = build(t);
    st.S ??= makeShadow(220, L, 3.1, [0, 0.9, 0]);
    renderShadow(st.S, F);
    halo(R, W / 2, H * 0.45, H * 0.66);
    clearDepth(R);
    draw(R, F, cam, shade);
    if (t < st.dingUntil) {
      const p = cam.proj([st.carr + 1.6, 1.42, -0.62]);
      drawText(R.c, W, H, "DING", Math.round(p[0]) - 2, Math.round(p[1]) - 6, P.light);
    }
    const typing = st.steps.length > 0 || anim.carr !== null || anim.feed !== null || t < st.dingUntil || t < st.keyUntil;
    return typing || (!reduced && st.auto > 0) || st.dragging || Math.abs(st.vYaw) > 0.001;
  }

  return {
    frame,
    /** start typing a sheet now (`seed` keeps each title's rhythm its own) */
    type,
    /** seconds since the last sheet was finished (negative while typing) */
    idle: (t: number) => (st.steps.length ? -1 : t - st.doneAt),
    grab(t: number) {
      st.dragging = true;
      st.vYaw = 0;
      st.lastInput = t;
    },
    turn(dx: number, ms: number, t: number) {
      const k = 0.008;
      st.user += dx * k;
      st.vYaw = (dx * k) / (Math.max(1, ms) / 1000);
      st.lastInput = t;
    },
    release(t: number, still: boolean) {
      if (still) st.vYaw = 0;
      st.dragging = false;
      st.lastInput = t;
    },
  };
}

export type Typewriter = ReturnType<typeof makeTypewriter>;
