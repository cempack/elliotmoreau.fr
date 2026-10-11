export type PlaceStatus = "been" | "want";

export type Place = {
  id: string;
  lat: number;
  lon: number;
  status: PlaceStatus;
  home?: boolean;
  name: { en: string; fr: string };
  region: { en: string; fr: string };
};

export const PLACES: Place[] = [
  { id: "france", lat: 46.6034, lon: 1.8883, status: "been", home: true, name: { en: "France", fr: "France" }, region: { en: "europe", fr: "europe" } },
  { id: "canada", lat: 56.1304, lon: -106.3468, status: "been", name: { en: "Canada", fr: "Canada" }, region: { en: "north america", fr: "amérique du nord" } },
  { id: "ireland", lat: 53.1424, lon: -7.6921, status: "been", name: { en: "Ireland", fr: "Irlande" }, region: { en: "europe", fr: "europe" } },
  { id: "northern-ireland", lat: 54.7877, lon: -6.4923, status: "been", name: { en: "Northern Ireland", fr: "Irlande du Nord" }, region: { en: "europe", fr: "europe" } },
  { id: "canaries", lat: 28.2916, lon: -16.6291, status: "been", name: { en: "Canary Islands", fr: "Îles Canaries" }, region: { en: "atlantic", fr: "atlantique" } },
  { id: "spain", lat: 40.4637, lon: -3.7492, status: "been", name: { en: "Spain", fr: "Espagne" }, region: { en: "europe", fr: "europe" } },
  { id: "japan", lat: 36.2048, lon: 138.2529, status: "want", name: { en: "Japan", fr: "Japon" }, region: { en: "asia", fr: "asie" } },
  { id: "usa", lat: 37.0902, lon: -95.7129, status: "want", name: { en: "United States", fr: "États-Unis" }, region: { en: "north america", fr: "amérique du nord" } },
  { id: "south-africa", lat: -30.5595, lon: 22.9375, status: "want", name: { en: "South Africa", fr: "Afrique du Sud" }, region: { en: "africa", fr: "afrique" } },
  { id: "norway", lat: 60.472, lon: 8.4689, status: "want", name: { en: "Norway", fr: "Norvège" }, region: { en: "europe", fr: "europe" } },
];

export const HOME = PLACES[0];

export function fmtCoords(lat: number, lon: number) {
  const la = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"}`;
  const lo = `${Math.abs(lon).toFixed(2)}°${lon >= 0 ? "E" : "W"}`;
  return `${la} ${lo}`;
}

export const SOCIALS = {
  github: "https://github.com/cempack",
  youtube: "https://www.youtube.com/@cempack",
  mastodon: "https://mastodon.social/@cempack",
  x: "https://x.com/cempack_",
  spotifyUser: "https://open.spotify.com/user/31a6a3od3rg52u6yz53ubapsxfgu",
  email: "hello@elliotm.fr",
};
