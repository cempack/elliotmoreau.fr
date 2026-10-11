import { Inter, JetBrains_Mono } from "next/font/google";

/**
 * The two faces, defined once for both root layouts ([lang]/layout and
 * global-not-found). Inter is variable (one file, optical sizes too); the
 * mono comes as its three static weights, which together weigh less than
 * its variable file.
 */
export const inter = Inter({ variable: "--font-inter", subsets: ["latin"], axes: ["opsz"] });
export const mono = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], weight: ["400", "500", "600"] });
