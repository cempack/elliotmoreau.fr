"use client";

import "./overview.css";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, animate, m, useMotionValue, useTransform, type MotionValue } from "motion/react";
import { useI18n } from "@/i18n/client";
import { useFinePointer, useReduced } from "@/hooks/env";
import { useSpotifyStatus } from "@/hooks/useSpotifyStatus";
import { spring, springCss } from "@/lib/motion";
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
import { useContextMenu } from "./context/ContextMenu";

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

  // phones lay their row out in CSS, every card one size: one is measured,
  // once, after everything is in (the one read the opening makes)
  const cardW = useRef(0);
  const fitters = useRef(new Set<() => void>());
  const layoutKey = `${ids.join(",")}|${vp.w}x${vp.h}`;
  useLayoutEffect(() => {
    if (!phone) return;
    const li = rootRef.current?.querySelector<HTMLElement>(".os-ov-slot");
    if (!li) return;
    cardW.current = li.clientWidth;
    for (const fit of fitters.current) fit();
  }, [phone, layoutKey]);

  // focus lands with the first frame, on the window on screen
  useLayoutEffect(() => {
    back.current = document.activeElement as HTMLElement | null;
    const card = rootRef.current?.querySelector<HTMLElement>(`[data-ov="${here}"]`) ?? rootRef.current?.querySelector<HTMLElement>("[data-ov]");
    card?.focus({ preventScroll: true });
    return () => {
      const b = back.current;
      if (b?.isConnected) b.focus({ preventScroll: true });
    };
    // once, as it opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    blip("open");
    // warm every window it can dive into, once the opening has played
    const t = window.setTimeout(() => {
      for (const id of open) {
        const a = APPS.find((x) => x.id === id);
        if (a && id !== here) router.prefetch(path(a.path));
      }
    }, 450);
    return () => window.clearTimeout(t);
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

  // right-click a window: go to it, move it to another workspace, or close it
  useContextMenu(rootRef, ({ target }) => {
    const id = target.closest<HTMLElement>("[data-ov]")?.dataset.ov as AppId | undefined;
    if (!id || !open.includes(id)) return null;
    const c = t.shell.context;
    const at = deskOf(desks, id);
    return {
      final: true,
      items: [
        { label: c.open, onSelect: () => goTo(id) },
        {
          label: c.moveTo,
          submenu: Array.from({ length: desks.length + 1 }, (_, k) => ({
            label: fill(o.desk, { n: k + 1 }),
            checked: k === at,
            onSelect: () => k !== at && moveWin(id, k),
          })),
        },
        { label: c.close, onSelect: () => closeWin(id) },
      ],
    };
  });

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
                cardW={cardW}
                fitters={fitters}
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

/**
 * The miniatures go in one per frame after the first (the window on screen
 * goes in at once, it is what flies): each frame styles and lays out one
 * window, never all of them, while the cards' motion runs on the compositor.
 */
const attachQueue: (() => void)[] = [];
let attachRaf = 0;
function runAttach() {
  attachRaf = 0;
  attachQueue.shift()?.();
  if (attachQueue.length) attachRaf = requestAnimationFrame(runAttach);
}
function queueAttach(fn: () => void) {
  attachQueue.push(fn);
  if (!attachRaf) attachRaf = requestAnimationFrame(runAttach);
  return () => {
    const k = attachQueue.indexOf(fn);
    if (k >= 0) attachQueue.splice(k, 1);
  };
}

/** a window's miniature: its cloned DOM, attached once, scaled to the card */
function Thumb({
  shot,
  width,
  now,
  cardW,
  fitters,
}: {
  shot: Shot;
  /** the slot's width (desks); phones take the row's measured card width */
  width?: number;
  now: boolean;
  cardW: React.RefObject<number>;
  fitters: React.RefObject<Set<() => void>>;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  // the scale, refitted when the card changes size (a write only: nothing here reads layout)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const w = width ?? cardW.current;
      if (w) el.style.setProperty("transform", `scale(${w / shot.w})`);
    };
    fit();
    const set = fitters.current;
    set.add(fit);
    return () => {
      set.delete(fit);
    };
  }, [shot, width, cardW, fitters]);
  // the clone goes in once
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let undo: (() => void) | undefined;
    const attach = () => (undo = attachShot(shot, el));
    let cancel = () => {};
    if (now) attach();
    else cancel = queueAttach(attach);
    return () => {
      cancel();
      undo?.();
    };
  }, [shot, now]);
  return <span ref={ref} className="os-ov-shot" inert aria-hidden style={{ width: shot.w, height: shot.h }} />;
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
  cardW,
  fitters,
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
  cardW: React.RefObject<number>;
  fitters: React.RefObject<Set<() => void>>;
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
  const flyRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const tilt = slot?.r ?? (phone ? TILT[index % TILT.length] * 0.6 : 0);
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
  const width = slot?.w;

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

  // the window on screen shrinks into its card; the others settle in around it.
  // All of it on the compositor (WAAPI): the miniatures being laid out on the
  // main thread meanwhile never cost the motion a frame.
  useLayoutEffect(() => {
    const el = flyRef.current;
    const li = liRef.current;
    if (!el || !li || reduced) return;
    // phones: the row scrolls, and the window on screen starts in its middle
    const row = li.parentElement;
    if (phone && current && row) row.scrollLeft = li.offsetLeft - (row.clientWidth - li.offsetWidth) / 2;
    const w = current && shot ? toWindow() : null;
    const label = labelRef.current;
    if (w) {
      const { duration, easing } = springCss(0.5);
      el.animate([{ transform: `translate(${w.x}px, ${w.y}px) scale(${w.s})`, rotate: "0deg" }, { transform: "none", rotate: `${tilt}deg` }], { duration, easing });
      label?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: 220, easing: "ease-out", fill: "backwards" });
    } else {
      const delay = 40 + index * 35;
      const { duration, easing } = springCss(0.35);
      el.animate([{ transform: "translateY(18px) scale(0.9)" }, { transform: "none" }], { duration, easing, delay, fill: "backwards" });
      li.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay, easing: "ease-out", fill: "backwards" });
      label?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: delay + 80, easing: "ease-out", fill: "backwards" });
    }
    // once, as it appears
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // a window closed or moved away: the others glide to their new places (known, never measured)
  const prev = useRef<{ slot: Slot | null; index: number } | null>(null);
  const place = slot ? `${slot.x},${slot.y},${slot.w}` : `${index}`;
  useLayoutEffect(() => {
    const li = liRef.current;
    const p = prev.current;
    prev.current = { slot, index };
    if (!li || !p || reduced) return;
    const { duration, easing } = springCss(0.35);
    if (slot && p.slot) {
      const from = `translate(${p.slot.x - slot.x}px, ${p.slot.y - slot.y}px) scale(${p.slot.w / slot.w})`;
      li.animate([{ transform: from, transformOrigin: "0 0" }, { transform: "none", transformOrigin: "0 0" }], { duration, easing });
    } else if (!slot && p.index !== index && cardW.current) {
      // phones: a row, one card and a 1.125rem gap per place
      li.animate([{ transform: `translateX(${(p.index - index) * (cardW.current + 18)}px)` }, { transform: "none" }], { duration, easing });
    }
    // only when its place changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place]);

  // dive in (or back): the card grows into the window's place, from wherever it is right now
  useEffect(() => {
    const map = fly.current;
    map.set(id, () => {
      const el = flyRef.current;
      const w = toWindow();
      if (!el || !w || reduced) return;
      const cs = getComputedStyle(el);
      const from = { transform: cs.transform, rotate: cs.rotate };
      for (const a of el.getAnimations()) a.cancel();
      const { duration, easing } = springCss(0.35);
      el.animate([from, { transform: `translate(${w.x - w.s * x.get()}px, ${w.y - w.s * y.get()}px) scale(${w.s})`, rotate: "0deg" }], { duration, easing, fill: "forwards" });
      labelRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, fill: "forwards" });
    });
    return () => {
      map.delete(id);
    };
  });

  /* the hand, by pointer events (a drag library would measure every card as
     it mounts, a full layout each, just to be ready): a card follows the
     pointer, leans the way it is pulled, and is thrown, set down on a
     workspace or springs back. On phones only a pull up is the card's (the
     row pans sideways natively), held back as it goes down. */
  const hand = useRef<{ id: number; sx: number; sy: number; on: boolean; trail: { t: number; x: number; y: number }[] } | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (gone || e.button !== 0 || hand.current) return;
    hand.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, on: false, trail: [{ t: e.timeStamp, x: e.clientX, y: e.clientY }] };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const h = hand.current;
    if (!h || h.id !== e.pointerId) return;
    const dx = e.clientX - h.sx;
    const dy = e.clientY - h.sy;
    if (!h.on) {
      if (Math.hypot(dx, dy) < 5) return;
      // a sideways swipe on a phone is the row's
      if (phone && Math.abs(dx) > Math.abs(dy)) {
        hand.current = null;
        return;
      }
      h.on = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      x.stop();
      y.stop();
      dragged.current = true;
      onDragState(true);
      setHeld(true);
    }
    h.trail.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
    if (h.trail.length > 8) h.trail.shift();
    if (phone) y.set(dy < 0 ? dy * 0.85 : dy * 0.1);
    else {
      x.set(dx);
      y.set(dy);
    }
    const k = deskAt(e.clientX, e.clientY);
    const on = k !== null && k !== view;
    onHoverDesk(on ? k : null);
    if (on !== over.current) {
      over.current = on;
      animate(shrink, on ? 0.42 : 1, spring.snappy);
    }
  };
  const endDrag = (e: React.PointerEvent<HTMLButtonElement>, cancelled: boolean) => {
    const h = hand.current;
    if (!h || h.id !== e.pointerId) return;
    hand.current = null;
    if (!h.on) return;
    window.setTimeout(() => (dragged.current = false), 0);
    onDragState(false);
    setHeld(false);
    over.current = false;
    onHoverDesk(null);
    const k = cancelled ? null : deskAt(e.clientX, e.clientY);
    if (k !== null && k !== view) {
      setGone(true);
      onMove(id, k);
      return;
    }
    animate(shrink, 1, spring.snappy);
    // the hand's speed over its last few moves, px/s
    const a = h.trail.find((p) => e.timeStamp - p.t < 100) ?? h.trail[0];
    const dt = Math.max(1, e.timeStamp - a.t) / 1000;
    const vx = cancelled ? 0 : (e.clientX - a.x) / dt;
    const vy = cancelled ? 0 : (e.clientY - a.y) / dt;
    const ox = e.clientX - h.sx;
    const oy = e.clientY - h.sy;
    if (phone) {
      if (!cancelled && (oy < -110 || vy < -650)) throwAway(0, Math.min(vy, -900));
      else settle(0, vy * 0.1);
      return;
    }
    const dist = Math.hypot(ox, oy);
    if (!cancelled && (Math.hypot(vx, vy) > 1100 || dist > Math.max(220, (width ?? 0) * 0.75))) throwAway(vx || ox, vy || oy);
    else settle(vx, vy);
  };

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
    <span ref={labelRef} className="os-ov-label" aria-hidden>
      <span className="os-ov-label-name">{name}</span>
      {detail && <span className="os-ov-label-detail">{detail}</span>}
    </span>
  );

  return (
    <m.li
      ref={liRef}
      className="os-ov-slot"
      data-diving={diving || undefined}
      style={
        slot
          ? { left: slot.x, top: slot.y, width: slot.w, height: slot.h, zIndex: diving ? 8 : held ? 5 : current ? 2 : 1 }
          : ({ "--ar": shot ? shot.w / shot.h : 0.52, zIndex: diving ? 8 : held ? 5 : 1 } as React.CSSProperties)
      }
      exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.16 } }}
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
      <div ref={flyRef} className="os-ov-fly" style={{ rotate: `${tilt}deg` }}>
        <m.button
          type="button"
          className="os-ov-card"
          data-ov={id}
          data-held={held || undefined}
          aria-current={current ? "page" : undefined}
          aria-label={detail ? `${name}: ${detail}` : name}
          aria-keyshortcuts="Delete"
          style={{ x, y, rotate: lean, opacity: fade }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => endDrag(e, false)}
          onPointerCancel={(e) => endDrag(e, true)}
          onClick={() => {
            if (dragged.current || gone) return;
            onGo(id);
          }}
        >
          <m.span className="os-ov-inner" style={{ scale: shrink }}>
            {label}
            <span className="os-ov-face">{shot ? <Thumb shot={shot} width={width} now={current} cardW={cardW} fitters={fitters} /> : <Blank id={id} name={name} />}</span>
          </m.span>
        </m.button>
      </div>
    </m.li>
  );
}
