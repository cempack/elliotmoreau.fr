"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/i18n/client";
import { loc, type Status } from "@/lib/content";
import type { Overview } from "../api";
import { useSave } from "../useSave";
import { Btn, Section, Segmented, Select, Text, fill } from "../ui";
import { StatsGlance } from "../stats/Glance";
import { visitorLine, zones } from "./status";

const OTHER = "__other";

/**
 * Where the panel opens: what visitors are told right now, where you are
 * (home, or away somewhere until a date: one change, one save), the mail
 * waiting, then today's visitors at a glance (the rest is in Stats).
 */
export function OverviewPane({ data, onSaved, onMail, onStats }: { data: Overview; onSaved: () => void; onMail: () => void; onStats: () => void }) {
  const { t, lang } = useI18n();
  const o = t.admin.overview;
  const s = t.admin.status;
  const [away, setAwayDraft] = useState<Status["away"]>(data.status.away);
  const save = useSave(onSaved);
  const draft: Status = { ...data.status, away };
  const dirty = JSON.stringify(away ?? null) !== JSON.stringify(data.status.away ?? null);
  const { line } = visitorLine(draft, s, lang);
  const places = data.places.filter((p) => !p.home);
  const placeChoice = away ? (away.placeId ?? OTHER) : "";
  const tzOptions = useMemo(() => zones().map((z) => ({ value: z, label: z.replace(/_/g, " ") })), []);
  const setAway = (patch: Partial<NonNullable<Status["away"]>> | null) => setAwayDraft((a) => (patch === null ? null : { ...(a ?? {}), ...patch }));
  const resolved = data.away ? (data.away.place ? loc(data.away.place.name, lang) : (data.away.city ?? "?")) : s.resolvedHome;
  const unread = data.mail.unread;

  return (
    <Section title={o.title}>
      <div className="app-admin-hero">
        <p className="app-admin-hero-label">{o.visitorsSee}</p>
        <p className="app-admin-hero-line" aria-live="polite">
          {line}
        </p>
      </div>

      <div className="app-admin-duo">
        <div className="app-admin-card">
          <p className="app-admin-card-title">{o.where}</p>
          <Segmented
            label={o.where}
            value={away ? "away" : "home"}
            onChange={(v) => setAway(v === "home" ? null : { placeId: places[0]?.id, city: places[0] ? undefined : "" })}
            options={[
              { value: "home", label: o.home },
              { value: "away", label: o.away },
            ]}
          />
          {away && (
            <div className="app-admin-grid">
              <Select
                label={s.place}
                value={placeChoice}
                onChange={(v) => (v === OTHER ? setAway({ placeId: undefined, city: away.city ?? "" }) : setAway({ placeId: v, city: undefined, tz: undefined }))}
                options={[...places.map((p) => ({ value: p.id, label: loc(p.name, lang) })), { value: OTHER, label: s.otherCity }]}
                error={save.fieldError("away.placeId")}
              />
              {placeChoice === OTHER && (
                <>
                  <Text label={s.city} value={away.city ?? ""} onChange={(v) => setAway({ city: v })} error={save.fieldError("away.city")} />
                  <Select label={s.tz} value={away.tz ?? data.status.workHours.tz} onChange={(v) => setAway({ tz: v })} options={tzOptions} error={save.fieldError("away.tz")} />
                </>
              )}
              <Text label={o.until} hint={away.to ? undefined : o.untilOpen} type="date" value={away.to ?? ""} onChange={(v) => setAway({ to: v || undefined })} error={save.fieldError("away.to")} />
            </div>
          )}
          <div className="app-admin-card-foot">
            <span className="app-admin-hint">{fill(s.resolved, { where: resolved })}</span>
            {dirty && (
              <span className="app-admin-card-actions">
                <Btn kind="ghost" onClick={() => (setAwayDraft(data.status.away), save.clear())} disabled={save.saving}>
                  {t.admin.common.revert}
                </Btn>
                <Btn kind="primary" onClick={() => save.run("away.set", { away })} disabled={save.saving}>
                  {save.saving ? t.admin.common.saving : o.apply}
                </Btn>
              </span>
            )}
          </div>
          {save.error && <p className="app-admin-error">{save.error}</p>}
        </div>

        <div className="app-admin-card app-admin-mailcard">
          <p className="app-admin-card-title">{t.admin.nav.mail}</p>
          <p className="app-admin-mailcard-count">{unread ? (unread === 1 ? o.unreadOne : fill(o.unread, { n: unread })) : o.noUnread}</p>
          <Btn kind={unread ? "primary" : "plain"} onClick={onMail}>
            {o.openMail}
          </Btn>
        </div>
      </div>

      <StatsGlance onOpen={onStats} />
    </Section>
  );
}
