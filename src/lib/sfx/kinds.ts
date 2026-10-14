/**
 * Every sound emOS can make, by name. The OS's own voice (soft plucks in
 * the startup chord's C major) for the things every app shares; and for
 * each lit object on the site, the sound that object would make if it were
 * real and small: the typewriter's keys and bell, the cassette turning on
 * its turntable, the dome's glass, the 404's shards, a split-flap row, a
 * record sleeve, a rubber stamp, a brick of the wall.
 */

export type SoundKind =
  /* ── the OS ── */
  /** the softest touch: a tab, a segmented choice, a small button */
  | "tap"
  /** a detent: scrubbing, a counter, a station passing */
  | "tick"
  /** picking one thing among several */
  | "select"
  /** a neutral switch between options */
  | "toggle"
  /** a switch turned on, and off */
  | "on"
  | "off"
  /** a panel, sheet or menu coming up, and going away */
  | "open"
  | "close"
  /** an app opening (each app has its own three notes: pass its id as the variant) */
  | "launch"
  /** something worked: saved, subscribed, unlocked */
  | "success"
  /** copied to the clipboard */
  | "copy"
  /** a letter leaving */
  | "send"
  /** it didn't work */
  | "error"
  /** deleted */
  | "trash"
  /** a window widening or narrowing into place */
  | "snap"
  /** a page turning: a post opening or closing */
  | "page"
  /** emOS turning off: the startup chord, falling */
  | "shutdown"
  /** a context menu blooming under the pointer */
  | "menu"
  /** something picked up (an icon, a widget, a card) */
  | "lift"
  /** and put down: a felt-tipped landing; heavier when thrown (amount) */
  | "drop"
  /** the sky turning towards day, and towards night */
  | "dawn"
  | "dusk"

  /* ── the terminal ── */
  /** a key of a soft mechanical keyboard */
  | "key"
  /** the return key: the big one, with its stabilizer */
  | "enter"
  /** tab-completion filling the word in */
  | "complete"
  /** the metro: the doors chime as the train reaches a station */
  | "chime"

  /* ── the Mail typewriter ── */
  /** a typebar striking the platen */
  | "type"
  /** the spacebar: no strike, just the carriage stepping */
  | "space"
  /** the margin bell, near the end of a line */
  | "ding"
  /** the carriage thrown back: a ratchet, a slide, a clunk */
  | "carriage"
  /** the wax seal pressed */
  | "seal"
  /** paper folding, a sheet lifting */
  | "fold"

  /* ── the Music cassette, the turntables ── */
  /** the cassette turning over on the turntable */
  | "flip"
  /** and seating on its new side */
  | "seat"
  /** a hand on the record: it stops dead */
  | "brake"
  /** let go, the record spins back up */
  | "whirl"
  /** a record sleeve flicking past in the crate */
  | "sleeve"
  /** a split-flap row turning over */
  | "flap"

  /* ── the Projects machine ── */
  /** a screen coming on: the tube's thump, a breath of static */
  | "power"
  /** the drive reading: a few seeks of a little disk */
  | "disk"
  /** leaning in to the screen, and back */
  | "zoom"

  /* ── pieces you can turn ── */
  /** a throw that sends a piece turning on its turntable (amount: how hard) */
  | "spin"
  /** a turn that reaches its end stop */
  | "stop"

  /* ── the Blog dome ── */
  /** a fingertip on the glass dome */
  | "glass"
  /** the reading's long exposure ending: a shutter closing */
  | "shutter"

  /* ── Atlas ── */
  /** a pin pushed into the map */
  | "pin"
  /** a rubber stamp landing on a postcard */
  | "stamp"
  /** a postcard or a card turned over */
  | "card"

  /* ── the 404 ── */
  /** the page breaking into shards */
  | "shatter"
  /** and the shards finding each other again */
  | "mend"

  /* ── the Desktop and the room ── */
  /** a brick of the wall under the finger: terracotta */
  | "brick"
  /** an hour passing while you scrub through the day */
  | "hour"
  /** through the lit window, into the room */
  | "inside"
  /** and back out to the city */
  | "outside"
  /** a thing in the room, touched (the variant is the thing) */
  | "thing"
  /** the admin's lock: a latch, a bolt drawn back */
  | "unlock";

/** options a call can pass along */
export type SoundOpts = {
  /** how hard (0…1): a throw's speed, a heavier landing */
  amount?: number;
  /** which version of the sound (an app's id, a thing in the room) */
  variant?: string;
  /** where on screen it happened (client x), for a hair of stereo */
  x?: number;
};
