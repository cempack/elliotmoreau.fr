"use client";

import { useState } from "react";
import { useI18n } from "@/i18n/client";
import { useToast } from "@/components/Toasts";
import { CONTINENTS, loc, type Continent, type PlaceRow } from "@/lib/content";
import { rpc, type Overview } from "../api";
import { useSave } from "../useSave";
import { WorldPicker } from "../WorldPicker";
import { PixelGlyph } from "@/components/glyphs";
import { G_CHEVRON } from "@/components/os/window/glyphs";
import { Btn, Group, Pair, SaveBar, Section, Segmented, Select, Text, Toggle, fill } from "../ui";

// the place being edited survives the remount that follows a save
let remembered: string | null = null;

/** list and editor side by side (narrower: the list, then the editor in its place) */
const sideBySide = () => typeof window !== "undefined" && window.matchMedia("(min-width: 901px)").matches;

const blank = (sort: number): PlaceRow => ({
  id: "",
  name: { en: "", fr: "" },
  region: { en: "", fr: "" },
  lat: 0,
  lon: 0,
  status: "want",
  home: false,
  iso: "",
  continent: "europe",
  sort,
});

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

export function TravelsPane({ data, onSaved }: { data: Overview; onSaved: () => void }) {
  const { t, lang } = useI18n();
  const tr = t.admin.travels;
  const c = t.admin.common;
  const { notify } = useToast();
  const places = data.places;
  // side by side, a place is always open (the first, unless one was being edited)
  const [selected, setSelected] = useState<string | null>(() =>
    remembered && places.some((p) => p.id === remembered) ? remembered : sideBySide() ? (places[0]?.id ?? null) : null
  );
  const [isNew, setIsNew] = useState(false);
  const original = isNew ? null : (places.find((p) => p.id === selected) ?? null);
  const [draft, setDraft] = useState<PlaceRow | null>(original);
  const [confirming, setConfirming] = useState(false);
  const save = useSave(onSaved);

  const open = (p: PlaceRow | null, fresh = false) => {
    remembered = fresh ? null : (p?.id ?? null);
    setSelected(p?.id ?? null);
    setIsNew(fresh);
    setDraft(p);
    setConfirming(false);
    save.clear();
  };

  const set = (patch: Partial<PlaceRow>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const dirty = isNew ? Boolean(draft) : Boolean(draft && original && JSON.stringify(draft) !== JSON.stringify(original));

  const move = async (i: number, dir: -1 | 1) => {
    const ids = places.map((p) => p.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const res = await rpc("place.reorder", { ids });
    if (res.ok) onSaved();
  };

  const onSave = async () => {
    if (!draft) return;
    const before = remembered;
    remembered = draft.id;
    if (!(await save.run("place.upsert", { place: draft }))) remembered = before;
  };

  const onDelete = async () => {
    if (!draft) return;
    if (!confirming) return setConfirming(true);
    const res = await rpc("place.delete", { id: draft.id });
    if (res.ok) {
      notify(fill(tr.deleted, { name: loc(draft.name, lang) || draft.id }), t.shell.apps.admin);
      remembered = null;
      onSaved();
    } else setConfirming(false);
  };

  const tag = (p: PlaceRow) => (p.home ? tr.homeTag : p.status === "been" ? tr.been : tr.want);

  return (
    <Section
      title={tr.title}
      lede={tr.lede}
      actions={
        <Btn kind="primary" onClick={() => open(blank(places.length), true)}>
          {tr.add}
        </Btn>
      }
    >
      <div className="app-admin-split" data-editing={draft ? "" : undefined}>
        <ol className="app-admin-list" aria-label={tr.title}>
          {places.map((p, i) => (
            <li key={p.id} className="app-admin-list-item" data-on={p.id === selected && !isNew ? "" : undefined}>
              <button type="button" className="app-admin-list-main" onClick={() => open(p)} aria-current={p.id === selected && !isNew ? "true" : undefined}>
                <span className="app-admin-dot" data-kind={p.home ? "home" : p.status} aria-hidden />
                <span className="app-admin-list-name">{loc(p.name, lang)}</span>
                <span className="app-admin-list-meta">
                  {tag(p)}
                  {p.tripFrom ? ` · ${p.tripFrom}` : ""}
                </span>
              </button>
              <span className="app-admin-list-move">
                <button type="button" className="app-admin-icon" aria-label={`${c.up}: ${loc(p.name, lang)}`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <PixelGlyph cells={G_CHEVRON} size={9} className="app-admin-up" />
                </button>
                <button
                  type="button"
                  className="app-admin-icon"
                  aria-label={`${c.down}: ${loc(p.name, lang)}`}
                  disabled={i === places.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <PixelGlyph cells={G_CHEVRON} size={9} />
                </button>
              </span>
            </li>
          ))}
        </ol>

        <div className="app-admin-editor">
          {!draft ? (
            <p className="app-admin-empty">{tr.empty}</p>
          ) : (
            <>
              <Btn kind="ghost" className="app-admin-btn app-admin-back" onClick={() => open(null)}>
                <PixelGlyph cells={G_CHEVRON} size={9} className="app-admin-left" />
                {tr.title}
              </Btn>
              <h3 className="app-admin-h3 app-admin-editor-title">{isNew ? tr.newTitle : loc(draft.name, lang) || draft.id}</h3>
              <Pair
                label={tr.name}
                value={draft.name}
                onChange={(name) => set(isNew && (!draft.id || draft.id === slugify(draft.name.en)) ? { name, id: slugify(name.en) } : { name })}
                error={save.fieldError("name")}
              />
              <Pair label={tr.region} value={draft.region} onChange={(region) => set({ region })} error={save.fieldError("region")} />
              <div className="app-admin-grid">
                <Text
                  label={tr.id}
                  value={draft.id}
                  mono
                  disabled={!isNew}
                  hint={isNew ? tr.idHint : undefined}
                  onChange={(v) => set({ id: slugify(v) })}
                  error={save.fieldError("id")}
                />
                <Text
                  label={tr.iso}
                  value={draft.iso}
                  mono
                  maxLength={2}
                  onChange={(v) => set({ iso: v.toUpperCase().replace(/[^A-Z]/g, "") })}
                  error={save.fieldError("iso")}
                />
                <Select<Continent>
                  label={tr.continent}
                  value={draft.continent}
                  onChange={(continent) => set({ continent })}
                  options={CONTINENTS.map((k) => ({ value: k, label: tr.continents[k] }))}
                />
              </div>

              <Group title={`${tr.lat} · ${tr.lon}`} hint={tr.mapHint}>
                <WorldPicker places={places} value={{ lat: draft.lat, lon: draft.lon }} selected={draft.id} onChange={(v) => set(v)} label={`${tr.lat} · ${tr.lon}`} />
                <div className="app-admin-grid">
                  <Text
                    label={tr.lat}
                    type="number"
                    step="0.01"
                    min={-90}
                    max={90}
                    mono
                    value={String(draft.lat)}
                    onChange={(v) => v !== "" && Number.isFinite(Number(v)) && set({ lat: Number(v) })}
                    error={save.fieldError("lat")}
                  />
                  <Text
                    label={tr.lon}
                    type="number"
                    step="0.01"
                    min={-180}
                    max={180}
                    mono
                    value={String(draft.lon)}
                    onChange={(v) => v !== "" && Number.isFinite(Number(v)) && set({ lon: Number(v) })}
                    error={save.fieldError("lon")}
                  />
                </div>
              </Group>

              <Group title={tr.status}>
                <Segmented
                  label={tr.status}
                  value={draft.status}
                  onChange={(status) => set({ status, home: status === "want" ? false : draft.home })}
                  options={[
                    { value: "been", label: tr.been },
                    { value: "want", label: tr.want },
                  ]}
                />
                {draft.status === "been" && <Toggle label={tr.isHome} checked={draft.home} onChange={(home) => set({ home })} />}
                {save.fieldError("home") && <p className="app-admin-error">{save.fieldError("home")}</p>}
                <div className="app-admin-grid">
                  <Text
                    label={tr.visited}
                    hint={tr.visitedHint}
                    value={draft.visited ?? ""}
                    onChange={(v) => set({ visited: v || undefined })}
                    error={save.fieldError("visited")}
                  />
                </div>
              </Group>

              <Pair label={tr.note} value={draft.note} onChange={(note) => set({ note: note.en || note.fr ? note : undefined })} error={save.fieldError("note")} />

              <Group title={tr.trip} hint={tr.tripHint}>
                <div className="app-admin-grid">
                  <Text
                    label={t.admin.status.from}
                    type="date"
                    value={draft.tripFrom ?? ""}
                    onChange={(v) => set({ tripFrom: v || undefined })}
                    error={save.fieldError("tripFrom")}
                  />
                  <Text
                    label={t.admin.status.to}
                    type="date"
                    value={draft.tripTo ?? ""}
                    onChange={(v) => set({ tripTo: v || undefined })}
                    error={save.fieldError("tripTo")}
                  />
                </div>
              </Group>

              {!isNew && !draft.home && (
                <div className="app-admin-row">
                  <Btn kind="danger" onClick={onDelete}>
                    {confirming ? c.confirm : c.delete}
                  </Btn>
                </div>
              )}

              <SaveBar
                dirty={dirty}
                saving={save.saving}
                error={save.error}
                onRevert={() => (isNew ? open(null) : open(original))}
                onSave={onSave}
              />
            </>
          )}
        </div>
      </div>
    </Section>
  );
}
