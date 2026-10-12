"use client";

import { useMemo } from "react";
import { useI18n } from "@/i18n/client";
import { fill } from "./mail";
import { useAway, useStatus } from "@/components/os/SiteData";
import { clock, readEstimate } from "./hours";
import { readSentence } from "./levee";
import { useNow } from "./useNow";

const SCALE = ["00", "06", "12", "18", "24"];

/**
 * "When it'll be read", on the card after a letter is delivered: Elliot's
 * day in Toulouse as 24 cells (his working hours lit, a mark at the time
 * now), when he's likely to read it, and when a reply usually comes. All
 * from his status (working hours, reply days, away), in his time zone,
 * with the visitor's own time beside it when theirs differs. A trip dated on
 * an Atlas place counts as away too (the resolved trip, as the box reads it).
 */
export function ReadEstimate() {
  const { t, lang } = useI18n();
  const w = t.contact.when;
  const status = useStatus();
  const away = useAway();
  const now = useNow(30_000);
  const tz = status.workHours.tz;
  const loc = lang === "fr" ? "fr-FR" : "en-GB";

  const view = useMemo(() => {
    if (!now) return null;
    const est = readEstimate(now, { ...status, away });
    const mine = Intl.DateTimeFormat().resolvedOptions().timeZone || tz;
    const longDate = (d: Date) => new Intl.DateTimeFormat(loc, { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(d);
    const read = readSentence(est, { lang, tz, mine, w });
    const n = Math.max(1, status.replyDays);
    const reply = est.replyBy ? fill(n === 1 ? w.replyOne : w.reply, { n, date: longDate(est.replyBy) }) : null;
    const nowClock = clock(now, tz, lang);
    const working = est.cells.some((c) => c > 0);
    const label = working ? fill(w.strip, { start: est.start, end: est.end, now: nowClock }) : fill(w.stripOff, { now: nowClock });
    return { est, read, reply, nowClock, label };
  }, [now, status, away, tz, lang, loc, w]);

  return (
    <section className="app-contact-when" aria-label={w.label}>
      <div className="app-contact-when-head">
        <span className="app-contact-label">{w.label}</span>
        <span className="app-contact-when-clock tabular">{view ? fill(w.clock, { time: view.nowClock }) : " "}</span>
      </div>
      <div className="app-contact-when-day">
        <div className="app-contact-when-strip" role="img" aria-label={view?.label ?? w.label}>
          {(view?.est.cells ?? Array.from({ length: 24 }, () => 0)).map((f, i) => (
            <i
              key={i}
              data-on={f > 0 || undefined}
              data-past={(view && i + 1 <= Math.floor(view.est.nowHour)) || undefined}
              style={f > 0 && f < 1 ? ({ "--f": f } as React.CSSProperties) : undefined}
            />
          ))}
          {view && <span className="app-contact-when-now" style={{ left: `${(view.est.nowHour / 24) * 100}%` }} aria-hidden />}
        </div>
        <div className="app-contact-when-scale" aria-hidden>
          {SCALE.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
      </div>
      <p className="app-contact-when-read">{view?.read ?? " "}</p>
      {view?.reply && <p className="app-contact-when-reply">{view.reply}</p>}
    </section>
  );
}
