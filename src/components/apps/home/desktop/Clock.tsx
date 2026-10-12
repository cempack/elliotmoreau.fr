"use client";

import Link from "next/link";
import { AnimatePresence, m } from "motion/react";
import { useId, useMemo, useSyncExternalStore } from "react";
import { cellPaths, pxPath } from "@/lib/pxpath";
import { mix, type ArtPalette } from "@/lib/theme";
import { spring } from "@/lib/motion";
import { useI18n } from "@/i18n/client";
import { useReduced } from "@/hooks/env";
import { useArtPalette } from "@/hooks/useTheme";
import { Glass } from "@/components/os/Glass";
import { useSky } from "@/components/os/sky";
import { useWeather, type WeatherKind } from "@/components/os/weather";
import { pinnedMs, sunScrub } from "@/components/os/wallpaper/sunClock";
import { atLocalHour, moonPhase, phaseOf, sunAt, sunDay, type SkyPhase } from "@/lib/sun";
import { PARIS, fmtOffset, hhmm, offsetMinutes, useMinute, useVisitorZone } from "./time";

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

/* ───────────────────────────── the clock ─────────────────────────────
   Toulouse time in big pixel numerals, two cells to a stroke like the
   wordmark, and like the wordmark they wear bands of colour: here the
   sky's, at the hour the wallpaper is showing. Cream and sage by day,
   cream into amber and red as the sun goes down, moonlit greys at night;
   the inks follow the sun's real elevation, so they turn by degrees, and
   while someone holds the wallpaper's sun the numerals follow that hour
   and change colour with it. A digit rolls over when the minute turns,
   through the bands: they belong to the light, not to the digit.
   Around it: the city and its weather, the next sunrise or sunset, and
   the visitor's own time when it isn't Toulouse's. */

/* 6 × 10 numerals, 2-cell strokes */
const NUMERALS: Record<string, string[]> = {
  "0": [".####.", "######", "##..##", "##..##", "##..##", "##..##", "##..##", "##..##", "######", ".####."],
  "1": ["..##..", ".###..", "####..", "..##..", "..##..", "..##..", "..##..", "..##..", "..##..", "..##.."],
  "2": [".####.", "######", "##..##", "....##", "...###", "..###.", ".###..", "###...", "######", "######"],
  "3": [".####.", "######", "##..##", "....##", "..###.", "..####", "....##", "##..##", "######", ".####."],
  "4": ["...###", "..####", ".##.##", "##..##", "##..##", "######", "######", "....##", "....##", "....##"],
  "5": ["######", "######", "##....", "##....", "#####.", "######", "....##", "##..##", "######", ".####."],
  "6": [".####.", "######", "##....", "##....", "#####.", "######", "##..##", "##..##", "######", ".####."],
  "7": ["######", "######", "....##", "....##", "...##.", "...##.", "..##..", "..##..", "..##..", "..##.."],
  "8": [".####.", "######", "##..##", "##..##", ".####.", "######", "##..##", "##..##", "######", ".####."],
  "9": [".####.", "######", "##..##", "##..##", "######", ".#####", "....##", "....##", "######", ".####."],
  "-": ["......", "......", "......", "......", ".####.", ".####.", "......", "......", "......", "......"],
};
const GW = 6;
const GH = 10;
/** HH:MM across 32 cells: a cell between the digits of a pair, the colon centred in a 6-cell gap */
const COLS = 32;
const SLOTS = [0, 7, 19, 26];
const COLON_X = 15;
/** five bands of two rows, crest to foot */
const BAND_ROWS = 2;

type Bands = [string, string, string, string, string];

/** each numeral as one path, to mask the bands with */
const NUMERAL_PATHS: Record<string, string> = Object.fromEntries(
  Object.entries(NUMERALS).map(([ch, rows]) => {
    const runs: { x: number; y: number }[] = [];
    rows.forEach((row, y) => {
      for (let x = 0; x < GW; x++) if (row[x] === "#") runs.push({ x, y });
    });
    return [ch, pxPath(runs, 0.02)];
  })
);

/**
 * The numerals' bands for a sun position: night, the twilight and golden
 * hour of its side of the day, and day, blended by elevation. Every ramp
 * starts on paper and stays light enough to read on the tile's dark glass.
 */
