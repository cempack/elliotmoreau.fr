"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/i18n/client";
import { PROJECT_KINDS, type L10n, type ProjectKind, type ProjectNote } from "@/lib/content";
import { guessKind } from "@/components/apps/work/kind";
import { rpc, type Overview } from "../api";
import { useSave } from "../useSave";
import { Btn, Group, Pair, SaveBar, Section, Select, Text, Toggle, fill } from "../ui";

type Repo = { name: string; description: string; homepage: string; topics: string[]; language: string; pushedAt: string; url: string };
type Draft = { notes: Record<string, ProjectNote>; order: string[]; hidden: string[]; featured: string };

const keyOf = (name: string) => name.toLowerCase();

/** the same draft whatever order its keys came in, for "is anything unsaved?" */
const norm = (d: Draft) =>
  JSON.stringify({
    notes: Object.keys(d.notes)
      .sort()
      .map((k) => [k, d.notes[k].kind, d.notes[k].title ?? "", d.notes[k].plain?.en ?? "", d.notes[k].plain?.fr ?? ""]),
    order: d.order,
    hidden: d.hidden.map(keyOf).sort(),
    featured: keyOf(d.featured),
  });

/**
 * Projects: every repo GitHub lists, on the shelves the site shows them on.
 * Each one gets a readable title, a sentence for anyone (EN and FR), a
 * shelf, a place in its shelf's order and whether it shows at all; the
 * project the page opens on is picked at the top. One save writes it all.
 */
