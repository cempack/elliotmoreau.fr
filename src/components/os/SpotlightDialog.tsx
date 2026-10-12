"use client";

import { useEffect } from "react";
import { useI18n } from "@/i18n/client";
import { CommandPalette, usePalette as useInner } from "@/components/ui/CommandPalette";
import { useSpotlightCommands, useSpotlightFallback } from "./commands";
import { useSpotlightAnswers } from "./answers";
import { useNow } from "./menubar/util";

type Api = { open: () => void; close: () => void; isOpen: boolean };

function Bridge({ register, onState }: { register: (a: Api) => void; onState: (v: boolean) => void }) {
  const inner = useInner();
  useEffect(() => {
    register(inner);
  }, [inner, register]);
  useEffect(() => onState(inner.isOpen), [inner.isOpen, onState]);
  useEffect(() => {
    inner.open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export default function SpotlightDialog(props: { register: (a: Api) => void; onState: (v: boolean) => void }) {
  const { t } = useI18n();
  const commands = useSpotlightCommands();
  const fallback = useSpotlightFallback();
  const answers = useSpotlightAnswers();
  const now = useNow("minute");
  const clock = now ? new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hour12: false }).format(now) : "--:--";
  return (
    <CommandPalette
      commands={commands}
      placeholder={t.shell.spotlight.placeholder}
      empty={t.shell.spotlight.empty}
      board={{ title: t.shell.spotlight.board.title, code: "TLS", clock }}
      fallback={fallback}
      answers={answers}
      arrivals={t.shell.spotlight.arrivals}
    >
      <Bridge {...props} />
    </CommandPalette>
  );
}
