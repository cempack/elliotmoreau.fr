"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

/**
 * CONTRACT (owner: boot/terminal agent)
 * Global Terminal app: a draggable glass terminal window that opens over
 * any page (dock icon, Spotlight, or the ` key). Interactive commands
 * (help, whoami, ls, cd/open <app>, cat now, projects, posts, contact,
 * copy email, sky <phase>, lang fr|en, sound on|off, clear, exit, neofetch,
 * sudo hire elliot …), history with ↑/↓, tab completion. Bilingual output.
 */
type TerminalCtx = { open: boolean; setOpen: (v: boolean) => void; toggle: () => void };
const Ctx = createContext<TerminalCtx>({ open: false, setOpen: () => {}, toggle: () => {} });
export const useTerminal = () => useContext(Ctx);

export function TerminalProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((o) => !o), []);
  const value = useMemo(() => ({ open, setOpen, toggle }), [open, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function Terminal() {
  return null;
}
