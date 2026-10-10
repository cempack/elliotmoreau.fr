"use client";

import "../story.css";
import { useEffect, useRef } from "react";
import { useSiteData } from "@/components/os/SiteData";
import { useSpotifyStatus } from "@/hooks/useSpotifyStatus";
import { MissionControl } from "./MissionControl";
import { Manifesto } from "./Manifesto";
import { LiveBand } from "./LiveBand";
import { WorkDeck } from "./Deck";
import { WritingChapter } from "./Writing";
import { Finale } from "./Finale";

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
      root.querySelectorAll<HTMLElement>("[data-veil]").forEach((el) => {
        const y = el.getBoundingClientRect().top + sy - vh / 3;
        next.push([Math.max(next[next.length - 1][0] + 1, y), Number(el.dataset.veil) || 0]);
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
