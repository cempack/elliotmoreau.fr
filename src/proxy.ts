import { NextResponse, type NextRequest } from "next/server";

/**
 * Locale routing. `/fr/*` is French; everything else is English, served
 * from `/en/*` through an internal rewrite so English URLs stay clean.
 * A visitor who picked French (cookie) is sent to the French URL.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (/^\/(fr|en)(\/|$)/.test(pathname)) return NextResponse.next();

  if (request.cookies.get("em-lang")?.value === "fr") {
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? "/fr" : `/fr${pathname}`;
    return NextResponse.redirect(url, 307);
  }

  const url = request.nextUrl.clone();
  url.pathname = pathname === "/" ? "/en" : `/en${pathname}`;
  url.search = search;
  return NextResponse.rewrite(url);
}

export const config = {
  // pages only: no API, Next internals, metadata files or anything with an extension
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
