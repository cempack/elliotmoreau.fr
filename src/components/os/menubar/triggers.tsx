"use client";

import { useI18n } from "@/i18n/client";
import type { SpotifyStatus, TrackInfo } from "@/lib/spotify";
import { PixelEq } from "./glyphs";
import { fmtShortDate, useNow } from "./util";

export type Music = { status: SpotifyStatus | null; track: TrackInfo | null; playing: boolean };

/** Menu bar face: "Sat 10 Oct  14:32", Toulouse time. */
export function ClockTrigger({ time }: { time: string | null }) {
  const { lang } = useI18n();
  const now = useNow("minute");
  return (
    <>
      <span className="os-menubar-date" suppressHydrationWarning>
        {now ? fmtShortDate(now, lang) : " "}
      </span>
      <time className="os-menubar-time tabular" suppressHydrationWarning>
        {time ?? "--:--"}
      </time>
    </>
  );
}

/** Menu bar face: pixel equalizer + the truncated title. */
export function MusicTrigger({ music }: { music: Music }) {
  const { t } = useI18n();
  const { track, playing } = music;
  return (
    <>
      <PixelEq playing={playing} />
      <span className="os-menubar-music-title" data-playing={playing || undefined}>
        {track ? track.title : t.shell.music.offline}
      </span>
    </>
  );
}
