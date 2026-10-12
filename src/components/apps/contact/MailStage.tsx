"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Phase } from "./Compose";
import type { StageHandle } from "./GlobeStage";

export type { StageHandle } from "./GlobeStage";

/** the planet and its flight: its own chunk, loaded once there's a reason (focus, a sendable letter, idle).
    One import site, so arming and rendering share a single chunk. */
const loadGlobe = () => import("./GlobeStage");
const Globe = dynamic(() => loadGlobe().then((m) => m.GlobeStage), { ssr: false });

/**
 * The flight, between the letter and what comes after it. At rest there is
 * nothing here: the letter is the whole page. Send hands the stage to the
 * globe (loaded ahead, on focus, a sendable letter or idle, so Send never
 * waits), which carries the sealed letter from the visitor's city to
 * Toulouse and stays on the landing while the result card says what
 * happened. The same StageHandle as before, so Compose's flow doesn't
 * change.
 */
export function MailStage({
  ref,
  phase,
  stamped,
  ready,
  reduced,
  onLand,
  doneLabel,
}: {
  ref?: React.Ref<StageHandle>;
  phase: Phase;
  stamped: boolean;
  /** the letter could be sent right now */
  ready: boolean;
  reduced: boolean;
  onLand: (canOpen: boolean) => boolean;
  doneLabel?: string;
}) {
  const [show, setShow] = useState<"rest" | "globe">("rest");
  const [armed, setArmed] = useState(false);
  const [caption, setCaption] = useState("");

  const globeRef = useRef<StageHandle | null>(null);
  const pending = useRef<{ gate?: Promise<boolean> } | null>(null);
  const arming = useRef(false);

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

  /** the globe mounted: a Send that came before it goes now */
  const globeMounted = useCallback((h: StageHandle | null) => {
    globeRef.current = h;
    const p = pending.current;
    if (h && p) {
      pending.current = null;
      setShow("globe");
      h.send(p.gate);
    }
  }, []);

  useImperativeHandle(ref, () => ({
    send: (gate) => {
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
      pending.current = null;
      globeRef.current?.reset();
      setShow("rest");
    },
  }));

  const onGlobe = show === "globe";

  return (
    <div className="app-contact-flight" data-show={show}>
      <div className="app-contact-stage" data-show={show}>
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
              lead={0}
              onCaption={setCaption}
            />
          )}
        </div>
      </div>
      <p className="app-contact-stage-caption" aria-live="polite">
        {onGlobe ? caption || " " : " "}
      </p>
    </div>
  );
}
