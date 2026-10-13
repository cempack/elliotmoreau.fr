"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/i18n/client";
import { rpc } from "../api";
import { useSave } from "../useSave";
import { Btn, Field, SaveBar, Section, Text, Toggle, fill } from "../ui";
import { Picker } from "../Picker";

type Flat = Record<string, string>;
type Copy = { en: Flat; fr: Flat };
const LANGS = ["en", "fr"] as const;

/** the parts of the site, as the dictionary's paths group them (the README first: it's what gets edited most) */
const AREAS = [
  { id: "readme", match: (k: string) => k === "home.name" || k === "home.role" || k.startsWith("system.term.readme.") },
  { id: "desktop", match: (k: string) => k.startsWith("home.") },
  { id: "dock", match: (k: string) => k.startsWith("dock.") },
  { id: "work", match: (k: string) => k.startsWith("work.") },
  { id: "writing", match: (k: string) => k.startsWith("writing.") },
  { id: "atlas", match: (k: string) => k.startsWith("atlas.") },
  { id: "now", match: (k: string) => k.startsWith("now.") },
  { id: "contact", match: (k: string) => k.startsWith("contact.") },
  { id: "menus", match: (k: string) => k.startsWith("shell.") || k.startsWith("windowing.") },
  { id: "terminal", match: (k: string) => k.startsWith("system.") },
  { id: "notfound", match: (k: string) => k.startsWith("notfound.") },
  { id: "meta", match: (k: string) => k.startsWith("meta.") },
  { id: "all", match: () => true },
] as const;
type Area = (typeof AREAS)[number]["id"];

const PAGE = 40;
const placeholdersOf = (s: string) => [...new Set(Array.from(s.matchAll(/\{(\w+)\}/g), (m) => `{${m[1]}}`))];
/** strings only screen readers hear (landmark names, spoken descriptions) */
const spoken = (k: string) => /(^|\.)(aria\w*|\w*Aria|label|sr\w*)$/.test(k);

/** only real edits: not empty, not the original */
function normalize(c: Copy, base: { en: Flat; fr: Flat }): Copy {
  const out: Copy = { en: {}, fr: {} };
  for (const l of LANGS)
    for (const [k, v] of Object.entries(c[l])) {
      const t = v.trim();
      if (t && t !== base[l][k]) out[l][k] = v;
    }
  return out;
}
const same = (a: Copy, b: Copy) =>
  LANGS.every((l) => {
    const ka = Object.keys(a[l]);
    return ka.length === Object.keys(b[l]).length && ka.every((k) => a[l][k] === b[l][k]);
  });

/**
 * Texts: every string on the site (the README, the captions, each app's
 * little descriptions, what search engines show) in English and French,
 * found by the words on screen or by part of the site. A field shows
 * what the site says now; change it, or empty it (or press Back to the
 * original) to go back to what was written. One save for all of them;
 * every page shows the new words on its next render.
 */
