"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/i18n/client";
import { loc, type Status } from "@/lib/content";
import { readEstimate, clock } from "@/components/apps/contact/hours";
import type { Overview } from "../api";
import { useSave } from "../useSave";
import { Field, Group, SaveBar, Section, Segmented, Select, Text, fill } from "../ui";

const OTHER = "__other";

/** every IANA zone the browser knows (a short list if it can't say) */
function zones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone");
  } catch {
    return ["Europe/Paris", "Europe/London", "America/New_York", "America/Los_Angeles", "Asia/Tokyo", "Australia/Sydney", "UTC"];
  }
}

export function StatusPane({ data, onSaved }: { data: Overview; onSaved: () => void }) {
  const { t, lang } = useI18n();
  const s = t.admin.status;
  const [draft, setDraft] = useState<Status>(data.status);
  const save = useSave(onSaved);
  const dirty = JSON.stringify(draft) !== JSON.stringify(data.status);
  const tzs = useMemo(() => zones(), []);
  const tzOptions = tzs.map((z) => ({ value: z, label: z.replace(/_/g, " ") }));

  const away = draft.away;
  const placeChoice = away ? (away.placeId ?? OTHER) : "";
  const places = data.places.filter((p) => !p.home);

  const setAway = (patch: Partial<NonNullable<Status["away"]>> | null) =>
    setDraft((d) => ({ ...d, away: patch === null ? null : { ...(d.away ?? {}), ...patch } }));

  const wh = draft.workHours;
  const setWh = (patch: Partial<Status["workHours"]>) => setDraft((d) => ({ ...d, workHours: { ...d.workHours, ...patch } }));

  // what Mail would tell a visitor right now, with the draft applied
  const est = readEstimate(new Date(), draft);
  const fmtDay = (d: Date) => new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { weekday: "long", timeZone: wh.tz }).format(d);
  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
  const preview =
    est.state === "desk"
      ? s.previewDesk
      : est.state === "later" && est.readAt
        ? fill(s.previewLater, { time: clock(est.readAt, wh.tz, lang) })
        : est.state === "next" && est.readAt
          ? fill(s.previewNext, { day: fmtDay(est.readAt), time: clock(est.readAt, wh.tz, lang) })
          : est.state === "away" && est.awayUntil
            ? fill(s.previewAway, { date: fmtDate(est.awayUntil) })
            : s.previewAwayOpen;

  const resolved = data.away ? (data.away.place ? loc(data.away.place.name, lang) : (data.away.city ?? "?")) : s.resolvedHome;

  return (
    <Section title={s.title} lede={s.lede}>
      <div className="app-admin-preview" aria-live="polite">
        <span className="app-admin-preview-label">{s.preview}</span>
        <p className="app-admin-preview-line">
          <span className="app-admin-dot" data-state={est.state} aria-hidden />
          {preview} {fill(s.replyBy, { n: draft.replyDays })}
        </p>
        <span className="app-admin-hint">{fill(s.resolved, { where: resolved })}</span>
      </div>

      <Group title={s.where} hint={s.datesHint}>
        <Segmented
          label={s.where}
          value={away ? "away" : "home"}
          onChange={(v) => setAway(v === "home" ? null : { placeId: places[0]?.id, city: places[0] ? undefined : "" })}
          options={[
            { value: "home", label: s.home },
            { value: "away", label: s.away },
          ]}
        />
        {away && (
          <div className="app-admin-grid">
            <Select
              label={s.place}
              value={placeChoice}
              onChange={(v) =>
                v === OTHER ? setAway({ placeId: undefined, city: away.city ?? "" }) : setAway({ placeId: v, city: undefined, tz: undefined })
              }
              options={[...places.map((p) => ({ value: p.id, label: loc(p.name, lang) })), { value: OTHER, label: s.otherCity }]}
              error={save.fieldError("away.placeId")}
            />
            {placeChoice === OTHER && (
              <>
                <Text label={s.city} value={away.city ?? ""} onChange={(v) => setAway({ city: v })} error={save.fieldError("away.city")} />
                <Select
                  label={s.tz}
                  value={away.tz ?? wh.tz}
                  onChange={(v) => setAway({ tz: v })}
                  options={tzOptions}
                  error={save.fieldError("away.tz")}
                />
              </>
            )}
            <Text label={s.from} type="date" value={away.from ?? ""} onChange={(v) => setAway({ from: v || undefined })} error={save.fieldError("away.from")} />
            <Text label={s.to} type="date" value={away.to ?? ""} onChange={(v) => setAway({ to: v || undefined })} error={save.fieldError("away.to")} />
          </div>
        )}
      </Group>

      <Group title={s.hours}>
        <div className="app-admin-grid">
          <Text label={s.start} type="time" value={wh.start} onChange={(v) => setWh({ start: v })} error={save.fieldError("workHours.start")} />
          <Text label={s.end} type="time" value={wh.end} onChange={(v) => setWh({ end: v })} error={save.fieldError("workHours.end")} />
          <Select label={s.tz} value={wh.tz} onChange={(v) => setWh({ tz: v })} options={tzOptions} error={save.fieldError("workHours.tz")} />
        </div>
        <Field label={s.days} error={save.fieldError("workHours.days")} wide>
          {(id) => (
            <div className="app-admin-days" id={id} role="group">
              {s.dayNames.map((name, i) => {
                const day = i + 1;
                const on = wh.days.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    className="app-admin-day"
                    aria-pressed={on}
                    onClick={() => setWh({ days: on ? wh.days.filter((x) => x !== day) : [...wh.days, day].sort() })}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          )}
        </Field>
        <div className="app-admin-hours" aria-hidden>
          {est.cells.map((c, h) => (
            <span key={h} style={{ "--w": c } as React.CSSProperties} data-now={Math.floor(est.nowHour) === h || undefined} />
          ))}
        </div>
      </Group>

      <Group title={s.replyDays}>
        <div className="app-admin-grid">
          <Text
            label={s.replyUnit}
            type="number"
            min={1}
            max={30}
            value={String(draft.replyDays)}
            onChange={(v) => setDraft((d) => ({ ...d, replyDays: Math.max(1, Math.min(30, Math.round(Number(v) || 1))) }))}
            error={save.fieldError("replyDays")}
          />
        </div>
      </Group>

      <SaveBar
        dirty={dirty}
        saving={save.saving}
        error={save.error}
        onRevert={() => (setDraft(data.status), save.clear())}
        onSave={() => save.run("status.set", { patch: draft })}
      />
    </Section>
  );
}
