export interface SocialLink {
  id: string;
  label: string;
  shortLabel?: string;
  href: string;
  icon: string;
  rel?: string;
}

export const socialLinks: SocialLink[] = [
  {
    id: 'github',
    label: 'GitHub',
    href: 'https://github.com/cempack',
    icon: 'https://cdn.simpleicons.org/github/ffffff',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    href: 'https://youtube.com/cempack',
    icon: 'https://cdn.simpleicons.org/youtube/ffffff',
  },
  {
    id: 'mastodon',
    label: 'Mastodon',
    href: 'https://mastodon.social/@cempack',
    icon: 'https://cdn.simpleicons.org/mastodon/ffffff',
    rel: 'me',
  },
  {
    id: 'x',
    label: 'X / Twitter',
    shortLabel: 'X',
    href: 'https://x.com/cempack_',
    icon: 'https://cdn.simpleicons.org/x/ffffff',
  },
  {
    id: 'spotify',
    label: 'Spotify',
    href: 'https://open.spotify.com/user/31a6a3od3rg52u6yz53ubapsxfgu',
    icon: 'https://cdn.simpleicons.org/spotify/ffffff',
  },
  {
    id: 'rss',
    label: 'RSS',
    href: '/rss.xml',
    icon: '',
  },
];
