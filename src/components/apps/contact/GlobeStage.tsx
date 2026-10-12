"use client";

import { useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { bounce, visibleIcon } from "@/components/os/dock/launch";
import { useAway, usePlaces, useStatus } from "@/components/os/SiteData";
import { distanceKm, focusFor } from "@/components/apps/atlas/geo";
import { paintPlanet, project, route, sunVector, type Camera } from "@/components/apps/atlas/planet";
import { useI18n } from "@/i18n/client";
import { useSound } from "@/lib/sound";
import { clockIn, tzForAway } from "@/lib/tz";
import { cityOfZone, visitorZone } from "@/lib/tzCities";
import type { PlaceRow } from "@/lib/content";
import type { Phase } from "./Compose";
import { activationFresh, fill } from "./mail";

/**
 * The stage beside the letter: a small planet in the Atlas's inks, lit by
 * the real sun, with the route a letter takes from the visitor's city (read
 * from their browser's time zone: no prompt, nothing sent) to Toulouse, or
 * to wherever Elliot is this week. The envelope waits over their city and
 * lifts a little while they type. Send seals it; it then flies the great
 * circle, out of their daylight and into his, and lands with a few pixels
 * thrown out (the Dock's Mail icon bounces too).
 *
 * The mail-app path keeps the browser's rule: the app is opened at once,
 * while the click still counts, and the flight plays after; when the click
 * no longer counts, the letter seals in place and the card offers the
 * button. Reduced motion: it seals and appears at the other end.
 *
 * Everything is painted on demand: the planet once per size and every
 * minute for the terminator, the route and envelope only while they move.
 */

export type StageHandle = {
  /** seal and fly; with `gate` (the server is sending), fly only once it says delivered */
  send: (gate?: Promise<boolean>) => void;
  /** the mail app was just opened by a click: the sealed letter makes the trip */
  deliver: (from?: Element | null) => void;
  /** back to writing: the letter waits over the visitor's city again */
  reset: () => void;
};

/** CSS px per planet pixel, as on the Atlas */
const CELL = 3;
const FLIGHT_MS = 1700;
const BURST_MS = 650;
const PAPER = "#efe6d4";
const PAPER_EDGE = "#b9ab90";
const STAMP = "#f0334a";
const ROUTE = "rgba(242, 212, 154, 0.95)";
const ROUTE_DIM = "rgba(242, 212, 154, 0.4)";

/** the envelope, in cells: 9 wide, open (flap up) or sealed */
function drawEnvelope(g: CanvasRenderingContext2D, x: number, y: number, c: number, sealed: boolean, stamp: boolean) {
  const r = (i: number, j: number, w: number, h: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(Math.round(x + i * c), Math.round(y + j * c), Math.ceil(w * c), Math.ceil(h * c));
  };
  r(0.5, 0.5, 9, 6, "rgba(0,0,0,0.35)");
  if (!sealed) {
    // the flap stands open above the pocket
    r(1, -2, 7, 1, PAPER_EDGE);
    r(2, -3, 5, 1, PAPER_EDGE);
    r(3, -4, 3, 1, PAPER_EDGE);
  }
  r(0, 0, 9, 6, PAPER);
  r(0, 5, 9, 1, PAPER_EDGE);
  // the V of the flap
  for (let k = 0; k < 4; k++) {
    r(k, k, 1, 1, PAPER_EDGE);
    r(8 - k, k, 1, 1, PAPER_EDGE);
  }
  if (stamp) r(6, 1, 2, 2, STAMP);
}

type Flight = { t0: number; deliver: boolean; land: boolean };

export function GlobeStage({
  ref,
  phase,
  stamped,
  lifted,
  reduced,
  onLand,
  doneLabel,
}: {
  ref?: React.Ref<StageHandle>;
  phase: Phase;
  /** the meter has struck its postmark on the letter */
  stamped: boolean;
  lifted: boolean;
  reduced: boolean;
  /** time to hand over (or the server said yes); `canOpen` is false when the browser would refuse */
  onLand: (canOpen: boolean) => boolean;
  doneLabel?: string;
}) {
  const { t, lang } = useI18n();
  const c = t.contact;
  const g = c.globe;
  const { blip } = useSound();
  const status = useStatus();
  const away = useAway();
  const places = usePlaces();

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState(0);
  // the visitor's zone is only known in the browser: null until mounted, so the server HTML matches
  const [zone, setZone] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [sealed, setSealed] = useState(false);
  /** where the letter is: over the visitor's city, on its way, or arrived */
  const [where, setWhere] = useState<"here" | "flying" | "there">("here");

  useEffect(() => {
    const tick = () => setNow(new Date());
    queueMicrotask(() => {
      setZone(visitorZone() ?? "");
      tick();
    });
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // where it goes: Elliot's away place when he's travelling, else home
  const home = places.find((p) => p.home) ?? places[0];
  const dest = useMemo(() => {
    const p = away?.place;
    if (p) return { lat: p.lat, lon: p.lon, name: p.name[lang] ?? p.name.en, tz: tzForAway(away) ?? status.workHours.tz };
    if (away?.city && away.tz) return null; // somewhere without coordinates: no route, just the time
    return { lat: home?.lat ?? 43.6047, lon: home?.lon ?? 1.4442, name: "Toulouse", tz: status.workHours.tz };
  }, [away, home, lang, status.workHours.tz]);
  const from = useMemo(() => (zone ? cityOfZone(zone) : null), [zone]);
  const km = from && dest ? distanceKm(from, dest) : 0;
  /** a route worth drawing: far enough to read on a planet */
  const far = from && dest && km > 800;

  const cam: Camera = useMemo(() => {
    if (!dest) return { lat: 30, lon: 0, zoom: 1 };
    const destRow = { id: "dest", lat: dest.lat, lon: dest.lon, home: true } as PlaceRow;
    if (!far) return { lat: dest.lat - 4, lon: dest.lon - 9, zoom: 2.4 };
    const focus = focusFor({ id: "from", lat: from!.lat, lon: from!.lon } as PlaceRow, { ...destRow, home: false } as PlaceRow);
    const ang = (km / 6371) || 1;
    return { lat: focus.lat, lon: focus.lon, zoom: Math.min(3.2, Math.max(1, 0.62 / ang)) };
  }, [dest, far, from, km]);

  const R = Math.max(18, Math.floor((size / CELL - 10) / 2));
  const path = useMemo(() => (far ? route(from!, dest!, 72).pts : []), [far, from, dest]);

  // ── painting: the planet raster (per size, camera, minute), then the route and the letter ──
  const planet = useRef<HTMLCanvasElement | null>(null);
  const flight = useRef<Flight | null>(null);
  const burst = useRef(0);
  const raf = useRef(0);
  const live = useRef({ sealed, stamped, lifted, where, path, R, cam, far, dest });
  useEffect(() => {
    live.current = { sealed, stamped, lifted, where, path, R, cam, far, dest };
  });

  const draw = useRef<(ts: number) => boolean>(() => false);
  const loop = useRef<() => void>(() => {});
  const onLandRef = useRef(onLand);
  const blipRef = useRef(blip);
  useEffect(() => {
    onLandRef.current = onLand;
    blipRef.current = blip;
    draw.current = (ts: number) => {
    const cv = canvasRef.current;
    const pl = planet.current;
    if (!cv || !pl) return false;
    const gx = cv.getContext("2d");
    if (!gx) return false;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const { R: r, cam: cm, path: pts, far: isFar, dest: d } = live.current;
    const cs = CELL * dpr;
    const W = cv.width;
    const cx = W / 2;
    const cy = W / 2;
    gx.imageSmoothingEnabled = false;
    gx.clearRect(0, 0, W, W);
    // orbit ring and the planet
    gx.fillStyle = "rgba(58, 60, 122, 0.55)";
    for (let a = 0; a < Math.PI * 2; a += 1 / (r + 4)) {
      if (Math.round(a * (r + 4)) % 3) continue;
      gx.fillRect(Math.round(cx + Math.cos(a) * (r + 4) * cs - cs / 2), Math.round(cy + Math.sin(a) * (r + 4) * cs - cs / 2), cs, cs);
    }
    gx.drawImage(pl, Math.round(cx - (r + 0.5) * cs), Math.round(cy - (r + 0.5) * cs), pl.width * cs, pl.height * cs);
    if (!d) return false;
    const at = (lat: number, lon: number, lift = 1) => {
      const p = project(lat, lon, r, cm, lift);
      return { x: cx + p.x * cs, y: cy + p.y * cs, front: p.front && p.x * p.x + p.y * p.y <= (r + 1) * (r + 1) };
    };
    const f = flight.current;
    const prog = f ? Math.min(1, (ts - f.t0) / FLIGHT_MS) : live.current.where === "there" ? 1 : 0;
    const ease = prog < 0.5 ? 4 * prog * prog * prog : 1 - Math.pow(-2 * prog + 2, 3) / 2;
    // the route: faint ahead, bright where the letter has been
    if (isFar && pts.length) {
      for (let k = 0; k < pts.length; k++) {
        const q = at(pts[k].lat, pts[k].lon, pts[k].lift);
        if (!q.front) continue;
        const passed = k / (pts.length - 1) <= ease;
        if (!passed && k % 2) continue;
        gx.fillStyle = passed ? ROUTE : ROUTE_DIM;
        gx.fillRect(Math.round(q.x - cs / 2), Math.round(q.y - cs / 2), cs, cs);
      }
    }
    // markers: a square where the letter starts, home's own at the other end
    const mark = (lat: number, lon: number, col: string) => {
      const q = at(lat, lon);
      if (!q.front) return;
      gx.fillStyle = col;
      const s = cs;
      gx.fillRect(Math.round(q.x - 2 * s), Math.round(q.y - 2 * s), 5 * s, s);
      gx.fillRect(Math.round(q.x - 2 * s), Math.round(q.y + 2 * s), 5 * s, s);
      gx.fillRect(Math.round(q.x - 2 * s), Math.round(q.y - 2 * s), s, 5 * s);
      gx.fillRect(Math.round(q.x + 2 * s), Math.round(q.y - 2 * s), s, 5 * s);
    };
    if (isFar && pts.length) mark(pts[0].lat, pts[0].lon, "#7fc6c9");
    mark(d.lat, d.lon, "#e0c15c");
    // the letter
    const { sealed: sl, stamped: st, lifted: lf } = live.current;
    let ex: number;
    let ey: number;
    let bob = 0;
    if (isFar && pts.length) {
      const k = ease * (pts.length - 1);
      const i0 = Math.floor(k);
      const i1 = Math.min(pts.length - 1, i0 + 1);
      const a0 = at(pts[i0].lat, pts[i0].lon, pts[i0].lift);
      const a1 = at(pts[i1].lat, pts[i1].lon, pts[i1].lift);
      ex = a0.x + (a1.x - a0.x) * (k - i0);
      ey = a0.y + (a1.y - a0.y) * (k - i0);
    } else {
      // no route to draw: it drops from above onto home
      const q = at(d.lat, d.lon);
      ex = q.x;
      ey = q.y - (1 - ease) * 10 * cs;
    }
    if (!f && live.current.where === "here" && lf) bob = Math.round(Math.sin(ts / 160) * 1.2) * cs;
    const shown = live.current.where !== "there" || !f;
    if (shown) drawEnvelope(gx, ex - 4.5 * cs, ey - 9 * cs + bob, cs, sl || prog > 0, st);
    // arrival: eight pixels thrown out from home
    const b = burst.current ? (ts - burst.current) / BURST_MS : 1;
    if (b < 1) {
      const q = at(d.lat, d.lon);
      gx.fillStyle = `rgba(248, 235, 227, ${1 - b})`;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const rr = (4 + b * (k % 2 ? 7 : 9)) * cs;
        gx.fillRect(Math.round(q.x + Math.cos(a) * rr - cs / 2), Math.round(q.y + Math.sin(a) * rr - cs / 2), cs, cs);
      }
    }
    return !!f || b < 1 || (lf && live.current.where === "here" && !reduced);
  };

  loop.current = () => {
    cancelAnimationFrame(raf.current);
    const step = (ts: number) => {
      const f = flight.current;
      if (f && ts - f.t0 >= FLIGHT_MS) {
        flight.current = null;
        setWhere("there");
        live.current.where = "there";
        burst.current = ts;
        if (f.land) onLandRef.current(true);
        const slot = visibleIcon("contact");
        bounce(slot?.querySelector<HTMLElement>("[data-dock-bounce]") ?? null, 10);
        blipRef.current("success");
      }
      if (draw.current(ts)) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };
  });

  // repaint the planet when the size, the camera or the minute changes
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !size || !now) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.round(size * dpr);
    if (cv.width !== px) {
      cv.width = px;
      cv.height = px;
    }
    planet.current ??= document.createElement("canvas");
    paintPlanet(planet.current, R, cam, sunVector(now));
    loop.current();
  }, [size, R, cam, now]);

  // typing lifts the letter a little; stillness lets it rest
  useEffect(() => {
    if (!planet.current) return;
    loop.current();
  }, [lifted, sealed, stamped, where]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const fly = (land: boolean) => {
    setSealed(true);
    setWhere("flying");
    live.current.where = "flying";
    flight.current = { t0: performance.now(), deliver: !land, land };
    loop.current();
  };
  const arriveNow = () => {
    setSealed(true);
    setWhere("there");
    live.current.where = "there";
    loop.current();
  };
  const runs = useRef(0);

  useImperativeHandle(ref, () => ({
    send: (gate) => {
      const run = ++runs.current;
      if (gate) {
        setSealed(true);
        gate.then(
          (ok) => {
            if (runs.current !== run) return;
            if (!ok) return onLandRef.current(false);
            if (reduced) {
              arriveNow();
              onLandRef.current(true);
            } else fly(true);
          },
          () => runs.current === run && onLandRef.current(false)
        );
        return;
      }
      // the mail app opens now, while the click still counts; the flight shows it leaving
      const fresh = activationFresh();
      const opened = onLandRef.current(fresh);
      if (!opened) {
        setSealed(true);
        return;
      }
      if (reduced) arriveNow();
      else fly(false);
    },
    deliver: () => {
      if (reduced) return arriveNow();
      fly(false);
    },
    reset: () => {
      runs.current++;
      flight.current = null;
      burst.current = 0;
      setSealed(false);
      setWhere("here");
      live.current.where = "here";
      loop.current();
    },
  }));

  // ── words: who is where, and what time it is there ──
  const view = useMemo(() => {
    if (!now || zone === null || !dest) return null;
    const there = clockIn(dest.tz, now);
    const mine = zone ? clockIn(zone, now) : "";
    const off = (tz: string) => {
      try {
        const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(now).find((x) => x.type === "timeZoneName")?.value ?? "";
        const m = /GMT([+-])(\d{2}):?(\d{2})?/.exec(p);
        return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
      } catch {
        return 0;
      }
    };
    const diff = zone ? Math.round((off(dest.tz) - off(zone)) / 30) / 2 : 0;
    const gap = diff === 0 ? g.same : fill(diff > 0 ? g.ahead : g.behind, { place: dest.name, h: String(Math.abs(diff)).replace(".", lang === "fr" ? "," : ".") });
    const dist = new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-US").format(Math.round(km / 10) * 10);
    return { there, mine, gap, dist };
  }, [now, zone, dest, km, g, lang]);

  // labels sit beside the markers, in CSS px
  const pin = (lat: number, lon: number) => {
    const p = project(lat, lon, R, cam);
    return { x: size / 2 + p.x * CELL, y: size / 2 + p.y * CELL, front: p.front };
  };
  /** a name sits centred under its marker, kept inside the stage */
  const clampX = (x: number) => Math.min(size - 56, Math.max(56, x));
  const fromPin = far ? pin(from!.lat, from!.lon) : null;
  const destPin = dest ? pin(dest.lat, dest.lon) : null;

  let caption = "";
  if (view && dest) {
    if (phase === "sent" && where !== "flying") caption = doneLabel ? fill(g.landed, { place: dest.name, time: view.there }) : c.outbox;
    else if (phase === "ready") caption = c.waiting;
    else if (far) caption = fill(g.route, { km: view.dist, gap: view.gap });
    else caption = view.mine && view.mine === view.there ? fill(g.near, { place: dest.name }) : fill(g.time, { place: dest.name, time: view.there });
  }

  return (
    <div className="app-contact-globe" data-where={where}>
      <div
        ref={wrapRef}
        className="app-contact-globe-disc"
        role="img"
        aria-label={dest ? (far ? fill(g.label, { from: from!.name, to: dest.name }) : fill(g.labelNear, { to: dest.name })) : c.envelopeLabel}
      >
        <canvas ref={canvasRef} className="app-contact-globe-canvas" aria-hidden />
        {view && fromPin?.front && (
          <span className="app-contact-globe-pin" style={{ left: clampX(fromPin.x), top: fromPin.y }} aria-hidden>
            {from!.name} <i className="tabular">{view.mine}</i>
          </span>
        )}
        {view && dest && destPin?.front && (
          <span className="app-contact-globe-pin" style={{ left: clampX(destPin.x), top: destPin.y }} aria-hidden>
            {dest.name} <i className="tabular">{view.there}</i>
          </span>
        )}
      </div>
      <p className="app-contact-globe-caption" aria-live="polite">
        {caption || " "}
      </p>
    </div>
  );
}
