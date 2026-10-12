"use client";

import "./room.css";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/client";
import { useFinePointer, useReduced } from "@/hooks/env";
import { useSpotifyStatus } from "@/hooks/useSpotifyStatus";
import { timeAgo } from "@/lib/format";
import { loc } from "@/lib/content";
import { useSound } from "@/lib/sound";
import { useSky } from "@/components/os/sky";
import { useWeather } from "@/components/os/weather";
import { useSiteData } from "@/components/os/SiteData";
import { homeSpot } from "@/components/os/wallpaper/sunClock";
import { ROOM_H, ROOM_W, paintRoom, type Rect, type RoomSpots } from "./roomArt";
import { intersects } from "../desktop/physics";
import { menubarPx } from "../desktop/layout";

/* whether the room is open, and the point it opened from (the lit window's centre) */
let state: { open: boolean; from: { x: number; y: number } | null } = { open: false, from: null };
const subs = new Set<() => void>();
const setRoom = (open: boolean, from: { x: number; y: number } | null = state.from) => {
  state = { open, from };
  subs.forEach((f) => f());
};
const useRoom = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => {
        subs.delete(f);
      };
    },
    () => state,
    () => state
  );

const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));
const parisHM = () => {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "numeric", minute: "numeric", hour12: false }).formatToParts(new Date());
  return { hour: Number(p.find((x) => x.type === "hour")?.value ?? 0), minute: Number(p.find((x) => x.type === "minute")?.value ?? 0) };
};

/** an element's box as laid out, transforms aside (the desk rises in as the boot clears) */
const layoutRect = (el: HTMLElement) => {
  let x = 0;
  let y = 0;
  for (let n: HTMLElement | null = el; n; n = n.offsetParent as HTMLElement | null) {
    x += n.offsetLeft;
    y += n.offsetTop;
  }
  return { left: x, top: y, right: x + el.offsetWidth, bottom: y + el.offsetHeight };
};
type Side = "above" | "below" | "start" | "end";
const inflate = (q: { left: number; top: number; right: number; bottom: number }, d: number) => ({
  left: q.left - d,
  top: q.top - d,
  right: q.right + d,
  bottom: q.bottom + d,
});

/**
 * The door: on the wallpaper, one window on the quay is always lit
 * (Elliot's room). It is marked like a map marks a place: corner brackets
 * round that one window and its name on a plate above, on a leader line,
 * always there. Hover or focus tightens the brackets and lights the
 * plate; a click or a tap goes through the glass. The plate never lands
 * on the widgets, the icons or the caption: a phone's home screen can
 * reach down to the window, so then it hangs below it, or beside it, or
 * (nowhere free) the brackets stand alone. A window under the icons has
 * no door.
 */