function bandsFor(p: ArtPalette, elevation: number, morning: boolean): Bands {
  const night: Bands = [p.paper, p.paper2, mix(p.paper2, p.ion, 0.5), p.ion, mix(p.ion, p.lilac, 0.5)];
  // mornings come up pale and gold, evenings go down deep and red
  const twilight: Bands = morning
    ? [p.paper, mix(p.paper, p.emberLight, 0.5), p.emberLight, mix(p.emberLight, p.ember, 0.6), mix(p.ember, p.flare, 0.25)]
    : [p.paper, p.emberLight, p.ember, mix(p.ember, p.flare, 0.55), mix(p.flare, p.lilac, 0.55)];
  const golden: Bands = morning
    ? [p.paper, mix(p.paper, p.yellow, 0.5), p.yellow, mix(p.yellow, p.ember, 0.5), p.ember]
    : [p.paper, p.yellow, mix(p.yellow, p.ember, 0.6), p.ember, mix(p.ember, p.flare, 0.4)];
  const day: Bands = [p.paper, p.paper, mix(p.paper, p.signalLight, 0.55), p.signalLight, p.signal];
  const stops: [number, Bands][] = [
    [-10, night],
    [-3, twilight],
    [4, golden],
    [16, day],
  ];
  if (elevation <= stops[0][0]) return night;
  for (let i = 1; i < stops.length; i++) {
    const [e1, b1] = stops[i];
    if (elevation <= e1) {
      const [e0, b0] = stops[i - 1];
      const t = (elevation - e0) / (e1 - e0);
      return b0.map((c, k) => mix(c, b1[k], t)) as Bands;
    }
  }
  return day;
}

const variants = {
  enter: (roll: boolean) => ({ y: roll ? GH : 0 }),
  still: { y: 0 },
  leave: (roll: boolean) => (roll ? { y: -GH } : { opacity: 0, transition: { duration: 0 } }),
};

/** HH:MM in the numerals: each digit masks the bands laid in its slot,
    and rolls over (inside the mask, which clips it) when it changes */
function Numerals({ time, bands, roll }: { time: string | null; bands: Bands; roll: boolean }) {
  const uid = useId().replace(/[^\w-]/g, "");
  const chars = time ? time.replace(/\D/g, "").split("") : ["-", "-", "-", "-"];
  const glyph = (ch: string) => <path d={NUMERAL_PATHS[ch] ?? NUMERAL_PATHS["-"]} fill="#fff" />;
  const lay = (x: number, w: number) =>
    bands.map((c, b) => <rect key={b} className="app-home-clock-ink" x={x} y={b * BAND_ROWS} width={w} height={BAND_ROWS + 0.02} fill={c} />);
  return (
    <svg className="app-home-clock-digits" viewBox={`0 0 ${COLS} ${GH}`} shapeRendering="crispEdges" aria-hidden focusable="false">
      <defs>
        {chars.map((ch, i) => (
          <mask key={i} id={`${uid}-${i}`} maskUnits="userSpaceOnUse" x={SLOTS[i]} y={0} width={GW} height={GH}>
            <g transform={`translate(${SLOTS[i]} 0)`}>
              {time ? (
                <AnimatePresence initial={false} custom={roll}>
                  <m.g key={ch} custom={roll} variants={variants} initial="enter" animate="still" exit="leave" transition={spring.snappy}>
                    {glyph(ch)}
                  </m.g>
                </AnimatePresence>
              ) : (
                glyph(ch)
              )}
            </g>
          </mask>
        ))}
      </defs>
      {SLOTS.map((x, i) => (
        <g key={i} mask={`url(#${uid}-${i})`}>
          {lay(x, GW)}
        </g>
      ))}
      {/* the colon: two squares, in the bands they sit in */}
      {[2, 6].map((y) => (
        <rect key={y} className="app-home-clock-ink" x={COLON_X} y={y} width={2} height={2} fill={bands[y / BAND_ROWS]} />
      ))}
    </svg>
  );
}

/* ── the weather, as an 11 × 9 glyph: the sky's body (sun, low sun, moon)
   behind the conditions ── */

