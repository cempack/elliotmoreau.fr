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
import { CELL, pixelLoop } from "@/lib/pixel3d";
import { coverPixels, makeRoundRoom, THINGS, type Rect, type RoundRoom, type Thing } from "./round/scene";
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

type Spot = { id: Thing; k: string; title: string; sub: string; go: () => void };

/**
 * Elliot's room, behind the lit window, in the round (round/scene.ts draws
 * it): everything in it is live and opens its app. The laptop shows the
 * last push, the deck what's playing (the sleeve is the real cover, in the
 * room's pixels), the shelf the posts, the board the trips, the tray a
 * letter; the window looks back over the river in today's light and goes
 * back out. Drag to turn the room (the arrow keys too). Hover or focus
 * names a thing; on touch a first tap names it and a second opens it.
 */
export function Room() {
  const { open, from } = useRoom();
  // it stays mounted through its exit: shown from the moment it opens until it has left
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);
  // left some other way (an app opened from the Dock, Spotlight, the address bar): the room is
  // closed for good, or coming back to the Desktop would zoom straight back into it
  useEffect(
    () => () => {
      state = { open: false, from: null };
    },
    []
  );
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
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const sceneRef = useRef<RoundRoom | null>(null);
  const wakeRef = useRef<() => void>(() => {});
  // where each thing landed on screen (css px), once the room is still; null while it turns
  const [spots, setSpots] = useState<Partial<Record<Thing, Rect>> | null>(null);
  const [named, setNamed] = useState<Thing | null>(null);
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
  // the cover, read back so it can be painted in the room's pixels (Spotify's CDN allows it)
  const [cover, setCover] = useState<{ src: string; img: HTMLImageElement } | null>(null);
  const coverSrc = track?.image ?? "";
  useEffect(() => {
    if (!coverSrc) return;
    let live = true;
    const load = (cors: boolean) => {
      const img = new Image();
      if (cors) img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.onload = () => live && setCover({ src: coverSrc, img });
      // no CORS: laid on as it is
      img.onerror = () => cors && live && load(false);
      img.src = coverSrc;
    };
    load(true);
    return () => {
      live = false;
    };
  }, [coverSrc]);
  const coverImg = cover && cover.src === coverSrc ? cover.img : null;
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
    [sky.phase, wx.kind, posts.length, been.length, clock.hour, clock.minute, music.playing]
  );

  // the room: a pixel loop that paints when something changes and while it turns
  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    const scene = makeRoundRoom(reduced);
    sceneRef.current = scene;
    let last = "";
    // the band between the menu bar and the Dock, where the room sits
    const fit = () => {
      const dock = document.querySelector("[data-os-dock]")?.getBoundingClientRect();
      const h = host.clientHeight;
      scene.setBand(menubarPx() / CELL, (dock && dock.height ? Math.min(h, dock.top) : h) / CELL);
    };
    fit();
    const loop = pixelLoop({
      host,
      canvas,
      // its laid-out size: the layer grows out of the window on a transform as it opens
      size: () => [Math.ceil(host.clientWidth / CELL), Math.ceil(host.clientHeight / CELL)],
      frame: (R, tt, dt) => {
        const wait = scene.frame(R, tt, dt);
        if (wait === Infinity) {
          // still: the doors go where the things are
          const b = scene.boxes();
          const key = JSON.stringify(b);
          if (key !== last) {
            last = key;
            const px: Partial<Record<Thing, Rect>> = {};
            for (const t of THINGS) {
              const q = b[t];
              if (q) px[t] = { x: q.x * CELL, y: q.y * CELL, w: q.w * CELL, h: q.h * CELL };
            }
            setSpots(px);
          }
        }
        return wait;
      },
    });
    wakeRef.current = loop.wake;
    const onResize = () => {
      fit();
      loop.wake();
    };
    window.addEventListener("resize", onResize);

    // drag anywhere to turn it (a press that doesn't move is still a click on a thing)
    let drag: { id: number; x: number; y: number; t: number; moved: boolean } | null = null;
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || (e.target as Element).closest(".app-home-room-tag, .app-home-room-back")) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moved) {
        if (Math.hypot(dx, dy) < 6) return;
        drag.moved = true;
        host.setPointerCapture(e.pointerId);
        scene.grab();
        setNamed(null);
        setSpots(null);
        last = "";
      }
      const now = performance.now();
      scene.turn(dx, dy, now - drag.t);
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.t = now;
      loop.wake();
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.moved) {
        scene.release(performance.now() - drag.t > 80);
        loop.wake();
        // the click that ends a turn opens nothing
        const swallow = (c: MouseEvent) => {
          c.stopPropagation();
          c.preventDefault();
        };
        window.addEventListener("click", swallow, { capture: true, once: true });
        window.setTimeout(() => window.removeEventListener("click", swallow, true), 0);
      }
      drag = null;
    };
    host.addEventListener("pointerdown", down);
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerup", up);
    host.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("resize", onResize);
      host.removeEventListener("pointerdown", down);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerup", up);
      host.removeEventListener("pointercancel", up);
      loop.dispose();
      sceneRef.current = null;
    };
  }, [reduced]);

  // what's live in it (the scene is remade when reduced motion flips, so this runs again then)
  const art = useMemo(() => coverPixels(coverImg), [coverImg]);
  useEffect(() => {
    sceneRef.current?.set(roomState, art);
    wakeRef.current();
  }, [roomState, art, reduced]);

  // the named thing lights up
  useEffect(() => {
    if (sceneRef.current?.light(named ? THINGS.indexOf(named) : -1)) wakeRef.current();
  }, [named, reduced]);

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
      // (on the way out, or gone with the Desktop: the wallpaper outlives it, so it is put back as it was)
      return () => {
        anims.forEach((a) => a.cancel());
        city.forEach((el) => (el.style.transformOrigin = ""));
        scene?.removeAttribute("inert");
      };
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

  // the Dock's Desktop icon goes back out too (it is the Desktop already, so on its own it does nothing)
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!(e.target as Element | null)?.closest?.('[data-dock-launch="home"]')) return;
      e.preventDefault();
      leave();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  });

  // Esc goes back out; the arrows turn the room
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        setNamed(null);
        sceneRef.current?.nudge(e.key === "ArrowLeft" ? -0.12 : 0.12);
        wakeRef.current();
        return;
      }
      if (e.key !== "Escape") return;
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
      go: () => go("/blog"),
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

  return (
    <div
      ref={layerRef}
      className="app-home-room"
      role="dialog"
      aria-modal="true"
      aria-label={r.label}
      data-leaving={leaving || undefined}
      onPointerDown={(e) => {
        // (portalled, but still inside the Desktop's React tree: its marquee mustn't start under the room)
        e.stopPropagation();
        if (!(e.target as Element).closest(".app-home-room-thing, .app-home-room-tag")) setNamed(null);
      }}
    >
      {/* first in the tab order: the way out, then each thing in the room */}
      <button ref={backRef} type="button" className="app-home-room-back" aria-label={r.backLabel} onClick={leave}>
        <span aria-hidden>←</span> {r.back}
      </button>
      <div ref={hostRef} className="app-home-room-stage">
        <canvas ref={canvasRef} className="app-home-room-canvas" aria-hidden />
        {spots &&
          list.map((s) => {
            const q = spots[s.id];
            if (!q) return null;
            const shown = named === s.id;
            const cx = q.x + q.w / 2;
            const vw = typeof window === "undefined" ? 1440 : window.innerWidth;
            return (
              <div key={s.id} className="app-home-room-spot" style={{ left: q.x, top: q.y, width: q.w, height: q.h }}>
                <button
                  type="button"
                  className="app-home-room-thing"
                  aria-label={[s.k, s.title, s.sub].filter(Boolean).join(". ")}
                  data-named={shown || undefined}
                  onPointerEnter={(e) => e.pointerType === "mouse" && e.buttons === 0 && setNamed(s.id)}
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
                      blip("tick");
                      return;
                    }
                    s.go();
                  }}
                />
                {shown && (
                  <div
                    className="app-home-room-tag"
                    data-side={q.y + q.h / 2 > (typeof window === "undefined" ? 900 : window.innerHeight) * 0.55 ? "up" : "down"}
                    data-align={cx < 160 ? "start" : cx > vw - 160 ? "end" : undefined}
                    onClick={s.go}
                  >
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

      <p className="app-home-room-hint" data-quiet={(looked && !fine) || undefined}>
        {fine ? r.hint : r.hintTouch}
      </p>
    </div>
  );
}
