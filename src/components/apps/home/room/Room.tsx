"use client";

import "./room.css";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useI18n } from "@/i18n/client";
import { useSound } from "@/lib/sound";
import { homeSpot } from "@/components/os/wallpaper/sunClock";
import { intersects } from "../desktop/physics";
import { menubarPx } from "../desktop/layout";
import { forgetRoom, setRoom, useRoom } from "./store";

/* the room itself (its scene and the 3D renderer) is only fetched for a
   desktop that shows the lit window, a beat after it settles or as soon
   as a pointer comes near the door */
const loadLayer = () => import("./RoomLayer");
const RoomLayer = dynamic(() => loadLayer().then((m) => m.RoomLayer), { ssr: false });

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

  // the room's code, once the Desktop has settled (Safari has no requestIdleCallback)
  useEffect(() => {
    if (typeof window.requestIdleCallback !== "function") {
      const id = window.setTimeout(loadLayer, 2500);
      return () => window.clearTimeout(id);
    }
    const id = window.requestIdleCallback(() => void loadLayer(), { timeout: 4000 });
    return () => window.cancelIdleCallback(id);
  }, []);

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
      onPointerEnter={() => void loadLayer()}
      onFocus={() => void loadLayer()}
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
  useEffect(() => forgetRoom, []);
  if (!shown || typeof document === "undefined") return null;
  return createPortal(<RoomLayer from={from} leaving={!open} onGone={() => setShown(false)} />, document.body);
}
