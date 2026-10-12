import { Inter, JetBrains_Mono } from "next/font/google";

/**
 * The two faces, defined once for both root layouts ([lang]/layout and
 * global-not-found). Both are variable, one face each: the mono's three
 * static weights came out as three faces on the same file, and the first
 * window to use a weight the Desktop hadn't (400) set the fonts loading
 * mid page transition, which holds the transition until they are in.
 */
export const inter = Inter({ variable: "--font-inter", subsets: ["latin"], axes: ["opsz"] });
export const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });
