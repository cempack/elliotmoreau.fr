"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/i18n/client";
import { PIXEL_FOLD, PIXEL_GLYPHS } from "@/components/PixelLabel";
import { useSiteData } from "../SiteData";
import { FIRST_COMMIT, SITE_REPO, fill, useNow } from "./util";
import { timeAgo } from "@/lib/format";

/**
 * The plate every aircraft built in Toulouse carries, for emOS: brushed
 * aluminium in pixels, four rivets, embossed capitals (where and when it
 * was built, its last service, the coordinates), and a Hobbs meter, the
 * counter aircraft log engine hours on, counting real hours since the
 * first commit. On open the drums roll from the reading this visitor last
 * saw to now, rightmost furthest, like an odometer catching up; on a first
 * visit nothing rolls. Only real values: no serial number.
 */

const CELL = 2;
const ROW = 8;
const FIRST = new Date(FIRST_COMMIT).getTime();
const SEEN_KEY = "em-hobbs";
/** the reading this visitor last saw, read once per page load (so a
    second mount, or reopening the panel, doesn't read back our own write) */
let lastSeen: number | null | undefined;

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x: number, y: number) => (B4[((y & 3) << 2) | (x & 3)] + 0.5) / 16;

const ALU = [hex("#5c635c"), hex("#6c736c"), hex("#7c837c"), hex("#8b928a")];
const EDGE = hex("#2b302c");
const BEVEL = hex("#a3aaa1");
const STAMP = hex("#3d433d");
const HI = hex("#9ba299");
const LO = hex("#363b36");
const RIVET = hex("#c9cfc7");
const RIVET_LO = hex("#454b45");

const textW = (s: string) => {
  let w = 0;
  for (const raw of s) w += raw === " " ? 3 : 4;
  return Math.max(0, w - 1);
};

/** stamp a line of capitals into the buffer: pressed-in ink, the light catching each stroke's lower right edge */
function stamp(put: (x: number, y: number, c: RGB) => void, s: string, x0: number, y0: number) {
  let x = x0;
  for (const raw of s.toUpperCase()) {
    const ch = PIXEL_FOLD[raw] ?? raw;
    if (ch === " ") {
      x += 3;
      continue;
    }
    const g = PIXEL_GLYPHS[ch];
    if (g) {
      const on = (cx: number, cy: number) => cy >= 0 && cy < 5 && cx >= 0 && cx < 3 && g[cy][cx] === "1";
      for (let y = 0; y <= 5; y++)
        for (let c = 0; c <= 3; c++) {
          if (on(c, y)) put(x + c, y0 + y, STAMP);
          else if (on(c - 1, y - 1) && !on(c, y + 1) && !on(c + 1, y)) put(x + c, y0 + y, HI);
        }
    }
    x += 4;
  }
}

function drawPlate(ctx: CanvasRenderingContext2D, W: number, H: number, lines: string[]) {
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const set = (x: number, y: number, c: RGB) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const o = (y * W + x) * 4;
    d[o] = c[0];
    d[o + 1] = c[1];
    d[o + 2] = c[2];
    d[o + 3] = 255;
  };
  // brushed: each row its own tone, dithered across, lighter toward the top
  let seed = 0x9e37;
  for (let y = 0; y < H; y++) {
    seed = (Math.imul(seed, 1103515245) + 12345) | 0;
    const row = ((seed >>> 8) & 255) / 255;
    const level = 1.2 + (1 - y / H) * 1.3 + (row - 0.5) * 1.1;
    for (let x = 0; x < W; x++) {
      const v = Math.min(3, Math.max(0, Math.floor(level + bayer(x * 7 + y, y) - 0.5)));
      set(x, y, ALU[v]);
    }
  }
  // edge and bevel
  for (let x = 0; x < W; x++) {
    set(x, 0, EDGE);
    set(x, H - 1, EDGE);
    set(x, 1, BEVEL);
    set(x, H - 2, LO);
  }
  for (let y = 0; y < H; y++) {
    set(0, y, EDGE);
    set(W - 1, y, EDGE);
    if (y > 0 && y < H - 1) {
      set(1, y, BEVEL);
      set(W - 2, y, LO);
    }
  }
  // four rivets
  for (const [rx, ry] of [
    [5, 5],
    [W - 9, 5],
    [5, H - 9],
    [W - 9, H - 9],
  ]) {
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        if ((x === 0 || x === 3) && (y === 0 || y === 3)) continue;
        set(rx + x, ry + y, x + y <= 2 ? RIVET : x + y >= 5 ? RIVET_LO : ALU[3]);
      }
  }
  const put = (x: number, y: number, c: RGB) => set(x, y, c);
  lines.forEach((l, i) => stamp(put, l, 14, 7 + i * ROW));
  ctx.putImageData(img, 0, 0);
}

/** "21 MAR 2026", in the plate's language, unaccented as stamped plates are */
function stampDate(t: number, lang: string) {
  const parts = new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" }).formatToParts(
    new Date(t)
  );
  const get = (k: string) => parts.find((p) => p.type === k)?.value ?? "";
  return `${get("day")} ${get("month").replace(/\./g, "")} ${get("year")}`.toUpperCase();
}

