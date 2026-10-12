import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { inter, mono } from "@/app/fonts";
import "../globals.css";
import { getDict, getShellDict, hasLocale, LOCALES, localePath, SITE_URL } from "@/i18n";
import { I18nProvider } from "@/i18n/client";
import { getShellData } from "@/lib/data";
import { SoundProvider } from "@/lib/sound";
import { ToastProvider } from "@/components/Toasts";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { OSShell } from "@/components/os/OSShell";
import { SKY_SCRIPT } from "@/components/os/sky-script";
import { InlineScript } from "@/components/InlineScript";

// Both locales are prerendered; any other `lang` is turned away by the
// hasLocale() check below. Not `dynamicParams = false`: with it, a page
// whose cache entry revalidateContent() expired has no fallback and 404s
// until the next deploy (Next drops the expired entry, then refuses to
// re-render a "not generated" param), so admin saves would break the site.
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export const viewport: Viewport = {
  themeColor: "#0a0c0b",
  colorScheme: "dark",
  viewportFit: "cover",
};

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const t = getDict(lang).meta;
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t.title, template: `%s · ${t.siteName}` },
    description: t.description,
    applicationName: t.siteName,
    authors: [{ name: "Elliot Moreau", url: SITE_URL }],
    alternates: {
      canonical: localePath(lang, "/"),
      languages: { en: "/", fr: "/fr", "x-default": "/" },
    },
    openGraph: {
      type: "website",
      siteName: t.siteName,
      title: t.title,
      description: t.description,
      locale: lang === "fr" ? "fr_FR" : "en_US",
      url: localePath(lang, "/"),
    },
    twitter: { card: "summary_large_image", title: t.title, description: t.description },
  };
}

// before first paint: sky phase from Toulouse time, and skip the intro for
// returning visitors this session
/* returning this session: no boot. Arriving on the Desktop for the first
   time: the boot is about to show, so the menu bar and dock step away
   before the first paint (intro.css), not only once it hydrates */
const INTRO_SCRIPT = `try{var d=document.documentElement,p=location.pathname;if(sessionStorage.getItem("em-intro"))d.dataset.intro="done";else if(p==="/"||p==="/fr"||p==="/fr/")d.dataset.introUp="first"}catch(e){}`;

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = getShellDict(lang);
  const data = await getShellData();
  return (
    <html lang={lang} suppressHydrationWarning className={`${inter.variable} ${mono.variable}`}>
      <head>
        <link rel="me" href="https://mastodon.social/@cempack" />
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
                    {children}
                  </main>
                </OSShell>
              </ToastProvider>
            </SoundProvider>
          </MotionProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
