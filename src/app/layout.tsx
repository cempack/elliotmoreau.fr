import { ThemeProvider } from "@/components/theme-provider";
import Footer from "@/components/ui/footer";
import { NavBar } from "@/components/ui/navbar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";
import "@/styles/globals.css";
import { Analytics } from "@vercel/analytics/next";
import { Home, Rss } from "lucide-react";
import type { Metadata } from "next";
import { inter } from "./fonts";

export const metadata: Metadata = {
  title: "Cempack • Home",
  description: "Hello there 👋 ! Welcome to my portfolio.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body
        className={cn(
          "antialiased dark:bg-black bg-white  dark:bg-grid-small-white/[0.2] bg-grid-small-black/[0.2]",
          inter.className,
        )}
      >
        <div className="mx-auto max-w-2xl mb-8 flex flex-col md:flex-row mt-40 w-full">
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <ThemeToggle />
            <NavBar
              navItems={[
                { name: "Home", link: "/", icon: <Home /> },
                {
                  name: "Blog",
                  link: "https://blog.elliotmoreau.fr",
                  icon: <Rss />,
                },
              ]}
            />
            <div className="flex flex-col w-full">
              {children}
              <Footer />
            </div>
          </ThemeProvider>
        </div>
      </body>
      <Analytics />
    </html>
  );
}
