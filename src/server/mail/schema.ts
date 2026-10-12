import type { Migration } from "../db/types";

/** Mail tables (threads, messages, IMAP sync state). Owned by the mail module. */
export const mailMigrations: Migration[] = [];
