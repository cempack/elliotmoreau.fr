/**
 * Ghost posts always carry a reading time: Ghost's own when it gave one,
 * else an estimate from the words (the body, or the excerpt in a list).
 *
 *   npx tsx --conditions=react-server --test scripts/test/ghost-reading.test.ts
 *
 * The fetches are answered by a stub (the env is set before the module
 * loads, since ghost.ts reads it once).
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";

process.env.GHOST_API_URL = "https://ghost.test";
process.env.GHOST_CONTENT_KEY = "test-key";

let g: typeof import("../../src/lib/ghost");
const realFetch = globalThis.fetch;
let answer: unknown = { posts: [] };

before(async () => {
  globalThis.fetch = (async () => new Response(JSON.stringify(answer), { status: 200 })) as typeof fetch;
  g = await import("../../src/lib/ghost");
});

after(() => {
  globalThis.fetch = realFetch;
});

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

const post = (over: Record<string, unknown> = {}) => ({
  title: "Coming soon",
  slug: "coming-soon",
  excerpt: "A short note while the first real post is written.",
  published_at: "2026-09-05T09:00:00.000Z",
  feature_image: null,
  url: "https://blog.test/coming-soon/",
  tags: [],
  ...over,
});

test("words: markup, styles and entities out; contractions stay whole", () => {
  assert.equal(g.wordCount(""), 0);
  assert.equal(g.wordCount(null), 0);
  assert.equal(g.wordCount("<p>Hello <strong>there</strong>, world.</p>"), 3);
  assert.equal(g.wordCount("<p>don&rsquo;t stop&nbsp;now &amp; then</p>"), 4);
  assert.equal(g.wordCount("<p>l’été, c’est 3 mois</p><style>p { color: red }</style>"), 4);
  assert.equal(g.wordCount('<figure><img src="a.png" alt="a long alt text"></figure>'), 0);
});

test("Ghost's figure wins when it has one", () => {
  assert.equal(g.readingMinutes({ reading_time: 7, excerpt: "short" }), 7);
  assert.equal(g.readingMinutes({ reading_time: "4" }), 4);
  assert.equal(g.readingMinutes({ reading_time: 2.6 }), 3);
});

test("missing, 0, empty or junk: estimated at ~230 wpm, never under a minute", () => {
  for (const reading_time of [undefined, null, 0, "", "n/a", -3, Number.NaN]) {
    assert.equal(g.readingMinutes({ reading_time, excerpt: "Coming soon." }), 1, `reading_time: ${String(reading_time)}`);
  }
  assert.equal(g.readingMinutes({}), 1);
  assert.equal(g.readingMinutes({ html: `<p>${words(230 * 6)}</p>` }), 6);
  assert.equal(g.readingMinutes({ html: `<p>${words(230 * 6 + 100)}</p>` }), 6);
  assert.equal(g.readingMinutes({ html: `<p>${words(230 * 6 + 130)}</p>` }), 7);
  // a body shorter than its custom excerpt reads as long as the excerpt
  assert.equal(g.readingMinutes({ html: "<p>Soon.</p>", excerpt: words(500) }), 2);
});

test("the list: every post comes back with whole minutes", async () => {
  answer = {
    posts: [
      post({ slug: "missing" }),
      post({ slug: "zero", reading_time: 0 }),
      post({ slug: "ghost", reading_time: 9 }),
      post({ slug: "long-excerpt", excerpt: words(700) }),
    ],
  };
  const got = await g.getLatestPosts(4);
  assert.ok(got);
  assert.deepEqual(
    got.map((p) => [p.slug, p.reading_time]),
    [
      ["missing", 1],
      ["zero", 1],
      ["ghost", 9],
      ["long-excerpt", 3],
    ],
  );
  // nothing else is touched
  assert.equal(got[0].title, "Coming soon");
  assert.equal(got[0].excerpt, post().excerpt);
});

test("one post: the estimate counts its body", async () => {
  answer = { posts: [post({ html: `<h2>Start</h2><p>${words(230 * 4)}</p>` })] };
  const got = await g.getPost("coming-soon");
  assert.ok(got);
  assert.equal(got.reading_time, 4);
  assert.ok(got.html.startsWith("<h2>"));
});

test("a post Ghost can't place (url .../404/) links to its slug on the blog", async () => {
  answer = { posts: [post({ url: "https://blog.test/404/" })] };
  const got = await g.getPost("coming-soon");
  assert.ok(got);
  assert.equal(got.url, "https://ghost.test/coming-soon/");
  answer = { posts: [post({ url: "https://blog.test/coming-soon/" })] };
  assert.equal((await g.getPost("coming-soon"))?.url, "https://blog.test/coming-soon/");
});