export function TextsPane() {
  const { t } = useI18n();
  const x = t.admin.texts;
  const [base, setBase] = useState<{ en: Flat; fr: Flat } | null>(null);
  const [initial, setInitial] = useState<Copy>({ en: {}, fr: {} });
  const [draft, setDraft] = useState<Copy>({ en: {}, fr: {} });
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [area, setArea] = useState<Area>("readme");
  const [editedOnly, setEditedOnly] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const q = useDeferredValue(query.trim().toLowerCase());

  useEffect(() => {
    rpc<{ base: { en: Flat; fr: Flat }; copy: Copy }>("copy.options").then((r) => {
      if (!r.ok) return setFailed(true);
      setBase(r.base);
      setInitial(r.copy);
      setDraft(r.copy);
    });
  }, []);

  const save = useSave(() => setInitial(base ? normalize(draft, base) : draft));

  const keys = useMemo(() => {
    if (!base) return [];
    // a search looks through everything; otherwise the part of the site picked
    const match = q ? () => true : (AREAS.find((a) => a.id === area)?.match ?? (() => true));
    return Object.keys(base.en).filter((k) => {
      if (!match(k)) return false;
      if (editedOnly && !(k in draft.en) && !(k in draft.fr)) return false;
      if (!q) return true;
      return (
        k.toLowerCase().includes(q) ||
        LANGS.some((l) => (base[l][k] ?? "").toLowerCase().includes(q) || (draft[l][k] ?? "").toLowerCase().includes(q))
      );
    });
  }, [base, q, area, editedOnly, draft]);

  const clean = useMemo(() => (base ? normalize(draft, base) : draft), [draft, base]);
  const dirty = !!base && !same(clean, normalize(initial, base));
  const editedCount = new Set([...Object.keys(clean.en), ...Object.keys(clean.fr)]).size;

  const set = (l: "en" | "fr", k: string, v: string) =>
    setDraft((d) => {
      const next = { ...d[l] };
      if (base && v === base[l][k]) delete next[k];
      else next[k] = v;
      return { ...d, [l]: next };
    });
  const reset = (k: string) =>
    setDraft((d) => {
      const en = { ...d.en };
      const fr = { ...d.fr };
      delete en[k];
      delete fr[k];
      return { en, fr };
    });

  return (
    <Section title={x.title} lede={x.lede}>
      <div className="app-admin-texts-tools">
        <Text
          label={x.search}
          hideLabel
          type="search"
          value={query}
          placeholder={x.searchPlaceholder}
          onChange={(v) => {
            setQuery(v);
            setShown(PAGE);
          }}
        />
        <Field label={x.area} hideLabel>
          {(id) => (
            <Picker
              id={id}
              value={q ? "all" : area}
              options={AREAS.map((a) => ({ value: a.id, label: x.areas[a.id] }))}
              onChange={(v) => {
                setArea(v);
                setQuery("");
                setShown(PAGE);
              }}
            />
          )}
        </Field>
        <Toggle label={x.edited} checked={editedOnly} onChange={(v) => (setEditedOnly(v), setShown(PAGE))} />
      </div>

      {!base ? (
        <p className="app-admin-empty">{failed ? t.admin.common.offline : x.loading}</p>
      ) : (
        <>
          <p className="app-admin-hint app-admin-texts-count" aria-live="polite">
            {keys.length === 1 ? x.countOne : fill(x.count, { n: keys.length })}
            {editedCount > 0 && ` · ${fill(x.editedCount, { n: editedCount })}`}
          </p>
          {!keys.length ? (
            <p className="app-admin-empty">{x.none}</p>
          ) : (
            <ol className="app-admin-texts">
              {keys.slice(0, shown).map((k) => {
                const edited = k in draft.en || k in draft.fr;
                const holes = placeholdersOf(base.en[k]);
                return (
                  <li key={k} className="app-admin-text" data-edited={edited || undefined}>
                    <div className="app-admin-text-head">
                      <code className="app-admin-text-key">{k}</code>
                      {spoken(k) && <span className="app-admin-tag">{x.sr}</span>}
                      {edited && (
                        <Btn kind="ghost" onClick={() => reset(k)}>
                          {x.reset}
                        </Btn>
                      )}
                    </div>
                    <div className="app-admin-text-pair">
                      {LANGS.map((l) => {
                        const value = draft[l][k] ?? base[l][k];
                        const long = base[l][k].length > 72 || base[l][k].includes("\n") || value.length > 72;
                        const err = save.fieldError(`${l}.${k}`);
                        const common = {
                          className: "app-admin-input app-admin-text-input",
                          value,
                          lang: l,
                          "aria-label": `${k} (${l.toUpperCase()})`,
                          "aria-invalid": err ? true : undefined,
                          "data-changed": k in draft[l] || undefined,
                          placeholder: base[l][k],
                        };
                        return (
                          <label key={l} className="app-admin-pair-cell">
                            <span className="app-admin-lang" aria-hidden>
                              {l.toUpperCase()}
                            </span>
                            {long ? (
                              <textarea {...common} rows={Math.min(6, Math.ceil(value.length / 64) + 1)} onChange={(e) => set(l, k, e.target.value)} />
                            ) : (
                              <input {...common} onChange={(e) => set(l, k, e.target.value)} />
                            )}
                            {err && <span className="app-admin-error">{err}</span>}
                          </label>
                        );
                      })}
                    </div>
                    {holes.length > 0 && <p className="app-admin-hint">{fill(x.placeholders, { list: holes.join(" ") })}</p>}
                  </li>
                );
              })}
            </ol>
          )}
          {keys.length > shown && (
            <div className="app-admin-texts-more">
              <Btn onClick={() => setShown((n) => n + PAGE)}>{fill(x.more, { n: Math.min(PAGE, keys.length - shown) })}</Btn>
            </div>
          )}
        </>
      )}

      <SaveBar
        dirty={dirty}
        saving={save.saving}
        error={save.error}
        onRevert={() => (setDraft(initial), save.clear())}
        onSave={() => save.run("copy.save", { copy: clean })}
      />
    </Section>
  );
}
