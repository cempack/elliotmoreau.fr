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
 * Mail's typewriter: a pixel machine on a turntable, in the Atlas globe's
 * inks, that types the letter as it is written. Today's date goes on top
 * in red, then the subject, then the message, a key going down for each
 * letter as it strikes. The carriage steps along and flies back at the end
 * of a line, the bell rings near the margin, the paper rolls up as the
 * letter grows, and a correction tape lifts the letters a backspace takes
 * away. A French machine: AZERTY, the full stop on the ; key and the
 * hyphen on the 6. It only paints while something moves: a still machine
 * costs nothing.
 */

/* the sheet: 60×200 texels, 13 letters a line, a letter 3 texels wide and 4 apart */
const SW = 60;
const SH = 200;
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
/** the most lines a sheet takes */
const LINES = Math.floor((SH - TOPM - 5) / LINE) + 1;
/** the subject gets at most this many, the last one cut short */
const SUBJECT_LINES = 3;
/** past this many letters to take back, or to type at once (a paste), the sheet is re-inked in one go */
const ERASE_MAX = 16;
const TYPE_MAX = 64;

const carrAt = (col: number) => PAPER_W / 2 - (MARG + col * 4 + 1.5) * TEX;
/** the paper's travel with `line` at the typing point, just clear of the bail */
const feedAt = (line: number) => TOPM + 10 + line * LINE;
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

/** text in lines of 13 capitals at most: words kept whole when they fit, longer ones (an address) broken */
function wrap(s: string, max = Infinity) {
  const words = s.split(/\s+/).filter(Boolean).map((w) => [...w].map(foldChar).join(""));
  const out: string[] = [];
  let line = "";
  for (let w of words) {
    if (line && line.length + 1 + w.length <= COLS) {
      line += " " + w;
      continue;
    }
    if (line) out.push(line);
    while (w.length > COLS) {
      out.push(w.slice(0, COLS));
      w = w.slice(COLS);
    }
    line = w;
  }
  if (line) out.push(line);
  if (out.length > max) {
    out.length = max;
    out[max - 1] = out[max - 1].slice(0, COLS - 3).trimEnd() + "...";
  }
  return out;
}

/**
 * A letter as the machine sets it: the date, the subject, a blank line and
 * the message, a paragraph at a time (a return the writer just made stays,
 * so the carriage comes back as they hit it), as much as one sheet takes.
 */
