"use client";

import { useI18n } from "@/i18n/client";
import type { SpotifyStatus, TrackInfo } from "@/lib/spotify";
import { GLYPH_NOTE, PixelEq, Pixels } from "./glyphs";
import { fmtShortDate, useNow } from "./util";
import { Battery } from "./day";
import type { Day } from "@/lib/day";

export type Music = { status: SpotifyStatus | null; track: TrackInfo | null; playing: boolean };

/** Menu bar face: "Sat 10 Oct  14:32", Toulouse time. */
export function ClockTrigger({ time, day }: { time: string | null; day?: Day | null }) {
  const { lang, t } = useI18n();
  const now = useNow("minute");
  return (
    <>
      {day && <Battery day={day} />}
      <span className="os-menubar-date" suppressHydrationWarning>
        {now ? fmtShortDate(now, lang) : " "}
      </span>
      <time className="os-menubar-time tabular" suppressHydrationWarning>
        {time ?? "--:--"}
      </time>
      {day?.away && (
        <span className="os-menubar-away">
          <span className="os-menubar-away-k">{t.shell.day.awayChip}</span>
          <span className="os-menubar-away-city">{day.away.city}</span>
          {day.away.time && <time className="tabular">{day.away.time}</time>}
        </span>
      )}
    </>
  );
}

/** Menu bar face: the equalizer while something plays (a plain note when
    nothing does, so the button still says what it is) + the truncated title. */
export function MusicTrigger({ music }: { music: Music }) {
  const { t } = useI18n();
  const { track, playing } = music;
  return (
    <>
      {playing ? <PixelEq playing /> : <Pixels cells={GLYPH_NOTE} size={14} className="os-menubar-idle" />}
      <span className="os-menubar-music-title" data-playing={playing || undefined}>
        {track ? track.title : t.shell.music.offline}
      </span>
    </>
  );
}
