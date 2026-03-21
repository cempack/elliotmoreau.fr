export const prerender = true;

import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { sortBlogPosts } from '../lib/blog';

export async function GET(context: APIContext) {
  const sorted = sortBlogPosts(await getCollection('blog'));

  return rss({
    title: 'Elliot Moreau',
    description: 'Thoughts on design systems, software engineering, and digital minimalism.',
    site: context.site || 'https://elliotmoreau.fr',
    items: sorted.map(post => ({
      title: post.data.title,
      pubDate: post.data.pubDate,
      description: post.data.description,
      link: `/blog/${post.id}/`,
    })),
  });
}
