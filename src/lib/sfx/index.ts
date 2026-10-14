/**
 * The sounds themselves: the instruments (voices.ts) and what each sound is
 * made of (recipes.ts). Loaded on the visitor's first gesture (or once the
 * page is idle), never with the page: lib/sound.tsx imports this lazily.
 */
export { makeBus, panned, type Bus } from "./voices";
export { play, LENGTH } from "./recipes";