export function letterLines(date: string, subject: string, body: string) {
  const lines = [date, ...wrap(subject, SUBJECT_LINES)];
  if (body.trim()) {
    lines.push("");
    for (const para of body.replace(/^\s*\n/, "").split("\n")) lines.push(...(para.trim() ? wrap(para) : [""]));
  }
  if (lines.length > LINES) lines.length = LINES;
  return lines;
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

/** the parts that never move: body, deck, hood, spools, type guide, turntable */
function frameFaces() {
  const F: Face[] = [];
  box(F, [-1.5, 0, -0.95], [1.5, 0.62, 0.15], "body");
  face(F, [[-1.5, 0.62, 0.15], [1.5, 0.62, 0.15], [1.5, 0.16, 1.2], [-1.5, 0.16, 1.2]], "body");
  face(F, [[-1.5, 0.16, 1.2], [1.5, 0.16, 1.2], [1.5, 0, 1.2], [-1.5, 0, 1.2]], "body");
  face(F, [[1.5, 0.16, 1.2], [1.5, 0.62, 0.15], [1.5, 0, 0.15], [1.5, 0, 1.2]], "body");
  face(F, [[-1.5, 0.62, 0.15], [-1.5, 0.16, 1.2], [-1.5, 0, 1.2], [-1.5, 0, 0.15]], "body");
  box(F, [-1.25, 0.62, -0.22], [1.25, 0.84, 0.16], "hood");
  for (const sx of [-0.82, 0.82]) prism(F, "y", [sx, 0.87, -0.03], 0.25, 0.03, 14, "chrome", "spool");
  box(F, [-0.06, 1.0, -0.44], [0.06, 1.1, -0.38], "chrome");
  turntable(F, FLOOR_R, 0, "floor");
  return F;
}

/** a key (a stem and a round cap) up and down */
const keyFaces = (k: (typeof KEYS)[number]) =>
  [0, 0.05].map((down) => {
    const F: Face[] = [];
    box(F, [k.x - 0.018, k.deck, k.z - 0.018], [k.x + 0.018, k.y - 0.02 - down, k.z + 0.018], "dark");
    prism(F, "y", [k.x, k.y - down, k.z], 0.088, 0.02, 8, "chrome", "cap", { on: down > 0 });
    return F;
  });

const spaceFaces = () =>
  [0, 0.04].map((down) => {
    const F: Face[] = [];
    box(F, [-0.8, 0.19 - down, 1.16], [0.8, 0.24 - down, 1.27], "chrome");
    return F;
  });

/** the carriage at cx: rail, platen and its knobs, paper bail, return lever, paper table, the sheet */
function carriageFaces(cx: number) {
  const F: Face[] = [];
  box(F, [-1.45 + cx, 0.62, -0.95], [1.45 + cx, 0.72, -0.3], "dark");
  prism(F, "x", [cx, 0.95, -0.62], 0.2, 1.3, 14, "dark", "dark");
  for (const s of [-1, 1]) prism(F, "x", [cx + s * 1.41, 0.95, -0.62], 0.25, 0.09, 14, "knob", "knobcap");
  box(F, [-1.2 + cx, 1.18, -0.465], [1.2 + cx, 1.215, -0.43], "chrome");
  box(F, [-1.92 + cx, 1.14, -0.36], [-1.32 + cx, 1.19, -0.3], "chrome");
  box(F, [-2.0 + cx, 1.1, -0.38], [-1.88 + cx, 1.24, -0.27], "dark");
  face(F, [[-1.15 + cx, 2.05, -1.12], [1.15 + cx, 2.05, -1.12], [1.15 + cx, 1.05, -0.86], [-1.15 + cx, 1.05, -0.86]], "body", { two: true });
  face(F, [[-0.95 + cx, PT[1], PT[2]], [0.95 + cx, PT[1], PT[2]], [0.95 + cx, PB[1], PB[2]], [-0.95 + cx, PB[1], PB[2]]], "paper", { two: true, cast: false });
  return F;
}

/** the typebar's flash as a letter strikes */
const flashFaces = () => {
  const F: Face[] = [];
  face(F, [[-0.025, 1.08, -0.42], [0.025, 1.08, -0.42], [0.025, 0.84, -0.1], [-0.025, 0.84, -0.1]], "chrome", { two: true, cast: false });
  return F;
};

/** `onStrike`: a letter just hit the paper (for its sound) */
export function makeTypewriter(reduced: boolean, onStrike?: () => void) {
  const sheet = new Uint8Array(SW * SH);
  const st = {
    user: 0,
    vYaw: 0,
    dragging: false,
    carr: carrAt(0),
    feed: 0,
    keyDown: -1,
    keyUntil: 0,
    spaceUntil: 0,
    strikeUntil: 0,
    dingUntil: 0,
    spool: 0,
    steps: [] as Step[],
    /** when the machine is free for the next step */
    free: 0,
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
  const r = rng(0x5eed);

  // the geometry, built once; only the carriage is rebuilt, and only when it moves
  const still = frameFaces();
  const keys = KEYS.map(keyFaces);
  const space = spaceFaces();
  const flash = flashFaces();
  let carriage: Face[] = [];
  let carriageAt = NaN;
  let shadowAt = NaN;
  const F: Face[] = [];

  /** the letter as it will stand once every queued step has run (null: no sheet in yet) */
  let plan: string[] | null = null;

  /** queue a step that takes `dur` once the machine is free; without motion, it happens now */
  const queue = (now: number, dur: number, fn: (n: number) => void) => {
    if (reduced) return fn(now);
    const t = Math.max(now, st.free);
    st.free = t + dur;
    st.steps.push({ t, fn });
  };
  /** behind the writer, the machine hurries */
  const pace = (now: number, calm: number) => (st.free - now > 0.45 ? 0.03 : calm);

  function ink(line: number, col: number, ch: string | null, v: number) {
    const g = ch && glyphOf(ch);
    for (let i = 0; i < 15; i++) {
      const k = (TOPM + line * LINE + ((i / 3) | 0)) * SW + MARG + col * 4 + (i % 3);
      if (!g) sheet[k] = 0;
      else if (g[i] === "1") sheet[k] = v;
    }
  }

  function strike(ch: string, line: number, col: number, now: number) {
    if (ch === " ") {
      if (!reduced) st.spaceUntil = now + 0.09;
    } else {
      ink(line, col, ch, line === 0 ? 2 : 1);
      if (!reduced) {
        st.keyDown = keyOf.get(ch) ?? -1;
        st.keyUntil = now + 0.09;
        st.strikeUntil = now + 0.06;
      }
      onStrike?.();
    }
    tween("carr", carrAt(col + 1), 0.05, now);
    if (col + 1 === COLS - 4 && !reduced) st.dingUntil = now + 0.6;
    st.spool += 0.35;
  }

  /** pull the sheet out (if one is in) and feed a fresh one to the first line */
  function fresh(now: number) {
    if (plan) queue(now, 0.5, (n) => tween("feed", SH + VIS + 4, 0.45, n));
    queue(now, 0.1, (n) => {
      sheet.fill(0);
      st.feed = 0;
      anim.feed = null;
      tween("carr", carrAt(0), 0.32, n);
    });
    queue(now, 0.62, (n) => tween("feed", feedAt(0), 0.5, n));
    plan = [""];
  }

  /** the whole letter inked at once, the carriage and paper where its last letter left them */
  function reink(lines: string[], now: number) {
    const snap = [...lines];
    queue(now, 0.3, (n) => {
      sheet.fill(0);
      snap.forEach((ln, li) => [...ln].forEach((ch, c) => ink(li, c, ch, li === 0 ? 2 : 1)));
      tween("carr", carrAt(snap[snap.length - 1].length), 0.25, n);
      tween("feed", feedAt(snap.length - 1), 0.25, n);
    });
  }

  /**
   * Bring the sheet to `target` (lines from letterLines): what the writer
   * added is typed, what they took back is lifted letter by letter, and
   * anything bigger (a paste, an edit far up the page) is re-inked at once.
   * A letter cleared after it was sent gets a fresh sheet.
   */
  function show(target: string[], now: number) {
    if (!plan) fresh(now);
    const was = plan!;
    const a = was.join("\n");
    const b = target.join("\n");
    if (a === b) return;
    let p = 0;
    while (p < a.length && p < b.length && a[p] === b[p]) p++;
    if (a.length - p > ERASE_MAX) {
      if (b.length <= target[0].length && was.length > 1) {
        fresh(now);
        return show(target, now);
      }
      reink(target, now);
      plan = target;
      return;
    }
    let line = was.length - 1;
    let col = was[line].length;
    for (let i = a.length - 1; i >= p; i--) {
      if (a[i] === "\n") {
        line--;
        col = was[line].length;
        const [l, c] = [line, col];
        queue(now, 0.3, (n) => {
          tween("feed", feedAt(l), 0.2, n);
          tween("carr", carrAt(c), 0.2, n);
        });
      } else {
        col--;
        const [l, c] = [line, col];
        queue(now, pace(now, 0.06), (n) => {
          tween("carr", carrAt(c), 0.04, n);
          ink(l, c, null, 0);
          if (!reduced) st.strikeUntil = n + 0.05;
        });
      }
    }
    let budget = TYPE_MAX;
    for (const ch of b.slice(p)) {
      if (budget-- <= 0) {
        reink(target, now);
        break;
      }
      if (ch === "\n") {
        line++;
        col = 0;
        const l = line;
        queue(now, 0.42, (n) => {
          tween("carr", carrAt(0), 0.3, n);
          tween("feed", feedAt(l), 0.22, n);
        });
      } else {
        const [l, c] = [line, col];
        queue(now, pace(now, 0.05 + r() * 0.05), (n) => strike(ch, l, c, n));
        col++;
      }
    }
    plan = target;
  }

  function build(now: number) {
    if (st.carr !== carriageAt) {
      carriage = carriageFaces(st.carr);
      carriageAt = st.carr;
    }
    F.length = 0;
    for (const f of still) F.push(f);
    const down = now < st.keyUntil ? st.keyDown : -1;
    for (let i = 0; i < keys.length; i++) for (const f of keys[i][i === down ? 1 : 0]) F.push(f);
    for (const f of space[now < st.spaceUntil ? 1 : 0]) F.push(f);
    for (const f of carriage) F.push(f);
    if (now < st.strikeUntil) for (const f of flash) F.push(f);
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

  /** paints a frame; answers how many seconds until the picture next changes */
  function frame(R: Raster, t: number, dt: number) {
    while (st.steps.length && st.steps[0].t <= t) st.steps.shift()!.fn(t);
    for (const k of ["carr", "feed"] as const) {
      const a = anim[k];
      if (!a) continue;
      const p = clamp((t - a.t0) / a.dur, 0, 1);
      st[k] = a.from + (a.to - a.from) * ease(p);
      if (p >= 1) anim[k] = null;
    }
    if (!st.dragging && st.vYaw) {
      st.user += st.vYaw * dt;
      st.vYaw *= Math.exp(-dt * 3);
      if (Math.abs(st.vYaw) < 0.03) st.vYaw = 0;
    }
    const W = R.w;
    const H = R.h;
    // close on the sheet, big enough to read, the keyboard running off the bottom edge; the view
    // drifts a third of the way with the carriage, so a whole line's travel stays on the paper
    const scale = Math.min(W / 3.4, H / 2.9);
    const cam = makeCam(-0.42 + st.user, 0.46, scale, W / 2, H * 0.6, [0.2 + 0.35 * st.carr, 1.25, -0.1]);
    st.cam = cam;
    const faces = build(t);
    // the shadow follows the carriage; nothing else that moves casts one worth redrawing
    if (!st.S) st.S = makeShadow(200, L, 3.1, [0, 0.9, 0]);
    if (Number.isNaN(shadowAt) || Math.abs(st.carr - shadowAt) > TEX / 2) {
      renderShadow(st.S, faces);
      shadowAt = st.carr;
    }
    halo(R, W / 2, H * 0.45, H * 0.66);
    clearDepth(R);
    draw(R, faces, cam, shade);
    if (t < st.dingUntil) {
      const p = cam.proj([st.carr + 1.6, 1.42, -0.62]);
      drawText(R.c, W, H, "DING", Math.round(p[0]) - 2, Math.round(p[1]) - 6, P.light);
    }
    if (anim.carr || anim.feed || st.dragging || st.vYaw) return 0;
    // between strikes nothing moves: sleep until the next key, or a key coming back up
    let next = st.steps.length ? st.steps[0].t : Infinity;
    for (const u of [st.keyUntil, st.spaceUntil, st.strikeUntil, st.dingUntil]) if (u > t && u < next) next = u;
    return next - t;
  }

  return {
    frame,
    show,
    grab() {
      st.dragging = true;
      st.vYaw = 0;
    },
    turn(dx: number, ms: number) {
      const k = 0.008;
      st.user += dx * k;
      st.vYaw = (dx * k) / (Math.max(1, ms) / 1000);
    },
    release(still: boolean) {
      if (still) st.vYaw = 0;
      st.dragging = false;
    },
  };
}

export type Typewriter = ReturnType<typeof makeTypewriter>;
