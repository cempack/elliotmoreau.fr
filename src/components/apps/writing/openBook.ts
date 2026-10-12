/**
 * A book taken off the shelf: its spine slides up out of the row, the book
 * turns to show its cover (the post's sky, its title), flies to the middle
 * of the window and opens on its title page. The post is loading behind
 * it by then; once it is on screen the book fades into it.
 *
 * Plain DOM and the Web Animations API, mounted on <body>, so it survives
 * the navigation it starts. It never takes a pointer, and it removes
 * itself after a few seconds whatever happens.
 */

import { composite, paintPlateLayers, plateSeed } from "./plate";

type Post = { slug: string; title: string; published_at: string; reading_time?: number };

export type BookFrom = {
  /** the spine on screen, in viewport px */
  rect: DOMRect;
  /** the spine's pixels, cropped from the shelf canvas */
  spine: HTMLCanvasElement | null;
  /** the book's cloth */
  cloth: string;
  edge: string;
  label: string;
};

/** the cover's plate: the post's sky, painted at cover size, in whole cells */
function coverPlate(post: Post, W: number, H: number) {
  const L = paintPlateLayers(plateSeed(post), W, H);
  const out = new Uint8ClampedArray(W * H * 4);
  composite(L, [0, 0, 0, 0], out);
  // the plate fades out at its foot into the cloth: keep it whole here
  for (let i = 3; i < out.length; i += 4) out[i] = 255;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  c.getContext("2d")?.putImageData(new ImageData(out, W, H), 0, 0);
  return c;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement) => {
  const e = document.createElement(tag);
  e.className = cls;
  parent?.appendChild(e);
  return e;
};

let live: (() => void) | null = null;

