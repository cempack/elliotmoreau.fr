"use client";

import { useState } from "react";
import { useI18n } from "@/i18n/client";
import type { Book, Draft, L10n, Learning, NowContent } from "@/lib/content";
import type { Overview } from "../api";
import { useSave } from "../useSave";
import { Btn, Group, Pair, SaveBar, Section, Select, Text, Toggle } from "../ui";

const today = () => new Date().toISOString().slice(0, 10);
const optL = (v: L10n) => (v.en || v.fr ? v : undefined);

/** a list of cards with move up / move down / remove, and an add button */
function ListEditor<T>({
  items,
  onChange,
  make,
  addLabel,
  title,
  render,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  make: () => T;
  addLabel: string;
  title: (item: T, i: number) => string;
  render: (item: T, set: (patch: Partial<T>) => void, i: number) => React.ReactNode;
}) {
  const { t } = useI18n();
  const c = t.admin.common;
  const swap = (i: number, j: number) => {
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="app-admin-cards">
      {items.map((item, i) => (
        <div key={i} className="app-admin-card">
          <div className="app-admin-card-head">
            <span className="app-admin-card-title">{title(item, i) || `#${i + 1}`}</span>
            <span className="app-admin-list-move">
              <button type="button" className="app-admin-icon" aria-label={c.up} disabled={i === 0} onClick={() => swap(i, i - 1)}>
                ↑
              </button>
              <button type="button" className="app-admin-icon" aria-label={c.down} disabled={i === items.length - 1} onClick={() => swap(i, i + 1)}>
                ↓
              </button>
              <button type="button" className="app-admin-icon" aria-label={c.remove} onClick={() => onChange(items.filter((_, k) => k !== i))}>
                ×
              </button>
            </span>
          </div>
          {render(item, (patch) => onChange(items.map((x, k) => (k === i ? { ...x, ...patch } : x))), i)}
        </div>
      ))}
      <Btn kind="ghost" onClick={() => onChange([...items, make()])}>
        + {addLabel}
      </Btn>
    </div>
  );
}

export function NowPane({ data, onSaved }: { data: Overview; onSaved: () => void }) {
  const { t, lang } = useI18n();
  const n = t.admin.now;
  const [draft, setDraft] = useState<NowContent>(data.now);
  const [touch, setTouch] = useState(true);
  const save = useSave(onSaved);
  const dirty = JSON.stringify(draft) !== JSON.stringify(data.now);
  const set = (patch: Partial<NowContent>) => setDraft((d) => ({ ...d, ...patch }));
  const setFocus = (patch: Partial<NowContent["focus"]>) => setDraft((d) => ({ ...d, focus: { ...d.focus, ...patch } }));
  const f = save.fieldError;

  return (
    <Section title={n.title} lede={n.lede}>
      <Group title={n.updated}>
        <div className="app-admin-grid">
          <Text label={n.updated} hideLabel type="date" value={draft.updated} onChange={(updated) => set({ updated })} error={f("updated")} disabled={touch} />
        </div>
        <Toggle label={n.touch} checked={touch} onChange={setTouch} />
      </Group>

      <Pair label={n.intro} value={draft.intro} onChange={(intro) => set({ intro })} area rows={3} error={f("intro")} />

      <Group title={n.focus}>
        <div className="app-admin-grid">
          <Text label={n.focusName} value={draft.focus.name} onChange={(name) => setFocus({ name })} error={f("focus.name")} />
          <Text label={n.focusUrl} type="url" value={draft.focus.url} onChange={(url) => setFocus({ url })} error={f("focus.url")} mono />
        </div>
        <Pair label={n.focusDoing} hint={n.focusDoingHint} value={draft.focus.doing} onChange={(doing) => setFocus({ doing })} error={f("focus.doing")} />
        <Pair label={n.focusTitle} value={draft.focus.title} onChange={(title) => setFocus({ title })} error={f("focus.title")} />
        <Pair label={n.focusBody} value={draft.focus.body} onChange={(body) => setFocus({ body })} area rows={4} error={f("focus.body")} />
      </Group>

      <Group title={n.reading}>
        <ListEditor<Book>
          items={draft.reading}
          onChange={(reading) => set({ reading })}
          make={() => ({ title: "", author: "", status: "next" })}
          addLabel={n.addBook}
          title={(b) => b.title}
          render={(b, s, i) => (
            <>
              <div className="app-admin-grid">
                <Text label={n.bookTitle} value={b.title} onChange={(title) => s({ title })} error={f(`reading[${i}].title`)} />
                <Text label={n.bookAuthor} value={b.author} onChange={(author) => s({ author })} error={f(`reading[${i}].author`)} />
                <Select<Book["status"]>
                  label={n.bookStatus}
                  value={b.status}
                  onChange={(status) => s({ status })}
                  options={(["reading", "rereading", "next", "finished"] as const).map((v) => ({ value: v, label: n.bookStatuses[v] }))}
                />
                <Text label={n.bookUrl} type="url" mono value={b.url ?? ""} onChange={(url) => s({ url: url || undefined })} error={f(`reading[${i}].url`)} />
              </div>
              <Pair label={n.bookNote} value={b.note} onChange={(note) => s({ note: optL(note) })} error={f(`reading[${i}].note`)} />
            </>
          )}
        />
      </Group>

      <Group title={n.learning}>
        <ListEditor<Learning>
          items={draft.learning}
          onChange={(learning) => set({ learning })}
          make={() => ({ label: { en: "", fr: "" } })}
          addLabel={n.addLearning}
          title={(x) => x.label[lang]}
          render={(x, s, i) => (
            <>
              <Pair label={n.label} value={x.label} onChange={(label) => s({ label })} error={f(`learning[${i}].label`)} />
              <Pair label={n.note} value={x.note} onChange={(note) => s({ note: optL(note) })} error={f(`learning[${i}].note`)} />
            </>
          )}
        />
      </Group>

      <Group title={n.drafting}>
        <ListEditor<Draft>
          items={draft.drafting}
          onChange={(drafting) => set({ drafting })}
          make={() => ({ title: { en: "", fr: "" } })}
          addLabel={n.addDraft}
          title={(x) => x.title[lang]}
          render={(x, s, i) => (
            <>
              <Pair label={n.draftTitle} value={x.title} onChange={(title) => s({ title })} error={f(`drafting[${i}].title`)} />
              <Pair label={n.note} value={x.note} onChange={(note) => s({ note: optL(note) })} error={f(`drafting[${i}].note`)} />
            </>
          )}
        />
      </Group>

      <SaveBar
        dirty={dirty}
        saving={save.saving}
        error={save.error}
        onRevert={() => (setDraft(data.now), save.clear())}
        onSave={() => save.run("now.set", { now: touch ? { ...draft, updated: today() } : draft })}
      />
    </Section>
  );
}
