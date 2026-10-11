"use client";

import "../story.css";
import { useEffect, useRef } from "react";
import { useSiteData } from "@/components/os/SiteData";
import { useSpotifyStatus } from "@/hooks/useSpotifyStatus";
import { lenisRef } from "@/lib/lenisRef";
import { MissionControl } from "./MissionControl";
import { Manifesto } from "./Manifesto";
import { LiveBand } from "./LiveBand";
import { WorkDeck } from "./Deck";
import { WritingChapter } from "./Writing";
import { Finale } from "./Finale";
import { restoreScrollMode } from "./PowerOff";
import { readPip } from "../../pip";

/**
 * CONTRACT (owner: home-story builder)
 * `<Story/>`: the scroll story under the Desktop scene on `/`. No props;
 * reads useSiteData(). Six chapters: Mission Control (pinned flight of
 * live app windows), the manifesto (word-by-word scrub), the live band,
 * selected work as an app switcher (the signature gesture), writing, and
 * the "Shut down" finale with the footer.
 *
 * The desktop recedes under a veil: a fixed ink layer inside the story's
 * own stacking context, so it dims the wallpaper and the Desktop scene
 * (but never the menu bar or Dock) as the story rises. Each chapter asks
 * for a depth with `data-veil` and the veil eases between them with the
 * scroll. Needs no ancestor with transform/overflow (fixed + sticky).
 */
export function Story() {
  const data = useSiteData();
  const music = useSpotifyStatus(data.spotify);
  const rootRef = useRef<HTMLDivElement>(null);
  const veilRef = useRef<HTMLDivElement>(null);
  useVeil(rootRef, veilRef);
  useIdleOffscreen(rootRef);
  useRevealFocus(rootRef);
  // back from a reboot (Restart, or the power button): the boot landed at
  // the top; the history entry gets its usual scroll restoration back
  useEffect(() => restoreScrollMode(), []);

  return (
    <div ref={rootRef} className="app-story">
      <div ref={veilRef} className="app-story-veil" aria-hidden />
      <MissionControl music={music} />
      <Manifesto />
      <LiveBand music={music} />
      <WorkDeck />
      <WritingChapter />
      <Finale />
    </div>
  );
}

/**
 * CSS loops (eq bars, the map ping, carets) rest while their chapter is
 * off-screen. A chapter that remounts its <section> after hydration (the
 * manifesto picks its mode then) is picked up again by the mutation
 * observer, so no loop ever escapes.
 */
function useIdleOffscreen(rootRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          const el = en.target as HTMLElement;
          if (en.isIntersecting) delete el.dataset.idle;
          else el.dataset.idle = "";
        }
      },
      { rootMargin: "100px 0px" }
    );
    const watch = () => {
      io.disconnect();
      root.querySelectorAll(":scope > section").forEach((el) => io.observe(el));
    };
    watch();
    const mo = new MutationObserver(watch);
    mo.observe(root, { childList: true });
    return () => {
      mo.disconnect();
      io.disconnect();
    };
  }, [rootRef]);
}

/**
 * Keyboard focus lands clear of the chrome. Browsers only scroll a focused
 * element that is off-screen, so a card that is "visible" under the Dock,
 * the menu bar or the mini player stays half-hidden; this glides it into
 * the clear band between them. Pinned Mission Control moves its own scene.
 */
function useRevealFocus(rootRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    // resolves the chrome's heights (CSS vars with calc) to pixels
    const probe = document.createElement("span");
    probe.className = "app-story-probe";
    probe.setAttribute("aria-hidden", "true");
    root.appendChild(probe);
    let raf = 0;
    const reveal = (el: HTMLElement) => {
      const cs = getComputedStyle(probe);
      let top = parseFloat(cs.paddingTop) || 0;
      let bottom = window.innerHeight - (parseFloat(cs.paddingBottom) || 0);
      const r = el.getBoundingClientRect();
      // the mini player floats over a corner: a control in its column
      // clears it too (WCAG 2.4.11, focus not obscured)
      const pip = readPip();
      if (pip && r.right > pip.left - 8 && r.left < pip.right + 8) {
        if (pip.corner[0] === "b") bottom = Math.min(bottom, pip.top - 14);
        else top = Math.max(top, pip.bottom + 14);
      }
      let dy = 0;
      if (r.top < top || r.height > bottom - top) dy = r.top - top;
      else if (r.bottom > bottom) dy = r.bottom - bottom;
      if (Math.abs(dy) < 2) return;
      const y = window.scrollY + dy;
      if (lenisRef.current) lenisRef.current.scrollTo(y, { duration: 0.5, easing: (t) => 1 - Math.pow(1 - t, 4) });
      else window.scrollTo({ top: y, behavior: "instant" });
    };
    const onFocus = (e: FocusEvent) => {
      const el = e.target as HTMLElement;
      if (!el.matches?.(":focus-visible") || el.closest('.app-story-mc[data-mode="pin"]')) return;
      // a glide still running (from the previous Tab) would undo the
      // browser's own focus scroll: settle it where it is first
      const l = lenisRef.current;
      if (l?.isScrolling === "smooth") l.scrollTo(window.scrollY, { immediate: true, force: true });
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => reveal(el));
    };
    root.addEventListener("focusin", onFocus);
    return () => {
      cancelAnimationFrame(raf);
      root.removeEventListener("focusin", onFocus);
      probe.remove();
    };
  }, [rootRef]);
}

/**
 * Veil opacity from the scroll: 0 until the story's top enters, then
 * linear between each chapter's requested depth, reached when that
 * chapter's top is a third of the way down the viewport.
 */
function useVeil(rootRef: React.RefObject<HTMLDivElement | null>, veilRef: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    const veil = veilRef.current;
    if (!root || !veil) return;
    let stops: [number, number][] = [];
    let raf = 0;
    const update = () => {
      raf = 0;
      const y = window.scrollY;
      let v = 0;
      if (stops.length) {
        if (y <= stops[0][0]) v = stops[0][1];
        else if (y >= stops[stops.length - 1][0]) v = stops[stops.length - 1][1];
        else {
          for (let i = 1; i < stops.length; i++) {
            const [y1, v1] = stops[i];
            if (y <= y1) {
              const [y0, v0] = stops[i - 1];
              v = v0 + ((v1 - v0) * (y - y0)) / Math.max(1, y1 - y0);
              break;
            }
          }
        }
      }
      veil.style.opacity = v.toFixed(3);
    };
    const measure = () => {
      const vh = window.innerHeight;
      const sy = window.scrollY;
      const top = root.getBoundingClientRect().top + sy;
      const next: [number, number][] = [[top - vh, 0]];
      // each chapter's depth is reached as its top passes a third of the
      // way down and held until its end comes into view (pins hold it)
      const push = (y: number, v: number) => next.push([Math.max(next[next.length - 1][0] + 1, y), v]);
      root.querySelectorAll<HTMLElement>("[data-veil]").forEach((el) => {
        const r = el.getBoundingClientRect();
        const v = Number(el.dataset.veil) || 0;
        push(r.top + sy - vh / 3, v);
        push(r.bottom + sy - vh * 1.15, v);
      });
      stops = next;
      update();
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", schedule, { passive: true });
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", schedule);
    };
  }, [rootRef, veilRef]);
}
