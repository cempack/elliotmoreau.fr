import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "../globals.css";
import { getDict, hasLocale, LOCALES, localePath, SITE_URL } from "@/i18n";
import { I18nProvider } from "@/i18n/client";
import { getSiteData } from "@/lib/data";
import { SoundProvider } from "@/lib/sound";
import { ToastProvider } from "@/components/Toasts";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { OSShell } from "@/components/os/OSShell";
import { SKY_SCRIPT } from "@/components/os/sky-script";
import { InlineScript } from "@/components/InlineScript";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], axes: ["opsz"] });
const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], weight: ["400", "500", "600"] });

export const dynamicParams = false;
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
    title: { default: t.title, template: `%s — ${t.siteName}` },
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

// before first paint: sky phase from Paris time, and skip the intro for
// returning visitors this session
const INTRO_SCRIPT = `try{if(sessionStorage.getItem("em-intro"))document.documentElement.dataset.intro="done"}catch(e){}`;

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const dict = getDict(lang);
  const data = await getSiteData();
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
        <Analytics />
      </body>
    </html>
  );
}
