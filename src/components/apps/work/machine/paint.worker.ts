/**
 * Paints the machine's frames off the main thread (./painter), so turning
 * it, its sway and its dissolves never cost the page a frame. Takes the
 * textures when they change, a dissolve when the machine does, and a frame
 * for each ask, painted into the buffer the ask brought and handed back
 * with it (transferred both ways: no copies). Also fetches, decodes and
 * scales the screenshots, which would otherwise hold the page up each time
 * the project changes.
 */
import { painter, type FromPainter, type ToPainter } from "./painter";
import { cover } from "./render";

type Scope = {
  onmessage: ((e: MessageEvent<ToPainter>) => void) | null;
  postMessage: (message: FromPainter, transfer: Transferable[]) => void;
};
const scope = self as unknown as Scope;
const p = painter();

/** the last screenshot, decoded whole: each size is scaled from it */
let last: { url: string; img: Promise<ImageBitmap | null> } | null = null;
const decoded = (url: string) => {
  if (last?.url !== url) {
    const img = fetch(url)
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => (b ? createImageBitmap(b) : null))
      .catch(() => null);
    last = { url, img };
  }
  return last.img;
};
/** the screenshot at `w`×`h`, covering; null when it can't be fetched (its host doesn't share it) or scaled here */
async function picture(url: string, w: number, h: number): Promise<ImageBitmap | null> {
  const img = await decoded(url);
  if (!img) return null;
  const { sx, sy, sw, sh } = cover(img.width, img.height, w, h);
  try {
    const pic = await createImageBitmap(img, sx, sy, sw, sh, { resizeWidth: w, resizeHeight: h, resizeQuality: "high" });
    if (pic.width === w && pic.height === h) return pic;
    pic.close();
  } catch {
    // not with these options: drawn instead
  }
  if (typeof OffscreenCanvas === "undefined") return null;
  const cv = new OffscreenCanvas(w, h), ctx = cv.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  return cv.transferToImageBitmap();
}

scope.onmessage = (e) => {
  const d = e.data;
  if (d.type === "textures") p.textures(d);
  else if (d.type === "dissolve") p.dissolve(d.at);
  else if (d.type === "picture")
    void picture(d.url, d.w, d.h)
      .catch(() => null)
      .then((pic) => scope.postMessage({ type: "picture", id: d.id, pic }, pic ? [pic] : []));
  else {
    const pictured = p.frame(d.ask, new Uint32Array(d.buf));
    scope.postMessage({ type: "frame", id: d.id, buf: d.buf, pictured }, [d.buf]);
  }
};