const SUN = [".....r.....", "..r.....r..", "....sss....", "...sssss...", ".r.sssss.r.", "...sssss...", "....sss....", "..r.....r..", ".....r....."];
const LOW_SUN = ["...........", "...........", "..r.....r..", "....sss....", "...sssss...", ".r.sssss.r.", "hhhhhhhhhhh", "...........", "..........."];
const SMALL_SUN = ["......sss..", ".....sssss.", ".....sssss.", ".....sssss.", "......sss..", "...........", "...........", "...........", "..........."];
const CRESCENT = [".......mmm.", "......mmm..", "......mm...", "......mmm..", ".......mmm.", "...........", "...........", "...........", "..........."];
const CLOUD = ["...........", "...........", "...........", "....ccc....", "..ccccccc..", ".ccccccccc.", "ccccccccccc", ".ddddddddd.", "..........."];
const RAIN_CLOUD = ["....ccc....", "..ccccccc..", ".ccccccccc.", "ccccccccccc", ".ddddddddd.", "...........", "..w..w..w..", ".w..w..w...", "..........."];
const FOG = ["...........", "..fffffff..", "...........", "ffffff.fff.", "...........", ".fff.ffffff", "...........", "..fffffff..", "..........."];
const WIND = ["...........", "......eee..", ".........e.", "eeeeeeeee..", "...........", "eeeeeeeee..", ".........e.", "......eee..", "..........."];

/** the lit part of a 7×7 moon in its real phase (waxing lit on the right), as rows */
function moonRows(phase: number, x0: number, y0: number) {
  const rows = Array.from({ length: 9 }, () => [..."..........."]);
  // never thinner than a readable crescent
  const k = Math.cos(2 * Math.PI * Math.min(0.8, Math.max(0.2, phase)));
  const waxing = phase < 0.5;
  for (let y = -3; y <= 3; y++) {
    for (let x = -3; x <= 3; x++) {
      const nx = x / 3.3;
      const ny = y / 3.3;
      if (nx * nx + ny * ny > 1) continue;
      const half = Math.sqrt(Math.max(0, 1 - ny * ny));
      if (waxing ? nx > k * half : nx < -k * half) rows[y0 + y][x0 + x] = "m";
    }
  }
  return rows.map((r) => r.join(""));
}

function WeatherGlyph({ kind, phase, ms, p }: { kind: WeatherKind; phase: SkyPhase; ms: number; p: ArtPalette }) {
  const ink: Record<string, string> = { s: p.yellow, r: p.ember, h: p.paper3, c: p.paper, d: p.paper2, w: p.ionLight, f: p.paper2, e: p.ember, m: p.paper };
  const night = phase === "night";
  const low = phase === "dawn" || phase === "dusk";
  const layers =
    kind === "clear"
      ? [night ? moonRows(moonPhase(new Date(ms)), 5, 4) : low ? LOW_SUN : SUN]
      : kind === "cloudy"
        ? [night ? CRESCENT : SMALL_SUN, CLOUD]
        : [kind === "rain" ? RAIN_CLOUD : kind === "fog" ? FOG : WIND];
  // later layers cover earlier ones, cell by cell
  const grid = new Map<number, { x: number; y: number; c: string }>();
  for (const rows of layers)
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (row[x] !== ".") grid.set(y * 11 + x, { x, y, c: ink[row[x]] });
    });
  return (
    <svg className="app-home-clock-wx-glyph" viewBox="0 0 11 9" shapeRendering="crispEdges" aria-hidden focusable="false">
      {cellPaths([...grid.values()], (q) => q.c, 0.02).map(({ fill: c, d }) => (
        <path key={c} d={d} fill={c} />
      ))}
    </svg>
  );
}

/* ───────────────────────────── the widget ───────────────────────────── */

type Events = { sunrise: number; sunset: number; dusk: number };

function eventsFor(now: Date): Events {
  const d = sunDay(now);
  const ms = (h: number | null, fb: number) => atLocalHour(h ?? fb, now).getTime();
  return { sunrise: ms(d.sunrise, 6), sunset: ms(d.sunset, 20), dusk: ms(d.dusk, 21) };
}

/** the next change of light after `at` (an instant of today): which, and when */
function nextEvent(at: number, ev: Events): { key: "sunrise" | "sunset" | "night"; ms: number } {
  if (at < ev.sunrise) return { key: "sunrise", ms: ev.sunrise };
  if (at < ev.sunset) return { key: "sunset", ms: ev.sunset };
  if (at < ev.dusk) return { key: "night", ms: ev.dusk };
  const tomorrow = new Date(at + 86_400_000);
  return { key: "sunrise", ms: atLocalHour(sunDay(tomorrow).sunrise ?? 8, tomorrow).getTime() };
}

