"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { m } from "motion/react";
import { useI18n } from "@/i18n/client";
import { useReduced } from "@/hooks/env";
import { useSound } from "@/lib/sound";
import { spring } from "@/lib/motion";
import { SITE_URL } from "@/i18n/config";
import { PixelGlyph } from "@/components/glyphs";
import { CopyButton } from "./Copy";
import { G_CHEVRON, G_DOWN, G_RETRY, G_TERM } from "./glyphs";
import { fill } from "./mail";
import { ART_H, ART_W, drunkenBishop, groups, loadKey, type KeyInfo } from "./pgp";

const KEY_FILE = "elliot-moreau.asc";

/** visit count → colour, cool to warm; start and end stand out */
const HEAT = ["", "#3a3f55", "#7a68e6", "#b3a4ff", "#8be9ff", "#f5f2ec"];

/** The fingerprint drawn as a 17 × 9 pixel board (the drunken bishop). */
function VisualFingerprint({ info }: { info: KeyInfo }) {
  const { grid, start, end } = useMemo(() => drunkenBishop(info.bytes), [info.bytes]);
  return (
    <svg
      viewBox={`-1 -1 ${ART_W + 2} ${ART_H + 2}`}
      shapeRendering="crispEdges"
      className="app-contact-art-svg"
      aria-hidden
      focusable="false"
    >
      {grid.map((n, i) => {
        const x = i % ART_W;
        const y = Math.floor(i / ART_W);
        if (!n) return <rect key={i} x={x + 0.4} y={y + 0.4} width={0.2} height={0.2} fill="#3a3f55" />;
        return <rect key={i} x={x + 0.06} y={y + 0.06} width={0.88} height={0.88} fill={HEAT[Math.min(n, 5)]} />;
      })}
      <rect x={start.x} y={start.y} width={1} height={1} fill="#c6ff5e" />
      <rect x={end.x} y={end.y} width={1} height={1} fill="#ffb86b" />
    </svg>
  );
}

/**
 * PGP key: /pgp.asc read and described in the browser (fingerprint,
 * key ID, user ID, creation date, algorithm, all parsed from the file),
 * its visual fingerprint, copy and download, the armored block revealed
 * on a spring, and a one-line import for terminal people.
 */
