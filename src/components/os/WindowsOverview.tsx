"use client";

import "./overview.css";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, animate, m, useMotionValue, useTransform, type MotionValue } from "motion/react";
import { useI18n } from "@/i18n/client";
import { useFinePointer, useReduced } from "@/hooks/env";
import { useSpotifyStatus } from "@/hooks/useSpotifyStatus";
import { spring } from "@/lib/motion";
import { useSound } from "@/lib/sound";
import { useToast } from "@/components/Toasts";
import { loadDraft, DRAFT_EVENT } from "@/components/apps/contact/mail";
import { APPS, appForPath, type AppId } from "./apps";
import { AppIcon } from "./icons";
import { useSiteData } from "./SiteData";
import { closeOverview, openOverview, setOverview, stayThroughNavigation, takeStay, useOverviewOpen } from "./overview";
import { closeWorkspace, deskOf, deskWindows, getHomeDesk, moveToDesk, setHomeDesk, useDesks, useWorkspaces } from "./workspaces";
import { attachShot, dropShot, getShot, type Shot } from "./windowShots";
import { fill } from "./menubar/util";

/** a trackpad pinch arrives as ctrl+wheel with fractional deltas (a mouse wheel's are whole) */
const isPinch = (e: WheelEvent) => e.ctrlKey && !Number.isInteger(e.deltaY);

/**
 * Every open window, over the river: each app opened in this visit as a
 * live miniature of its window (its own pixels, as it was left), scattered
 * over the Garonne with a line of what's in it. Numbered workspaces sit
 * on top. Click a window to dive back into it, throw it away to close it,
 * drag it onto another workspace to move it there; Esc, a click on the
 * river or a pinch in puts the windows back. Ctrl+↑ or a trackpad pinch
 * out opens it from anywhere, so do the Dock, Spotlight and, on phones, a
 * swipe up on the tab bar.
 */
export function WindowsOverview() {
  const open = useOverviewOpen();
  const pathname = usePathname();

  // the keyboard and the trackpad, from anywhere
  useEffect(() => {
    let pinch = 0;
    let idle = 0;
    const onWheel = (e: WheelEvent) => {
      if (!isPinch(e)) return;
      const shown = document.documentElement.hasAttribute("data-overview");
      // a pinch out opens it; a pinch in, while it shows, closes it
      if ((!shown && e.deltaY <= 0) || (shown && e.deltaY >= 0)) return;
      e.preventDefault();
      pinch += e.deltaY;
      window.clearTimeout(idle);
      idle = window.setTimeout(() => (pinch = 0), 260);
      if (!shown && pinch > 26) {
        pinch = 0;
        openOverview();
      } else if (shown && pinch < -26) {
        pinch = 0;
        closeOverview();
      }
    };
    // Safari reports a pinch as a gesture
    const onGesture = (e: Event) => {
      const scale = (e as Event & { scale?: number }).scale ?? 1;
      const shown = document.documentElement.hasAttribute("data-overview");
      if (!shown && scale < 0.82) {
        e.preventDefault();
        openOverview();
      } else if (shown && scale > 1.2) {
        e.preventDefault();
        closeOverview();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowUp" || !e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input,textarea,select,[contenteditable='true'],.os-term")) return;
      if (!document.documentElement.hasAttribute("data-overview") && document.querySelector("dialog[open],[aria-modal='true']")) return;
      e.preventDefault();
      setOverview(!document.documentElement.hasAttribute("data-overview"));
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("gesturechange", onGesture);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("gesturechange", onGesture);
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(idle);
    };
  }, []);

  // the windows step back while it shows (overview.css)
  useEffect(() => {
    const root = document.documentElement;
    if (open) root.setAttribute("data-overview", "");
    else root.removeAttribute("data-overview");
    return () => root.removeAttribute("data-overview");
  }, [open]);

  // a navigation (a card, a link, the back button) puts it away
  const shownOn = useRef(pathname);
  useEffect(() => {
    if (open && shownOn.current !== pathname && !takeStay()) closeOverview();
    shownOn.current = pathname;
  }, [pathname, open]);

  return <AnimatePresence>{open && <Layer key="overview" />}</AnimatePresence>;
}

/* ───────────── layout: scattered over the river (desktop), a row (phones) ───────────── */

type Slot = { x: number; y: number; w: number; h: number; r: number };
type Box = { x: number; y: number; w: number; h: number };

