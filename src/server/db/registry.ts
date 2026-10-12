import type { Migration, Seed } from "./types";
import { contentMigrations, contentSeed } from "../content/schema";
import { authMigrations } from "../auth/schema";
import { mailMigrations } from "../mail/schema";

/**
 * Every module's migrations, in order. Modules don't share tables, so
 * their lists only need to be ordered within themselves; ids are
 * namespaced ("content-001") so they never collide.
 */
export const MIGRATIONS: Migration[] = [...contentMigrations, ...authMigrations, ...mailMigrations];

/** Starting data, run after migrations; each seed checks before it inserts. */
export const SEEDS: Seed[] = [contentSeed];
