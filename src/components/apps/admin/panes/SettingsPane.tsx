"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/i18n/client";
import type { Status } from "@/lib/content";
import { rpc, type Overview } from "../api";
import { useSave } from "../useSave";
import { Field, Group, SaveBar, Section, Select, Text, Toggle } from "../ui";
import { SystemPane } from "./SystemPane";
import { visitorLine, zones } from "./status";

type Posts = { slug: string; title: string; published: string }[];
type Draft = { workHours: Status["workHours"]; replyDays: number; pinnedPost: string; showSpotify: boolean };

/**
 * Settings: when you're online and how soon you reply (what Mail's read
 * estimate says), the post Writing opens on, whether the music shows, and
 * below, the keys to this window (passkeys, browsers, recovery, history).
 */
export function SettingsPane({ data, onSaved }: { data: Overview; onSaved: () => void }) {
  const { t, lang } = useI18n();
  const st = t.admin.settings;
  const s = t.admin.status;
  const l = t.admin.live;
  const initial = useMemo<Draft>(
    () => ({ workHours: data.status.workHours, replyDays: data.status.replyDays, pinnedPost: data.live.pinnedPost ?? "", showSpotify: data.live.showSpotify }),
    [data]
  );
  const [draft, setDraft] = useState<Draft>(initial);
  const [posts, setPosts] = useState<Posts | null>(null);
  const save = useSave(onSaved);
  const tzOptions = useMemo(() => zones().map((z) => ({ value: z, label: z.replace(/_/g, " ") })), []);

  useEffect(() => {
    rpc<{ posts: Posts }>("live.options").then((r) => r.ok && setPosts(r.posts));
  }, []);

  const wh = draft.workHours;
  const setWh = (patch: Partial<Status["workHours"]>) => setDraft((d) => ({ ...d, workHours: { ...d.workHours, ...patch } }));
  const { line, est } = visitorLine({ ...data.status, workHours: wh, replyDays: draft.replyDays }, s, lang);

  const statusDirty = JSON.stringify([draft.workHours, draft.replyDays]) !== JSON.stringify([initial.workHours, initial.replyDays]);
  const liveDirty = draft.pinnedPost !== initial.pinnedPost || draft.showSpotify !== initial.showSpotify;

  const onSave = () =>
    save.run("settings.save", {
      status: statusDirty ? { workHours: draft.workHours, replyDays: draft.replyDays } : {},
      live: liveDirty ? { pinnedPost: draft.pinnedPost, showSpotify: draft.showSpotify } : {},
    });

  const list = posts ?? [];

  return (
    <>
      <Section title={st.title} lede={st.lede}>
        <Group title={s.hours} hint={line}>
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

        <Group title={st.writing}>
          <Select
            label={st.writing}
            hideLabel
            wide
            value={draft.pinnedPost}
            onChange={(v) => setDraft((d) => ({ ...d, pinnedPost: v }))}
            options={[
              { value: "", label: l.latest },
              ...list.map((p) => ({ value: p.slug, label: p.title })),
              ...(draft.pinnedPost && !list.some((p) => p.slug === draft.pinnedPost) ? [{ value: draft.pinnedPost, label: draft.pinnedPost }] : []),
            ]}
            error={save.fieldError("pinnedPost")}
          />
        </Group>

        <Group title={st.music}>
          <Toggle label={l.spotify} hint={l.spotifyHint} checked={draft.showSpotify} onChange={(showSpotify) => setDraft((d) => ({ ...d, showSpotify }))} />
        </Group>

        <SaveBar dirty={statusDirty || liveDirty} saving={save.saving} error={save.error} onRevert={() => (setDraft(initial), save.clear())} onSave={onSave} />
      </Section>

      <div className="app-admin-more">
        <SystemPane data={data} onChanged={onSaved} />
      </div>
    </>
  );
}
