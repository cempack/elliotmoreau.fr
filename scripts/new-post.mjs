import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const title = process.argv.slice(2).join(' ').trim();

if (!title) {
  console.error('Usage: npm run new:post -- "My New Post"');
  process.exit(1);
}

const slug = title
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

if (!slug) {
  console.error('Could not generate a slug from that title.');
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const targetDir = path.resolve('src/blog');
const targetFile = path.join(targetDir, `${slug}.md`);

const content = `---
title: '${title.replace(/'/g, "\\'")}'
pubDate: ${today}
description: 'Add a short summary for the blog index and RSS feed.'
tags: ['writing']
---

# ${title}

Start writing here in Markdown.
`;

await mkdir(targetDir, { recursive: true });
await writeFile(targetFile, content, { flag: 'wx' });

console.log(`Created ${targetFile}`);
