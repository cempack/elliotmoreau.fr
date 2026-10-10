import { SoundProvider } from "@/lib/sound";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { PixelSky } from "@/components/PixelSky";
import { ClickStamps } from "@/components/ClickStamps";
import { PixelDust } from "@/components/PixelDust";
import { ToastProvider } from "@/components/Toasts";
import { SmoothScroll } from "@/components/SmoothScroll";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grain vignette flex min-h-full flex-1 flex-col">
      <SmoothScroll />
      <PixelSky />
      <div aria-hidden className="bg-hills" />
      <PixelDust />
      <SoundProvider>
        <ToastProvider>
          <Nav />
          <main className="relative z-10 flex-1 pt-14">{children}</main>
          <Footer />
          <ClickStamps />
        </ToastProvider>
      </SoundProvider>
    </div>
  );
}
