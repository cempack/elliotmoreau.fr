"use client";

import { useI18n } from "@/i18n/client";
import { useHydrated, useReduced } from "@/hooks/env";
import { Wordmark } from "../intro/Wordmark";
import { ArrowUpRight, GithubIcon, RestartIcon, RssIcon } from "./glyphs";
import { BLOG_RSS, FIRST_COMMIT, SITE_REPO, restartOS, useNow } from "./util";
import { lockOS } from "../Intro";

/** fastfetch's colour blocks, in Moss. */
const SWATCHES = [
  "var(--color-ink-900)",
  "var(--color-ink-600)",
  "var(--color-label-3)",
  "var(--color-label)",
  "var(--color-signal)",
  "var(--color-ion)",
  "var(--color-lilac)",
  "var(--color-ember)",
  "var(--color-flare)",
];

const FIRST = new Date(FIRST_COMMIT).getTime();

function Uptime() {
  const { t } = useI18n();
  const a = t.shell.about;
  const now = useNow("minute");
  if (!now) return <span className="os-menubar-about-dim">…</span>;
  const ms = Math.max(0, now.getTime() - FIRST);
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  return (
    <>
      {d} {d === 1 ? a.day : a.days}, {h} {h === 1 ? a.hour : a.hours}
      <span className="os-menubar-about-dim"> · {a.sinceFirst}</span>
    </>
  );
}

/** The name's box for the menu: the boot's field, a quarter the size. */
const MARK = { w: 480, h: 128 };

/**
 * "About this site", as fastfetch would print it: the boot's living "emos"
 * on top, then user@host, the specs with coloured keys and the palette
 * blocks, then the actions.
 */
export function AboutPanel() {
  const { t } = useI18n();
  const a = t.shell.about;
  const hydrated = useHydrated();
  const reduced = useReduced();
  const rows: [string, React.ReactNode][] = [
    [a.keys.os, a.values.os],
    [a.keys.built, a.values.built],
    [a.keys.host, a.values.host],
    [a.keys.theme, a.values.theme],
    [a.keys.fonts, a.values.fonts],
    [a.keys.location, a.values.location],
    [a.keys.uptime, <Uptime key="up" />],
  ];
  return (
    <div className="os-menubar-about">
      <div className="os-menubar-about-head">
        <div className="os-menubar-about-mark" aria-hidden>
          <div className="os-menubar-about-mark-box">
            <Wordmark desk={MARK} phone={MARK} live={hydrated && !reduced} />
          </div>
        </div>
        <p className="os-menubar-about-version">{a.version}</p>
        <p className="os-menubar-about-tagline">{a.tagline}</p>
      </div>

      <div className="os-menubar-about-ff">
        <p className="os-menubar-about-prompt" aria-hidden>
          <span className="os-menubar-about-user">{a.user}</span>
          <span className="os-menubar-about-at">@</span>
          <span className="os-menubar-about-host">{a.host}</span>
        </p>
        <p className="os-menubar-about-rule" aria-hidden>
          {"-".repeat(a.user.length + 1 + a.host.length)}
        </p>
        <dl className="os-menubar-about-specs">
          {rows.map(([k, v]) => (
            <div key={k} className="os-menubar-about-row">
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <ul className="os-menubar-about-swatches" aria-label={a.palette}>
          {SWATCHES.map((c) => (
            <li key={c} style={{ background: c }} />
          ))}
        </ul>
      </div>

      <div className="os-menubar-about-actions">
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
        <button type="button" className="os-menubar-action os-menubar-action--ghost" onClick={lockOS}>
          <span>{t.shell.menu.lock}</span>
        </button>
        <button type="button" className="os-menubar-action os-menubar-action--ghost os-menubar-action--tail" onClick={restartOS}>
          <RestartIcon />
          <span>{t.shell.menu.restart}</span>
        </button>
      </div>
    </div>
  );
}
