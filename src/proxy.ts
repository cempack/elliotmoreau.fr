import { NextResponse, type NextRequest } from "next/server";

/**
 * Locale routing. `/fr/*` is French; everything else is English, served
 * from `/en/*` through an internal rewrite so English URLs stay clean.
 * A visitor who picked French (cookie) is sent to the French URL.
 *
 * Every request also carries its locale as `x-em-lang`, for the one
 * render that has no `[lang]` param: app/global-not-found.tsx (the 404).
 */
const LANG_HEADER = "x-em-lang";

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const headers = new Headers(request.headers);
  const prefixed = pathname.match(/^\/(fr|en)(?=\/|$)/);
  if (prefixed) {
    headers.set(LANG_HEADER, prefixed[1]);
    return NextResponse.next({ request: { headers } });
  }

  if (request.cookies.get("em-lang")?.value === "fr") {
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? "/fr" : `/fr${pathname}`;
    return NextResponse.redirect(url, 307);
  }

  const url = request.nextUrl.clone();
  url.pathname = pathname === "/" ? "/en" : `/en${pathname}`;
  url.search = search;
  headers.set(LANG_HEADER, "en");
  return NextResponse.rewrite(url, { request: { headers } });
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
