"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, animate, m, useMotionValue, type Variants } from "motion/react";
import { project, rubberband, spring } from "@/lib/motion";
import { useSound } from "@/lib/sound";
import { useFlick } from "./flick";
import { claimSurface, useSurfaceYield } from "../surface";

/**
 * Menu bar panels. One context owns which panel is open (only ever one),
 * where it is anchored, and how it leaves. Each <MenuItem> pairs a trigger
 * with its panel in the DOM, so the panel grows out of the trigger
 * (transform-origin at the trigger's centre) and exits along the same
 * path. Panels are non-modal dialogs: focus moves in on open, Tab cycles
 * inside, Esc closes and hands focus back to the trigger, a click outside
 * closes. Under 768px they become full-width sheets from the top that
 * can be flung back up from their grabber.
 */

export type PanelId = "about" | "music" | "control" | "notifications";
export type Align = "start" | "center" | "end" | "edge";

type Anchor = {
  left: number;
  top: number;
  width: number;
  originX: number;
  originY: number;
  sheet: boolean;
};

type ExitMode = "settle" | "fling";

type MenuCtx = {
  open: PanelId | null;
  anchor: Anchor | null;
  exit: ExitMode;
  toggle: (id: PanelId, el: HTMLElement, width: number, align: Align) => void;
  hover: (id: PanelId, el: HTMLElement, width: number, align: Align) => void;
  show: (id: PanelId, width: number, align: Align) => void;
  close: (opts?: { focus?: boolean; fling?: boolean }) => void;
  register: (id: PanelId, el: HTMLElement | null) => void;
};

const Ctx = createContext<MenuCtx | null>(null);

export function useMenu() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useMenu outside MenuProvider");
  return v;
}

const SHEET_BELOW = 768;
const GAP = 6;
const EDGE = 8;

function measure(el: HTMLElement, width: number, align: Align): Anchor {
  const r = el.getBoundingClientRect();
  const bar = el.closest("header")?.getBoundingClientRect();
  const vw = bar ? bar.right : document.documentElement.clientWidth;
  const top = Math.round((bar?.bottom ?? r.bottom) + GAP);
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  if (vw < SHEET_BELOW) {
    return { left: EDGE, top, width: vw - EDGE * 2, originX: cx - EDGE, originY: cy - top, sheet: true };
  }
  const w = Math.min(width, vw - EDGE * 2);
  let left =
    align === "start" ? r.left : align === "end" ? r.right - w : align === "edge" ? vw - w - EDGE : cx - w / 2;
  left = Math.round(Math.min(Math.max(left, EDGE), vw - w - EDGE));
  return { left, top, width: w, originX: cx - left, originY: cy - top, sheet: false };
}

