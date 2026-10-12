import "server-only";
import sanitizeHtml from "sanitize-html";

/**
 * A Ghost post's HTML, made safe to put in the page: an allowlist of
 * elements and attributes (no scripts, styles, forms or event handlers),
 * links to other sites open in a new tab, images load lazily, and only
 * video embeds from YouTube and Vimeo survive, sandboxed. Ghost's own card
 * classes (kg-*) are kept so wide images and galleries keep their layout.
 * Headings get ids so a section can be linked.
 */

const EMBEDS = ["www.youtube.com", "www.youtube-nocookie.com", "youtube.com", "player.vimeo.com"];

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z]+;/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

export function cleanPostHtml(html: string, siteOrigin: string): string {
  const clean = sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "hr", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "code", "kbd", "samp", "mark",
      "strong", "b", "em", "i", "u", "s", "del", "ins", "sub", "sup", "small", "abbr",
      "ul", "ol", "li", "dl", "dt", "dd", "a", "img", "figure", "figcaption", "picture", "source",
      "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "div", "span", "aside",
      "details", "summary", "video", "audio", "iframe",
    ],
    // h1 is the page's title: a post's own h1 becomes an h2
    transformTags: {
      h1: "h2",
      a: (tagName, attribs) => {
        const href = attribs.href ?? "";
        let external = false;
        try {
          external = /^https?:/i.test(href) && new URL(href).origin !== siteOrigin;
        } catch {}
        return {
          tagName,
          attribs: external ? { ...attribs, target: "_blank", rel: "noopener noreferrer" } : attribs,
        };
      },
      img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, loading: "lazy", decoding: "async" } }),
      iframe: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          loading: "lazy",
          sandbox: "allow-scripts allow-same-origin allow-presentation allow-popups",
          referrerpolicy: "strict-origin-when-cross-origin",
        },
      }),
    },
    allowedAttributes: {
      a: ["href", "title", "target", "rel", "id"],
      img: ["src", "srcset", "sizes", "alt", "title", "width", "height", "loading", "decoding"],
      source: ["srcset", "sizes", "type", "media", "src"],
      video: ["src", "poster", "controls", "width", "height", "playsinline", "loop", "muted", "preload"],
      audio: ["src", "controls", "preload"],
      iframe: ["src", "width", "height", "title", "allow", "allowfullscreen", "loading", "sandbox", "referrerpolicy"],
      code: ["class"],
      pre: ["class"],
      th: ["colspan", "rowspan", "scope"],
      td: ["colspan", "rowspan"],
      abbr: ["title"],
      ol: ["start", "reversed", "type"],
      "*": ["class", "id", "lang", "dir"],
    },
    allowedClasses: {
      "*": [/^kg-[a-z0-9-]+$/, /^language-[a-z0-9+#-]+$/],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    allowedIframeHostnames: EMBEDS,
    allowIframeRelativeUrls: false,
  });

  // ids are namespaced so a post's can't clash with the page's own; headings
  // without one get one (for links to a section), unique
  const seen = new Map<string, number>();
  return clean
    .replace(/\sid="([^"]*)"/g, (_, id: string) => ` id="post-${slugify(id) || "x"}"`)
    .replace(/<(h[2-4])>([\s\S]*?)<\/\1>/g, (_, tag: string, inner: string) => {
      const base = `post-${slugify(inner) || "section"}`;
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      return `<${tag} id="${n ? `${base}-${n + 1}` : base}">${inner}</${tag}>`;
    });
}

/** plain text of a post, for its meta description */
export function postText(html: string, max = 200) {
  const text = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
