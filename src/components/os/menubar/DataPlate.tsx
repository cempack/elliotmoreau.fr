"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/i18n/client";
import { useSiteData } from "../SiteData";
import { FIRST_COMMIT, SITE_REPO, fill, useNow } from "./util";
import { timeAgo } from "@/lib/format";

/**
 * The plate every aircraft built in Toulouse carries, for emOS: brushed
 * aluminium, four rivets, two engraved lines (model and where it was
 * built; when it was made and last serviced), and a Hobbs meter, the
 * counter aircraft log engine hours on, counting real hours since the
 * first commit. On open the drums roll from the reading this visitor last
 * saw to now, rightmost furthest, like an odometer catching up; on a first
 * visit nothing rolls. Only real values: no serial number.
 */

const FIRST = new Date(FIRST_COMMIT).getTime();
const SEEN_KEY = "em-hobbs";
/** the reading this visitor last saw, read once per page load (so a
    second mount, or reopening the panel, doesn't read back our own write) */
let lastSeen: number | null | undefined;

/** "21 MAR 2026", in the plate's language, unaccented as stamped plates are */
function stampDate(t: number, lang: string) {
  const parts = new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" }).formatToParts(
    new Date(t)
  );
  const get = (k: string) => parts.find((p) => p.type === k)?.value ?? "";
  return `${get("day")} ${get("month").replace(/\./g, "")} ${get("year")}`.toUpperCase();
}

/** one drum: a strip of digits that rolls forward to its value */
function Drum({ value, from, turns, delay, white }: { value: number; from: number | null; turns: number; delay: number; white?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (from == null || reduced || (from === value && turns === 0)) {
      el.style.transition = "none";
      el.style.transform = `translateY(${-(value / 30) * 100}%)`;
      return;
    }
    // start where this visitor left it, then roll forward (never back)
    el.style.transition = "none";
    el.style.transform = `translateY(${-(from / 30) * 100}%)`;
    const target = value + 10 * (turns + (value < from ? 1 : 0));
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        el.style.transition = `transform 600ms cubic-bezier(0.23, 1, 0.32, 1) ${delay}ms`;
        el.style.transform = `translateY(${-(target / 30) * 100}%)`;
      })
    );
    const done = window.setTimeout(() => {
      el.style.transition = "none";
      el.style.transform = `translateY(${-(value / 30) * 100}%)`;
    }, 700 + delay);
    return () => {
      cancelAnimationFrame(id);
      window.clearTimeout(done);
    };
  }, [value, from, turns, delay]);
  return (
    <span className="os-plate-drum" data-white={white || undefined}>
      <span ref={ref} className="os-plate-strip" style={{ transform: `translateY(${-(value / 30) * 100}%)` }}>
        {Array.from({ length: 30 }, (_, k) => (
          <span key={k}>{k % 10}</span>
        ))}
      </span>
    </span>
  );
}

export function DataPlate() {
  const { t, lang } = useI18n();
  const a = t.shell.about;
  const p = a.plate;
  const { activity, repos } = useSiteData();
  const now = useNow("minute");
  const [seen, setSeen] = useState<number | null | undefined>(undefined);

  // the last reading this visitor saw (their device only), then today's
  useEffect(() => {
    if (lastSeen === undefined) {
      lastSeen = null;
      try {
        const raw = localStorage.getItem(SEEN_KEY);
        const v = raw ? Number(raw) : NaN;
        lastSeen = Number.isFinite(v) ? v : null;
        localStorage.setItem(SEEN_KEY, String((Date.now() - FIRST) / 3_600_000));
      } catch {}
    }
    const id = window.setTimeout(() => setSeen(lastSeen ?? null), 0);
    return () => window.clearTimeout(id);
  }, []);

  // last service: the latest push to this site's repo, else its pushedAt
  const service = useMemo(() => {
    if (activity && activity.repo === "elliotmoreau.fr") return { at: Date.parse(activity.createdAt), msg: activity.message };
    const r = repos.find((x) => x.name === "elliotmoreau.fr");
    return r?.pushedAt ? { at: Date.parse(r.pushedAt), msg: "" } : null;
  }, [activity, repos]);

  const lines = [
    `${p.model} · ${p.built}`,
    [fill(p.mfg, { date: stampDate(FIRST, lang) }), service ? fill(p.service, { date: stampDate(service.at, lang) }) : ""].filter(Boolean).join(" · "),
  ];

  const hours = now ? (now.getTime() - FIRST) / 3_600_000 : null;
  const tenths = hours == null ? 0 : Math.floor(hours * 10);
  const digits = String(Math.floor(tenths / 10)).padStart(5, "0").slice(-5).split("").map(Number);
  const tenth = tenths % 10;
  const before = seen != null ? Math.floor(seen * 10) : null;
  const fromDigits = before != null ? String(Math.floor(before / 10)).padStart(5, "0").slice(-5).split("").map(Number) : null;
  const delta = before != null ? tenths - before : 0;
  const turnsFor = (place: number) => Math.min(2, Math.floor(delta / (10 * place)));

  return (
    <div className="os-plate-wrap">
      <div className="os-plate">
        <div className="os-plate-text" aria-hidden>
          {lines.map((l, i) => (
            <p key={i} className="os-plate-line">
              {l}
            </p>
          ))}
        </div>
        {hours != null && (
          <div className="os-plate-hobbs" aria-hidden>
            <span className="os-plate-hobbs-label">{p.hours}</span>
            <span className="os-plate-drums">
              {digits.map((d, i) => (
                <Drum key={i} value={d} from={fromDigits ? fromDigits[i] : null} turns={turnsFor(10 ** (4 - i) * 10)} delay={(5 - i) * 40} />
              ))}
              <Drum value={tenth} from={before != null ? before % 10 : null} turns={turnsFor(1)} delay={0} white />
            </span>
          </div>
        )}
        <p className="sr-only">
          {fill(p.aria, {
            mfg: new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { dateStyle: "long" }).format(FIRST),
            service: service ? new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { dateStyle: "long" }).format(service.at) : "",
            hours: hours == null ? "" : Math.floor(hours).toLocaleString(lang),
          })}
        </p>
      </div>
      {seen != null && hours != null && delta > 0 && (
        <p className="os-plate-since">{fill(p.since, { h: (delta / 10).toLocaleString(lang, { maximumFractionDigits: 1 }) })}</p>
      )}
      {service?.msg && (
        <a className="os-plate-log" href={`${SITE_REPO}/commits`} target="_blank" rel="noopener noreferrer">
          <span className="os-plate-log-msg">{service.msg}</span>
          <span className="os-plate-log-ago" suppressHydrationWarning>
            {now ? timeAgo(new Date(service.at).toISOString(), lang) : ""}
          </span>
        </a>
      )}
    </div>
  );
}
