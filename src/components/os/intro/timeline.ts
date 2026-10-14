/* The arrival's timeline on its own: the boot reads it on every first
   visit, while the flight itself (flight.ts, with the planet's landmass
   and the city) only loads where it runs, in its worker. */

/** The timeline, in ms. */
export const T = {
  /** stars and the planet come up out of the dark */
  fade: 1000,
  /** Toulouse faces you */
  turned: 3200,
  /** the fall toward it begins */
  plunge: 3400,
  /** inside the thickest cloud: the planet becomes the city */
  city: 6000,
  /** the descent over the map levels off over the Pont Saint-Pierre */
  reveal: 8000,
  /** deep in the low cloud on the river: the map is gone, the wallpaper's scene is under it, the glide up the river begins */
  glide: 8500,
  /** (the city camera's last frame, under the cloud) */
  joined: 8500,
  /** the Desktop starts coming in, over the last of the glide */
  hand: 9700,
  /** the glide has come to rest on the wallpaper's own view (the canvas, fading, is a pixel off at most by then) */
  land: 10300,
  /** the Desktop is all there is */
  end: 10600,
} as const;
