import type { Metadata } from "next";
import { Fraunces, Archivo, Inter, JetBrains_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";
import { LanguageProvider } from "@/lib/i18n";

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz", "SOFT"],
});

const sans = Archivo({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  axes: ["opsz"],
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

// runs before first paint: a returning visitor this session skips the intro
const INTRO_SCRIPT = `try{if(sessionStorage.getItem("em-intro"))document.documentElement.dataset.intro="done"}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${display.variable} ${sans.variable} ${inter.variable} ${mono.variable} h-full antialiased`}
    >
      <head>
        <link rel="me" href="https://mastodon.social/@cempack" />
        <script dangerouslySetInnerHTML={{ __html: INTRO_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col bg-ink text-bone">
        <LanguageProvider>{children}</LanguageProvider>
        <Analytics />
      </body>
    </html>
  );
}