export function MenuProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ id: PanelId; anchor: Anchor } | null>(null);
  const [exit, setExit] = useState<ExitMode>("settle");
  const stateRef = useRef(state);
  const triggers = useRef(new Map<PanelId, HTMLElement>());
  const { blip } = useSound();

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const openAt = useCallback((id: PanelId, el: HTMLElement, width: number, align: Align, sound: boolean) => {
    setExit("settle");
    setState({ id, anchor: measure(el, width, align) });
    if (sound) {
      blip("open");
      claimSurface("menu");
    }
  }, [blip]);

  const close = useCallback<MenuCtx["close"]>(
    (opts) => {
      const cur = stateRef.current;
      if (!cur) return;
      setExit(opts?.fling ? "fling" : "settle");
      setState(null);
      blip("close");
      if (opts?.focus) triggers.current.get(cur.id)?.focus({ preventScroll: true });
    },
    [blip]
  );

  const toggle = useCallback<MenuCtx["toggle"]>(
    (id, el, width, align) => {
      const cur = stateRef.current;
      if (cur?.id === id) close();
      else openAt(id, el, width, align, !cur);
    },
    [close, openAt]
  );

  // macOS: once a menu is open, sliding onto a neighbour switches to it
  const hover = useCallback<MenuCtx["hover"]>(
    (id, el, width, align) => {
      const cur = stateRef.current;
      if (cur && cur.id !== id && !cur.anchor.sheet) openAt(id, el, width, align, false);
    },
    [openAt]
  );

  const show = useCallback<MenuCtx["show"]>(
    (id, width, align) => {
      const el = triggers.current.get(id);
      if (!el || el.offsetParent === null) return;
      openAt(id, el, width, align, true);
    },
    [openAt]
  );

  const register = useCallback<MenuCtx["register"]>((id, el) => {
    if (el) triggers.current.set(id, el);
    else triggers.current.delete(id);
  }, []);

  // the Terminal or Spotlight opening takes over: get out of the way
  useSurfaceYield("menu", () => close());

  const openId = state?.id ?? null;
  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close({ focus: true });
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        close();
      } else if (e.key === "/" || e.key === "`") {
        // Spotlight / Terminal shortcuts take over the screen: get out of the way
        const t = e.target as HTMLElement | null;
        if (!t?.closest?.("input,textarea,[contenteditable=true]")) close();
      }
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t?.closest) return;
      if (t.closest(`[data-mb-item="${openId}"]`) || t.closest("[data-mb-trigger]")) return;
      close();
    };
    const onResize = () => close();
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("resize", onResize);
    };
  }, [openId, close]);

  const value = useMemo<MenuCtx>(
    () => ({ open: openId, anchor: state?.anchor ?? null, exit, toggle, hover, show, close, register }),
    [openId, state?.anchor, exit, toggle, hover, show, close, register]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** A menu bar trigger and the panel that grows out of it. */
export function MenuItem({
  id,
  label,
  panelLabel,
  width,
  align,
  className = "",
  itemClassName = "",
  trigger,
  title,
  children,
}: {
  id: PanelId;
  /** accessible name of the trigger */
  label: string;
  /** accessible name of the panel */
  panelLabel: string;
  width: number;
  align: Align;
  className?: string;
  itemClassName?: string;
  trigger: React.ReactNode;
  title?: string;
  children: React.ReactNode;
}) {
  const menu = useMenu();
  const isOpen = menu.open === id;
  const panelId = useId();
  const pressed = useRef(false);

  return (
    <div className={`os-menubar-item ${itemClassName}`} data-mb-item={id}>
      <button
        ref={(el) => menu.register(id, el)}
        type="button"
        data-mb-trigger={id}
        className={`os-menubar-btn ${className}`}
        aria-label={label}
        title={title}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        // menus open on mouse-down (they respond to the press, not the release)
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse" || e.button !== 0) return;
          pressed.current = true;
          menu.toggle(id, e.currentTarget, width, align);
        }}
        onClick={(e) => {
          if (pressed.current) {
            pressed.current = false;
            return;
          }
          menu.toggle(id, e.currentTarget, width, align);
        }}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") menu.hover(id, e.currentTarget, width, align);
        }}
      >
        {trigger}
      </button>
      <AnimatePresence custom={menu.exit}>
        {isOpen && menu.anchor && (
          <Panel key={id} domId={panelId} label={panelLabel} anchor={menu.anchor} panel={id}>
            {children}
          </Panel>
        )}
      </AnimatePresence>
    </div>
  );
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])';

const variants: Variants = {
  open: { opacity: 1, scale: 1, y: 0, transition: spring.default },
  closed: (mode: ExitMode) =>
    mode === "fling"
      ? { opacity: 0, transition: { duration: 0.24, delay: 0.06 } }
      : { opacity: 0, scale: 0.88, y: -6, transition: spring.snappy },
};

function Panel({
  domId,
  label,
  anchor,
  panel,
  children,
}: {
  domId: string;
  label: string;
  anchor: Anchor;
  panel: PanelId;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const menu = useMenu();
  const y = useMotionValue(0);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  // non-modal, but Tab cycles inside until Esc or a click outside
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const at = document.activeElement;
    if (e.shiftKey && (at === first || at === ref.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && at === last) {
      e.preventDefault();
      first.focus();
    }
  };

  // the sheet tracks 1:1 upward (the dismiss direction) and rubber-bands
  // downward. At release the throw is projected: past the threshold it
  // leaves upward carrying the finger's velocity (the exit variant only
  // fades, so nothing re-targets the flight); otherwise it springs home
  const onFlick = (v: number, at: number) => {
    const h = ref.current?.offsetHeight ?? 400;
    if (at + project(v, 0.99) < -Math.min(160, h * 0.3)) {
      animate(y, -(h + 80), { ...spring.default, velocity: Math.min(v, -400) });
      menu.close({ fling: true });
    } else {
      animate(y, 0, { ...spring.default, velocity: v });
    }
  };
  const flick = useFlick({
    axis: "y",
    value: y,
    resist: (raw) => (raw > 0 ? rubberband(raw, ref.current?.offsetHeight ?? 400, 0.35) : raw),
    onRelease: onFlick,
  });

  // phones: a swipe up anywhere on the sheet puts it away, as Notification
  // Center does (not only from its grabber). Content that scrolls keeps the
  // finger until it is at its end; sideways drags (the tape, the sun) and
  // anything marked data-no-flick keep theirs
  const sheet = anchor.sheet;
  const releaseRef = useRef(onFlick);
  useEffect(() => {
    releaseRef.current = onFlick;
  });
  useEffect(() => {
    const panel = ref.current;
    if (!sheet || !panel) return;
    type T = { x: number; y: number; origin: number; mode: "wait" | "drag" | "off"; samples: { t: number; p: number }[] };
    let st: T | null = null;
    const onStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      const off =
        e.touches.length !== 1 ||
        !!target.closest?.(".os-menubar-grabber,input,textarea,select,[data-no-flick]") ||
        getComputedStyle(target).touchAction === "none";
      const t = e.touches[0];
      st = { x: t.clientX, y: t.clientY, origin: t.clientY - y.get(), mode: off ? "off" : "wait", samples: [{ t: e.timeStamp, p: t.clientY }] };
    };
    const onMove = (e: TouchEvent) => {
      if (!st || st.mode === "off") return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - st.x;
      const dy = t.clientY - st.y;
      if (st.mode === "wait") {
        if (Math.hypot(dx, dy) < 6) return;
        const sc = panel.querySelector<HTMLElement>(".os-menubar-scroll");
        const scrolls = !!sc && sc.scrollHeight > sc.clientHeight + 1;
        const atEnd = !sc || sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1;
        if (Math.abs(dx) > Math.abs(dy) || (scrolls && !(dy < 0 && atEnd))) {
          st.mode = "off";
          return;
        }
        st.mode = "drag";
        st.origin = t.clientY - y.get();
        y.stop();
      }
      if (e.cancelable) e.preventDefault();
      const raw = t.clientY - st.origin;
      y.set(raw > 0 ? rubberband(raw, panel.offsetHeight || 400, 0.35) : raw);
      st.samples.push({ t: e.timeStamp, p: t.clientY });
      if (st.samples.length > 8) st.samples.shift();
    };
    const onEnd = (e: TouchEvent) => {
      const s = st;
      st = null;
      if (s?.mode !== "drag") return;
      const last = s.samples[s.samples.length - 1];
      const recent = s.samples.filter((x) => last.t - x.t <= 100);
      const a = recent.length > 1 ? recent[0] : s.samples[s.samples.length - 2];
      const v = a && last.t > a.t && e.timeStamp - last.t < 160 ? ((last.p - a.p) / (last.t - a.t)) * 1000 : 0;
      releaseRef.current(v, y.get());
    };
    panel.addEventListener("touchstart", onStart, { passive: true });
    panel.addEventListener("touchmove", onMove, { passive: false });
    panel.addEventListener("touchend", onEnd);
    panel.addEventListener("touchcancel", onEnd);
    return () => {
      panel.removeEventListener("touchstart", onStart);
      panel.removeEventListener("touchmove", onMove);
      panel.removeEventListener("touchend", onEnd);
      panel.removeEventListener("touchcancel", onEnd);
    };
  }, [sheet, y]);

  return (
    <>
      {anchor.sheet && (
        <m.div
          className="os-menubar-scrim"
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={() => menu.close()}
        />
      )}
      <m.div
        ref={ref}
        id={domId}
        role="dialog"
        aria-label={label}
        tabIndex={-1}
        data-panel={panel}
        data-sheet={anchor.sheet || undefined}
        // the material lives on the animated element itself: an ancestor with
        // opacity < 1 would become a backdrop root and the blur would drop
        // out for the whole spring, then pop in at the end
        className="os-menubar-panel glass-thick"
        style={{
          left: anchor.left,
          top: anchor.top,
          width: anchor.width,
          maxHeight: `calc(100dvh - ${anchor.top + 12}px)`,
          transformOrigin: `${anchor.originX}px ${anchor.originY}px`,
          y,
        }}
        custom={menu.exit}
        variants={variants}
        initial="closed"
        animate="open"
        exit="closed"
        onKeyDown={onKeyDown}
      >
        <div className="os-menubar-scroll" data-lenis-prevent>
          {children}
        </div>
        {anchor.sheet && (
          <div className="os-menubar-grabber" {...flick} aria-hidden>
            <span />
          </div>
        )}
      </m.div>
    </>
  );
}
