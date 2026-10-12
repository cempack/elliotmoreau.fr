/**
 * A command to run as soon as the terminal is open: the desktop's README
 * icon opens the terminal on `cat README.md`. One slot; the open session
 * takes it (see Session).
 */
let pending: string | null = null;
const listeners = new Set<() => void>();

export const termQueue = {
  push(cmd: string) {
    pending = cmd;
    for (const l of listeners) l();
  },
  take() {
    const c = pending;
    pending = null;
    return c;
  },
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  },
};
