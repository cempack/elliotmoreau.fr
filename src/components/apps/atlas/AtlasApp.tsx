"use client";

import "./atlas.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMotionValue, useTransform } from "motion/react";
import type { SiteData } from "@/lib/data";
import { AppWindow } from "@/components/os/AppWindow";
import { Glass } from "@/components/os/Glass";
import { useI18n } from "@/i18n/client";
import { useSound } from "@/lib/sound";
import { useMedia } from "@/hooks/env";
import { PressButton } from "@/components/ui/Pressable";
import { lenisRef } from "@/lib/lenisRef";
import { HOME, PLACES } from "@/lib/places";
import { placeById } from "./geo";
import { AtlasGlobe } from "./AtlasGlobe";
import { PlaceCard } from "./PlaceCard";
import { PlacesList } from "./PlacesList";
import { Stats } from "./Stats";
import { Postcards } from "./Postcards";
import { MapSheet, type Detent } from "./MapSheet";
import { fmtCoordsL } from "./fmt";

/** Layout switch: floating panels around the globe from here up, the
    Maps-style sheet below. Must match the breakpoint in atlas.css. */
const WIDE = "(min-width: 1200px)";
/** Below WIDE: landscape tablets float the sheet beside the globe (an
    iPad Maps sidebar); phones and portrait tablets put it under the globe.
    Must match atlas.css. */
const BESIDE = "(min-width: 768px) and (min-aspect-ratio: 5/4)";

/**
 * Atlas (Maps). A throwable pixel globe fills the window; choosing a place
 * flies the camera along the great-circle route from home and the card
 * tells its story. Desktop: Places and the place card float as glass
 * panels either side of the globe, the stats sit under it, and a strip of
 * pixel-map postcards you can fling follows below. Phones and tablets: a
 * three-detent bottom sheet holds it all. The selection lives in the URL
 * hash (/atlas#japan), so a place can be shared.
 */
