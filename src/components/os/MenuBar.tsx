"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, m, useScroll, useTransform } from "motion/react";
import { useI18n } from "@/i18n/client";
import { spring } from "@/lib/motion";
import { useIsMac } from "@/hooks/env";
import { useSpotifyStatus } from "@/hooks/useSpotifyStatus";
import { useParisTime } from "@/hooks/useParisTime";
import { usePalette } from "@/components/ui/CommandPalette";
import { appForPath } from "./apps";
import { useSiteData } from "./SiteData";
import { MenuItem, MenuProvider, useMenu, type Align, type PanelId } from "./menubar/Panel";
import { AboutPanel } from "./menubar/About";
import { MusicPanel, MusicTrigger } from "./menubar/Music";
import { ControlCenterPanel } from "./menubar/ControlCenter";
import { ClockTrigger, NotificationPanel } from "./menubar/Notifications";
import { ControlIcon, EmosMark, SearchIcon } from "./menubar/glyphs";
import { fill, restartOS } from "./menubar/util";
import "./menubar.css";

/**
 * emOS menu bar. A fixed glass strip (height var(--menubar-h)) that starts
 * nearly clear over the wallpaper and gains material as the page scrolls
 * under it. Left: the emOS mark (About this site), the current app, and
 * Restart. Right: a live status strip: now playing, Control Center,
 * Spotlight and the Paris clock (Notification Center). Every panel grows
 * out of its trigger, only one is open at a time, and Spotlight commands
 * can open them too (window event "em:menubar" with a PanelId detail).
 * Condensed under 768px, where panels become sheets from the top.
 */

const PANELS: Record<PanelId, { width: number; align: Align }> = {
  about: { width: 520, align: "start" },
  music: { width: 328, align: "center" },
  control: { width: 344, align: "end" },
  notifications: { width: 372, align: "edge" },
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

function Bar() {
  const { t } = useI18n();
  const s = t.shell;
  const app = appForPath(usePathname());
  const menu = useMenu();
  const { show } = menu;
  const palette = usePalette();
  const isMac = useIsMac();
  const { time } = useParisTime();
  const music = useSpotifyStatus(useSiteData().spotify);

  // the bar gains material as content scrolls beneath it
  const { scrollY } = useScroll();
  const thick = useTransform(scrollY, [0, 220], [0, 1], { clamp: true });

  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<PanelId>).detail;
      const cfg = PANELS[id];
      // Spotlight is still leaving: open once its dialog hands focus back
      if (cfg) window.setTimeout(() => show(id, cfg.width, cfg.align), 280);
    };
    window.addEventListener("em:menubar", onOpen);
    return () => window.removeEventListener("em:menubar", onOpen);
  }, [show]);

  const musicLabel = music.track
    ? `${music.playing ? s.player.nowPlaying : s.player.lastPlayed}: ${music.track.title}, ${music.track.artist}`
    : s.player.nothing;

  return (
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
        <AppName id={app.id} label={s.apps[app.label]} />
        <button type="button" className="os-menubar-btn os-menubar-text os-menubar-hide-sm" onClick={restartOS}>
          <span>{s.menu.restart}</span>
        </button>
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
    </header>
  );
}
