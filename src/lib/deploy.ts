import "server-only";
import path from "node:path";

/**
 * Where this server runs. The site is self-hosted on Coolify, behind
 * Cloudflare; Coolify sets COOLIFY_* on the container, and SOURCE_COMMIT
 * (the deployed commit) unless that's switched off in its Advanced settings.
 */

function siteHost() {
  try {
    return new URL(process.env.SITE_URL ?? "").hostname;
  } catch {
    return "";
  }
}

/**
 * The real site (or one of its PR previews): a production server with a
 * public SITE_URL. Anywhere else (next dev, a local `next start`, a build
 * without SITE_URL) is a workbench.
 */
export function isLive() {
  const host = siteHost();
  return process.env.NODE_ENV === "production" && Boolean(host) && !/^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/.test(host);
}

/** sample data stands in for unreachable sources, except on the real site (or with EM_NO_FIXTURES=1) */
export const sampleAllowed = () => !isLive() && process.env.EM_NO_FIXTURES !== "1";

/** the commit this server was built from (or the branch, when Coolify doesn't say), so the Terminal's git log is the running site's */
export const deployedSha = () => process.env.SOURCE_COMMIT || "main";

/** this server was deployed by Coolify (rather than run by hand) */
export const deployedByCoolify = () => Boolean(process.env.COOLIFY_RESOURCE_UUID || process.env.COOLIFY_CONTAINER_NAME);

/** whether the database file lives outside the app's own folder (which every deploy replaces) */
export const databaseKept = (file: string) => !path.resolve(file).startsWith(process.cwd() + path.sep);
