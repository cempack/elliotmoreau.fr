"use client";

import { useEffect, useId, useState } from "react";
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
import { groups, loadKey, normalizeFp, type KeyInfo } from "./pgp";
import { CheckFingerprint, Seal, groupMatches } from "./Seal";

const KEY_FILE = "elliot-moreau.asc";

/**
 * PGP key: /pgp.asc read and described in the browser (fingerprint,
 * key ID, user ID, creation date, algorithm, all parsed from the file),
 * its wax seal (see Seal) and a way to check a fingerprint against it,
 * copy and download, the armored block revealed on a spring, and a
 * one-line import for terminal people.
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
  /** the fingerprint being checked */
  const [check, setCheck] = useState("");

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
                <PixelGlyph cells={G_RETRY} size={14} />
                <span>{c.retry}</span>
              </button>
              <a className="app-contact-btn app-contact-btn--ghost" href="/pgp.asc" download={KEY_FILE}>
                <PixelGlyph cells={G_DOWN} size={14} />
                <span>{c.keyErrorCta}</span>
              </a>
            </div>
          </div>
        ) : (
          <>
            <div className="app-contact-key-top">
              {info ? (
                <Seal
                  info={info}
                  reduced={reduced}
                  verified={normalizeFp(check).slice(0, info.fingerprint.length) === info.fingerprint}
                  label={c.sealLabel}
                />
              ) : (
                <div className="app-contact-seal app-contact-seal--empty" aria-hidden />
              )}

              <div className="app-contact-key-facts">
                <h3 id={`${uid}-fp`} className="app-contact-label">
                  {c.fingerprint}
                </h3>
                {info ? (
                  <FingerprintGroups info={info} check={check} />
                ) : (
                  <p className="app-contact-fp app-contact-fp--loading">{c.keyLoading}</p>
                )}
                <p className="app-contact-seal-hint">{c.sealHint}</p>
                <dl className="app-contact-dl">
                  <div>
                    <dt>{c.keyId}</dt>
                    <dd className="app-contact-mono">{info ? groups(info.keyId).join(" ") : "…"}</dd>
                  </div>
                  <div>
                    <dt>{c.keyUser}</dt>
                    <dd>{info ? info.userIds[0] ?? "-" : "…"}</dd>
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
                {info && (
                  <CheckFingerprint
                    info={info}
                    value={check}
                    onChange={setCheck}
                    labels={{ label: c.checkLabel, placeholder: c.checkPlaceholder, same: c.checkSame, diff: c.checkDiff, note: c.checkNote }}
                  />
                )}
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
                <PixelGlyph cells={G_DOWN} size={14} />
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
                  blip(open ? "close" : "open");
                }}
              >
                <span className="app-contact-chev" aria-hidden>
                  <PixelGlyph cells={G_CHEVRON} size={14} />
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
            <PixelGlyph cells={G_TERM} size={14} />
          </span>
          {/* a sideways scroller: focusable, so the keyboard can scroll it too */}
          <code className="app-contact-cmd-text" data-lenis-prevent tabIndex={0} role="region" aria-label={c.importHint}>
            {command}
          </code>
          <CopyButton
            text={command}
            ok={c.commandCopied}
            fail={c.commandCopyFailed}
            label={c.copyCommand}
            className="app-contact-iconbtn"
          />
        </div>
      </div>
    </div>
  );
}

/** The fingerprint in groups of four, moss as a pasted one matches. */
function FingerprintGroups({ info, check }: { info: KeyInfo; check: string }) {
  const fp = groups(info.fingerprint);
  const half = Math.ceil(fp.length / 2);
  const match = groupMatches(info.fingerprint, check);
  const span = (g: string, i: number) => (
    <span
      key={i}
      className="app-contact-fp-g"
      data-id={(info.version !== 6 && i >= fp.length - 4) || undefined}
      data-match={match[i] ?? undefined}
    >
      {g}
    </span>
  );
  // real spaces between groups, so a copied fingerprint reads as one
  const line = (from: number, to: number) => fp.slice(from, to).flatMap((g, k) => (k ? [" ", span(g, from + k)] : [span(g, from + k)]));
  return (
    <p className="app-contact-fp">
      <span>{line(0, half)}</span>
      <span>{line(half, fp.length)}</span>
    </p>
  );
}
