"use client";

import Link from "next/link";
import { useRef, useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { m } from "motion/react";
import { useI18n } from "@/i18n/client";
import { useReduced } from "@/hooks/env";
import { spring } from "@/lib/motion";
import { usePalette } from "@/components/ui/palette";
import { Sheet, useSheetDismiss } from "@/components/ui/Sheet";
import { APPS, appForPath, type AppId } from "../apps";
import { AppIcon, type IconId } from "../icons";
import { useTerminal } from "../Terminal";
import { bounce, isPlainClick, markLaunch, pressHandlers, scrollToTop } from "./launch";

/** The five apps that earn a tab; the rest live behind More. */
const PRIMARY: AppId[] = ["home", "work", "writing", "atlas", "contact"];
const TAB_ICON = 32;

function Lens({ reduced }: { reduced: boolean }) {
  return (
    <m.span
      layoutId="os-tabbar-lens"
      className="os-tabbar-lens"
      aria-hidden
      transition={reduced ? { duration: 0 } : spring.default}
    />
  );
}

function TabFace({ app, label }: { app: IconId; label: string }) {
  return (
    <>
      <span className="os-tabbar-icon" data-dock-bounce>
        <span className="os-tabbar-press">
          <AppIcon app={app} size={TAB_ICON} />
        </span>
      </span>
      {/* icons only on the bar; the name stays for assistive tech */}
      <span className="sr-only">{label}</span>
    </>
  );
}

function Chevron() {
  return (
    <svg className="os-more-chev" width="8" height="14" viewBox="0 0 8 14" aria-hidden focusable="false">
      <path d="M1.5 1.5 6.5 7l-5 5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The phone dock (<768px): a solid bar along the bottom edge. Five apps
 * get a tab (icons only, each with its name for assistive tech) and a moss
 * bar slides to the current one; More opens a flingable sheet with Now,
 * Terminal and Search.
 */
/** fields that bring up the on-screen keyboard */
const KBD_FIELDS =
  'input:not([type="checkbox"], [type="radio"], [type="range"], [type="button"], [type="submit"], [type="reset"], [type="color"], [type="file"]), textarea, [contenteditable="true"]';

export function MobileTabBar() {
  const { t, path } = useI18n();
  const active = appForPath(usePathname());
  const reduced = useReduced();
  const [more, setMore] = useState(false);
  const after = useRef<(() => void) | null>(null);

  const inMore = !PRIMARY.includes(active.id);

  // typing: the bar steps out of the keyboard's way
  const [kbd, setKbd] = useState(false);
  useEffect(() => {
    const typing = (el: EventTarget | null) => el instanceof HTMLElement && el.matches(KBD_FIELDS);
    const on = (e: FocusEvent) => setKbd(typing(e.target));
    const off = (e: FocusEvent) => setKbd(typing(e.relatedTarget));
    document.addEventListener("focusin", on);
    document.addEventListener("focusout", off);
    return () => {
      document.removeEventListener("focusin", on);
      document.removeEventListener("focusout", off);
    };
  }, []);

  const launch = (e: React.MouseEvent<HTMLElement>, on: boolean) => {
    if (!isPlainClick(e)) return;
    if (on) {
      e.preventDefault();
      scrollToTop();
      return;
    }
    const tab = e.currentTarget;
    markLaunch(tab.querySelector("[data-dock-bounce]"));
    bounce(tab.querySelector("[data-dock-bounce]"), 7);
  };

  return (
    <>
      <nav aria-label={t.dock.label} className="os-tabbar" data-os-dock="" data-kbd={kbd || undefined}>
        <ul className="os-tabbar-list">
          {PRIMARY.map((id) => {
            const app = APPS.find((a) => a.id === id)!;
            const on = active.id === id;
            return (
              <li key={id} className="os-tabbar-item" data-dock-launch={id}>
                <Link prefetch={false}
                  href={path(app.path)}
                  transitionTypes={["app-open"]}
                  className="os-tabbar-link"
                  aria-current={on ? "page" : undefined}
                  onClick={(e) => launch(e, on)}
                  {...pressHandlers}
                >
                  {on && <Lens reduced={reduced} />}
                  <TabFace app={id} label={t.shell.apps[app.label]} />
                </Link>
              </li>
            );
          })}
          <li className="os-tabbar-item">
            <button
              type="button"
              className="os-tabbar-link"
              aria-haspopup="dialog"
              aria-expanded={more}
              aria-current={inMore ? "page" : undefined}
              onClick={() => setMore(true)}
              {...pressHandlers}
            >
              {inMore && <Lens reduced={reduced} />}
              <TabFace app="more" label={t.dock.more} />
            </button>
          </li>
        </ul>
      </nav>

      <Sheet
        open={more}
        label={t.dock.moreTitle}
        className="os-more"
        onClose={() => {
          setMore(false);
          const fn = after.current;
          after.current = null;
          fn?.();
        }}
      >
        <MoreList active={active.id} afterRef={after} />
      </Sheet>
    </>
  );
}

/**
 * The More sheet's rows. Lives inside <Sheet> so every row can ask it to
 * leave along its own path (useSheetDismiss); a follow-up action waits in
 * `afterRef` and runs once the sheet has gone (the Sheet's onClose).
 */
function MoreList({ active, afterRef }: { active: AppId; afterRef: React.RefObject<(() => void) | null> }) {
  const { t, path } = useI18n();
  const term = useTerminal();
  const palette = usePalette();
  const dismiss = useSheetDismiss();
  const now = APPS.find((a) => a.id === "now")!;

  /** close the sheet, then run `fn` once it has left */
  const thenClose = (fn: () => void) => {
    afterRef.current = fn;
    dismiss();
  };

  return (
    <>
      <h2 className="os-more-title">{t.dock.moreTitle}</h2>
      <ul className="os-more-list">
        <li data-dock-launch="now">
          <Link prefetch={false}
            href={path(now.path)}
            transitionTypes={["app-open"]}
            className="os-more-row"
            aria-current={active === "now" ? "page" : undefined}
            onClick={(e) => {
              if (!isPlainClick(e)) return;
              if (active === "now") {
                e.preventDefault();
                thenClose(scrollToTop);
                return;
              }
              markLaunch(e.currentTarget.querySelector("[data-dock-bounce]"));
              dismiss();
            }}
          >
            <span data-dock-bounce>
              <AppIcon app="now" size={44} />
            </span>
            <span className="os-more-text">
              <span className="os-more-name">{t.shell.apps.now}</span>
              <span className="os-more-hint">{t.dock.nowHint}</span>
            </span>
            <Chevron />
          </Link>
        </li>
        <li>
          <button
            type="button"
            className="os-more-row"
            aria-pressed={term.open}
            onClick={() => thenClose(() => term.setOpen(true))}
          >
            <AppIcon app="terminal" size={44} />
            <span className="os-more-text">
              <span className="os-more-name">{t.shell.apps.terminal}</span>
              <span className="os-more-hint">{t.dock.terminalHint}</span>
            </span>
            <Chevron />
          </button>
        </li>
        <li>
          <button type="button" className="os-more-row" onClick={() => thenClose(palette.open)}>
            <AppIcon app="spotlight" size={44} />
            <span className="os-more-text">
              <span className="os-more-name">{t.dock.search}</span>
              <span className="os-more-hint">{t.dock.searchHint}</span>
            </span>
            <Chevron />
          </button>
        </li>
      </ul>
    </>
  );
}
