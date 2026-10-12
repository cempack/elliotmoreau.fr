import type { Migration } from "../db/types";

/** Admin auth tables (passkeys, sessions, rate limits, audit). Owned by the admin module. */
export const authMigrations: Migration[] = [];
