"use client";

import { useMemo } from "react";
import { usePlaces } from "@/components/os/SiteData";
import { atlasOf, type Atlas } from "./geo";

/** The places from the database, ordered and grouped once per data change. */
export function useAtlas(): Atlas {
  const places = usePlaces();
  return useMemo(() => atlasOf(places), [places]);
}
