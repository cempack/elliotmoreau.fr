import type { PlaceRow } from "./content";

export { SOCIALS } from "./socials";

export type PlaceStatus = PlaceRow["status"];

/** A place as written here: home is optional, the order is the list's. */
export type Place = Omit<PlaceRow, "sort" | "home"> & { home?: boolean };

/**
 * SEED ONLY. The places live in the database (src/server/content) and are
 * edited from the admin panel; this list fills an empty database on first
 * boot, and stands in if the database can't be opened. The site never reads
 * it directly: use usePlaces() on the client, getPlaces() on the server.
 *
 * `iso` is the country a place belongs to (the Canaries are Spain, Northern
 * Ireland is the UK) and `continent` its continent, so the Atlas counts
 * countries and continents honestly. `note` is the place card's line.
 */
export const PLACES: Place[] = [
  {
    id: "france",
    lat: 43.6047,
    lon: 1.4442,
    status: "been",
    home: true,
    name: { en: "France", fr: "France" },
    region: { en: "europe", fr: "europe" },
    iso: "FR",
    continent: "europe",
    note: {
      en: "Home. Where I study, and where every trip starts and ends.",
      fr: "Chez moi. Là où j’étudie, et où chaque voyage commence et finit.",
    },
  },
  {
    id: "canada",
    lat: 56.1304,
    lon: -106.3468,
    status: "been",
    name: { en: "Canada", fr: "Canada" },
    region: { en: "north america", fr: "amérique du nord" },
    iso: "CA",
    continent: "north-america",
    note: { en: "Big skies and long drives.", fr: "De grands ciels et de longues routes." },
  },
  {
    id: "ireland",
    lat: 53.1424,
    lon: -7.6921,
    status: "been",
    name: { en: "Ireland", fr: "Irlande" },
    region: { en: "europe", fr: "europe" },
    iso: "IE",
    continent: "europe",
    note: {
      en: "Green everywhere, and weather that changes every hour.",
      fr: "Du vert partout, et une météo qui change toutes les heures.",
    },
  },
  {
    id: "northern-ireland",
    lat: 54.7877,
    lon: -6.4923,
    status: "been",
    name: { en: "Northern Ireland", fr: "Irlande du Nord" },
    region: { en: "europe", fr: "europe" },
    iso: "GB",
    continent: "europe",
    note: { en: "The Causeway Coast, and a lot of wind.", fr: "La Chaussée des Géants, et beaucoup de vent." },
  },
  {
    id: "canaries",
    lat: 28.2916,
    lon: -16.6291,
    status: "been",
    name: { en: "Canary Islands", fr: "Îles Canaries" },
    region: { en: "atlantic", fr: "atlantique" },
    iso: "ES",
    continent: "europe",
    note: { en: "Volcanic landscapes and sun in winter.", fr: "Des paysages volcaniques et du soleil en hiver." },
  },
  {
    id: "spain",
    lat: 40.4637,
    lon: -3.7492,
    status: "been",
    name: { en: "Spain", fr: "Espagne" },
    region: { en: "europe", fr: "europe" },
    iso: "ES",
    continent: "europe",
    note: { en: "Late dinners and long evenings.", fr: "Des dîners tardifs et de longues soirées." },
  },
  {
    id: "japan",
    lat: 36.2048,
    lon: 138.2529,
    status: "want",
    name: { en: "Japan", fr: "Japon" },
    region: { en: "asia", fr: "asie" },
    iso: "JP",
    continent: "asia",
    note: {
      en: "First on the list: the trains, the food, the cities.",
      fr: "En tête de liste : les trains, la cuisine, les villes.",
    },
  },
  {
    id: "usa",
    lat: 37.0902,
    lon: -95.7129,
    status: "want",
    name: { en: "United States", fr: "États-Unis" },
    region: { en: "north america", fr: "amérique du nord" },
    iso: "US",
    continent: "north-america",
    note: { en: "A road trip through the national parks.", fr: "Un road trip à travers les parcs nationaux." },
  },
  {
    id: "south-africa",
    lat: -30.5595,
    lon: 22.9375,
    status: "want",
    name: { en: "South Africa", fr: "Afrique du Sud" },
    region: { en: "africa", fr: "afrique" },
    iso: "ZA",
    continent: "africa",
    note: { en: "Cape Town and the coast.", fr: "Le Cap et la côte." },
  },
  {
    id: "norway",
    lat: 60.472,
    lon: 8.4689,
    status: "want",
    name: { en: "Norway", fr: "Norvège" },
    region: { en: "europe", fr: "europe" },
    iso: "NO",
    continent: "europe",
    note: {
      en: "Fjords, and hopefully the northern lights.",
      fr: "Les fjords, et avec un peu de chance les aurores boréales.",
    },
  },
];
