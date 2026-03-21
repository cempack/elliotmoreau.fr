// Globe Locations Configuration
// Edit this file to update the places shown on your 3D globe.
// Each location needs: name, lat, lng, and type ('visited' or 'wishlist')

export interface GlobeLocation {
  name: string;
  lat: number;
  lng: number;
  type: 'visited' | 'wishlist';
}

export const locations: GlobeLocation[] = [
  // ── Places I've Been ──
  { name: 'France',           lat: 46.6034,  lng: 1.8883,    type: 'visited' },
  { name: 'Canada',           lat: 56.1304,  lng: -106.3468, type: 'visited' },
  { name: 'Ireland',          lat: 53.1424,  lng: -7.6921,   type: 'visited' },
  { name: 'Northern Ireland', lat: 54.7877,  lng: -6.4923,   type: 'visited' },
  { name: 'Canary Islands',   lat: 28.2916,  lng: -16.6291,  type: 'visited' },
  { name: 'Spain',            lat: 40.4637,  lng: -3.7492,   type: 'visited' },

  // ── Places I Wanna Go ──
  { name: 'Japan',            lat: 36.2048,  lng: 138.2529,  type: 'wishlist' },
  { name: 'United States',    lat: 37.0902,  lng: -95.7129,  type: 'wishlist' },
  { name: 'South Africa',     lat: -30.5595, lng: 22.9375,   type: 'wishlist' },
  { name: 'Norway',           lat: 60.4720,  lng: 8.4689,    type: 'wishlist' },
];
