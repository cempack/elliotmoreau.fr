/**
 * Flies the arrival (./flight) off the main thread, onto the canvas the
 * page handed over: hydration, the Desktop mounting underneath and the
 * wallpaper's first paint never cost it a frame. Its clock starts once
 * everything is built (the page is told when, on the shared clock:
 * timeOrigin + now), so a slow device never skips the opening and the
 * page's readout and dissolve stay in step with what is on screen.
 */
import { T, createFlight } from "./flight";

type Start = { type: "start"; canvas: OffscreenCanvas; W: number; H: number; now: number; near: number };
type Msg = Start | { type: "stop" };
type Out = { type: "ready"; start: number } | { type: "land" } | { type: "fail" };
type Scope = {
  onmessage: ((e: MessageEvent<Msg>) => void) | null;
  postMessage: (message: Out) => void;
  requestAnimationFrame?: (cb: () => void) => number;
};
const scope = self as unknown as Scope;
const clock = () => performance.timeOrigin + performance.now();

let stopped = false;

scope.onmessage = (e) => {
  const d = e.data;
  if (d.type === "stop") {
    stopped = true;
    return;
  }
  const ctx = d.canvas.getContext("2d");
  if (!ctx) {
    scope.postMessage({ type: "fail" });
    return;
  }
  const flight = createFlight(d);
  const img = new ImageData(d.W, d.H);
  const px = new Uint32Array(img.data.buffer);
  // a worker's own frame clock where there is one (Chrome, Firefox), a timer elsewhere
  const raf = typeof scope.requestAnimationFrame === "function" ? (cb: () => void) => scope.requestAnimationFrame!(cb) : (cb: () => void) => setTimeout(cb, 16);
  const start = clock();
  scope.postMessage({ type: "ready", start });
  let landed = false;
  const tick = () => {
    if (stopped) return;
    const t = clock() - start;
    flight.draw(t, px);
    ctx.putImageData(img, 0, 0);
    if (!landed && t >= T.land) {
      landed = true;
      scope.postMessage({ type: "land" });
    }
    if (t < T.end + 300) raf(tick);
  };
  tick();
};
