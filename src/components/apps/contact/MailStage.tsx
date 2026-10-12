"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { useAway, useStatus } from "@/components/os/SiteData";
import { useI18n } from "@/i18n/client";
import type { Mode, Phase } from "./Compose";
import type { StageHandle } from "./GlobeStage";
import { clock } from "./hours";
import { boxLabel, leveeView, readSentence } from "./levee";
import { fill } from "./mail";
import { PostBox, type PostBoxHandle } from "./PostBox";
import { useNow } from "./useNow";

export type { StageHandle } from "./GlobeStage";

/** the planet and its flight: its own chunk, loaded once there's a reason (focus, a sendable letter, idle).
    One import site, so arming and rendering share a single chunk. */
const loadGlobe = () => import("./GlobeStage");
const Globe = dynamic(() => loadGlobe().then((m) => m.GlobeStage), { ssr: false });

/** GlobeStage's landing burst, then a beat on "Landed in Toulouse at 18:13" */
const BURST_MS = 650;
const HOLD_MS = 900;
const DISSOLVE_MS = 240;

/**
 * The stage beside the letter. At rest, Elliot's letterbox in Toulouse: its
 * plate and window print his real hours and when he's likely to read the
 * letter, a slip forwards his post while he's away, and one caption says it
 * in words. Send hands the stage to the globe for the flight (the box
 * dissolves as the sealed letter waits over the visitor's city); a letter
 * the site delivered while he's home then comes back down into the slot.
 * The same StageHandle as before, so Compose's flow doesn't change.
 */
export function MailStage({
  ref,
  phase,
  mode,
  stamped,
  ready,
  delivered,
  reduced,
  onLand,
  doneLabel,
}: {
  ref?: React.Ref<StageHandle>;
  phase: Phase;
  mode: Mode;
  stamped: boolean;
  /** the letter could be sent right now */
  ready: boolean;
  /** the site delivered it: the visitor's token */
  delivered: string | null;
  reduced: boolean;
  onLand: (canOpen: boolean) => boolean;
  doneLabel?: string;
}) {
  const { t, lang } = useI18n();
  const b = t.contact.box;
  const w = t.contact.when;
  const now = useNow(30_000);
  const status = useStatus();
  const away = useAway();
  const tz = status.workHours.tz;

  const view = useMemo(() => (now ? leveeView(now, status, away) : null), [now, status, away]);
  const read = useMemo(() => {
    if (!view) return "";
    const mine = Intl.DateTimeFormat().resolvedOptions().timeZone || tz;
    return readSentence(view.est, { lang, tz, mine, w });
  }, [view, lang, tz, w]);
  const label = boxLabel(view, { lang, b, away, hours: status.workHours });

  const [show, setShow] = useState<"box" | "globe">("box");
  const [armed, setArmed] = useState(false);
  const [posted, setPosted] = useState<string | null>(null);
  const [globeCaption, setGlobeCaption] = useState("");

  const globeRef = useRef<StageHandle | null>(null);
  const boxRef = useRef<PostBoxHandle>(null);
  const runs = useRef(0);
  const timers = useRef<number[]>([]);
  const pending = useRef<{ gate?: Promise<boolean> } | null>(null);
  const arming = useRef(false);
  const live = useRef({ mode, delivered, away, reduced, tz, lang });
  useEffect(() => {
    live.current = { mode, delivered, away, reduced, tz, lang };
  });

  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };

  const arm = useCallback(() => {
    if (arming.current) return;
    arming.current = true;
    loadGlobe().then(
      () => setArmed(true),
      () => {
        arming.current = false;
      }
    );
  }, []);

  // so Send never waits on the chunk: armed on the first focus, a sendable letter, or idle
  useEffect(() => {
    const ric = typeof window.requestIdleCallback === "function";
    const h = ric ? window.requestIdleCallback(arm, { timeout: 4000 }) : window.setTimeout(arm, 2500);
    document.addEventListener("focusin", arm, { once: true });
    return () => {
      if (ric) window.cancelIdleCallback(h);
      else window.clearTimeout(h);
      document.removeEventListener("focusin", arm);
    };
  }, [arm]);
  useEffect(() => {
    if (ready) arm();
  }, [ready, arm]);
  useEffect(() => () => clearTimers(), []);

  /** the globe mounted: a Send that came before it goes now (the box stayed up meanwhile) */
  const globeMounted = useCallback((h: StageHandle | null) => {
    globeRef.current = h;
    const p = pending.current;
    if (h && p) {
      pending.current = null;
      setShow("globe");
      h.send(p.gate);
    }
  }, []);

  /** the flight is over: back to the box, and the letter into the slot, only for a letter the site delivered while he's home */
  const onArrive = useCallback(() => {
    const run = runs.current;
    const l = live.current;
    timers.current.push(
      window.setTimeout(
        async () => {
          if (runs.current !== run) return;
          const now = live.current;
          if (now.mode !== "send" || now.delivered == null || now.away) return;
          setShow("box");
          // the box dissolves back in before the letter drops
          if (!now.reduced) await new Promise<void>((r) => timers.current.push(window.setTimeout(r, DISSOLVE_MS)));
          if (runs.current !== run) return;
          await boxRef.current?.drop();
          if (runs.current !== run) return;
          setPosted(clock(new Date(), now.tz, now.lang));
        },
        l.reduced ? 1200 : BURST_MS + HOLD_MS
      )
    );
  }, []);

  useImperativeHandle(ref, () => ({
    send: (gate) => {
      runs.current++;
      clearTimers();
      setPosted(null);
      // in the same tick, so the mail app still opens inside the click's activation
      if (globeRef.current) {
        setShow("globe");
        globeRef.current.send(gate);
      } else {
        // not loaded yet (a slow network, Send right away): it goes as soon as it mounts
        pending.current = { gate };
        arm();
      }
    },
    deliver: (from) => globeRef.current?.deliver(from),
    reset: () => {
      runs.current++;
      clearTimers();
      pending.current = null;
      globeRef.current?.reset();
      setShow("box");
      setPosted(null);
    },
  }));

  const caption = show === "globe" ? globeCaption : posted ? fill(b.inBox, { time: posted }) : read;
  const onGlobe = show === "globe";

  return (
    <>
      <div className="app-contact-stage" data-show={show}>
        <PostBox
          ref={boxRef}
          view={view}
          now={now}
          ready={ready && phase === "compose"}
          shown={!onGlobe}
          reduced={reduced}
          label={label}
        />
        <div className="app-contact-stage-globe" aria-hidden={!onGlobe || undefined} inert={!onGlobe}>
          {armed && (
            <Globe
              ref={globeMounted}
              phase={phase}
              stamped={stamped}
              reduced={reduced}
              onLand={onLand}
              doneLabel={doneLabel}
              dormant={!onGlobe}
              lead={reduced ? 0 : DISSOLVE_MS}
              onArrive={onArrive}
              onCaption={setGlobeCaption}
            />
          )}
        </div>
      </div>
      <p className="app-contact-stage-caption" aria-live="polite">
        {caption || " "}
      </p>
    </>
  );
}
