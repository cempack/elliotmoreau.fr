"use client";

import dynamic from "next/dynamic";

// Loaded lazily so its stylesheet isn't preloaded on every page ("CSS
// preloaded but not used" warnings).
export const NotFoundLazy = dynamic(() => import("./NotFoundApp").then((m) => m.NotFoundApp));
