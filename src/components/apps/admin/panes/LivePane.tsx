"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/client";
import type { LiveOverrides } from "@/lib/content";
import { rpc, type Overview } from "../api";
import { useSave } from "../useSave";
import { Group, SaveBar, Section, Select, Toggle } from "../ui";

type Options = { repos: { name: string; language: string; pushedAt: string }[]; posts: { slug: string; title: string; published: string }[] };

const AUTO = "";

export function LivePane({ data, onSaved }: { data: Overview; onSaved: () => void }) {
  const { t } = useI18n();
  const l = t.admin.live;
  const [draft, setDraft] = useState<LiveOverrides>(data.live);
  const [opts, setOpts] = useState<Options | null>(null);
  const save = useSave(onSaved);

  useEffect(() => {
    rpc<Options>("live.options").then((r) => r.ok && setOpts({ repos: r.repos, posts: r.posts }));
  }, []);

  // compare with the empty-string clears the server expects
  const norm = (v: LiveOverrides) => JSON.stringify({ ...v, featuredRepo: v.featuredRepo ?? "", pinnedPost: v.pinnedPost ?? "", hiddenRepos: [...v.hiddenRepos].sort() });
  const dirty = norm(draft) !== norm(data.live);

  const repos = opts?.repos ?? [];
  // a hidden or featured repo that GitHub no longer lists still shows, so it can be cleared
  const names = [...new Set([...repos.map((r) => r.name), ...draft.hiddenRepos, ...(draft.featuredRepo ? [draft.featuredRepo] : [])])];
  const posts = opts?.posts ?? [];

  return (
    <Section title={l.title} lede={l.lede}>
      <Group title={l.featured}>
        <Select
          label={l.featured}
          hideLabel
          wide
          value={draft.featuredRepo ?? AUTO}
          onChange={(v) => setDraft((d) => ({ ...d, featuredRepo: v || undefined }))}
          options={[{ value: AUTO, label: l.auto }, ...names.filter((n) => !draft.hiddenRepos.includes(n)).map((n) => ({ value: n, label: n }))]}
          error={save.fieldError("featuredRepo")}
        />
      </Group>

      <Group title={l.hidden} hint={l.hiddenHint}>
        {!opts ? (
          <p className="app-admin-empty">{t.admin.common.loading}</p>
        ) : !names.length ? (
          <p className="app-admin-empty">{l.noRepos}</p>
        ) : (
          <ul className="app-admin-checks">
            {names.map((n) => {
              const on = draft.hiddenRepos.includes(n);
              return (
                <li key={n}>
                  <label className="app-admin-check">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        setDraft((d) => ({
                          ...d,
                          hiddenRepos: on ? d.hiddenRepos.filter((x) => x !== n) : [...d.hiddenRepos, n],
                          featuredRepo: !on && d.featuredRepo === n ? undefined : d.featuredRepo,
                        }))
                      }
                    />
                    <span className="app-admin-check-name">{n}</span>
                    <span className="app-admin-hint">{repos.find((r) => r.name === n)?.language}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </Group>

      <Group title={l.pinned}>
        <Select
          label={l.pinned}
          hideLabel
          wide
          value={draft.pinnedPost ?? AUTO}
          onChange={(v) => setDraft((d) => ({ ...d, pinnedPost: v || undefined }))}
          options={[
            { value: AUTO, label: l.latest },
            ...posts.map((p) => ({ value: p.slug, label: p.title })),
            ...(draft.pinnedPost && !posts.some((p) => p.slug === draft.pinnedPost) ? [{ value: draft.pinnedPost, label: draft.pinnedPost }] : []),
          ]}
          error={save.fieldError("pinnedPost")}
        />
      </Group>

      <Group title="Spotify">
        <Toggle label={l.spotify} hint={l.spotifyHint} checked={draft.showSpotify} onChange={(showSpotify) => setDraft((d) => ({ ...d, showSpotify }))} />
      </Group>

      <SaveBar
        dirty={dirty}
        saving={save.saving}
        error={save.error}
        onRevert={() => (setDraft(data.live), save.clear())}
        onSave={() =>
          save.run("live.set", {
            patch: { ...draft, featuredRepo: draft.featuredRepo ?? "", pinnedPost: draft.pinnedPost ?? "" },
          })
        }
      />
    </Section>
  );
}
