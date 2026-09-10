"use client";

import { useMemo, useState } from "react";
import { useLang } from "@/lib/i18n";
import { useSound } from "@/lib/sound";
import { PLACES, fmtCoords, type Place } from "@/lib/places";
import { PixelLabel } from "./PixelLabel";
import { Reveal } from "./Reveal";
import { TtfxText } from "./TtfxText";
import { PixelGlobe } from "./PixelGlobe";
import { BackdropWord } from "./BackdropWord";

function StampCard({
  place,
  active,
  onPick,
  label,
  region,
  index,
}: {
  place: Place;
  active: boolean;
  onPick: () => void;
  label: string;
  region: string;
  index: string;
}) {
  const want = place.status === "want";
  return (
    <button
      onClick={onPick}
      aria-pressed={active}
      className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-[12px] border p-3 text-left transition-all duration-200 hover:-translate-y-0.5 ${
        active
          ? want
            ? "border-glacier/70 bg-glacier/10 shadow-[0_10px_30px_-14px_rgba(131,192,146,0.5)]"
            : "border-ember/70 bg-ember/10 shadow-[0_10px_30px_-14px_rgba(167,192,128,0.45)]"
          : want
            ? "border-dashed border-line/70 hover:border-glacier/60 hover:bg-panel"
            : "border-line/60 hover:border-ember/50 hover:bg-panel"
      }`}
  >
      <span
        className={`w-8 shrink-0 font-display text-2xl tabular-nums transition-colors ${
          active ? "text-ember" : "text-faint/60 group-hover:text-ember/70"
        }`}
        aria-hidden
    >
        {index}
      </span>
      {want ? (
        <span
          className={`h-[10px] w-[10px] shrink-0 rounded-[2px] border-2 transition-colors ${
            active ? "border-glacier" : "border-glacier/60 group-hover:border-glacier"
          }`}
          aria-hidden
        />
      ) : (
        <span
          className={`h-[10px] w-[10px] shrink-0 rounded-[2px] transition-colors ${
            active ? "bg-ember" : "bg-ember/70 group-hover:bg-ember"
          }`}
          style={{ boxShadow: active ? "0 0 12px rgba(167,192,128,0.9)" : undefined }}
          aria-hidden
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="block overflow-hidden">
          <PixelLabel text={label} cell={2} className={active ? "text-bone" : "text-bone/75"} />
        </span>
        <span className="mt-0.5 block truncate font-mono text-[10px] text-faint">
          {region} · {fmtCoords(place.lat, place.lon)}
        </span>
      </span>
      {place.home && (
        <span className="shrink-0 font-mono text-xs text-ember" aria-hidden title="home">
          ◆
        </span>
      )}
      <span className="pixel-arrow shrink-0 font-display text-xl text-faint" aria-hidden>
        →
      </span>
    </button>
  );
}

export function TravelSection() {
  const { lang, t } = useLang();
  const { blip } = useSound();
  const [selectedId, setSelectedId] = useState<string | null>("france");

  const been = useMemo(() => PLACES.filter((p) => p.status === "been"), []);
  const want = useMemo(() => PLACES.filter((p) => p.status === "want"), []);
  const selected = PLACES.find((p) => p.id === selectedId) ?? null;

  const pick = (id: string) => {
    setSelectedId(id);
    blip("select");
  };

  return (
    <section id="travel" aria-label={t("travel.title")} className="relative z-10 mx-auto max-w-6xl scroll-mt-20 px-4 sm:px-6">
      <BackdropWord text="02" cell={22} drift={70} top={170} />
      <div data-parallax="0.06">
        <Reveal className="mb-6 flex flex-wrap items-end justify-between gap-3" preset="focus">
          <div>
            <PixelLabel text={t("travel.label")} cell={3} className="mb-3 block text-ember" />
            <h2 className="font-display text-4xl text-bone sm:text-5xl">{t("travel.title")}</h2>
          </div>
          <p className="font-mono text-[11px] text-faint">{t("travel.hint")}</p>
        </Reveal>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]" data-parallax="0.03">
        <Reveal className="relative h-[480px] overflow-hidden rounded-[12px] border border-line bg-ink-2 sm:h-[560px] lg:sticky lg:top-24 lg:self-start" preset="lift">
          <PixelGlobe places={PLACES} selectedId={selectedId} onSelect={pick} />
          {/* selected place readout */}
          <div className="pointer-events-none absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
            <div className="rounded-[12px] border border-line bg-ink/85 px-4 py-3 backdrop-blur-sm">
              {selected ? (
                <>
                  <p className="font-display text-xl leading-tight text-bone">
                    <TtfxText text={selected.name[lang]} effect="decrypt" />
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-faint">
                    {fmtCoords(selected.lat, selected.lon)} · {selected.region[lang]} ·{" "}
                    <span className={selected.status === "been" ? "text-ember" : "text-glacier"}>
                      {selected.home
                        ? t("travel.home")
                        : selected.status === "been"
                          ? t("travel.been")
                          : t("travel.want")}
                    </span>
                  </p>
                </>
              ) : (
                <p className="font-mono text-[11px] text-faint">{t("travel.empty")}</p>
              )}
            </div>
            <div className="hidden shrink-0 gap-4 rounded-[12px] border border-line bg-ink/85 px-4 py-3 font-mono text-[11px] backdrop-blur-sm sm:flex">
              <span className="inline-flex items-center gap-2 text-sage">
                <span className="h-2 w-2 rounded-[2px] bg-ember" aria-hidden />
                {t("travel.been")} · {been.length}
              </span>
              <span className="inline-flex items-center gap-2 text-sage">
                <span className="h-2 w-2 rounded-full border-2 border-glacier" aria-hidden />
                {t("travel.want")} · {want.length}
              </span>
            </div>
          </div>
        </Reveal>

        <div className="grid content-start gap-5">
          <Reveal>
            <p className="mb-3 flex items-center gap-3">
              <PixelLabel text={t("travel.been")} cell={3} className="text-ember" />
              <span className="rounded-[8px] border border-line/70 bg-panel px-2 py-0.5 font-mono text-[11px] text-sage">
                {been.length}
              </span>
            </p>
            <div className="grid gap-2">
              {been.map((p, i) => (
                <Reveal key={p.id} delay={i * 55} y={18}>
                  <StampCard
                    place={p}
                    label={p.name[lang]}
                    region={p.region[lang]}
                    index={String(i + 1).padStart(2, "0")}
                    active={p.id === selectedId}
                    onPick={() => pick(p.id)}
                  />
                </Reveal>
              ))}
            </div>
          </Reveal>
          <Reveal>
            <p className="mb-3 flex items-center gap-3">
              <PixelLabel text={t("travel.want")} cell={3} className="text-glacier" />
              <span className="rounded-[8px] border border-line/70 bg-panel px-2 py-0.5 font-mono text-[11px] text-sage">
                {want.length}
              </span>
            </p>
            <div className="grid gap-2">
              {want.map((p, i) => (
                <Reveal key={p.id} delay={i * 55} y={18}>
                  <StampCard
                    place={p}
                    label={p.name[lang]}
                    region={p.region[lang]}
                    index={String(i + 1).padStart(2, "0")}
                    active={p.id === selectedId}
                    onPick={() => pick(p.id)}
                  />
                </Reveal>
              ))}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
