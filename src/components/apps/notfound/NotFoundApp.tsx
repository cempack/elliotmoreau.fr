"use client";

import "./notfound.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { animate, useMotionValue } from "motion/react";
import { useI18n } from "@/i18n/client";
import { stripLocale } from "@/i18n/config";
import { useSound } from "@/lib/sound";
import { useReduced } from "@/hooks/env";
import { scrollToY } from "@/lib/scroller";
import { usePalette } from "@/components/ui/palette";
import { APPS } from "@/components/os/apps";
import { useSiteData } from "@/components/os/SiteData";
import { dockIconCenter } from "@/components/os/window/dock";
import { Matrix404 } from "./Matrix404";
import { Alert } from "./Alert";
import { NetworkMap } from "./NetworkMap";
import { useTether } from "./useTether";
import { introOver } from "./intro";
import { commandFor, middleTruncate, suggest } from "./suggest";
import type { Answer } from "./Zsh";

/**
 * 404: "The application “/the-path” can't be opened." A Liquid Glass
 * alert floats over the desktop, covering the dead 0 of a giant LED
 * "404" drawn like the hero wordmark, so the glass bends the pixel grid
 * behind it. The signature: the alert is a physical sheet on a tether.
 * Pull it anywhere (the 0 shows through, bending in the glass) and it
 * springs home with your velocity; throw it into the Dock and it lands
 * on the Desktop (the Desktop buttons send it the same way); click the
 * desktop behind it and it shakes its head, like every macOS alert. A
 * zsh transcript underneath offers what you probably meant (an app, or
 * one of Elliot's posts or repos from the live data), and [nyae] answers
 * for real while the alert has focus (it takes focus as it appears, like
 * a macOS alert). Return takes the default button; ⌘K / "/" open
 * Spotlight.
 *
 * Rendered by app/global-not-found.tsx inside the OS shell (server-side:
 * the document arrives finished, with its own title and pre-paint
 * scripts), and by [lang]/not-found.tsx for an in-app notFound().
 */

const NUDGED = "em-nf-nudged";
/** how long a near-certain typo waits before it goes */
const AUTO_MS = 2200;