export function LitWindow() {
  const { t } = useI18n();
  const r = t.home.room;
  const spot = useSyncExternalStore(homeSpot.subscribe, homeSpot.get, () => null);
  const { open } = useRoom();
  const { blip } = useSound();
  const ref = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const door = ref.current;
    const scene = door?.closest<HTMLElement>(".app-home-scene");
    if (!door || !scene) return;
    const place = () => {
      const tag = door.querySelector<HTMLElement>(".app-home-door-tag");
      if (!tag) return;
      const boxes = Array.from(scene.querySelectorAll<HTMLElement>(".app-home-widget, .app-home-icon, .app-home-caption"))
        .filter((el) => el.getClientRects().length)
        .map(layoutRect);
      const g = door.getBoundingClientRect();
      const cx = g.left + g.width / 2;
      const cy = g.top + g.height / 2;
      if (boxes.some((b) => cx > b.left && cx < b.right && cy > b.top && cy < b.bottom)) {
        door.dataset.side = "hidden";
        return;
      }
      const blockers = boxes.map((b) => inflate(b, 6));
      const top = menubarPx() + 4;
      const bar = document.querySelector(".os-tabbar")?.getBoundingClientRect();
      const bottom = (bar && bar.height ? bar.top : window.innerHeight) - 4;
      const fits = (q: DOMRect) =>
        q.top >= top && q.bottom <= bottom && q.left >= 4 && q.right <= window.innerWidth - 4 && !blockers.some((b) => intersects(q, b));
      const order: Side[] = ["above", "below", cx > window.innerWidth / 2 ? "start" : "end"];
      for (const side of order) {
        door.dataset.side = side;
        if (fits(tag.getBoundingClientRect())) return;
      }
      door.dataset.side = "bare";
    };
    place();
    // the widgets settle as their data arrives, and the screen turns
    const ro = new ResizeObserver(place);
    for (const el of scene.querySelectorAll(".app-home-widgets, .app-home-icons")) ro.observe(el);
    return () => ro.disconnect();
  }, [spot]);

  if (!spot) return null;
  const cx = spot.x + spot.w / 2;
  const cy = spot.y + spot.h / 2;
  // the plate stays on screen: near an edge it hangs to the inside
  const vw = typeof window === "undefined" ? 1440 : window.innerWidth;
  const align = cx > vw - 80 ? "end" : cx < 80 ? "start" : "center";
  return (
    <button
      ref={ref}
      type="button"
      className="app-home-door"
      data-no-drag
      data-align={align}
      aria-label={r.doorLabel}
      aria-expanded={open}
      style={
        {
          left: cx,
          top: cy,
          "--w": `${spot.w + spot.cell * 2}px`,
          "--h": `${spot.h + spot.cell * 2}px`,
          "--ww": `${spot.w}px`,
          "--wh": `${spot.h}px`,
        } as React.CSSProperties
      }
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => {
        blip("open");
        setRoom(true, { x: cx, y: cy });
      }}
    >
      <span className="app-home-door-frame" aria-hidden />
      <span className="app-home-door-tag" aria-hidden>
        <span className="app-home-door-label">{r.door}</span>
      </span>
    </button>
  );
}

type Spot = { id: keyof RoomSpots; k: string; title: string; sub: string; go: () => void };

/**
 * Elliot's room, behind the lit window (roomArt.ts paints it): everything
 * in it is live and opens its app. The laptop shows the last push, the
 * turntable what's playing (the sleeve is the real cover), the shelf the
 * posts, the board the trips, the tray a letter; the window looks back
 * over the river in today's light and goes back out. Hover or focus names
 * a thing; on touch a first tap names it and a second opens it. Phones pan
 * across the room with a finger.
 */
export function Room() {
  const { open, from } = useRoom();
  // it stays mounted through its exit: shown from the moment it opens until it has left
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);
  if (!shown || typeof document === "undefined") return null;
  return createPortal(<RoomLayer from={from} leaving={!open} onGone={() => setShown(false)} />, document.body);
}

