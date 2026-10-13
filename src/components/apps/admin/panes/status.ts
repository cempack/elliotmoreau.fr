"use client";

import type { Status } from "@/lib/content";
import { readEstimate, clock } from "@/components/apps/contact/hours";
import { fill } from "../ui";

type StatusStrings = {
  previewDesk: string;
  previewLater: string;
  previewNext: string;
  previewAway: string;
  previewAwayOpen: string;
  replyBy: string;
};

/** every IANA zone the browser knows (a short list if it can't say) */
export function zones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone");
  } catch {
    return ["Europe/Paris", "Europe/London", "America/New_York", "America/Los_Angeles", "Asia/Tokyo", "Australia/Sydney", "UTC"];
  }
}

/** What Mail tells a visitor right now, for this status: "Back at 09:00 today. Replies within 3 days." */
export function visitorLine(status: Status, s: StatusStrings, lang: "en" | "fr", at = new Date()) {
  const wh = status.workHours;
  const est = readEstimate(at, status);
  const locale = lang === "fr" ? "fr-FR" : "en-GB";
  const fmtDay = (d: Date) => new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: wh.tz }).format(d);
  const fmtDate = (iso: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
  const line =
    est.state === "desk"
      ? s.previewDesk
      : est.state === "later" && est.readAt
        ? fill(s.previewLater, { time: clock(est.readAt, wh.tz, lang) })
        : est.state === "next" && est.readAt
          ? fill(s.previewNext, { day: fmtDay(est.readAt), time: clock(est.readAt, wh.tz, lang) })
          : est.state === "away" && est.awayUntil
            ? fill(s.previewAway, { date: fmtDate(est.awayUntil) })
            : s.previewAwayOpen;
  return { line: `${line} ${fill(s.replyBy, { n: status.replyDays })}`, est };
}
