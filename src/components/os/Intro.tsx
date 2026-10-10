"use client";

/**
 * CONTRACT (owner: boot/terminal agent)
 * Once-per-session boot → lock screen, built on IntroGate (SSR-visible,
 * skipped by any input, hidden pre-paint for returning visitors, never
 * under reduced motion, ≤ 2.4s total). Boot: pixel emOS mark + progress.
 * Lock screen: huge Paris clock + date over the wallpaper, "Elliot Moreau",
 * a hint to unlock; unlock = the glass lifts away (spring) revealing the
 * desktop; optional startup chime if sound is on and a gesture unlocked it.
 */
export function Intro() {
  return null;
}