/** one drum: a strip of digits that rolls forward to its value */
function Drum({ value, from, turns, delay, white }: { value: number; from: number | null; turns: number; delay: number; white?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (from == null || reduced || (from === value && turns === 0)) {
      el.style.transition = "none";
      el.style.transform = `translateY(${-(value / 30) * 100}%)`;
      return;
    }
    // start where this visitor left it, then roll forward (never back)
    el.style.transition = "none";
    el.style.transform = `translateY(${-(from / 30) * 100}%)`;
    const target = value + 10 * (turns + (value < from ? 1 : 0));
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        el.style.transition = `transform 600ms cubic-bezier(0.23, 1, 0.32, 1) ${delay}ms`;
        el.style.transform = `translateY(${-(target / 30) * 100}%)`;
      })
    );
    const done = window.setTimeout(() => {
      el.style.transition = "none";
      el.style.transform = `translateY(${-(value / 30) * 100}%)`;
    }, 700 + delay);
    return () => {
      cancelAnimationFrame(id);
      window.clearTimeout(done);
    };
  }, [value, from, turns, delay]);
  return (
    <span className="os-plate-drum" data-white={white || undefined}>
      <span ref={ref} className="os-plate-strip" style={{ transform: `translateY(${-(value / 30) * 100}%)` }}>
        {Array.from({ length: 30 }, (_, k) => (
          <span key={k}>{k % 10}</span>
        ))}
      </span>
    </span>
  );
}

export function DataPlate() {
  const { t, lang } = useI18n();
  const a = t.shell.about;
  const p = a.plate;
  const { activity, repos } = useSiteData();
  const now = useNow("minute");
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [W, setW] = useState(0);
  const [seen, setSeen] = useState<number | null | undefined>(undefined);

  // the last reading this visitor saw (their device only), then today's
  useEffect(() => {
    if (lastSeen === undefined) {
      lastSeen = null;
      try {
        const raw = localStorage.getItem(SEEN_KEY);
        const v = raw ? Number(raw) : NaN;
        lastSeen = Number.isFinite(v) ? v : null;
        localStorage.setItem(SEEN_KEY, String((Date.now() - FIRST) / 3_600_000));
      } catch {}
    }
    const id = window.setTimeout(() => setSeen(lastSeen ?? null), 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.floor(el.clientWidth / CELL)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // last service: the latest push to this site's repo, else its pushedAt
  const service = useMemo(() => {
    if (activity && activity.repo === "elliotmoreau.fr") return { at: Date.parse(activity.createdAt), msg: activity.message };
    const r = repos.find((x) => x.name === "elliotmoreau.fr");
    return r?.pushedAt ? { at: Date.parse(r.pushedAt), msg: "" } : null;
  }, [activity, repos]);

  const lines = useMemo(
    () => [
      p.built,
      p.model,
      fill(p.mfg, { date: stampDate(FIRST, lang) }),
      service ? fill(p.service, { date: stampDate(service.at, lang) }) : "",
      "43.60N 1.44E",
    ],
    [p, lang, service]
  );
  const textCells = Math.max(...lines.map(textW)) + 28;
  // narrow plates put the meter under the stamped rows
  const stacked = W > 0 && W < textCells + 58;
  const H = 7 + lines.length * ROW + 4 + (stacked ? 24 : 0);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx || W < 40) return;
    drawPlate(ctx, W, H, lines);
  }, [W, H, lines]);

  const hours = now ? (now.getTime() - FIRST) / 3_600_000 : null;
  const tenths = hours == null ? 0 : Math.floor(hours * 10);
  const digits = String(Math.floor(tenths / 10)).padStart(5, "0").slice(-5).split("").map(Number);
  const tenth = tenths % 10;
  const before = seen != null ? Math.floor(seen * 10) : null;
  const fromDigits = before != null ? String(Math.floor(before / 10)).padStart(5, "0").slice(-5).split("").map(Number) : null;
  const delta = before != null ? tenths - before : 0;
  const turnsFor = (place: number) => Math.min(2, Math.floor(delta / (10 * place)));

  return (
    <div className="os-plate-wrap">
      <div ref={wrap} className="os-plate" data-stacked={stacked || undefined}>
        <canvas ref={canvas} width={Math.max(1, W)} height={H} className="os-plate-canvas" style={{ width: W * CELL, height: H * CELL }} aria-hidden />
        {hours != null && (
          <div className="os-plate-hobbs" aria-hidden>
            <span className="os-plate-hobbs-label">{p.hours}</span>
            <span className="os-plate-drums">
              {digits.map((d, i) => (
                <Drum key={i} value={d} from={fromDigits ? fromDigits[i] : null} turns={turnsFor(10 ** (4 - i) * 10)} delay={(5 - i) * 40} />
              ))}
              <Drum value={tenth} from={before != null ? before % 10 : null} turns={turnsFor(1)} delay={0} white />
            </span>
          </div>
        )}
        <p className="sr-only">
          {fill(p.aria, {
            mfg: new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { dateStyle: "long" }).format(FIRST),
            service: service ? new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { dateStyle: "long" }).format(service.at) : "",
            hours: hours == null ? "" : Math.floor(hours).toLocaleString(lang),
          })}
        </p>
      </div>
      {seen != null && hours != null && delta > 0 && (
        <p className="os-plate-since">{fill(p.since, { h: (delta / 10).toLocaleString(lang, { maximumFractionDigits: 1 }) })}</p>
      )}
      {service?.msg && (
        <a className="os-plate-log" href={`${SITE_REPO}/commits`} target="_blank" rel="noopener noreferrer">
          <span className="os-plate-log-msg">{service.msg}</span>
          <span className="os-plate-log-ago" suppressHydrationWarning>
            {now ? timeAgo(new Date(service.at).toISOString(), lang) : ""}
          </span>
        </a>
      )}
    </div>
  );
}
