"use client";

import "./overview.css";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, animate, m, useMotionValue, useTransform, type MotionStyle } from "motion/react";
import { useI18n } from "@/i18n/client";
import { useFinePointer, useReduced } from "@/hooks/env";
import { useHomeTime } from "@/hooks/useHomeTime";
import { useSpotifyStatus } from "@/hooks/useSpotifyStatus";
import { timeAgo } from "@/lib/format";
import { spring } from "@/lib/motion";
import { useSound } from "@/lib/sound";
import { useToast } from "@/components/Toasts";
import { APPS, appForPath, type AppId } from "./apps";
import { AppGlyph, AppIcon } from "./icons";
import { useSiteData } from "./SiteData";
import { closeOverview, openOverview, setOverview, stayThroughNavigation, takeStay, useOverviewOpen } from "./overview";
import { closeWorkspace, useWorkspaces } from "./workspaces";
import { fill } from "./menubar/util";

/** a trackpad pinch arrives as ctrl+wheel with fractional deltas (a mouse wheel's are whole) */
const isPinch = (e: WheelEvent) => e.ctrlKey && !Number.isInteger(e.deltaY);

/**
 * Every open window, over the river: the Desktop and each app opened in
 * this visit, as live cards floating over the Garonne (their icon shows
 * the app's state, a line says what's in it). Click one to go back to it,
 * throw one up to close it; Esc, a click on the river or a pinch in puts
 * the windows back. Ctrl+↑ or a trackpad pinch out opens it from anywhere,
 * so do Spotlight and, on phones, a swipe up on the tab bar.
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

function Layer() {
  const { t, path, lang } = useI18n();
  const o = t.shell.overview;
  const router = useRouter();
  const fine = useFinePointer();
  const reduced = useReduced();
  const { blip } = useSound();
  const { notify } = useToast();
  const current = appForPath(usePathname()).id;
  const here: AppId = current === "admin" ? "home" : current;
  // windows thrown away here stay gone, even while the Desktop is still loading under a closed current one
  const [gone, setGone] = useState<AppId[]>([]);
  const ids = useWorkspaces(here).filter((id) => !gone.includes(id));
  const data = useSiteData();
  const music = useSpotifyStatus(data.spotify);
  const { time } = useHomeTime();
  const listRef = useRef<HTMLUListElement>(null);
  const back = useRef<HTMLElement | null>(null);

  useEffect(() => {
    back.current = document.activeElement as HTMLElement | null;
    blip("open");
    const id = requestAnimationFrame(() => {
      const card = listRef.current?.querySelector<HTMLElement>(`[data-ov="${here}"]`);
      card?.focus({ preventScroll: true });
      // phones: the row scrolls; the current window starts in the middle
      card?.scrollIntoView({ inline: "center", block: "nearest", behavior: "instant" });
    });
    return () => {
      cancelAnimationFrame(id);
      const b = back.current;
      if (b?.isConnected) b.focus({ preventScroll: true });
    };
    // once, as it opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** what each window holds right now, in one line */
  const lineOf = (id: AppId): string => {
    switch (id) {
      case "home":
        return fill(o.home, { time: time || "" });
      case "work":
        return data.activity ? `${data.activity.repo} · ${timeAgo(data.activity.createdAt, lang)}` : t.shell.apps.work;
      case "writing":
        return data.posts[0]?.title ?? t.shell.apps.writing;
      case "atlas":
        return data.away?.city ?? "Toulouse";
      case "now":
        return music.track ? `${music.track.title} · ${music.track.artist}` : o.nothing;
      case "contact":
        return o.write;
      default:
        return "";
    }
  };

  const goTo = (id: AppId) => {
    blip("select");
    if (id === here) {
      closeOverview();
      return;
    }
    const a = APPS.find((x) => x.id === id);
    if (a) router.push(path(a.path), { transitionTypes: ["app-open"] });
    closeOverview();
  };

  const closeWin = (id: AppId) => {
    if (id === "home") return;
    blip("close");
    setGone((g) => [...g, id]);
    closeWorkspace(id);
    notify(fill(o.closed, { app: t.shell.apps[id] }), o.label);
    // the window on screen was the one thrown away: the Desktop takes its place underneath
    if (id === here) {
      stayThroughNavigation();
      router.push(path("/"));
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const cards = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-ov]") ?? [])];
    const i = cards.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeOverview();
    } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const next = cards[(i + (e.key === "ArrowRight" ? 1 : -1) + cards.length) % cards.length];
      next?.focus();
    } else if ((e.key === "Delete" || e.key === "Backspace") && i >= 0) {
      e.preventDefault();
      const id = cards[i].dataset.ov as AppId;
      if (id !== "home") {
        (cards[i + 1] ?? cards[i - 1])?.focus();
        closeWin(id);
      }
    } else if (e.key === "Tab" && cards.length) {
      // focus stays among the windows
      e.preventDefault();
      cards[(i + (e.shiftKey ? -1 : 1) + cards.length) % cards.length]?.focus();
    }
  };

  return (
    <m.div
      className="os-ov"
      role="dialog"
      aria-modal="true"
      aria-label={o.label}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.18 } }}
      transition={{ duration: reduced ? 0 : 0.22 }}
      onKeyDown={onKeyDown}
      onClick={(e) => {
        // a click on the river (not on a window) puts the windows back
        if (!(e.target as Element).closest(".os-ov-card")) closeOverview();
      }}
    >
      <p className="os-ov-title">{o.label}</p>
      <ul ref={listRef} className="os-ov-row" style={{ "--n": ids.length } as React.CSSProperties}>
        <AnimatePresence initial={!reduced} mode="popLayout">
          {ids.map((id, i) => (
            <Card key={id} id={id} index={i} current={id === here} line={lineOf(id)} reduced={reduced} onGo={goTo} onThrow={closeWin} />
          ))}
        </AnimatePresence>
      </ul>
      <p className="os-ov-hint">{fine ? o.hint : o.hintTouch}</p>
    </m.div>
  );
}

