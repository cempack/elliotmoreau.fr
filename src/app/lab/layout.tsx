import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SoundProvider } from "@/lib/sound";
import { ToastProvider } from "@/components/Toasts";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { SmoothScroll } from "@/components/motion/SmoothScroll";

export const metadata: Metadata = {
  title: "Lab — Elliot Moreau",
  robots: { index: false, follow: false },
};

/**
 * Design prototypes for the rework. Local and preview deploys only —
 * production 404s here.
 */
export default function LabLayout({ children }: { children: React.ReactNode }) {
  if (process.env.VERCEL_ENV === "production") notFound();
  return (
    <MotionProvider>
      <SmoothScroll />
      <SoundProvider delegated={false}>
        <ToastProvider>{children}</ToastProvider>
      </SoundProvider>
    </MotionProvider>
  );
}
