/** What's live in Elliot's room (Room.tsx gathers it, round/scene.ts draws it). */

export type RoomPhase = "dawn" | "day" | "dusk" | "night";
export type RoomState = {
  phase: RoomPhase;
  rain: boolean;
  /** books on the shelf (one per post, up to 6) */
  posts: number;
  /** postcards on the board (one per trip, up to 6) */
  places: number;
  /** Toulouse time, for the clock */
  hour: number;
  minute: number;
  playing: boolean;
};