function Card({
  id,
  index,
  current,
  line,
  reduced,
  onGo,
  onThrow,
}: {
  id: AppId;
  index: number;
  current: boolean;
  line: string;
  reduced: boolean;
  onGo: (id: AppId) => void;
  onThrow: (id: AppId) => void;
}) {
  const { t } = useI18n();
  const app = APPS.find((a) => a.id === id)!;
  const name = t.shell.apps[app.label];
  const closable = id !== "home";
  const y = useMotionValue(0);
  // it fades as it is pulled up and away
  const fade = useTransform(y, [-280, -40, 0], [0.2, 1, 1]);
  const dragged = useRef(false);
  const [gone, setGone] = useState(false);

  const throwAway = (v: number) => {
    setGone(true);
    if (reduced) return onThrow(id);
    animate(y, -Math.max(window.innerHeight * 0.75, 420), { type: "spring", velocity: Math.min(v, -900), stiffness: 160, damping: 26 });
    window.setTimeout(() => onThrow(id), 180);
  };

  return (
    <m.li
      layout={!reduced}
      className="os-ov-slot"
      initial={{ opacity: 0, y: 26, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: { ...spring.default, delay: reduced ? 0 : index * 0.035 } }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.16 } }}
      transition={spring.default}
    >
      <m.button
        type="button"
        className="os-ov-card"
        data-ov={id}
        aria-current={current ? "page" : undefined}
        aria-label={`${name}: ${line}`}
        aria-keyshortcuts={closable ? "Delete" : undefined}
        style={{ y, opacity: fade, "--os-ov-accent": app.accent } as MotionStyle}
        drag={closable && !gone ? "y" : false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.85, bottom: 0.12 }}
        dragSnapToOrigin={false}
        onDragStart={() => {
          dragged.current = true;
        }}
        onDragEnd={(_, info) => {
          window.setTimeout(() => (dragged.current = false), 0);
          if (info.offset.y < -110 || info.velocity.y < -650) throwAway(info.velocity.y);
        }}
        onClick={() => {
          if (dragged.current || gone) return;
          onGo(id);
        }}
        whileTap={reduced ? undefined : { scale: 0.97 }}
      >
        <span className="os-ov-bar" aria-hidden>
          <AppGlyph app={id} size={12} />
          <span className="os-ov-name">{name}</span>
          <span className="os-ov-path">~{app.path === "/" ? "" : app.path}</span>
        </span>
        <span className="os-ov-body" aria-hidden>
          <AppIcon app={id} size={56} />
          <span className="os-ov-line">{line}</span>
        </span>
      </m.button>
      <span className="os-ov-key tabular" aria-hidden>
        {app.key}
      </span>
    </m.li>
  );
}
