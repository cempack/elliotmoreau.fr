/**
 * When the arrival plays (the boot and the descent from space onto the
 * Desktop). Never on a reload: once seen in a tab, it stays away from that
 * tab for six hours. After that it comes back on its own only when there
 * is something new to arrive to:
 *
 *  - this device has never seen it;
 *  - emOS has a new release (RELEASE below);
 *  - the light is new: it has been at least 20 hours since the last
 *    arrival, and the sky it would land in (dawn, day, dusk or night) has
 *    not had one for a week. Toulouse at night is another arrival than
 *    Toulouse at noon; a daily visitor gets one now and then, never twice
 *    in a day.
 *
 * And whenever asked: Restart, or "Watch the arrival again" (the Desktop's
 * right-click menu, Spotlight) leave a note in em-boot that plays it.
 *
 * Decided before first paint by INTRO_SCRIPT (after SKY_SCRIPT, which has
 * just put the sky on <html>), so a skipped intro never flashes and a
 * playing one never pops in late. Plain module: the layout imports it on
 * the server.
 */

export const RELEASE = "26.10";
const ARRIVALS = "em-arrivals";
const SIX_HOURS = 6 * 3600e3;
const DAY_ISH = 20 * 3600e3;
const WEEK = 7 * 24 * 3600e3;

export const INTRO_SCRIPT = `try{var d=document.documentElement,p=location.pathname,n=Date.now(),S=sessionStorage,s=S.getItem("em-intro"),y=0;if(s==="1"){s=""+n;S.setItem("em-intro",s)}if(S.getItem("em-boot"))y=1;else if(!s||n-s>${SIX_HOURS}){var a=JSON.parse(localStorage.getItem("${ARRIVALS}")||"null"),k=d.dataset.sky||"day";y=!a||a.v!=="${RELEASE}"||(n-(a.last||0)>${DAY_ISH}&&n-(a[k]||0)>${WEEK})}if(!y)d.dataset.intro="done";else if(p==="/"||p==="/fr"||p==="/fr/")d.dataset.introUp="first"}catch(e){}`;

/** the arrival has played: this tab has seen it, and so has this device, in this light */
export function rememberArrival() {
  const now = Date.now();
  try {
    sessionStorage.setItem("em-intro", String(now));
  } catch {}
  try {
    const sky = document.documentElement.dataset.sky || "day";
    const was = JSON.parse(localStorage.getItem(ARRIVALS) || "null") as Record<string, unknown> | null;
    const kept = was && was.v === RELEASE ? was : {};
    localStorage.setItem(ARRIVALS, JSON.stringify({ ...kept, v: RELEASE, last: now, [sky]: now }));
  } catch {}
}