export function ProjectsPane({ data, onSaved }: { data: Overview; onSaved: () => void }) {
  const { t, lang } = useI18n();
  const p = t.admin.projects;
  const save = useSave(onSaved);
  const initial = useMemo<Draft>(
    () => ({
      notes: data.projects.notes,
      order: data.projects.order,
      hidden: data.live.hiddenRepos,
      featured: data.live.featuredRepo ?? "",
    }),
    [data]
  );
  const [draft, setDraft] = useState<Draft>(initial);
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    rpc<{ repos: Repo[] }>("projects.options").then((r) => {
      if (r.ok) setRepos(r.repos);
      else setFailed(true);
    });
  }, []);

  const kindOf = (r: Repo): ProjectKind => draft.notes[keyOf(r.name)]?.kind ?? guessKind(r);

  // each shelf in the order the site will show it: the hand-set order, then the rest most recent first
  const shelves = useMemo(() => {
    if (!repos) return [];
    const rank = new Map(draft.order.map((n, i) => [n, i]));
    const time = (r: Repo) => Date.parse(r.pushedAt) || 0;
    const by = new Map<ProjectKind, Repo[]>();
    for (const r of repos) {
      const k = draft.notes[keyOf(r.name)]?.kind ?? guessKind(r);
      by.set(k, [...(by.get(k) ?? []), r]);
    }
    return PROJECT_KINDS.filter((k) => by.has(k)).map((kind) => ({
      kind,
      repos: by.get(kind)!.sort((a, b) => (rank.get(keyOf(a.name)) ?? Infinity) - (rank.get(keyOf(b.name)) ?? Infinity) || time(b) - time(a)),
    }));
  }, [repos, draft.notes, draft.order]);

  const setNote = (r: Repo, patch: Partial<ProjectNote>) =>
    setDraft((d) => {
      const k = keyOf(r.name);
      const next: ProjectNote = { ...(d.notes[k] ?? { kind: guessKind(r) }), ...patch };
      if (!next.title) delete next.title;
      if (!next.plain || (!next.plain.en && !next.plain.fr)) delete next.plain;
      return { ...d, notes: { ...d.notes, [k]: next } };
    });

  /** move within its shelf: the whole order becomes explicit from here on */
  const move = (kind: ProjectKind, name: string, by: -1 | 1) =>
    setDraft((d) => {
      const lists = shelves.map((s) => s.repos.map((r) => keyOf(r.name)));
      const i = shelves.findIndex((s) => s.kind === kind);
      const list = lists[i];
      const at = list.indexOf(keyOf(name));
      const to = at + by;
      if (at < 0 || to < 0 || to >= list.length) return d;
      [list[at], list[to]] = [list[to], list[at]];
      return { ...d, order: lists.flat() };
    });

  const isHidden = (name: string) => draft.hidden.some((h) => keyOf(h) === keyOf(name));
  const setShown = (name: string, shown: boolean) =>
    setDraft((d) => ({
      ...d,
      hidden: shown ? d.hidden.filter((h) => keyOf(h) !== keyOf(name)) : [...d.hidden, name],
      featured: !shown && keyOf(d.featured) === keyOf(name) ? "" : d.featured,
    }));

  const dirty = norm(draft) !== norm(initial);
  const shelfName = (k: ProjectKind) => p.shelves[k];

  return (
    <Section title={p.title} lede={p.lede}>
      <Group title={p.featured}>
        <Select
          label={p.featured}
          hideLabel
          wide
          value={draft.featured}
          onChange={(v) => setDraft((d) => ({ ...d, featured: v }))}
          options={[
            { value: "", label: p.featuredAuto },
            ...(repos ?? []).filter((r) => !isHidden(r.name)).map((r) => ({ value: r.name, label: draft.notes[keyOf(r.name)]?.title || r.name })),
          ]}
          error={save.fieldError("featuredRepo")}
        />
      </Group>

      {!repos ? (
        <p className="app-admin-empty">{failed ? p.none : p.loading}</p>
      ) : !repos.length ? (
        <p className="app-admin-empty">{p.none}</p>
      ) : (
        shelves.map((s) => (
          <Group key={s.kind} title={shelfName(s.kind)}>
            <ol className="app-admin-projects">
              {s.repos.map((r, i) => {
                const k = keyOf(r.name);
                const note = draft.notes[k];
                const hidden = isHidden(r.name);
                const editing = open === k;
                const title = note?.title || r.name;
                const sentence = note?.plain?.[lang] || r.description;
                return (
                  <li key={k} className="app-admin-project" data-hidden={hidden || undefined} data-open={editing || undefined}>
                    <div className="app-admin-project-row">
                      <div className="app-admin-project-move">
                        <button
                          type="button"
                          className="app-admin-icon-btn"
                          aria-label={fill(p.up, { name: title })}
                          disabled={i === 0}
                          onClick={() => move(s.kind, r.name, -1)}
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                            <path d="M2.5 7.5 6 4l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="app-admin-icon-btn"
                          aria-label={fill(p.down, { name: title })}
                          disabled={i === s.repos.length - 1}
                          onClick={() => move(s.kind, r.name, 1)}
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                            <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </div>
                      <button type="button" className="app-admin-project-main" aria-expanded={editing} onClick={() => setOpen(editing ? null : k)}>
                        <span className="app-admin-project-title">
                          {title}
                          {hidden && <span className="app-admin-tag">{p.hiddenTag}</span>}
                        </span>
                        <span className="app-admin-project-sub">
                          <span className="app-admin-project-repo">{r.name}</span>
                          {sentence ? <span className="app-admin-project-line">{sentence}</span> : <span className="app-admin-project-line">{p.noDescription}</span>}
                        </span>
                      </button>
                      <Btn kind="ghost" onClick={() => setOpen(editing ? null : k)} aria-expanded={editing}>
                        {editing ? p.done : p.edit}
                      </Btn>
                    </div>
                    {editing && (
                      <div className="app-admin-project-edit">
                        <div className="app-admin-grid">
                          <Text label={p.titleLabel} hint={p.titleHint} value={note?.title ?? ""} placeholder={r.name} onChange={(v) => setNote(r, { title: v })} />
                          <Select
                            label={p.shelf}
                            value={kindOf(r)}
                            onChange={(v) => setNote(r, { kind: v })}
                            options={PROJECT_KINDS.map((kk) => ({ value: kk, label: !note && kk === guessKind(r) ? fill(p.guessed, { shelf: shelfName(kk) }) : shelfName(kk) }))}
                          />
                        </div>
                        <Pair
                          label={p.sentence}
                          hint={p.sentenceHint}
                          area
                          rows={2}
                          value={note?.plain}
                          onChange={(v: L10n) => setNote(r, { plain: v })}
                          error={save.fieldError(`notes.${k}.plain`)}
                        />
                        <p className="app-admin-hint">
                          {p.github}: {r.description || p.noDescription}{" "}
                          <a href={r.url} target="_blank" rel="noopener noreferrer" className="app-admin-link">
                            {r.url.replace(/^https:\/\//, "")}
                          </a>
                        </p>
                        <Toggle label={p.shown} checked={!hidden} onChange={(v) => setShown(r.name, v)} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </Group>
        ))
      )}

      <SaveBar
        dirty={dirty}
        saving={save.saving}
        error={save.error}
        onRevert={() => (setDraft(initial), save.clear())}
        onSave={() =>
          save.run("projects.save", {
            projects: { notes: draft.notes, order: draft.order },
            hiddenRepos: draft.hidden,
            featuredRepo: draft.featured,
          })
        }
      />
    </Section>
  );
}
