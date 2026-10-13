import { NextResponse, type NextRequest } from "next/server";

/**
 * Locale routing. `/fr/*` is French; everything else is English, served
 * from `/en/*` through an internal rewrite so English URLs stay clean.
 * A visitor who picked French (cookie) is sent to the French URL.
 *
 * Every request also carries its locale as `x-em-lang`, for the one
 * render that has no `[lang]` param: app/global-not-found.tsx (the 404).
 *
 * www. redirects to the bare domain, so the site has one address.
 *
 * The site has no server actions, so a request naming one (a Next-Action
 * header) is a scanner probing for them: it is turned away here, before
 * Next logs a "Server Reference ID" error for it.
 *
 * A browser that kept pages under the old caching (next.config.ts, headers)
 * has its cache for the site cleared once, on its next page load, so no
 * copy from an older deploy is ever served again. Bump CACHE_EPOCH to
 * clear everyone's once more.
 */
const LANG_HEADER = "x-em-lang";
const CACHE_COOKIE = "em-cache";
const CACHE_EPOCH = "1";

/** a page load from a browser that may still hold old copies: it clears them, once */
function clearStale(request: NextRequest, res: NextResponse) {
  if (request.cookies.get(CACHE_COOKIE)?.value === CACHE_EPOCH) return res;
  if (request.headers.has("rsc") || !request.headers.get("accept")?.includes("text/html")) return res;
  res.headers.set("Clear-Site-Data", '"cache"');
  res.cookies.set(CACHE_COOKIE, CACHE_EPOCH, { maxAge: 60 * 60 * 24 * 365, path: "/", sameSite: "lax", secure: request.nextUrl.protocol === "https:" });
  return res;
}

export function proxy(request: NextRequest) {
  if (request.headers.has("next-action")) return new NextResponse(null, { status: 404 });
  const { pathname, search } = request.nextUrl;
  // one address: www.elliotmoreau.fr/… goes to elliotmoreau.fr/…
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  if (host.startsWith("www.")) return NextResponse.redirect(new URL(`${pathname}${search}`, `https://${host.slice(4)}`), 308);
  const headers = new Headers(request.headers);
  const prefixed = pathname.match(/^\/(fr|en)(?=\/|$)/);
  if (prefixed) {
    headers.set(LANG_HEADER, prefixed[1]);
    return clearStale(request, NextResponse.next({ request: { headers } }));
  }

  if (request.cookies.get("em-lang")?.value === "fr") {
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? "/fr" : `/fr${pathname}`;
    return clearStale(request, NextResponse.redirect(url, 307));
  }

  const url = request.nextUrl.clone();
  url.pathname = pathname === "/" ? "/en" : `/en${pathname}`;
  url.search = search;
  headers.set(LANG_HEADER, "en");
  return clearStale(request, NextResponse.rewrite(url, { request: { headers } }));
}

export const config = {
  matcher: [
    // pages only: no API, Next internals, metadata files or anything with an extension
    "/((?!api|_next|_vercel|.*\\..*).*)",
    // …but anything under a locale prefix, dotted or not ("/fr/old.html"),
    // so its 404 knows its language
    "/(en|fr)/:path*",
  ],
};