/** a little life, never a mess: each card's tilt and its nudge off the grid */
const TILT = [-1.2, 0.8, -0.5, 1.1, -0.9, 0.6];
const NUDGE = [-0.06, -0.11, -0.03, 0.05, 0.08, 0];
/** the room a card's name takes above it */
const LABEL = 40;

function scatter(n: number, vw: number, vh: number, aspect: number): Slot[] {
  if (!n) return [];
  const padX = Math.max(28, vw * 0.045);
  const x0 = padX;
  const x1 = vw - padX;
  // under the menu bar and the workspaces, over the hint and the Dock
  const y0 = 128;
  const y1 = vh - 150;
  let best = { cols: 1, w: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cellW = (x1 - x0) / cols;
    const cellH = (y1 - y0) / rows;
    const w = Math.min(cellW * 0.84, (cellH - LABEL - 20) * aspect, 600);
    if (w > best.w) best = { cols, w };
  }
  const { cols, w } = best;
  const h = w / aspect;
  const rows = Math.ceil(n / cols);
  const cellW = (x1 - x0) / cols;
  const cellH = (y1 - y0) / rows;
  return Array.from({ length: n }, (_, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const inRow = r === rows - 1 ? n - r * cols : cols;
    // the lower row sits a little to the right, like windows set down by hand
    const shift = rows > 1 ? (r % 2 ? 0.07 : -0.03) * cellW : 0;
    const cx = (x0 + x1) / 2 + (c - (inRow - 1) / 2) * cellW + shift;
    const cy = y0 + (r + 0.5) * cellH + LABEL / 2 + NUDGE[i % NUDGE.length] * (cellH - h - LABEL);
    const x = Math.min(Math.max(cx - w / 2, x0), x1 - w);
    const y = Math.min(Math.max(cy - h / 2, y0 + LABEL), y1 - h);
    return { x, y, w, h, r: rows * cols > 1 ? TILT[i % TILT.length] : 0 };
  });
}

/** the size of the viewport, live */
function useViewport() {
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return vp;
}

/** the waiting letter's length in words, or null */
const draftStore = {
  subscribe(cb: () => void) {
    window.addEventListener(DRAFT_EVENT, cb);
    return () => window.removeEventListener(DRAFT_EVENT, cb);
  },
  get(): number | null {
    const d = loadDraft();
    if (!d || !(d.body.trim() || d.subject.trim())) return null;
    return d.body.trim() ? d.body.trim().split(/\s+/).length : 0;
  },
};