export function openBook({
  post,
  from,
  bounds,
  meta,
  navigate,
  ready,
  onTurn,
}: {
  post: Post;
  from: BookFrom;
  /** where the book opens: the window's content box, in viewport px */
  bounds: DOMRect;
  /** the title page's small lines: "6 October 2026\n7 min read" */
  meta: string;
  navigate: () => void;
  /** true once the post is on screen */
  ready: () => boolean;
  onTurn?: () => void;
}) {
  live?.();
  const vw = window.innerWidth;
  const phone = vw < 768;
  // the closed book: a portrait cover; open, a spread centred in the window
  const CW = Math.round(phone ? Math.min(vw * 0.62, 280) : Math.max(150, Math.min(220, bounds.width * 0.2, bounds.height * 0.42)));
  const CH = Math.round(CW * 1.42);
  const cx = bounds.left + bounds.width / 2;
  const cy = bounds.top + Math.min(bounds.height / 2, Math.max(CH / 2 + 24, bounds.height * 0.44));

  const stage = el("div", "app-writing-book-stage");
  stage.setAttribute("aria-hidden", "true");
  stage.style.setProperty("--cloth", from.cloth);
  stage.style.setProperty("--edge", from.edge);
  stage.style.setProperty("--label", from.label);

  // the window dims a little behind the book while it opens
  const scrim = el("div", "app-writing-book-scrim", stage);
  Object.assign(scrim.style, { left: `${bounds.left}px`, top: `${bounds.top}px`, width: `${bounds.width}px`, height: `${bounds.height}px` });

  const book = el("div", "app-writing-book", stage);
  Object.assign(book.style, { left: `${cx - CW / 2}px`, top: `${cy - CH / 2}px`, width: `${CW}px`, height: `${CH}px` });

  // the title page, under the cover
  const page = el("div", "app-writing-book-page", book);
  el("p", "app-writing-book-meta", page).textContent = meta;
  el("p", "app-writing-book-title", page).textContent = post.title;
  page.style.fontSize = `${CW / 12}px`;

  // the cover: the post's sky on its upper half, the title under it; the endpaper behind
  const cover = el("div", "app-writing-book-cover", book);
  const front = el("div", "app-writing-book-front", cover);
  const cell = 3;
  const plate = coverPlate(post, Math.floor((CW - 2 * cell * 2) / cell), Math.floor((CH * 0.56) / cell));
  plate.className = "app-writing-book-plate";
  plate.style.width = `${plate.width * cell}px`;
  plate.style.height = `${plate.height * cell}px`;
  front.appendChild(plate);
  el("span", "app-writing-book-band", front);
  const ft = el("p", "app-writing-book-ctitle", front);
  ft.textContent = post.title;
  ft.style.fontSize = `${CW / 13}px`;
  el("p", "app-writing-book-mins", front).textContent = `${Math.max(1, post.reading_time || 1)} min`;
  el("div", "app-writing-book-back", cover);

  // the spine, where it stood
  const r = from.rect;
  const spine = from.spine ?? document.createElement("canvas");
  spine.className = "app-writing-book-spine";
  Object.assign(spine.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  stage.appendChild(spine);
  document.body.appendChild(stage);

  let done = false;
  const anims: Animation[] = [];
  const run = (target: Element, frames: Keyframe[], opts: KeyframeAnimationOptions) => {
    const a = target.animate(frames, { fill: "both", ...opts });
    anims.push(a);
    return a;
  };
  const cleanup = () => {
    if (done) return;
    done = true;
    window.clearTimeout(bail);
    anims.forEach((a) => a.cancel());
    stage.remove();
    if (live === cleanup) live = null;
  };
  live = cleanup;
  const bail = window.setTimeout(cleanup, 6000);

  const lift = Math.round(r.height * 0.32);
  const sx = r.left + r.width / 2;
  const sy = r.top + r.height / 2 - lift;
  const k0 = r.height / CH;
  const ease = "cubic-bezier(0.25, 0.8, 0.25, 1)";
  const edgeOn = `translate(${sx - cx}px, ${sy - cy}px) scale(${k0}) rotateY(-90deg)`;
  // until it turns, the cover is edge-on where the spine stands: unseen
  book.style.transform = edgeOn;

  (async () => {
    try {
      // 1. out of the row
      await run(spine, [{ transform: "translateY(0)" }, { transform: `translateY(${-lift}px)` }], { duration: 200, easing: "cubic-bezier(0.2, 0.9, 0.3, 1)" }).finished;
      onTurn?.();
      run(scrim, [{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: "ease-out" });
      // 2. it turns to show its cover and comes to the middle
      run(
        spine,
        [
          { transform: `translateY(${-lift}px) rotateY(0deg)`, opacity: 1 },
          { transform: `translate(${(cx - sx) * 0.2}px, ${(cy - sy) * 0.2 - lift}px) rotateY(88deg)`, opacity: 1, offset: 0.92 },
          { transform: `translate(${(cx - sx) * 0.22}px, ${(cy - sy) * 0.22 - lift}px) rotateY(90deg)`, opacity: 0 },
        ],
        { duration: 210, easing: "cubic-bezier(0.4, 0, 1, 1)" }
      );
      await run(
        book,
        [
          { transform: edgeOn },
          { transform: `translate(${(sx - cx) * 0.78}px, ${(sy - cy) * 0.78}px) scale(${k0 + (1 - k0) * 0.25}) rotateY(-62deg)`, offset: 0.3 },
          { transform: "translate(0px, 0px) scale(1) rotateY(0deg)" },
        ],
        { duration: 500, easing: ease }
      ).finished;
      // 3. it opens on its title page; the post starts loading
      navigate();
      const shift = phone ? 0 : CW / 2;
      run(book, [{ transform: "translate(0px, 0px)" }, { transform: `translate(${shift}px, 0px)` }], { duration: 560, easing: "cubic-bezier(0.45, 0.05, 0.25, 1)" });
      await run(cover, [{ transform: "rotateY(0deg)" }, { transform: "rotateY(-178deg)" }], { duration: 560, easing: "cubic-bezier(0.45, 0.05, 0.25, 1)" }).finished;
      // 4. once the post is there, the book gives way to it
      const t0 = performance.now();
      while (!ready() && performance.now() - t0 < 3500) await new Promise((res) => requestAnimationFrame(res));
      await run(stage, [{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(1.035)" }], { duration: 260, easing: "cubic-bezier(0.4, 0, 0.2, 1)" }).finished;
    } catch {
      // cancelled: a newer book took over
    }
    cleanup();
  })();

  return cleanup;
}
