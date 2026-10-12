"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Command } from "@/components/ui/CommandPalette";
import { useI18n } from "@/i18n/client";
import { loc } from "@/lib/content";
import { timeAgo } from "@/lib/format";
import { clockIn, tzForAway } from "@/lib/tz";
import { SOCIALS } from "@/lib/socials";
import { useSound } from "@/lib/sound";
import { useToast } from "@/components/Toasts";
import { useSpotifyStatus } from "@/hooks/useSpotifyStatus";
import { useSiteData } from "./SiteData";
import { useElliotsDay } from "./menubar/day";
import { fill } from "./menubar/util";

/**
 * Spotlight answers instead of only linking: "time" gives Toulouse's time
 * and the gap to yours, "playing" the track, "last push" the commit, a
 * place its distance and trip, "email" the address, "away" where Elliot
 * is, "reply" when a message gets read. Each answer has one action on
 * Enter. Words in English or French; no syntax.
 */

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const asks = (q: string, words: string[]) => words.some((w) => q === w || q.startsWith(`${w} `) || (w.includes(" ") && q.includes(w)));

const R = 6371;
function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

const openPanel = (id: string) => window.dispatchEvent(new CustomEvent("em:menubar", { detail: id }));

/** "+2 h", "3 h 30" from minutes */
const gap = (min: number) => {
  const a = Math.abs(min);
  const h = Math.floor(a / 60);
  const m = a % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
};

/** minutes between Toulouse's wall clock and the visitor's */
function offsetToToulouse(at: Date) {
  const parts = (tz?: string) => {
    const p = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(at);
    const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
    return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"));
  };
  return Math.round((parts("Europe/Paris") - parts(undefined)) / 60_000);
}

function Answer({ title, detail, action, post, active }: { title: string; detail?: string; action: string; post: () => void; active: boolean }) {
  return (
    <button type="button" className="em-answer" data-active={active || undefined} onClick={post} tabIndex={-1}>
      <span className="em-answer-title">{title}</span>
      {detail && <span className="em-answer-detail">{detail}</span>}
      <span className="em-answer-go">{action}</span>
    </button>
  );
}

export function useSpotlightAnswers() {
  const router = useRouter();
  const { t, lang, path } = useI18n();
  const { blip } = useSound();
  const { notify } = useToast();
  const data = useSiteData();
  const music = useSpotifyStatus(data.spotify);
  const elliot = useElliotsDay(music.playing);

  return useMemo(() => {
    const sp = t.shell.spotlight;
    const a = sp.answers;
    const home = data.places.find((p) => p.home);

    const card = (id: string, title: string, detail: string | undefined, action: string, perform: () => void): Command => ({
      id: `answer-${id}`,
      group: sp.answer,
      label: detail ? `${title}. ${detail}` : title,
      option: function Opt({ active, post }) {
        return <Answer title={title} detail={detail} action={fill(a.go, { action })} post={post} active={active} />;
      },
      perform,
    });

    return (query: string): Command[] => {
      const q = norm(query);
      if (q.length < 2) return [];
      const now = new Date();
      const out: Command[] = [];

      if (asks(q, ["time", "clock", "heure", "horloge", "what time", "quelle heure", "time in toulouse"])) {
        const off = offsetToToulouse(now);
        const you = new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
        const detail = off === 0 ? a.timeSame : fill(off > 0 ? a.timeAhead : a.timeBehind, { h: gap(off), you });
        out.push(card("time", fill(a.time, { time: clockIn("Europe/Paris", now) }), detail, a.actNc, () => openPanel("notifications")));
      }

      const track = music.track;
      if (track && asks(q, ["playing", "music", "song", "track", "listening", "now playing", "musique", "chanson", "ecoute", "spotify", "morceau"])) {
        const detail = music.playing ? a.playing : track.playedAt ? fill(a.played, { ago: timeAgo(track.playedAt, lang) }) : undefined;
        out.push(card("music", `${track.title} · ${track.artist}`, detail, a.actTrack, () => track.url && window.open(track.url, "_blank", "noopener,noreferrer")));
      }

      const push = data.activity;
      if (push && asks(q, ["last push", "push", "commit", "git", "dernier push", "latest push", "code"])) {
        out.push(
          card("push", push.message, fill(a.push, { repo: push.repo, ago: timeAgo(push.createdAt, lang) }), a.actRepo, () =>
            router.push(`${path("/work")}?repo=${encodeURIComponent(push.repo)}`, { transitionTypes: ["app-open"] } as never)
          )
        );
      }

      if (asks(q, ["email", "mail", "e mail", "contact", "courriel", "adresse", "address"])) {
        out.push(
          card("email", SOCIALS.email, a.emailDo, a.actCopy, () => {
            navigator.clipboard?.writeText(SOCIALS.email).catch(() => {});
            blip("success");
            notify(SOCIALS.email, t.shell.toast.copied);
          })
        );
      }

      if (asks(q, ["where", "away", "ou", "ou est", "voyage", "travel", "travelling", "traveling", "where is elliot"])) {
        const away = data.away;
        const city = away ? (away.place ? loc(away.place.name, lang) : (away.city ?? "")) : "";
        const tz = tzForAway(away);
        const title = !away ? a.home : tz ? fill(a.awayTime, { city, time: clockIn(tz, now) }) : fill(a.away, { city });
        out.push(card("where", title, elliot?.sentence, a.actGlobe, () => router.push(`${path("/atlas")}${away?.placeId ? `#${away.placeId}` : ""}`, { transitionTypes: ["app-open"] } as never)));
      }

      if (elliot && asks(q, ["reply", "when", "answer", "reponse", "repondre", "quand", "delai", "read"])) {
        out.push(card("reply", a.reply, elliot.sentence, a.actMail, () => router.push(path("/contact"), { transitionTypes: ["app-open"] } as never)));
      }

      // a place, by its name in either language or its id ("japan", "japon")
      if (q.length >= 3) {
        const place = data.places.find((p) => [p.id, p.name.en, p.name.fr].some((n) => norm(n) === q || (q.length >= 4 && norm(n).startsWith(q))));
        if (place && !place.home) {
          const bits = [place.status === "been" ? sp.been : sp.want];
          if (home) bits.push(fill(sp.kmFrom, { km: km(home, place).toLocaleString(lang === "fr" ? "fr-FR" : "en-GB") }));
          if (place.tripFrom && place.tripTo) bits.push(fill(sp.trip, { from: place.tripFrom, to: place.tripTo }));
          out.push(
            card(`place-${place.id}`, loc(place.name, lang), bits.join(" · "), a.actGlobe, () =>
              router.push(`${path("/atlas")}#${place.id}`, { transitionTypes: ["app-open"] } as never)
            )
          );
        }
      }
      return out;
    };
  }, [t, lang, path, router, blip, notify, data, music, elliot]);
}