function Layer() {
  const { t, path } = useI18n();
  const o = t.shell.overview;
  const router = useRouter();
  const fine = useFinePointer();
  const reduced = useReduced();
  const { blip } = useSound();
  const { notify } = useToast();
  const current = appForPath(usePathname()).id;
  const here: AppId = current === "admin" ? "home" : current;
  // windows thrown away here stay gone, even while the Desktop loads under a closed current one
  const [gone, setGone] = useState<AppId[]>([]);
  const open = useWorkspaces(here).filter((id) => id !== "home" && !gone.includes(id));
  const desks = useDesks();
  const [picked, setView] = useState(() => (here === "home" ? getHomeDesk() : deskOf(desks, here)));
  // a workspace emptied here goes away: fall back to the last one
  const view = Math.min(picked, desks.length - 1);
  const ids = deskWindows(desks, open, view);
  const data = useSiteData();
  const music = useSpotifyStatus(data.spotify);
  const words = useSyncExternalStore(draftStore.subscribe, draftStore.get, () => null);
  const vp = useViewport();
  const phone = vp.w < 768;
  const rootRef = useRef<HTMLDivElement>(null);
  const deskRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [hoverDesk, setHoverDesk] = useState<number | null>(null);
  const [nudged, setNudged] = useState(false);
  const back = useRef<HTMLElement | null>(null);
  // each card can fly back into its window (Esc, a click on the river)
  const fly = useRef(new Map<AppId, () => void>());
  // a drag that ends off a card still clicks the river: not a dismissal
  const dragEnd = useRef(0);
  // the window being dived into rises over the rest, which step aside
  const [diving, setDiving] = useState<AppId | null>(null);

  // every window is the same size: the window on screen sets the shape
  const shape = getShot(here) ?? ids.map(getShot).find(Boolean);
  const aspect = shape ? shape.w / shape.h : phone ? 0.52 : 1.6;
  const slots = useMemo(() => (phone ? [] : scatter(ids.length, vp.w, vp.h, aspect)), [phone, ids.length, vp.w, vp.h, aspect]);
  // where a window sits when it is on screen (cards dive into it)
  const winBox: Box = shape
    ? { x: shape.x, y: shape.y, w: shape.w, h: shape.h }
    : { x: vp.w * 0.06, y: 56, w: vp.w * 0.88, h: vp.h - 160 };

  useEffect(() => {
    back.current = document.activeElement as HTMLElement | null;
    blip("open");
    // warm every window it can dive into
    for (const id of open) {
      const a = APPS.find((x) => x.id === id);
      if (a && id !== here) router.prefetch(path(a.path));
    }
    const id = requestAnimationFrame(() => {
      const card = rootRef.current?.querySelector<HTMLElement>(`[data-ov="${here}"]`) ?? rootRef.current?.querySelector<HTMLElement>("[data-ov]");
      card?.focus({ preventScroll: true });
      // phones: the row scrolls; the current window starts in the middle
      card?.closest("li")?.scrollIntoView({ inline: "center", block: "nearest", behavior: "instant" });
    });
    return () => {
      cancelAnimationFrame(id);
      const b = back.current;
      if (b?.isConnected) b.focus({ preventScroll: true });
    };
    // once, as it opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** what each window holds right now, in a few words */
  const detailOf = (id: AppId): string => {
    switch (id) {
      case "work":
        return fill(o.repos, { n: data.repos.length });
      case "writing":
        return data.posts[0]?.title ?? "";
      case "atlas":
        return fill(o.places, { n: data.places.filter((p) => p.status === "been").length });
      case "now":
        return music.track ? music.track.title : o.nothing;
      case "contact":
        return words === null ? o.letter : words === 1 ? o.draftOne : fill(o.draft, { n: words });
      default:
        return "";
    }
  };

  const deskName = (k: number) => {
    const first = deskWindows(desks, open, k)[0];
    const theme = first ? o.theme[first as keyof typeof o.theme] : o.theme.empty;
    return `${k + 1} · ${theme}`;
  };

  const close = () => {
    // the window on screen shrinks back into place as the rest fades
    fly.current.get(here)?.();
    closeOverview();
  };

  const goTo = (id: AppId) => {
    blip("select");
    if (here === "home") setHomeDesk(view);
    if (id === here) return close();
    const a = APPS.find((x) => x.id === id);
    if (!a) return closeOverview();
    setDiving(id);
    fly.current.get(id)?.();
    // the card grows into the window's place and holds there; the overview
    // goes once the new window is in (the navigation closes it), so the
    // window that was on screen never flashes back in between
    router.push(path(a.path), { scroll: false });
  };

  const closeWin = (id: AppId) => {
    blip("close");
    setGone((g) => [...g, id]);
    closeWorkspace(id);
    dropShot(id);
    notify(fill(o.closed, { app: t.shell.apps[id] }), o.label);
    // the window on screen was the one thrown away: the Desktop takes its place underneath
    if (id === here) {
      stayThroughNavigation();
      router.push(path("/"), { scroll: false });
    }
  };

  const moveWin = (id: AppId, k: number) => {
    blip("select");
    moveToDesk(id, k);
    notify(fill(o.moved, { app: t.shell.apps[id], n: k + 1 }), o.label);
  };

  /** the workspace under the pointer: a desk, one past the last for "new", or null */
  const deskAt = (x: number, y: number): number | null => {
    const els = deskRefs.current;
    for (let k = 0; k < els.length; k++) {
      const r = els[k]?.getBoundingClientRect();
      if (r && x >= r.left - 10 && x <= r.right + 10 && y >= r.top - 12 && y <= r.bottom + 12) return k;
    }
    return null;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const cards = [...(rootRef.current?.querySelectorAll<HTMLElement>("[data-ov]") ?? [])];
    const i = cards.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key) && cards.length && (i >= 0 || !(e.target as Element).closest("[data-desk]"))) {
      e.preventDefault();
      const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
      cards[(i + step + cards.length) % cards.length]?.focus();
    } else if ((e.key === "Delete" || e.key === "Backspace") && i >= 0) {
      e.preventDefault();
      const id = cards[i].dataset.ov as AppId;
      (cards[i + 1] ?? cards[i - 1])?.focus();
      closeWin(id);
    } else if (e.key === "Tab") {
      // focus stays inside: the workspaces, then the windows
      const all = [...(rootRef.current?.querySelectorAll<HTMLElement>("[data-desk],[data-ov]") ?? [])];
      if (!all.length) return;
      e.preventDefault();
      const j = all.indexOf(document.activeElement as HTMLElement);
      all[(j + (e.shiftKey ? -1 : 1) + all.length) % all.length]?.focus();
    }
  };

  const deskCount = desks.length;
  // phones switch between workspaces but don't move windows (a drag up closes one)
  const showNew = !phone && deskCount < 5 && open.length > 1;
  const showDesks = deskCount > 1 || showNew;

  return (
    <m.div
      ref={rootRef}
      className="os-ov"
      data-phone={phone || undefined}
      data-diving={diving ? "" : undefined}
      role="dialog"
      aria-modal="true"
      aria-label={o.label}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: reduced ? 0.12 : 0.26 } }}
      transition={{ duration: reduced ? 0 : 0.2 }}
      onKeyDown={onKeyDown}
      onClick={(e) => {
        // a click on the river (not on a window or a workspace) puts the windows back
        if (performance.now() - dragEnd.current < 400) return;
        if (!(e.target as Element).closest(".os-ov-card,.os-ov-desks")) close();
      }}
    >
      {showDesks && (
      <nav className="os-ov-desks" aria-label={o.desks}>
        {Array.from({ length: deskCount }, (_, k) => (
          <button
            key={k}
            ref={(el) => {
              deskRefs.current[k] = el;
            }}
            type="button"
            className="os-ov-desk tabular"
            data-desk={k}
            aria-pressed={k === view}
            aria-label={`${fill(o.desk, { n: k + 1 })}, ${deskName(k)}`}
            data-drop={hoverDesk === k && k !== view ? "" : undefined}
            onClick={() => {
              blip("select");
              setView(k);
            }}
          >
            {deskName(k)}
          </button>
        ))}
        {showNew && (
          <button
            ref={(el) => {
              deskRefs.current[deskCount] = el;
            }}
            type="button"
            className="os-ov-desk os-ov-desk--new"
            data-desk={deskCount}
            data-drop={hoverDesk === deskCount ? "" : undefined}
            onClick={() => {
              // a new workspace starts with a window in it: say how
              setNudged(true);
              window.setTimeout(() => setNudged(false), 2200);
            }}
          >
            {nudged ? o.dropHere : `+ ${o.newDesk}`}
          </button>
        )}
      </nav>
      )}

      {ids.length ? (
        <ul className="os-ov-scatter" aria-label={o.label}>
          <AnimatePresence initial={false} mode="popLayout">
            {ids.map((id, i) => (
              <Card
                key={id}
                id={id}
                index={i}
                slot={slots[i] ?? null}
                current={id === here}
                diving={id === diving}
                name={t.shell.apps[id]}
                detail={detailOf(id)}
                shot={getShot(id)}
                winBox={winBox}
                phone={phone}
                reduced={reduced}
                fly={fly}
                deskAt={phone ? () => null : deskAt}
                view={view}
                onHoverDesk={setHoverDesk}
                onDragState={(on) => (dragEnd.current = on ? Infinity : performance.now())}
                onGo={goTo}
                onThrow={closeWin}
                onMove={moveWin}
              />
            ))}
          </AnimatePresence>
        </ul>
      ) : (
        <p className="os-ov-empty">{open.length ? o.emptyDesk : o.none}</p>
      )}

      {ids.length > 0 && (
        <p className="os-ov-hint">
          {/* it wraps between its phrases, never inside one, never before a dot */}
          {(fine ? o.hint : o.hintTouch).split(" · ").map((part, i, all) => (
            <span key={i}>
              <span className="os-ov-hint-part">
                {part}
                {i < all.length - 1 && " ·"}
              </span>
              {i < all.length - 1 && " "}
            </span>
          ))}
        </p>
      )}
    </m.div>
  );
}

