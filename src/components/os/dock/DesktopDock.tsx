"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/i18n/client";
import { APPS, appForPath } from "../apps";
import { AppIcon, ICON_ACCENT, type IconId } from "../icons";
import { Glass } from "../Glass";
import { useTerminal } from "../Terminal";
import { openOverview, useOverviewOpen } from "../overview";
import { DOCK_ICON, useMagnification } from "./useMagnification";
import { bounce, isPlainClick, pressHandlers } from "./launch";

/** Icon stack shared by every slot: magnify → bounce → press → tile. */
function DockIcon({ app }: { app: IconId }) {
  return (
    <span className="os-dock-icon" data-dock-icon>
      <span className="os-dock-bounce" data-dock-bounce>
        <span className="os-dock-press">
          <AppIcon app={app} size={DOCK_ICON} />
        </span>
      </span>
    </span>
  );
}

function Tip({ label, kbd }: { label: string; kbd: string }) {
  return (
    <span className="os-dock-tipwrap" data-dock-tip aria-hidden>
      <span className="os-dock-tip">
        {label}
        <kbd className="os-dock-kbd">{kbd}</kbd>
      </span>
    </span>
  );
}

/**
 * The desktop dock (≥768px): a flat bar of pixel app icons, a hairline
 * separator, then Terminal and Open windows (the overview). Tooltips, an active-app marker, press
 * feedback and a one-hop bounce when an app launches. Arrow keys rove
 * between icons.
 */
export function DesktopDock() {
  const { t, path } = useI18n();
  const router = useRouter();
  const active = appForPath(usePathname());
  const term = useTerminal();
  const overview = useOverviewOpen();
  const zoneRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const plateRef = useRef<HTMLDivElement>(null);
  // no macOS magnification: a tiling desktop's bar holds still
  useMagnification(zoneRef, listRef, plateRef, false);

  // roving tabindex: one tab stop, the last focused icon (else the active app)
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const tabStop = focusIdx ?? Math.max(0, APPS.findIndex((a) => a.id === active.id));
  const termIdx = APPS.length;
  const overviewIdx = APPS.length + 1;

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const els = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[data-dock-focus]"));
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % els.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + els.length) % els.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = els.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setFocusIdx(next);
    els[next].focus();
  };

  return (
    <nav ref={zoneRef} aria-label={t.dock.label} className="os-dock" data-os-dock="">
      <div className="os-dock-shelf">
        <div ref={plateRef} className="os-dock-plate" aria-hidden>
          <span className="os-dock-solid" />
          <Glass thickness="regular" className="os-dock-glass" />
        </div>
        <div
          ref={listRef}
          role="toolbar"
          aria-label={t.dock.apps}
          aria-orientation="horizontal"
          className="os-dock-list"
          onKeyDown={onKeyDown}
        >
          {APPS.map((app, i) => {
            const on = app.id === active.id;
            const label = t.shell.apps[app.label];
            return (
              <div
                key={app.id}
                className="os-dock-item"
                style={{ "--tile": ICON_ACCENT[app.id] } as React.CSSProperties}
                data-dock-item=""
                data-dock-scale=""
                data-dock-launch={app.id}
              >
                <Link
                  // warmed on hover or press (and on idle by IdlePrefetch), not all at once on load
                  prefetch={false}
                  onPointerEnter={() => router.prefetch(path(app.path))}
                  href={path(app.path)}
                  transitionTypes={["app-open"]}
                  className="os-dock-link"
                  aria-label={label}
                  aria-current={on ? "page" : undefined}
                  aria-keyshortcuts={app.key}
                  tabIndex={i === tabStop ? 0 : -1}
                  data-dock-focus=""
                  onFocus={() => setFocusIdx(i)}
                  onClick={(e) => {
                    if (!isPlainClick(e)) return;
                    // already here: no redundant navigation (and no page transition flash)
                    if (on) return e.preventDefault();
                    bounce(e.currentTarget.parentElement?.querySelector("[data-dock-bounce]"));
                  }}
                  {...pressHandlers}
                >
                  <DockIcon app={app.id} />
                </Link>
                <span className="os-dock-dot" data-on={on ? "" : undefined} aria-hidden />
                <Tip label={label} kbd={app.key} />
              </div>
            );
          })}
          <span className="os-dock-sep" data-dock-item="" aria-hidden />
          <div
            className="os-dock-item"
            style={{ "--tile": ICON_ACCENT.terminal } as React.CSSProperties}
            data-dock-item=""
            data-dock-scale=""
            data-dock-launch="terminal"
          >
            <button
              type="button"
              className="os-dock-link"
              aria-label={t.shell.apps.terminal}
              aria-pressed={term.open}
              aria-keyshortcuts="`"
              tabIndex={termIdx === tabStop ? 0 : -1}
              data-dock-focus=""
              onFocus={() => setFocusIdx(termIdx)}
              onClick={(e) => {
                if (!term.open) bounce(e.currentTarget.parentElement?.querySelector("[data-dock-bounce]"));
                term.toggle();
              }}
              {...pressHandlers}
            >
              <DockIcon app="terminal" />
            </button>
            <span className="os-dock-dot" data-on={term.open ? "" : undefined} aria-hidden />
            <Tip label={t.shell.apps.terminal} kbd="`" />
          </div>
          {/* every open window, over the river (WindowsOverview) */}
          <div
            className="os-dock-item"
            style={{ "--tile": ICON_ACCENT.overview } as React.CSSProperties}
            data-dock-item=""
            data-dock-scale=""
            data-dock-launch="overview"
          >
            <button
              type="button"
              className="os-dock-link"
              aria-label={t.shell.overview.label}
              aria-pressed={overview}
              aria-keyshortcuts="Control+ArrowUp"
              tabIndex={overviewIdx === tabStop ? 0 : -1}
              data-dock-focus=""
              onFocus={() => setFocusIdx(overviewIdx)}
              onClick={() => openOverview()}
              {...pressHandlers}
            >
              <DockIcon app="overview" />
            </button>
            <Tip label={t.shell.overview.label} kbd="⌃↑" />
          </div>
        </div>
      </div>
    </nav>
  );
}
