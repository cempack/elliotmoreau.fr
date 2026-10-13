/**
 * The cursor preference, applied before first paint: html[data-cursor="system"]
 * hands every --cursor-* back to the system (lib/cursors). A plain module, so
 * the server layouts can inline it; lib/cursorPref switches it.
 */
export const CURSOR_KEY = "em-cursor";

export const CURSOR_SCRIPT = `try{if(localStorage.getItem("${CURSOR_KEY}")==="system")document.documentElement.dataset.cursor="system"}catch(e){}`;
