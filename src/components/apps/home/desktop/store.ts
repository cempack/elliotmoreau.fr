import type { DesktopIconId } from "./icons";

/**
 * The desktop's memory for this tab: where you left the icons and whether
 * hello.txt is tucked away. Module state, so it survives opening an app
 * and closing it back to the Desktop (client navigation), and starts
 * fresh on a reload, which is also what the server rendered.
 */
export type Cell = { c: number; r: number };

type DesktopMemory = {
  /** null until someone arranges the icons by hand (then cells are kept) */
  cells: Partial<Record<DesktopIconId, Cell>> | null;
  helloClosed: boolean;
};

const memory: DesktopMemory = { cells: null, helloClosed: false };

export const desktopMemory = {
  arranged: () => memory.cells !== null,
  cell: (id: DesktopIconId): Cell | undefined => memory.cells?.[id],
  /** freeze the whole arrangement (called when a drag lands) */
  arrange: (cells: Record<DesktopIconId, Cell>) => {
    memory.cells = { ...cells };
  },
  helloClosed: () => memory.helloClosed,
  setHelloClosed: (v: boolean) => {
    memory.helloClosed = v;
  },
};