function RoomLayer({ from, leaving, onGone }: { from: { x: number; y: number } | null; leaving: boolean; onGone: () => void }) {
  const { t, path, lang } = useI18n();
  const r = t.home.room;
  const router = useRouter();
  const reduced = useReduced();
  const fine = useFinePointer();
  const { blip } = useSound();
  const sky = useSky();
  const wx = useWeather();
  const data = useSiteData();
  const music = useSpotifyStatus(data.spotify);
  const layerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const [view, setView] = useState({ w: 0, h: 0 });
  const [spots, setSpots] = useState<RoomSpots | null>(null);
  const [named, setNamed] = useState<keyof RoomSpots | null>(null);
  // once a first thing is named, its tag says the rest: the hint steps aside
  const [looked, setLooked] = useState(false);
  const [clock, setClock] = useState(parisHM);

  // the clock on the wall keeps time
  useEffect(() => {
    const id = window.setInterval(() => setClock(parisHM()), 20_000);
    return () => window.clearInterval(id);
  }, []);

  const been = data.places.filter((p) => p.status === "been" && !p.home);
  const posts = data.posts;
  const track = music.track;
  const roomState = useMemo(
    () => ({
      phase: sky.phase,
      rain: wx.kind === "rain",
      posts: posts.length,
      places: been.length,
      hour: clock.hour,
      minute: clock.minute,
      playing: music.playing,
    }),
    [sky.phase, wx.kind, posts.length, been.length, clock, music.playing]
  );

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    setSpots(paintRoom(cv, roomState));
  }, [roomState]);

  // the room covers the screen (phones pan across it)
  useLayoutEffect(() => {
    const onResize = () => setView({ w: window.innerWidth, h: window.innerHeight });
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const scale = view.w ? Math.max(view.w / ROOM_W, view.h / ROOM_H) : 0;
  const stageW = ROOM_W * scale;
  const stageH = ROOM_H * scale;

  // start with the desk in the middle
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !scale) return;
    el.scrollLeft = Math.max(0, 182 * scale - view.w / 2);
  }, [scale, view.w]);

  // in through the glass: the city grows toward the window as the room grows out of it
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const origin = from ? `${from.x}px ${from.y}px` : "50% 50%";
    const city = [document.querySelector<HTMLElement>(".os-wallpaper"), document.querySelector<HTMLElement>(".app-home-scene")].filter(Boolean) as HTMLElement[];
    const scene = document.querySelector<HTMLElement>(".app-home-scene");
    scene?.setAttribute("inert", "");
    if (!leaving) {
      blip("open");
      backRef.current?.focus({ preventScroll: true });
      if (reduced) {
        layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, fill: "both" });
        return;
      }
      const anims = city.map((el) => {
        el.style.transformOrigin = origin;
        return el.animate([{ transform: "scale(1)" }, { transform: "scale(3.2)", opacity: 0.4 }], { duration: 520, easing: "cubic-bezier(0.5, 0, 0.75, 0)", fill: "forwards" });
      });
      layer.style.transformOrigin = origin;
      layer.animate(
        [
          { transform: "scale(0.22)", opacity: 0 },
          { transform: "scale(0.45)", opacity: 1, offset: 0.35 },
          { transform: "scale(1)", opacity: 1 },
        ],
        { duration: 640, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "both" }
      );
      return () => anims.forEach((a) => a.cancel());
    }
    // back out: the room shrinks into the window, the city settles back
    const done = () => {
      scene?.removeAttribute("inert");
      city.forEach((el) => (el.style.transformOrigin = ""));
      onGone();
      const door = document.querySelector<HTMLElement>(".app-home-door");
      door?.focus({ preventScroll: true });
    };
    if (reduced) {
      layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: "both" }).finished.then(done, done);
      return;
    }
    city.forEach((el) => {
      el.style.transformOrigin = origin;
      el.animate([{ transform: "scale(3.2)", opacity: 0.4 }, { transform: "scale(1)", opacity: 1 }], { duration: 520, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "none" });
    });
    layer.animate(
      [
        { transform: "scale(1)", opacity: 1 },
        { transform: "scale(0.3)", opacity: 0 },
      ],
      { duration: 380, easing: "cubic-bezier(0.5, 0, 0.75, 0)", fill: "both" }
    ).finished.then(done, done);
    // once per direction
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving]);

  const leave = () => {
    blip("close");
    setRoom(false);
  };
  const go = (href: string) => {
    blip("select");
    router.push(path(href), { transitionTypes: ["app-open"] });
    setRoom(false);
  };

  // Esc goes back out
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      if (named && !fine) setNamed(null);
      else leave();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const list: Spot[] = [
    {
      id: "laptop",
      k: r.projects,
      title: data.activity?.message ?? t.home.room.projects,
      sub: data.activity ? fill(r.pushed, { repo: data.activity.repo, ago: timeAgo(data.activity.createdAt, lang) }) : "",
      go: () => go("/work"),
    },
    {
      id: "turntable",
      k: r.now,
      title: track?.title ?? r.silent,
      sub: track ? fill(music.playing ? r.playing : r.played, { artist: track.artist }) : "",
      go: () => go("/now"),
    },
    {
      id: "shelf",
      k: r.writing,
      title: posts[0]?.title ?? r.writing,
      sub: posts.length === 1 ? r.postOne : fill(r.posts, { n: posts.length }),
      go: () => go("/writing"),
    },
    {
      id: "board",
      k: r.atlas,
      title: been[0] ? loc(been[0].name, lang) : r.atlas,
      sub: been.length === 1 ? r.placeOne : fill(r.places, { n: been.length }),
      go: () => go("/atlas"),
    },
    { id: "tray", k: r.mail, title: r.write, sub: "", go: () => go("/contact") },
  ];
  // the window first: the desk's things stand in front of it (and stack above it)
  list.unshift({ id: "window", k: r.window, title: r.outside, sub: "", go: leave });

  const at = (q: Rect) => ({ left: q.x * scale, top: q.y * scale, width: q.w * scale, height: q.h * scale });
  /** touch: the room pans the least it takes for a named thing's tag to sit whole on screen */
  const bringIn = (q: Rect, el: HTMLElement | null) => {
    if (!el) return;
    const vw = el.clientWidth;
    const half = Math.min(288, vw - 40) / 2;
    const mid = (q.x + q.w / 2) * scale - el.scrollLeft;
    const need = mid - half < 20 ? mid - half - 20 : mid + half > vw - 20 ? mid + half - (vw - 20) : 0;
    if (need) el.scrollBy({ left: need, behavior: reduced ? "auto" : "smooth" });
  };
  const sleeve = track?.image && spots ? at(spots.sleeve) : null;

  return (
    <div
      ref={layerRef}
      className="app-home-room"
      role="dialog"
      aria-modal="true"
      aria-label={r.label}
      data-leaving={leaving || undefined}
      onPointerDown={(e) => {
        if (!(e.target as Element).closest(".app-home-room-thing, .app-home-room-tag")) setNamed(null);
      }}
    >
      <div ref={scrollRef} className="app-home-room-scroll">
        <div ref={stageRef} className="app-home-room-stage" style={{ width: stageW, height: stageH }}>
          <canvas ref={canvasRef} className="app-home-room-canvas" style={{ width: stageW, height: stageH }} aria-hidden />
          {sleeve && (
            // the record's real cover, on the sleeve against the cabinet
            // eslint-disable-next-line @next/next/no-img-element
            <img src={track!.image} alt="" className="app-home-room-sleeve" style={sleeve} decoding="async" />
          )}
          {spots &&
            list.map((s) => {
              const q = s.id === "turntable" ? merge(spots.turntable, spots.sleeve) : spots[s.id];
              const box = at(q);
              const shown = named === s.id;
              return (
                <div key={s.id} className="app-home-room-spot" style={box}>
                  <button
                    type="button"
                    className="app-home-room-thing"
                    aria-label={[s.k, s.title, s.sub].filter(Boolean).join(". ")}
                    data-named={shown || undefined}
                    onPointerEnter={(e) => e.pointerType === "mouse" && setNamed(s.id)}
                    onPointerLeave={(e) => e.pointerType === "mouse" && setNamed((n) => (n === s.id ? null : n))}
                    onFocus={(e) => {
                      // a tap focuses the button too (Chrome): only keys name a thing on focus there,
                      // or the first tap would already count as the second
                      if (fine || e.currentTarget.matches(":focus-visible")) setNamed(s.id);
                    }}
                    onBlur={() => setNamed((n) => (n === s.id ? null : n))}
                    onClick={(e) => {
                      // touch: the first tap names it, the second goes in
                      const touch = (e.nativeEvent as PointerEvent).pointerType === "touch" || !fine;
                      if (touch && named !== s.id) {
                        setNamed(s.id);
                        setLooked(true);
                        bringIn(q, e.currentTarget.closest<HTMLElement>(".app-home-room-scroll"));
                        blip("tick");
                        return;
                      }
                      s.go();
                    }}
                  />
                  {shown && (
                    <div className="app-home-room-tag" data-side={q.y * scale > stageH * 0.55 ? "up" : "down"} onClick={s.go}>
                      <span className="app-home-room-tag-k">{s.k}</span>
                      <span className="app-home-room-tag-t">{s.title}</span>
                      {s.sub && <span className="app-home-room-tag-s">{s.sub}</span>}
                      {!fine && (
                        <span className="app-home-room-tag-open">
                          {s.id === "window" ? r.back : r.open} <span aria-hidden>→</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      <button ref={backRef} type="button" className="app-home-room-back" aria-label={r.backLabel} onClick={leave}>
        <span aria-hidden>←</span> {r.back}
      </button>
      <p className="app-home-room-hint" data-quiet={(looked && !fine) || undefined}>
        {fine ? r.hint : r.hintTouch}
      </p>
    </div>
  );
}

const merge = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};
