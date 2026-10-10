"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/client";

/** Placeholder — replaced by the 404 builder. */
export function NotFoundApp() {
  const { path } = useI18n();
  return (
    <div className="grid min-h-svh place-items-center">
      <Link href={path("/")} className="glass rounded-2xl px-5 py-3">
        404
      </Link>
    </div>
  );
}
