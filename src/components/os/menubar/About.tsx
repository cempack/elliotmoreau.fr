"use client";

import "../menubar-panels.css";
import "../intro.css";

import { useEffect, useMemo, useRef } from "react";
import { useI18n } from "@/i18n/client";
import { useSound } from "@/lib/sound";
import { useTheme } from "@/hooks/useTheme";
import { ArrowUpRight, GithubIcon, PowerIcon, RestartIcon, RssIcon } from "./glyphs";
import { BLOG_RSS, SITE_REPO, restartOS } from "./util";
import { shutdownOS } from "../Intro";
import { PhoneTicket } from "./PhoneTicket";
import { useSiteData } from "../SiteData";
import { Wordmark } from "../intro/Wordmark";

/** the theme's colours, as one strip */
const SWATCHES = [
  "var(--color-ink-600)",
  "var(--color-label-3)",
  "var(--color-label)",
  "var(--color-signal)",
  "var(--color-ion)",
  "var(--color-lilac)",
  "var(--color-ember)",
  "var(--color-flare)",
];

/** The boot's own wordmark, drawn at twice this size and scaled down to fit the panel. */
const MARK = { w: 832, h: 208 };

function AboutMark({ label }: { label: string }) {
  const fitRef = useRef<HTMLDivElement>(null);
  // the live field lays its 8px cells over MARK; the box shrinks it to the panel's width
  useEffect(() => {
    const el = fitRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => el.style.setProperty("--k", String(el.clientWidth / MARK.w)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={fitRef} className="os-about-mark" role="img" aria-label={label}>
      <div className="os-about-mark-box" style={{ width: MARK.w, height: MARK.h }}>
        <Wordmark desk={MARK} phone={MARK} live />
      </div>
    </div>
  );
}

/**
 * About this site: the name as the boot draws it (the same living pixel
 * field, at the panel's size), one line on what this is, the few facts
 * worth knowing, a QR code to carry the page to a phone, and the power
 * buttons.
 */
export function AboutPanel() {
  const { t, lang } = useI18n();
  const a = t.shell.about;
  const { blip } = useSound();
  const { meta } = useTheme();
  const { activity, repos } = useSiteData();

  // last updated: the latest push to this site's repo
  const updated = useMemo(() => {
    if (activity && activity.repo === "elliotmoreau.fr") return Date.parse(activity.createdAt);
    const r = repos.find((x) => x.name === "elliotmoreau.fr");
    return r?.pushedAt ? Date.parse(r.pushedAt) : NaN;
  }, [activity, repos]);

  const rows: [string, React.ReactNode][] = [
    [a.keys.built, a.values.built],
    [a.keys.host, a.values.host],
    [
      a.keys.theme,
      <a key="theme" className="os-about-link" href={`https://github.com/${meta.repo}`} target="_blank" rel="noopener noreferrer">
        {meta.name}
        {meta.sha ? <span className="os-about-dim"> · {meta.sha}</span> : null}
      </a>,
    ],
    [a.keys.fonts, a.values.fonts],
  ];
  if (Number.isFinite(updated)) {
    rows.push([
      a.keys.updated,
      <a key="updated" className="os-about-link" href={`${SITE_REPO}/commits`} target="_blank" rel="noopener noreferrer">
        {new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { dateStyle: "long", timeZone: "Europe/Paris" }).format(updated)}
      </a>,
    ]);
  }

  return (
    <div className="os-about">
      <header className="os-about-head">
        <AboutMark label={a.name} />
        <p className="os-about-tagline">{a.tagline}</p>
        <p className="os-about-made">
          {a.name} · {a.made}
        </p>
      </header>

      <div className="os-about-card">
        <dl className="os-about-specs">
          {rows.map(([k, v]) => (
            <div key={k} className="os-about-row">
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="os-about-palette" role="img" aria-label={a.palette}>
          {SWATCHES.map((c) => (
            <span key={c} style={{ background: c }} />
          ))}
        </div>
      </div>

      <PhoneTicket />

      <div className="os-about-actions">
        <a className="os-menubar-action" href={SITE_REPO} target="_blank" rel="noopener noreferrer" aria-label={a.sourceLabel}>
          <GithubIcon />
          <span>{a.source}</span>
          <ArrowUpRight />
        </a>
        <a className="os-menubar-action" href={BLOG_RSS} target="_blank" rel="noopener noreferrer" aria-label={a.rssLabel}>
          <RssIcon />
          <span>{a.rss}</span>
          <ArrowUpRight />
        </a>
        <span className="os-about-gap" aria-hidden />
        <button
          type="button"
          className="os-menubar-action os-menubar-action--ghost"
          onClick={() => {
            blip("close");
            shutdownOS();
          }}
        >
          <PowerIcon />
          <span>{t.shell.menu.shutdown}</span>
        </button>
        <button
          type="button"
          className="os-menubar-action os-menubar-action--ghost"
          onClick={() => {
            blip("click");
            restartOS();
          }}
        >
          <RestartIcon />
          <span>{a.restart}</span>
        </button>
      </div>
    </div>
  );
}
