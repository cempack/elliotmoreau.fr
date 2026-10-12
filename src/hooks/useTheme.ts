"use client";

import { useMemo } from "react";
import { useMaybeSiteData } from "@/components/os/SiteData";
import { SNAPSHOT_THEME, artPalette, type ArtPalette, type Theme, type ThemeTokens } from "@/lib/theme";

/**
 * The live Dos Moos theme on the client (fetched on the server, carried in
 * SiteData), or the snapshot outside the OS shell. CSS reads the same
 * values as custom properties (--color-*); this is for what CSS can't
 * reach: SVG fills in pixel art, canvas painting, inline swatches.
 */
export function useTheme(): Theme {
  return useMaybeSiteData()?.theme ?? SNAPSHOT_THEME;
}

export function useThemeTokens(): ThemeTokens {
  return useTheme().tokens;
}

/** the pixel art's tones: base roles plus a light and a deep shade of each accent */
export function useArtPalette(): ArtPalette {
  const tokens = useThemeTokens();
  return useMemo(() => artPalette(tokens), [tokens]);
}
