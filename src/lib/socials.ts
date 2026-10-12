/** Elliot's profiles and address: fixed facts, not editable content. */
export const SOCIALS = {
  github: "https://github.com/cempack",
  youtube: "https://www.youtube.com/@cempack",
  mastodon: "https://mastodon.social/@cempack",
  x: "https://x.com/cempack_",
  spotifyUser: "https://open.spotify.com/user/31a6a3od3rg52u6yz53ubapsxfgu",
  email: "hello@elliotm.fr",
};

/**
 * What the site's mailto: links write to: the same inbox through a plus
 * tag (Proton delivers hello+site@ to hello@). It is how the admin's Mail
 * tells a letter someone sent from their own mail app, after clicking on
 * the site, from the rest of the inbox: the mail sync turns mail to this
 * address into a site conversation and leaves everything else alone.
 */
export const SITE_MAILTO = SOCIALS.email.replace("@", "+site@");