export function KeyView({ active }: { active: boolean }) {
  const { t, lang } = useI18n();
  const c = t.contact;
  const reduced = useReduced();
  const { blip } = useSound();
  const uid = useId();
  const [info, setInfo] = useState<KeyInfo | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!active || info) return;
    let alive = true;
    loadKey().then(
      (k) => alive && setInfo(k),
      () => alive && setError(true)
    );
    return () => {
      alive = false;
    };
  }, [active, info, attempt]);

  const command = `curl -sL ${SITE_URL}/pgp.asc | gpg --import`;
  const created = info
    ? new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "long", year: "numeric" }).format(
        info.created
      )
    : "";
  const fp = info ? groups(info.fingerprint) : [];
  const half = Math.ceil(fp.length / 2);
  const lines = info ? info.armored.split("\n") : [];

  return (
    <div className="app-contact-pane">
      <header className="app-contact-head">
        <p className="app-contact-eyebrow">
          {c.keyEyebrow}
          {info && <span className="app-contact-eyebrow-dim">· {info.algorithm}</span>}
        </p>
        <h2 className="app-contact-title">{c.keyTitle}</h2>
        <p className="app-contact-lead">{c.keyLead}</p>
      </header>

      <section className="app-contact-card app-contact-key" aria-busy={!info && !error} aria-labelledby={`${uid}-fp`}>
        {error ? (
          <div className="app-contact-key-error" role="alert">
            <p>{c.keyError}</p>
            <div className="app-contact-actions">
              <button
                type="button"
                className="app-contact-btn"
                onClick={() => {
                  setError(false);
                  setAttempt((a) => a + 1);
                }}
              >
                <PixelGlyph cells={G_RETRY} size={12} />
                <span>{c.retry}</span>
              </button>
              <a className="app-contact-btn app-contact-btn--ghost" href="/pgp.asc" download={KEY_FILE}>
                <PixelGlyph cells={G_DOWN} size={12} />
                <span>{c.keyErrorCta}</span>
              </a>
            </div>
          </div>
        ) : (
          <>
            <div className="app-contact-key-top">
              <figure className="app-contact-art">
                <div className="app-contact-art-board">
                  {info ? <VisualFingerprint info={info} /> : <span className="app-contact-art-empty" />}
                  <span className="app-contact-art-tag app-contact-art-tag--top" aria-hidden>
                    {info ? `${info.algorithm.toUpperCase()} ${info.version === 6 ? "V6" : "V4"}` : "…"}
                  </span>
                  <span className="app-contact-art-tag app-contact-art-tag--bottom" aria-hidden>
                    {info?.version === 6 ? "SHA256" : "SHA1"}
                  </span>
                </div>
                <figcaption className="app-contact-art-cap">
                  <span className="app-contact-art-cap-title">{c.visualFp}</span>
                  <span>{c.visualFpNote}</span>
                </figcaption>
              </figure>

              <div className="app-contact-key-facts">
                <h3 id={`${uid}-fp`} className="app-contact-label">
                  {c.fingerprint}
                </h3>
                {info ? (
                  <p className="app-contact-fp">
                    <span>{fp.slice(0, half).join(" ")}</span>
                    <span>
                      {fp.slice(half).map((g, i) => (
                        <span key={i} data-id={(info.version !== 6 && i >= fp.length - half - 4) || undefined}>
                          {i ? " " : ""}
                          {g}
                        </span>
                      ))}
                    </span>
                  </p>
                ) : (
                  <p className="app-contact-fp app-contact-fp--loading">{c.keyLoading}</p>
                )}
                <dl className="app-contact-dl">
                  <div>
                    <dt>{c.keyId}</dt>
                    <dd className="app-contact-mono">{info ? groups(info.keyId).join(" ") : "…"}</dd>
                  </div>
                  <div>
                    <dt>{c.keyUser}</dt>
                    <dd>{info ? info.userIds[0] ?? "—" : "…"}</dd>
                  </div>
                  <div>
                    <dt>{c.keyCreated}</dt>
                    <dd>{info ? created : "…"}</dd>
                  </div>
                  <div>
                    <dt>{c.keyAlgo}</dt>
                    <dd>{info ? info.algorithm : "…"}</dd>
                  </div>
                </dl>
              </div>
            </div>

            <div className="app-contact-actions app-contact-key-actions">
              <CopyButton
                text={info?.armored ?? null}
                ok={c.keyCopied}
                fail={c.keyCopyFailed}
                className="app-contact-btn app-contact-btn--primary"
              >
                <span>{c.copyKey}</span>
              </CopyButton>
              <a className="app-contact-btn" href="/pgp.asc" download={KEY_FILE}>
                <PixelGlyph cells={G_DOWN} size={12} />
                <span>{c.download}</span>
              </a>
              <button
                type="button"
                className="app-contact-btn app-contact-btn--ghost"
                aria-expanded={open}
                aria-controls={`${uid}-block`}
                disabled={!info}
                data-open={open || undefined}
                onClick={() => {
                  setOpen((o) => !o);
                  blip("toggle");
                }}
              >
                <span className="app-contact-chev" aria-hidden>
                  <PixelGlyph cells={G_CHEVRON} size={12} />
                </span>
                <span>{open ? c.hideKey : c.showKey}</span>
              </button>
            </div>

            <m.div
              id={`${uid}-block`}
              className="app-contact-armor-wrap"
              initial={false}
              animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
              transition={reduced ? { duration: 0 } : { height: spring.default, opacity: { duration: open ? 0.2 : 0.12 } }}
              inert={!open}
            >
              <div className="app-contact-armor">
                <div className="app-contact-armor-head">
                  <span>{KEY_FILE}</span>
                  <span className="tabular">{fill(c.keyLines, { n: lines.length })}</span>
                </div>
                <pre className="app-contact-armor-pre" data-lenis-prevent tabIndex={0} role="region" aria-label={c.keyBlock}>
                  <code>
                    {lines.map((l, i) => (
                      <span key={i} className="app-contact-armor-line">
                        {l || " "}
                        {"\n"}
                      </span>
                    ))}
                  </code>
                </pre>
              </div>
            </m.div>
          </>
        )}
      </section>

      <div className="app-contact-import">
        <p className="app-contact-label">{c.importHint}</p>
        <div className="app-contact-cmd">
          <span className="app-contact-cmd-prompt" aria-hidden>
            <PixelGlyph cells={G_TERM} size={12} />
          </span>
          <code className="app-contact-cmd-text" data-lenis-prevent>
            {command}
          </code>
          <CopyButton
            text={command}
            ok={c.commandCopied}
            fail={c.keyCopyFailed}
            label={c.copyCommand}
            className="app-contact-iconbtn"
          />
        </div>
      </div>
    </div>
  );
}
