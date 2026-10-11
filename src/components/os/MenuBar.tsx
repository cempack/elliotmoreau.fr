"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, m, useScroll, useTransform } from "motion/react";
import { useI18n } from "@/i18n/client";
import { spring } from "@/lib/motion";
import { useIsMac } from "@/hooks/env";
import { useSpotifyStatus } from "@/hooks/useSpotifyStatus";
import { useHomeTime } from "@/hooks/useHomeTime";
import { usePalette } from "@/components/ui/CommandPalette";
import { APPS, appForPath, type AppDef } from "./apps";
import { AppGlyph } from "./icons";
import { openWorkspace, useWorkspaces } from "./workspaces";
import { useSiteData } from "./SiteData";
import { MenuItem, MenuProvider, useMenu, type Align, type PanelId } from "./menubar/Panel";
import { AboutPanel } from "./menubar/About";
import { MusicPanel, MusicTrigger } from "./menubar/Music";
import { ControlCenterPanel } from "./menubar/ControlCenter";
import { ClockTrigger, NotificationPanel } from "./menubar/Notifications";
import { ControlIcon, EmosMark, SearchIcon } from "./menubar/glyphs";
import { fill } from "./menubar/util";
import "./menubar.css";

/**
 * emOS top bar, waybar-style. Left: the emOS mark (About, Restart, Lock)
 * and the workspaces: like Hyprland's, one exists only while an app is
 * open in it (see workspaces.ts), drawn with the app's glyph.
 * Centre: date and Toulouse time (Notification Center). Right: now playing,
 * Control Center and Spotlight. Every panel grows out of its trigger,
 * only one is open at a time, and Spotlight commands can open them too
 * (window event "em:menubar" with a PanelId detail). Under 768px the
 * workspaces give way to the app's name (the tab bar switches apps) and
 * panels become sheets from the top.
 */

const PANELS: Record<PanelId, { width: number; align: Align }> = {
  about: { width: 520, align: "start" },
  music: { width: 328, align: "center" },
  control: { width: 344, align: "end" },
  notifications: { width: 372, align: "center" },
};

export function MenuBar() {
  return (
    <MenuProvider>
      <Bar />
    </MenuProvider>
  );
}

function AppName({ id, label }: { id: string; label: string }) {
  return (
    <span className="os-menubar-app">
      <AnimatePresence mode="popLayout" initial={false}>
        <m.span
          key={id}
          className="os-menubar-app-label"
          initial={{ y: 14, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -14, opacity: 0 }}
          transition={spring.snappy}
        >
          {label}
        </m.span>
      </AnimatePresence>
    </span>
  );
}

/** The open workspaces, in dock order: each is its app's glyph, the
    current one lit with a bar beneath. One appears when you open an app
    and leaves when you close its window. */
function Workspaces({ current }: { current: AppDef }) {
  const { t, path } = useI18n();
  const ids = useWorkspaces(current.id);
  // opening an app opens its workspace for the rest of the visit
  useEffect(() => openWorkspace(current.id), [current.id]);
  return (
    <nav className="os-menubar-ws" aria-label={t.shell.menu.workspaces}>
      <AnimatePresence initial={false}>
        {ids.map((id) => {
          const a = APPS.find((x) => x.id === id)!;
          const on = id === current.id;
          const name = t.shell.apps[a.label];
          return (
            <m.span
              key={id}
              className="os-menubar-ws-slot"
              layout="position"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={spring.snappy}
            >
              <Link
                href={path(a.path)}
                transitionTypes={["app-open"]}
                className="os-menubar-ws-btn"
                aria-current={on ? "page" : undefined}
                aria-label={name}
                aria-keyshortcuts={a.key}
                title={`${name} · ${a.key}`}
              >
                <AppGlyph app={a.id} size={14} />
              </Link>
            </m.span>
          );
        })}
      </AnimatePresence>
    </nav>
  );
}

function Bar() {
  const { t } = useI18n();
  const s = t.shell;
  const app = appForPath(usePathname());
  const menu = useMenu();
  const { show } = menu;
  const palette = usePalette();
  const isMac = useIsMac();
  const { time } = useHomeTime();
  const music = useSpotifyStatus(useSiteData().spotify);

  // the bar gains material as content scrolls beneath it
  const { scrollY } = useScroll();
  const thick = useTransform(scrollY, [0, 140], [0, 1], { clamp: true });

  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<PanelId>).detail;
      const cfg = PANELS[id];
      // Spotlight runs its commands once its dialog has closed and handed
      // focus back, so the panel can take focus straight away
      if (cfg) show(id, cfg.width, cfg.align);
    };
    window.addEventListener("em:menubar", onOpen);
    return () => window.removeEventListener("em:menubar", onOpen);
  }, [show]);

  const musicLabel = music.track
    ? `${music.playing ? s.player.nowPlaying : s.player.lastPlayed}${s.colon}${music.track.title}, ${music.track.artist}`
    : s.player.nothing;

  return (
    // the bar's controls carry their own hover pills: the glass cursor
    // steps back to a dot here instead of blurring the labels
    <header className="os-menubar" data-open={menu.open ?? undefined}>
      <div className="os-menubar-bg" aria-hidden />
      <m.div className="os-menubar-tint" style={{ opacity: thick }} aria-hidden />
      <m.div className="os-menubar-edge" style={{ opacity: thick }} aria-hidden />

      <div className="os-menubar-side os-menubar-left">
        <MenuItem
          id="about"
          label={s.menu.mark}
          panelLabel={s.menu.about}
          title={s.menu.about}
          className="os-menubar-mark"
          {...PANELS.about}
          trigger={<EmosMark size={18} />}
        >
          <AboutPanel />
        </MenuItem>
        <Workspaces current={app} />
        <AppName id={app.id} label={s.apps[app.label]} />
      </div>

      <div className="os-menubar-side os-menubar-center">
        <MenuItem
          id="notifications"
          label={fill(s.menu.clock, { time: time ?? "" })}
          panelLabel={s.menu.notifications}
          className="os-menubar-clock"
          {...PANELS.notifications}
          trigger={<ClockTrigger time={time} />}
        >
          <NotificationPanel music={music} />
        </MenuItem>
      </div>

      <div className="os-menubar-side os-menubar-right">
        <MenuItem
          id="music"
          label={musicLabel}
          panelLabel={s.menu.music}
          title={music.track ? `${music.track.title} · ${music.track.artist}` : undefined}
          className="os-menubar-music-btn"
          itemClassName="os-menubar-hide-sm"
          {...PANELS.music}
          trigger={<MusicTrigger music={music} />}
        >
          <MusicPanel music={music} />
        </MenuItem>
        <MenuItem
          id="control"
          label={s.menu.controlCenter}
          panelLabel={s.menu.controlCenter}
          title={s.menu.controlCenter}
          className="os-menubar-icon"
          {...PANELS.control}
          trigger={<ControlIcon />}
        >
          <ControlCenterPanel />
        </MenuItem>
        <div className="os-menubar-item">
          <button
            type="button"
            className="os-menubar-btn os-menubar-search"
            aria-label={s.menu.spotlight}
            aria-keyshortcuts="Meta+K Control+K"
            title={`${s.menu.spotlight} (${isMac ? "⌘K" : "Ctrl K"})`}
            onClick={() => {
              menu.close();
              palette.open();
            }}
          >
            <SearchIcon />
            <kbd className="os-menubar-kbd os-menubar-hide-sm" suppressHydrationWarning>
              {isMac ? "⌘K" : "Ctrl K"}
            </kbd>
          </button>
        </div>
      </div>
    </header>
  );
}