export function NotFoundApp({ standalone = false }: {
  /** its own document (global-not-found): every way out is a full page
      load (the apps have another root layout), so go straight there */
  standalone?: boolean;
}) {
  const { t, path } = useI18n();
  const router = useRouter();
  const palette = usePalette();
  const { blip } = useSound();
  const reduced = useReduced();
  const { posts, repos } = useSiteData();
  const pathname = usePathname() ?? "/";

  const command = commandFor(stripLocale(pathname));
  const suggestion = useMemo(() => suggest(command, { posts, repos }), [command, posts, repos]);
  const home = path("/");

  // what the suggestion opens, and how the alert words it
  const s = t.notfound;
  let target = "";
  let suggestHref = home;
  let openLabel = "";
  let suggestBody = s.body;
  if (suggestion?.kind === "app") {
    const app = APPS.find((a) => a.id === suggestion.app) ?? APPS[0];
    target = t.shell.apps[app.label];
    suggestHref = path(app.path);
    openLabel = s.open.replace("{app}", target);
    suggestBody = s.bodySuggest.replace("{app}", target);
  } else if (suggestion) {
    target = middleTruncate(suggestion.name, 26);
    suggestHref = suggestion.kind === "post" ? path(suggestion.href) : suggestion.href;
    if (suggestion.kind === "post") {
      openLabel = s.read.replace("{name}", target);
      suggestBody = s.bodyPost.replace("{name}", middleTruncate(suggestion.name, 56));
    } else {
      openLabel = s.openRepo.replace("{name}", target);
      suggestBody = s.bodyRepo.replace("{name}", suggestion.name);
    }
  }

  const [answer, setAnswer] = useState<Answer | null>(null);
  const offering = suggestion != null && answer !== "n" && answer !== "a";
  const stageRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLElement>(null);
  const shake = useMotionValue(0);
  const flash = useRef(0);
  /** keys count once the intro is over (the key that ends it isn't ours) */
  const ready = useRef(false);

  // leaving for an app: a document navigation from the standalone 404
  // (the router would only find that out after a round trip), else the
  // router, with the window opening out of the Dock
  const go = useCallback(
    (href: string) => {
      if (standalone) window.location.assign(href);
      else router.push(href, { transitionTypes: ["app-open"] });
    },
    [router, standalone]
  );

  const tether = useTether({
    surfaceRef,
    stageRef,
    reduced,
    target: () => dockIconCenter("home", home),
    onLeave: () => blip("close"),
    onThrow: () => go(home),
  });
  const { dismiss } = tether;
  const nudgeRef = useRef(tether.nudge);
  useEffect(() => {
    nudgeRef.current = tether.nudge;
  });

  // where you'll most likely go next is fetched before you ask: the
  // Desktop (every throw lands there) and an in-site suggestion. From the
  // standalone 404 those are document loads, so the documents are
  // prefetched (speculation rules, else <link rel=prefetch>); in-app, the
  // router prefetches its routes.
  const appHref = suggestion?.kind === "app" ? suggestHref : null;
  useEffect(() => {
    const urls = appHref ? [home, appHref] : [home];
    if (!standalone) {
      for (const u of urls) router.prefetch(u);
      return;
    }
    const added: HTMLElement[] = [];
    if (HTMLScriptElement.supports?.("speculationrules")) {
      const rules = document.createElement("script");
      rules.type = "speculationrules";
      rules.textContent = JSON.stringify({ prefetch: [{ source: "list", urls, eagerness: "immediate" }] });
      added.push(rules);
    } else {
      for (const u of urls) {
        const link = document.createElement("link");
        link.rel = "prefetch";
        link.href = u;
        link.as = "document";
        added.push(link);
      }
    }
    document.head.append(...added);
    return () => added.forEach((el) => el.remove());
  }, [home, appHref, router, standalone]);

  // once the boot is out of the way, the alert takes focus (a
  // macOS alert is the key window; screen readers announce it), and the
  // first time this session it gives a little tug to show it moves
  useEffect(() => {
    let raf = 0;
    let timer = 0;
    const appear = () => {
      ready.current = true;
      const el = surfaceRef.current;
      const active = document.activeElement;
      if (el && (!active || active === document.body || active === document.documentElement)) {
        el.focus({ preventScroll: true });
      }
      let seen = true;
      try {
        seen = sessionStorage.getItem(NUDGED) != null;
      } catch {}
      if (seen) return;
      timer = window.setTimeout(() => {
        try {
          sessionStorage.setItem(NUDGED, "1");
        } catch {}
        nudgeRef.current();
      }, 1100);
    };
    const onDone = () => {
      raf = requestAnimationFrame(appear);
    };
    if (introOver()) appear();
    else window.addEventListener("em:intro-done", onDone, { once: true });
    return () => {
      window.removeEventListener("em:intro-done", onDone);
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, []);

  const openSuggestion = useCallback(() => {
    if (!suggestion) return;
    if (suggestion.kind === "repo") window.location.assign(suggestHref);
    else go(suggestHref);
  }, [suggestion, suggestHref, go]);

  // typo forgiveness: one letter off a real path goes there by itself after
  // a short countdown, once the boot is out of the way; Stay
  // (or any answer) stops it
  const [armed, setArmed] = useState(false);
  const [stayed, setStayed] = useState(false);
  const [left, setLeft] = useState(2);
  const certain = Boolean(suggestion?.certain);
  useEffect(() => {
    if (!certain) return;
    let t = 0;
    const arm = () => {
      t = window.setTimeout(() => setArmed(true), 0);
    };
    if (introOver()) arm();
    else window.addEventListener("em:intro-done", arm, { once: true });
    return () => {
      window.removeEventListener("em:intro-done", arm);
      window.clearTimeout(t);
    };
  }, [certain]);
  const counting = certain && armed && !stayed && answer == null;
  useEffect(() => {
    if (!counting) return;
    const start = performance.now();
    const id = window.setInterval(() => {
      const ms = AUTO_MS - (performance.now() - start);
      if (ms <= 0) {
        window.clearInterval(id);
        openSuggestion();
      } else setLeft(Math.ceil(ms / 1000));
    }, 100);
    return () => window.clearInterval(id);
  }, [counting, openSuggestion]);

  // macOS: clicking outside a modal alert gets a shake of the head (and
  // the alert keeps the focus)
  const refuse = useCallback(() => {
    // a shake of the head: a small, dull bump
    blip("stop");
    const el = surfaceRef.current;
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
    if (reduced) {
      // no motion: a brief rim highlight instead
      if (!el) return;
      el.dataset.refused = "";
      window.clearTimeout(flash.current);
      flash.current = window.setTimeout(() => delete el.dataset.refused, 420);
      return;
    }
    animate(shake, [0, -14, 12, -9, 6, -3, 0], { duration: 0.46, ease: "easeOut" });
  }, [blip, reduced, shake]);

  const onAnswer = useCallback(
    (a: Answer) => {
      setAnswer(a);
      if (a === "y") openSuggestion();
      else if (a === "e") palette.open();
      else {
        blip("select");
        // the keys go inert: focus moves on to the new default button
        // (never left on a dead control, never dropped on <body>)
        const active = document.activeElement;
        if (!active || active === document.body || surfaceRef.current?.contains(active)) {
          requestAnimationFrame(() => {
            const el = surfaceRef.current;
            (el?.querySelector<HTMLElement>(".app-nf-btn--primary") ?? el?.querySelector<HTMLElement>(".app-nf-btn"))?.focus();
          });
        }
      }
    },
    [openSuggestion, palette, blip]
  );

  // keyboard: Return presses the default button (anywhere a control isn't
  // focused); [nyae] answer zsh only while the alert has focus, so a stray
  // key elsewhere never leaves the page (WCAG 2.1.4)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.isComposing || e.repeat) return;
      if (!ready.current) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("input,textarea,select,[contenteditable=true],dialog")) return;
      if (document.querySelector("dialog[open]")) return;
      const surface = surfaceRef.current;
      if (e.key === "Enter") {
        // a focused control answers its own Return
        if (el?.closest?.("a,button,[role=button]")) return;
        e.preventDefault();
        // the default button visibly takes the press, as on macOS
        const primary = surface?.querySelector<HTMLElement>(".app-nf-btn--primary");
        if (primary) {
          primary.dataset.keyPress = "";
          window.setTimeout(() => delete primary.dataset.keyPress, 160);
        }
        if (offering) openSuggestion();
        else dismiss();
        return;
      }
      if (!suggestion || answer != null || e.key.length !== 1) return;
      if (!surface?.contains(document.activeElement)) return;
      const k = e.key.toLowerCase();
      if (k === "n" || k === "y" || k === "a" || k === "e") {
        e.preventDefault();
        onAnswer(k);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [suggestion, answer, offering, openSuggestion, dismiss, onAnswer]);

  useEffect(() => () => window.clearTimeout(flash.current), []);

  // pull the alert off the dead 0 and its ghost shows (wide screens: it's
  // hidden under the glass at rest), as much as the alert has moved
  const { x: ax, y: ay } = tether;
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let last = -1;
    const update = () => {
      const d = Math.hypot(ax.get(), ay.get());
      const r = Math.round(Math.min(1, Math.max(0, (d - 36) / 180)) * 100) / 100;
      if (r === last) return;
      last = r;
      stage.style.setProperty("--nf-reveal", String(r));
    };
    const offX = ax.on("change", update);
    const offY = ay.on("change", update);
    return () => {
      offX();
      offY();
    };
  }, [ax, ay]);

  const fullPath = command === "/" ? "/" : `/${command}`;

  // down to the network map, under the alert
  const toMap = () => {
    const el = document.getElementById("network-map");
    if (el) scrollToY(el.getBoundingClientRect().top + window.scrollY - 64, !reduced);
  };

  return (
    <>
      <div
        ref={stageRef}
        className="app-nf"
        onClick={(e) => {
          // a click on the desktop behind the alert (not the alert itself)
          if (!(e.target as Element).closest?.(".app-nf-alert, .app-nf-mapcue")) refuse();
        }}
      >
        <div className="app-nf-backdrop" aria-hidden>
          <Matrix404 />
        </div>
        <div className="app-nf-center">
          <Alert
            tether={tether}
            shake={shake}
            surfaceRef={surfaceRef}
            reduced={reduced}
            path={middleTruncate(fullPath, 28)}
            fullPath={fullPath}
            command={middleTruncate(command, 40)}
            suggestion={suggestion}
            suggestHref={suggestHref}
            target={target}
            openLabel={openLabel}
            bodyText={offering ? suggestBody : s.body}
            answer={answer}
            onAnswer={onAnswer}
            onSearch={palette.open}
            onDesktop={dismiss}
            onRebuilt={() => {
              // the shards finding each other
              blip("mend");
              if (offering) openSuggestion();
              else dismiss();
            }}
            countdown={counting ? { left, total: AUTO_MS, onStay: () => (setStayed(true), blip("select")) } : null}
          />
        </div>
        <button type="button" className="app-nf-mapcue" onClick={toMap}>
          {s.map.cue}
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <NetworkMap suggestion={suggestion} path={fullPath} go={go} home={home} />
    </>
  );
}
