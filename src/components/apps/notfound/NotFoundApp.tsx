"use client";

import "./notfound.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { animate, useMotionValue } from "motion/react";
import { useI18n } from "@/i18n/client";
import { stripLocale } from "@/i18n/config";
import { useSound } from "@/lib/sound";
import { useReduced } from "@/hooks/env";
import { usePalette } from "@/components/ui/CommandPalette";
import { APPS } from "@/components/os/apps";
import { dockIconCenter } from "@/components/os/window/dock";
import { Matrix404 } from "./Matrix404";
import { Alert } from "./Alert";
import { useTether } from "./useTether";
import { commandFor, middleTruncate, suggest } from "./suggest";
import type { Answer } from "./Zsh";

/**
 * 404: "The application “/the-path” can't be opened." A Liquid Glass
 * alert floats over the desktop, covering the 0 of a giant voxel "404"
 * drawn like the hero wordmark, so the glass refracts the hard pixels
 * behind it. The signature: the alert is a physical sheet on a tether.
 * Pull it anywhere (the 0 shows through, bending in the glass) and it
 * springs home with your velocity; throw it into the Dock and it lands
 * on the Desktop; click the desktop behind it and it shakes its head,
 * like every macOS alert. A zsh transcript underneath offers the app you
 * probably meant ([nyae] answers for real). Return takes the default
 * button; ⌘K / "/" open Spotlight. Renders inside the OS shell.
 */
export function NotFoundApp() {
  const { t, path } = useI18n();
  const router = useRouter();
  const palette = usePalette();
  const { blip } = useSound();
  const reduced = useReduced();
  const pathname = usePathname() ?? "/";

  const command = commandFor(stripLocale(pathname));
  const suggestion = suggest(command);
  const app = suggestion ? (APPS.find((a) => a.id === suggestion.app) ?? APPS[0]) : null;
  const appName = app ? t.shell.apps[app.label] : "";
  const suggestHref = path(app?.path ?? "/");
  const home = path("/");

  const [answer, setAnswer] = useState<Answer | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLElement>(null);
  const shake = useMotionValue(0);
  const flash = useRef(0);

  const tether = useTether({
    surfaceRef,
    stageRef,
    reduced,
    target: () => dockIconCenter("home", home),
    onThrow: () => {
      blip("close");
      router.push(home);
    },
  });

  // the tab says what happened; hand the title back on the way out (the
  // next page may render the same metadata title, which React won't redo)
  useEffect(() => {
    const prev = document.title;
    document.title = `${t.meta.pages.notFound} — ${t.meta.siteName}`;
    return () => {
      document.title = prev;
    };
  }, [t.meta.pages.notFound, t.meta.siteName]);

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
      if (a === "y") router.push(suggestHref, { transitionTypes: ["app-open"] });
      else if (a === "e") palette.open();
      else blip("select");
    },
    [router, suggestHref, palette, blip]
  );

  // keyboard: Return presses the default button; [nyae] answer zsh
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("input,textarea,select,[contenteditable=true],dialog")) return;
      if (document.querySelector("dialog[open]")) return;
      if (e.key === "Enter") {
        // a focused control answers its own Return
        if (el?.closest?.("a,button,[role=button]")) return;
        e.preventDefault();
        const offering = suggestion && answer !== "n" && answer !== "a";
        if (offering) router.push(suggestHref, { transitionTypes: ["app-open"] });
        else router.push(home);
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
  }, [suggestion, answer, suggestHref, home, router, onAnswer]);

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
      <div className="app-nf-backdrop" aria-hidden>
        <Matrix404 />
      </div>
      <div className="app-nf-center">
        <Alert
          tether={tether}
          shake={shake}
          surfaceRef={surfaceRef}
          reduced={reduced}
          path={middleTruncate(fullPath, 34)}
          fullPath={fullPath}
          command={middleTruncate(command, 40)}
          suggestion={suggestion}
          suggestHref={suggestHref}
          appName={appName}
          answer={answer}
          onAnswer={onAnswer}
          onSearch={palette.open}
        />
      </div>
    </div>
  );
}
