import { orderPlaces, type LiveOverrides, type NowContent, type PlaceRow, type ProjectsContent, type Status } from "@/lib/content";
import { PLACES } from "@/lib/places";
import { NOW } from "@/content/now";
import { PROJECTS } from "@/content/projects";

/**
 * The starting content: what an empty database is filled with, and what
 * reads fall back to when the database can't be opened (or during the
 * build, which never touches it). Each call returns fresh copies, so no
 * caller can change the seed for the next.
 */

const STATUS: Status = {
  away: null,
  workHours: { start: "09:00", end: "18:30", days: [1, 2, 3, 4, 5], tz: "Europe/Paris" },
  replyDays: 3,
};

const LIVE: LiveOverrides = {
  // the repo Projects featured before this was editable
  featuredRepo: "omarchy-dos-moos-theme",
  hiddenRepos: [],
  showSpotify: true,
};

export const seedPlaces = (): PlaceRow[] =>
  orderPlaces(PLACES.map((p, i) => structuredClone({ ...p, home: Boolean(p.home), sort: i })));
export const seedStatus = (): Status => structuredClone(STATUS);
export const seedNow = (): NowContent => structuredClone(NOW);
export const seedLive = (): LiveOverrides => structuredClone(LIVE);
export const seedProjects = (): ProjectsContent => structuredClone({ notes: PROJECTS, order: [] });
