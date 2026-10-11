"use client";

import "./notfound.css";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { animate, useMotionValue } from "motion/react";
import { useI18n } from "@/i18n/client";
import { stripLocale } from "@/i18n/config";
import { useSound } from "@/lib/sound";
import { useReduced } from "@/hooks/env";
import { usePalette } from "@/components/ui/CommandPalette";
import { APPS } from "@/components/os/apps";
import { useSiteData } from "@/components/os/SiteData";
import { dockIconCenter } from "@/components/os/window/dock";
import { Matrix404 } from "./Matrix404";
import { Alert } from "./Alert";
import { useTether } from "./useTether";
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
 * for real. Return takes the default button; ⌘K / "/" open Spotlight.
 * Renders inside the OS shell.
 */
export function NotFoundApp() {
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
    suggestHref = suggestion.href;
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
  const titleRef = useRef<HTMLTitleElement>(null);
  const shake = useMotionValue(0);
  const flash = useRef(0);

  const tether = useTether({
    surfaceRef,
    stageRef,
    reduced,
    target: () => dockIconCenter("home", home),
    onLeave: () => blip("close"),
    onThrow: () => router.push(home),
  });
  const { dismiss } = tether;

  // a hard 404 can arrive client-rendered (Next's error shell), so the
  // layout's pre-paint "returning visitor?" check never ran: repeat it
  // before paint, or every 404 would replay the boot and lock screens
  useLayoutEffect(() => {
    try {
      if (sessionStorage.getItem("em-intro")) document.documentElement.dataset.intro = "done";
    } catch {}
  }, []);

  // the tab says what happened. React hoists our <title> into <head> and
  // removes it when the 404 unmounts, but on a client-side navigation
  // Next's metadata title can land after it (and in front of it): while
  // mounted, keep ours the first title in the document, the one that counts
  useEffect(() => {
    const own = titleRef.current;
    if (!own) return;
    const head = document.head;
    const keepFirst = () => {
      const first = head.querySelector("title");
      if (own.parentNode === head && first && first !== own) head.insertBefore(own, first);
    };
    keepFirst();
    const mo = new MutationObserver(keepFirst);
    mo.observe(head, { childList: true });
    return () => mo.disconnect();
  }, []);

  const openSuggestion = useCallback(() => {
    if (!suggestion) return;
    if (suggestion.kind === "app") router.push(suggestHref, { transitionTypes: ["app-open"] });
    else window.location.assign(suggestHref);
  }, [suggestion, suggestHref, router]);

  // macOS: clicking outside a modal alert gets a shake of the head
  const refuse = useCallback(() => {
    blip("tick");
    const el = surfaceRef.current;
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

  // keyboard: Return presses the default button; [nyae] answer zsh
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      // a key that unlocks the boot/lock screen is not meant for the alert
      if (document.documentElement.dataset.intro !== "done") return;
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("input,textarea,select,[contenteditable=true],dialog")) return;
      if (document.querySelector("dialog[open]")) return;
      if (e.key === "Enter") {
        // a focused control answers its own Return
        if (el?.closest?.("a,button,[role=button]")) return;
        e.preventDefault();
        if (offering) openSuggestion();
        else dismiss();
        return;
      }
      if (suggestion && answer == null && e.key.length === 1) {
        const k = e.key.toLowerCase();
        if (k === "n" || k === "y" || k === "a" || k === "e") {
          e.preventDefault();
          onAnswer(k);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [suggestion, answer, offering, openSuggestion, dismiss, onAnswer]);

  useEffect(() => () => window.clearTimeout(flash.current), []);

  const fullPath = command === "/" ? "/" : `/${command}`;

  return (
    <div
      ref={stageRef}
      className="app-nf"
      onClick={(e) => {
        // a click on the desktop behind the alert (not the alert itself)
        if (!(e.target as Element).closest?.(".app-nf-alert")) refuse();
      }}
    >
      <title ref={titleRef}>{`${t.meta.pages.notFound} — ${t.meta.siteName}`}</title>
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
        />
      </div>
    </div>
  );
}