export function AtlasApp({ data }: { data: SiteData }) {
  void data; // the Atlas is drawn from lib/places, not from live site data
  const { t, lang } = useI18n();
  const a = t.atlas;
  const { blip } = useSound();
  // server and hydration render the wide layout; CSS hides its panels on
  // small screens until the sheet mounts
  const wide = useMedia(WIDE, true);
  const beside = useMedia(BESIDE, false);
  const [selectedId, setSelectedId] = useState(HOME.id);
  const [recenter, setRecenter] = useState(0);
  const [detent, setDetent] = useState<Detent>("peek");
  const readoutRef = useRef<HTMLSpanElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const place = placeById(selectedId) ?? HOME;

  const select = useCallback(
    (id: string) => {
      if (!placeById(id)) return;
      if (id === selectedId) setRecenter((n) => n + 1);
      else setSelectedId(id);
      blip("select");
      try {
        const url = new URL(window.location.href);
        url.hash = id === HOME.id ? "" : id;
        window.history.replaceState(window.history.state, "", url);
      } catch {}
    },
    [blip, selectedId]
  );

  // deep link: /atlas#japan
  useEffect(() => {
    const read = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (placeById(id)) setSelectedId(id);
    };
    queueMicrotask(read);
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  // picking a postcard below the fold: glide back up to the globe first
  const pickPostcard = useCallback(
    (id: string) => {
      const stage = stageRef.current;
      if (stage && stage.getBoundingClientRect().top < -stage.offsetHeight * 0.35) {
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const lenis = lenisRef.current;
        if (lenis) lenis.scrollTo(0, { immediate: reduced, duration: 1.1 });
        else window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
      }
      select(id);
    },
    [select]
  );

  const onCamera = useCallback(
    (lat: number, lon: number) => {
      if (readoutRef.current) readoutRef.current.textContent = fmtCoordsL(lat, lon, lang);
    },
    [lang]
  );

  // the sheet drives the globe: as it rises the planet is redrawn smaller
  // and higher, centred in the room left above it
  const sheetY = useMotionValue(0);
  const peekY = useMotionValue(0);
  const halfY = useMotionValue(0);
  const room = useMotionValue(0);
  const sheetMetrics = useMemo(() => ({ peekY, halfY, room }), [peekY, halfY, room]);
  const lift = useTransform(() => {
    const pk = sheetMetrics.peekY.get();
    const hf = sheetMetrics.halfY.get();
    if (pk - hf < 1) return 0;
    return Math.min(1, Math.max(0, (pk - sheetY.get()) / (pk - hf)));
  });

  const toolbar = (
    <div className="app-atlas-tools">
      <span className="app-atlas-readout" title={a.readout} aria-hidden>
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
          <circle cx="6" cy="6" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M6 0v3M6 9v3M0 6h3M9 6h3" stroke="currentColor" strokeWidth="1.2" />
        </svg>
        <span ref={readoutRef} className="tabular">
          {fmtCoordsL(HOME.lat, HOME.lon, lang)}
        </span>
      </span>
      <PressButton className="app-atlas-tool" onClick={() => setRecenter((n) => n + 1)} aria-label={a.recenterLabel}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
          <path d="M7 1.5 12.5 12 7 9.6 1.5 12Z" fill="currentColor" />
        </svg>
        <span className="app-atlas-tool-label">{a.recenter}</span>
      </PressButton>
    </div>
  );

  const cardTitle = wide ? "app-atlas-card-title" : "app-atlas-sheet-title";

  return (
    <AppWindow app="atlas" toolbar={toolbar}>
      <div className="app-atlas">
        <section ref={stageRef} className="app-atlas-stage" data-layout={wide ? "wide" : beside ? "beside" : "sheet"}>
          {/* source order is the reading order (list, globe, card); the
              grid places them */}
          {wide && (
            <Glass thickness="regular" refract={false} className="app-atlas-panel app-atlas-panel--places">
              <div className="app-atlas-panel-scroll" data-lenis-prevent>
                <PlacesList selectedId={selectedId} onSelect={select} thumbId="app-atlas-thumb-desk" />
              </div>
            </Glass>
          )}
          <div className="app-atlas-globe-slot">
            <AtlasGlobe
              places={PLACES}
              selectedId={selectedId}
              onSelect={select}
              ambient={wide || beside || detent === "peek"}
              recenter={recenter}
              margin={wide ? 30 : 18}
              label={a.globe}
              hint={a.spin}
              onCamera={onCamera}
              lift={wide ? undefined : lift}
              liftRoom={wide ? undefined : room}
            />
          </div>

          {wide ? (
            <>
              <Glass as="aside" thickness="thick" refract={false} className="app-atlas-panel app-atlas-panel--card" aria-label={a.card.label}>
                <PlaceCard place={place} onSelect={select} titleId={cardTitle} />
              </Glass>
              <div className="app-atlas-stats-slot">
                <Stats layout="strip" />
              </div>
            </>
          ) : (
            <MapSheet
              y={sheetY}
              metrics={sheetMetrics}
              place={place}
              beside={beside}
              onDetent={setDetent}
              card={<PlaceCard place={place} onSelect={select} compact titleId={cardTitle} />}
            >
              <div className="app-atlas-sheet-section">
                <PlacesList selectedId={selectedId} onSelect={select} thumbId="app-atlas-thumb-sheet" />
              </div>
              <div className="app-atlas-sheet-section">
                <Stats layout="grid" />
              </div>
              <div className="app-atlas-sheet-section">
                <h2 className="app-atlas-sheet-h">{a.postcards.title}</h2>
                <Postcards selectedId={selectedId} onPick={select} compact />
              </div>
            </MapSheet>
          )}
        </section>

        {wide && (
          <section className="app-atlas-cards" aria-labelledby="app-atlas-pc-title">
            <header className="app-atlas-cards-head">
              <h2 id="app-atlas-pc-title" className="app-atlas-cards-title">
                {a.postcards.title}
              </h2>
              <p className="app-atlas-cards-lede">{a.postcards.lede}</p>
            </header>
            <Postcards selectedId={selectedId} onPick={pickPostcard} />
          </section>
        )}
      </div>
    </AppWindow>
  );
}
