/**
 * The window's full-width preference for this visit, so switching apps
 * keeps the size you chose. Module state: false on every fresh page load
 * (matches the server render), remembered across client navigations.
 */
let zoomed = false;

export const getZoomPref = () => zoomed;
export const setZoomPref = (on: boolean) => {
  zoomed = on;
};
