import type { Migration, Seed } from "../db/types";

/** Content tables (places, status, now, settings). Owned by the content module. */
export const contentMigrations: Migration[] = [];

/** Seeds the content tables from the static files on first run. */
export const contentSeed: Seed = () => {};
