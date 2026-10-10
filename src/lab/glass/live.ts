"use client";

import { createContext, useContext } from "react";
import type { useSpotifyStatus } from "@/hooks/useSpotifyStatus";

type Live = ReturnType<typeof useSpotifyStatus>;

/** One Spotify poller for the whole page; hero chip and widgets read it. */
export const SpotifyCtx = createContext<Live>({ status: null, track: null, playing: false });
export const useSpotify = () => useContext(SpotifyCtx);
