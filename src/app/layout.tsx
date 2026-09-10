import type { Metadata } from "next";
import { Fraunces, Archivo, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";
import { LanguageProvider } from "@/lib/i18n";
import { SoundProvider } from "@/lib/sound";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { PixelSky } from "@/components/PixelSky";
import { ClickStamps } from "@/components/ClickStamps";
import { PixelDust } from "@/components/PixelDust";
import { ToastProvider } from "@/components/Toasts";
import { SmoothScroll } from "@/components/SmoothScroll";

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
});

const sans = Archivo({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Elliot Moreau — builds things",
  description: "Elliot Moreau. Code, travel and music. Live from France.",
  metadataBase: new URL("https://elliotmoreau.fr"),
  openGraph: {
    title: "Elliot Moreau — builds things",
    description: "Elliot Moreau. Code, travel and music. Live from France.",
    url: "https://elliotmoreau.fr",
    siteName: "Elliot Moreau",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Elliot Moreau — builds things",
    description: "Elliot Moreau. Code, travel and music. Live from France.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <head>
        <link rel="me" href="https://mastodon.social/@cempack" />
      </head>
      <body className="grain vignette flex min-h-full flex-col bg-ink text-bone">
        <SmoothScroll />
        <PixelSky />
        <div aria-hidden className="bg-hills" />
        <PixelDust />
        <LanguageProvider>
          <SoundProvider>
            <ToastProvider>
              <Nav />
              <main className="relative z-10 flex-1 pt-14">{children}</main>
              <Footer />
              <ClickStamps />
            </ToastProvider>
          </SoundProvider>
        </LanguageProvider>
        <Analytics />
      </body>
    </html>
  );
}