export function ClockWidget() {
  const { t, lang, path } = useI18n();
  const w = t.home.widgets.clock;
  const now = useMinute();
  const zone = useVisitorZone();
  const { mode } = useSky();
  const wx = useWeather();
  const art = useArtPalette();
  const reduced = useReduced();
  // the hour someone is holding the wallpaper's sun at (null: now)
  const scrub = useSyncExternalStore(sunScrub.subscribe, sunScrub.get, () => null);

  const nowMs = now?.getTime() ?? null;
  const shown = scrub ?? nowMs;
  const ev = useMemo(() => (nowMs == null ? null : eventsFor(new Date(nowMs))), [nowMs]);
  const pinned = mode !== "auto" ? mode : null;

  // the light the wallpaper is painting: the held hour, the pinned phase's, or now
  const lightMs = scrub ?? (nowMs == null ? null : pinned ? pinnedMs(pinned, new Date(nowMs)) : nowMs);
  const skyPhase: SkyPhase = lightMs == null ? "night" : phaseOf(sunAt(lightMs));
  const bands = useMemo(() => {
    if (lightMs == null) return [art.paper, art.paper, art.paper2, art.paper2, art.paper3] as Bands;
    const s = sunAt(lightMs);
    return bandsFor(art, s.elevation, s.hourAngle < 0);
  }, [art, lightMs]);

  /* ── the readout: the hour shown (held or now) ── */
  const time = shown == null ? null : hhmm(new Date(shown), lang);
  const next = shown == null || !ev ? null : nextEvent(shown, ev);
  // "Sunset {time}": the hour itself in full ink
  const [before, after] = next ? w.events[next.key].split("{time}") : ["", ""];
  const offset = now ? offsetMinutes(now, zone) - offsetMinutes(now, PARIS) : 0;
  const you = now && offset !== 0 && scrub == null ? fill(w.you, { time: hhmm(now, lang, zone) }) : "";
  const weather = wx.weather ? fill(w.weather[wx.kind], { temp: wx.weather.temp, wind: wx.weather.wind }) : "";

  /* ── what the tile says: always now ── */
  let label: string = w.title;
  if (now && ev) {
    const n = nextEvent(now.getTime(), ev);
    label = [
      fill(w.aria, { time: hhmm(now, lang), phase: w.phase[phaseOf(sunAt(now))], next: fill(w.events[n.key], { time: hhmm(new Date(n.ms), lang) }) }),
      offset !== 0 ? fill(w.ariaYou, { time: hhmm(now, lang, zone), offset: fmtOffset(offset) }) : "",
      weather ? fill(w.weatherAria, { weather }) : "",
      pinned ? `${fill(w.pinnedLine, { phase: w.phase[pinned] })}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  return (
    <div className="app-home-widget app-home-widget--s app-home-widget--clock">
      <Glass thickness="regular" refract={false} aria-hidden className="app-home-widget-glass" />
      <Link
        prefetch={false}
        href={path("/now")}
        transitionTypes={["app-open"]}
        className="app-home-widget-hit"
        aria-label={`${label} ${fill(w.open, { app: t.shell.apps.now })}`}
      />
      <p className="app-home-clock-head" aria-hidden>
        <span className="app-home-clock-city">{w.title}</span>
        {wx.weather && lightMs != null && (
          <span className="app-home-clock-wx">
            <WeatherGlyph kind={wx.kind} phase={skyPhase} ms={lightMs} p={art} />
            <span className="tabular">{fill(w.temp, { temp: wx.weather.temp })}</span>
          </span>
        )}
      </p>
      <Numerals time={time} bands={bands} roll={!reduced && scrub == null} />
      <div className="app-home-clock-foot" aria-hidden>
        <p className="app-home-clock-next">
          {next ? (
            <>
              {before}
              <span className="app-home-clock-next-time tabular">{hhmm(new Date(next.ms), lang)}</span>
              {after}
            </>
          ) : (
            " "
          )}
        </p>
        {pinned && scrub == null ? (
          <p className="app-home-clock-extra">{fill(w.pinnedLine, { phase: w.phase[pinned] })}</p>
        ) : you ? (
          <p className="app-home-clock-extra tabular">{you}</p>
        ) : wx.kind === "autan" && weather ? (
          // Toulouse's own wind, when it blows
          <p className="app-home-clock-extra" data-kind="autan">
            {weather}
          </p>
        ) : null}
      </div>
    </div>
  );
}
