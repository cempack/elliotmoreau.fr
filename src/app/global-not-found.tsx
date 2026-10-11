import "./globals.css";
import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import { Analytics } from "@vercel/analytics/react";
import { inter, mono } from "@/app/fonts";
import { getDict, getNamespaces, getShellDict, hasLocale, LANG_COOKIE, SITE_URL, type Locale } from "@/i18n";
import { I18nProvider } from "@/i18n/client";
import { getShellData } from "@/lib/data";
import { SoundProvider } from "@/lib/sound";
import { ToastProvider } from "@/components/Toasts";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { OSShell } from "@/components/os/OSShell";
import { SKY_SCRIPT } from "@/components/os/sky-script";
import { InlineScript } from "@/components/InlineScript";
import { NotFoundApp } from "@/components/apps/notfound/NotFoundApp";

/**
 * The 404, for every address no route matches (`/wrok`, `/fr/blgo`,
 * `/old.html`). The root layout lives under [lang], so Next can't compose
 * a not-found page from it: this file is the whole document instead,
 * server-rendered with the same <html>, pre-paint scripts and OS shell as
 * [lang]/layout.tsx, with the alert as its one app. Next sends it with a
 * 404 status and adds `noindex` itself.
 *
 * Its language comes from the locale proxy (`x-em-lang`, set on every
 * request it sees); an English-root address with a dot in it skips the
 * proxy, so there the visitor's saved language decides, else English.
 */

/** set by src/proxy.ts */
const LANG_HEADER = "x-em-lang";

async function requestLang(): Promise<Locale> {
  const fromProxy = (await headers()).get(LANG_HEADER);
  if (fromProxy && hasLocale(fromProxy)) return fromProxy;
  return (await cookies()).get(LANG_COOKIE)?.value === "fr" ? "fr" : "en";
}

export const viewport: Viewport = {
  themeColor: "#0a0c0b",
  colorScheme: "dark",
  viewportFit: "cover",
};

export async function generateMetadata(): Promise<Metadata> {
  const t = getDict(await requestLang());
  return {
    metadataBase: new URL(SITE_URL),
    title: `${t.meta.pages.notFound} · ${t.meta.siteName}`,
    description: t.notfound.body,
    applicationName: t.meta.siteName,
  };
}

// same as [lang]/layout.tsx: sky phase from Toulouse time, and no boot for a
// visitor who already saw it this session
const INTRO_SCRIPT = `try{if(sessionStorage.getItem("em-intro"))document.documentElement.dataset.intro="done"}catch(e){}`;

export default async function GlobalNotFound() {
  const lang = await requestLang();
  // the shell's strings plus this page's own, as on every other page
  const dict = { ...getShellDict(lang), ...getNamespaces(lang, "notfound") };
  const data = await getShellData();
  return (
    <html lang={lang} suppressHydrationWarning className={`${inter.variable} ${mono.variable}`}>
      <head>
        <InlineScript html={SKY_SCRIPT + INTRO_SCRIPT} />
      </head>
      <body className="min-h-svh bg-ink-950 text-label">
        <a href="#content" className="skip-link">
          {dict.shell.skip}
        </a>
        <I18nProvider lang={lang} dict={dict}>
          <MotionProvider>
            <SoundProvider delegated={false}>
              <ToastProvider>
                <OSShell data={data}>
                  <main id="content" tabIndex={-1} className="flex flex-1 flex-col outline-none">
                    <NotFoundApp standalone />
                  </main>
                </OSShell>
              </ToastProvider>
            </SoundProvider>
          </MotionProvider>
        </I18nProvider>
        <Analytics />
      </body>
    </html>
  );
}
