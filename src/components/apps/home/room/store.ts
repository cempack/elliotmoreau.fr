import { useSyncExternalStore } from "react";

/* whether the room is open, and the point it opened from (the lit window's centre) */
let state: { open: boolean; from: { x: number; y: number } | null } = { open: false, from: null };
const subs = new Set<() => void>();
export const setRoom = (open: boolean, from: { x: number; y: number } | null = state.from) => {
  state = { open, from };
  subs.forEach((f) => f());
};
/** closed for good, without a word to anyone (the Desktop unmounting) */
export const forgetRoom = () => {
  state = { open: false, from: null };
};
export const useRoom = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => {
        subs.delete(f);
      };
    },
    () => state,
    () => state
  );