/** a window's miniature: its cloned DOM, attached once, scaled to the card */
function Thumb({ shot, width, defer = false }: { shot: Shot; width: number; defer?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    if (!defer) return attachShot(shot, box);
    // the others a frame later: the overview's first frame only lays out the window on screen
    let undo: (() => void) | undefined;
    const id = requestAnimationFrame(() => (undo = attachShot(shot, box)));
    return () => {
      cancelAnimationFrame(id);
      undo?.();
    };
    // attached once per card
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot]);
  return (
    <span
      ref={ref}
      className="os-ov-shot"
      inert
      aria-hidden
      style={{ width: shot.w, height: shot.h, transform: `scale(${width / shot.w})` }}
    />
  );
}

/** no miniature yet (a window from before a reload): its icon on a plain window */
function Blank({ id, name }: { id: AppId; name: string }) {
  return (
    <span className="os-ov-blank" aria-hidden>
      <AppIcon app={id} size={48} />
      <span>{name}</span>
    </span>
  );
}

function Card({
  id,
  index,
  slot,
  current,
  diving,
  name,
  detail,
  shot,
  winBox,
  phone,
  reduced,
  fly,
  deskAt,
  view,
  onHoverDesk,
  onDragState,
  onGo,
  onThrow,
  onMove,
}: {
  id: AppId;
  index: number;
  slot: Slot | null;
  current: boolean;
  diving: boolean;
  name: string;
  detail: string;
  shot: Shot | undefined;
  winBox: Box;
  phone: boolean;
  reduced: boolean;
  fly: React.RefObject<Map<AppId, () => void>>;
  deskAt: (x: number, y: number) => number | null;
  view: number;
  onHoverDesk: (k: number | null) => void;
  /** held (true), or let go (false) */
  onDragState: (on: boolean) => void;
  onGo: (id: AppId) => void;
  onThrow: (id: AppId) => void;
  onMove: (id: AppId, k: number) => void;
}) {
  const liRef = useRef<HTMLLIElement>(null);
  const tilt = slot?.r ?? (phone ? TILT[index % TILT.length] * 0.6 : 0);
  // the card as a whole: where it flies from and back to
  const fx = useMotionValue(0);
  const fy = useMotionValue(0);
  const fs = useMotionValue(1);
  const fr = useMotionValue(tilt);
  const labelOpacity = useMotionValue(1);
  // the hand: a drag tilts the card the way it is pulled
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const lean = useTransform(x, [-320, 0, 320], [-9, 0, 9]);
  const fade = useTransform<number, number>([x, y] as MotionValue<number>[], ([a, b]) => {
    const d = Math.hypot(a, b);
    return d < 160 ? 1 : Math.max(0.25, 1 - (d - 160) / 520);
  });
  // over a workspace it shrinks toward it, a window ready to be set down there
  const shrink = useMotionValue(1);
  const over = useRef(false);
  const dragged = useRef(false);
  const [held, setHeld] = useState(false);
  const [gone, setGone] = useState(false);
  const width = slot?.w ?? 0;

  // from the li's box to the window's: the offset and the scale that make the card the window
  const toWindow = () => {
    const li = liRef.current?.getBoundingClientRect();
    if (!li || !li.width) return null;
    return {
      x: winBox.x + winBox.w / 2 - (li.left + li.width / 2),
      y: winBox.y + winBox.h / 2 - (li.top + li.height / 2),
      s: winBox.w / li.width,
    };
  };

  // the window on screen shrinks into its card; the others settle in around it
  useLayoutEffect(() => {
    if (reduced) return;
    const w = current && shot ? toWindow() : null;
    if (w) {
      fx.set(w.x);
      fy.set(w.y);
      fs.set(w.s);
      fr.set(0);
      labelOpacity.set(0);
      animate(fx, 0, spring.gentle);
      animate(fy, 0, spring.gentle);
      animate(fs, 1, spring.gentle);
      animate(fr, tilt, spring.gentle);
      animate(labelOpacity, 1, { duration: 0.2, delay: 0.22 });
    } else {
      fs.set(0.9);
      fy.set(18);
      labelOpacity.set(0);
      const delay = 0.04 + index * 0.035;
      animate(fs, 1, { ...spring.default, delay });
      animate(fy, 0, { ...spring.default, delay });
      animate(labelOpacity, 1, { duration: 0.2, delay: delay + 0.08 });
    }
    // once, as it appears
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // a new layout tilts it anew
  useEffect(() => {
    if (!held) animate(fr, tilt, spring.default);
  }, [tilt, held, fr]);

  // dive in (or back): the card grows into the window's place
  useEffect(() => {
    const map = fly.current;
    map.set(id, () => {
      const w = toWindow();
      if (!w || reduced) return;
      const t = { ...spring.default };
      animate(fx, w.x - x.get(), t);
      animate(fy, w.y - y.get(), t);
      animate(fs, w.s, t);
      animate(fr, 0, t);
      animate(labelOpacity, 0, { duration: 0.1 });
    });
    return () => {
      map.delete(id);
    };
  });

  const throwAway = (vx: number, vy: number) => {
    setGone(true);
    onHoverDesk(null);
    if (reduced) return onThrow(id);
    const v = Math.hypot(vx, vy) || 1;
    // on along the throw, well off screen
    const far = Math.max(window.innerWidth, window.innerHeight) * 0.9;
    const ux = phone ? 0 : vx / v;
    const uy = phone ? -1 : vy / v;
    animate(x, x.get() + ux * far, { type: "spring", velocity: vx, stiffness: 140, damping: 24 });
    animate(y, y.get() + uy * far, { type: "spring", velocity: vy, stiffness: 140, damping: 24 });
    window.setTimeout(() => onThrow(id), 200);
  };

  const settle = (vx: number, vy: number) => {
    animate(x, 0, { ...spring.flick, velocity: vx });
    animate(y, 0, { ...spring.flick, velocity: vy });
  };

  const label = (
    <m.span className="os-ov-label" style={{ opacity: labelOpacity }} aria-hidden>
      <span className="os-ov-label-name">{name}</span>
      {detail && <span className="os-ov-label-detail">{detail}</span>}
    </m.span>
  );

  return (
    <m.li
      ref={liRef}
      layout={!reduced && !held}
      className="os-ov-slot"
      data-diving={diving || undefined}
      style={
        slot
          ? { left: slot.x, top: slot.y, width: slot.w, height: slot.h, zIndex: diving ? 8 : held ? 5 : current ? 2 : 1 }
          : ({ "--ar": shot ? shot.w / shot.h : 0.52, zIndex: diving ? 8 : held ? 5 : 1 } as React.CSSProperties)
      }
      exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.16 } }}
      transition={spring.default}
    >
      {/* where it was, while it is held: put it back there, or throw it */}
      <AnimatePresence>
        {held && !gone && (
          <m.span
            className="os-ov-ghost"
            style={{ rotate: tilt }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.2 } }}
            aria-hidden
          />
        )}
      </AnimatePresence>
      <m.div className="os-ov-fly" style={{ x: fx, y: fy, scale: fs, rotate: fr }}>
        <m.button
          type="button"
          className="os-ov-card"
          data-ov={id}
          data-held={held || undefined}
          aria-current={current ? "page" : undefined}
          aria-label={detail ? `${name}: ${detail}` : name}
          aria-keyshortcuts="Delete"
          style={{ x, y, rotate: lean, opacity: fade }}
          drag={gone ? false : phone ? "y" : true}
          dragConstraints={phone ? { top: 0, bottom: 0 } : undefined}
          dragElastic={phone ? { top: 0.85, bottom: 0.1 } : undefined}
          dragMomentum={false}
          onDragStart={() => {
            dragged.current = true;
            onDragState(true);
            setHeld(true);
          }}
          onDrag={(_, info) => {
            const k = deskAt(info.point.x - window.scrollX, info.point.y - window.scrollY);
            const on = k !== null && k !== view;
            onHoverDesk(on ? k : null);
            if (on !== over.current) {
              over.current = on;
              animate(shrink, on ? 0.42 : 1, spring.snappy);
            }
          }}
          onDragEnd={(_, info) => {
            window.setTimeout(() => (dragged.current = false), 0);
            onDragState(false);
            setHeld(false);
            over.current = false;
            const k = deskAt(info.point.x - window.scrollX, info.point.y - window.scrollY);
            onHoverDesk(null);
            if (k !== null && k !== view) {
              setGone(true);
              onMove(id, k);
              return;
            }
            animate(shrink, 1, spring.snappy);
            const vx = info.velocity.x;
            const vy = info.velocity.y;
            if (phone) {
              if (info.offset.y < -110 || vy < -650) throwAway(0, Math.min(vy, -900));
              return;
            }
            const dist = Math.hypot(info.offset.x, info.offset.y);
            if (Math.hypot(vx, vy) > 1100 || dist > Math.max(220, width * 0.75)) throwAway(vx || info.offset.x, vy || info.offset.y);
            else settle(vx, vy);
          }}
          onClick={() => {
            if (dragged.current || gone) return;
            onGo(id);
          }}
        >
          <m.span className="os-ov-inner" style={{ scale: shrink }}>
            {label}
            <span className="os-ov-face">{shot && width ? <Thumb shot={shot} width={width} defer={!current} /> : shot && phone ? <PhoneThumb shot={shot} /> : <Blank id={id} name={name} />}</span>
          </m.span>
        </m.button>
      </m.div>
    </m.li>
  );
}

/** phones: the card's width comes from CSS, so the scale is measured */
function PhoneThumb({ shot }: { shot: Shot }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <span ref={ref} className="os-ov-fit">
      {width > 0 && <Thumb shot={shot} width={width} />}
    </span>
  );
}

