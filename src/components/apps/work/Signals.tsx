"use client";

import { m } from "motion/react";
import type { CiInfo, RepoDetail } from "@/lib/github";
import { useI18n } from "@/i18n/client";
import { timeAgo } from "@/lib/format";
import { spring } from "@/lib/motion";
import { fmt, langColor } from "./model";
import type { Mark } from "./extras";

/** Green light: three pixel lamps, the lit one says how the default branch is doing */
export function CiSignal({ ci, words = false }: { ci?: CiInfo; words?: boolean }) {
  const { t, lang } = useI18n();
  if (!ci) return null;
  const c = t.work.ci;
  const state = ci.state;
  const text =
    ci.detail === "deployed" && ci.at
      ? fmt(c.deployed, { ago: timeAgo(ci.at, lang) })
      : state === "failing"
        ? ci.detail
          ? fmt(c.failing, { check: ci.detail })
          : c.failingBare
        : c[state];
  const lamps = (
    <span className="app-work-ci-lamps" data-state={state} aria-hidden>
      <i data-lamp="red" />
      <i data-lamp="amber" />
      <i data-lamp="green" />
    </span>
  );
  const body = (
    <>
      {lamps}
      {words && <span className="app-work-ci-text">{text}</span>}
    </>
  );
  const label = fmt(c.label, { state: text });
  return ci.url && words ? (
    <a href={ci.url} target="_blank" rel="noopener noreferrer" className="app-work-ci" data-state={state} aria-label={`${label}. ${c.open}`} title={label}>
      {body}
    </a>
  ) : (
    <span className="app-work-ci" data-state={state} role="img" aria-label={label} title={label}>
      {body}
    </span>
  );
}

/** New since you last looked: "+3★" or "new", for this visit only */
export function MarkBadge({ mark }: { mark?: Mark }) {
  const { t } = useI18n();
  if (!mark || (!mark.stars && !mark.fresh)) return null;
  const k = t.work.marks;
  return (
    <span
      className="app-work-mark"
      data-kind={mark.stars ? "stars" : "fresh"}
      title={mark.stars ? fmt(k.starsLabel, { n: mark.stars }) : k.freshLabel}
    >
      {mark.stars ? fmt(k.stars, { n: mark.stars }) : k.fresh}
    </span>
  );
}

/**
 * The back of the sticker: what the README says first (and its first
 * picture), the languages by bytes, and the facts: issues, licence,
 * release, build. It turns over into view once GitHub has answered.
 */
export function RepoBack({ detail, reduced }: { detail: RepoDetail | null | undefined; reduced: boolean }) {
  const { t, lang } = useI18n();
  const q = t.work.ql;
  if (detail === undefined) return <p className="app-work-back-loading">{q.loading}</p>;
  if (!detail) return null;
  const total = detail.languages.reduce((s, l) => s + l.bytes, 0) || 1;
  const issues = detail.issues === 0 ? q.issuesNone : detail.issues === 1 ? q.issuesOne : fmt(q.issuesOther, { n: detail.issues });
  return (
    <m.section
      className="app-work-back"
      aria-label={q.back}
      initial={reduced ? { opacity: 0 } : { rotateX: -88, opacity: 0 }}
      animate={reduced ? { opacity: 1 } : { rotateX: 0, opacity: 1 }}
      transition={reduced ? { duration: 0.15 } : spring.default}
      style={{ transformOrigin: "50% 0", transformPerspective: 900 }}
    >
      <p className="app-work-back-k">{q.back}</p>
      {(detail.intro || detail.image) && (
        <div className="app-work-back-readme">
          {detail.image && (
            // README images live on arbitrary hosts: a plain lazy <img>, drawn in pixels
            // eslint-disable-next-line @next/next/no-img-element
            <img src={detail.image} alt="" loading="lazy" className="app-work-back-img" />
          )}
          {detail.intro && (
            <p className="app-work-back-intro" lang="en">
              {detail.intro}
            </p>
          )}
        </div>
      )}
      {detail.languages.length > 0 && (
        <div className="app-work-back-langs">
          <span className="app-work-back-bar" role="img" aria-label={detail.languages.map((l) => `${l.name} ${Math.round((l.bytes / total) * 100)}%`).join(", ")}>
            {detail.languages.map((l) => (
              <i key={l.name} style={{ flexGrow: l.bytes, background: langColor(l.name) }} />
            ))}
          </span>
          <ul className="app-work-back-legend" aria-hidden>
            {detail.languages.slice(0, 4).map((l) => (
              <li key={l.name}>
                <span style={{ color: langColor(l.name) }}>{l.name}</span> <small className="tabular">{Math.max(1, Math.round((l.bytes / total) * 100))}%</small>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="app-work-back-facts">
        <span>{issues}</span>
        <span>{detail.license ?? q.noLicense}</span>
        <span>
          {detail.release ? (
            <a href={detail.release.url} target="_blank" rel="noopener noreferrer">
              {fmt(q.release, { tag: detail.release.tag, ago: timeAgo(detail.release.at, lang) })}
            </a>
          ) : (
            q.noRelease
          )}
        </span>
        <CiSignal ci={detail.ci} words />
      </p>
    </m.section>
  );
}
