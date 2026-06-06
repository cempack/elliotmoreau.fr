# elliotmoreau.fr

Personal website built with [Astro](https://astro.build) featuring editorial dark design, Deezer & GitHub API integrations, and a markdown blog.

## Getting Started

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env` and fill in the server-side tokens before running the live integrations locally.

## Blog Posts

Blog posts are authored in Markdown and automatically rendered to HTML pages by Astro.

Add new posts in `src/blog/`:

```markdown
---
title: 'Your Post Title'
pubDate: 2024-01-01
description: 'Brief description of your post'
tags: ['tag1', 'tag2']
---

# Your Content Here

Write in standard markdown.
```

You can also scaffold a new post with:

```bash
npm run new:post -- "Your Post Title"
```

There is also a starter file at `src/blog/_template.md`. Files beginning with `_` are ignored by the blog collection, so the template will not be published.

## Environment Variables

```
GITHUB_TOKEN=
```

## Deployment (Vercel)

The site uses [Astro SSR](https://docs.astro.build/en/guides/on-demand-rendering/) with [`@astrojs/vercel`](https://docs.astro.build/en/guides/integrations-guide/vercel/). Project settings live in [`vercel.json`](vercel.json) (build/install commands). Vercel selects a [supported Node version](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions) from [`package.json` `engines`](package.json) (your local Node can be newer; the build may note the runtime Vercel uses).

### Git integration (recommended)

1. Push the repo to GitHub (or GitLab / Bitbucket).
2. In [Vercel](https://vercel.com), **Add New Project** → import the repository.
3. Leave the defaults (Vercel detects Astro; build runs `npm run build` per `vercel.json`).
4. Under **Environment Variables**, add the same keys as [`.env.example`](.env.example) for **Production** (and **Preview** if you want APIs on preview deployments):

   | Name | Notes |
   |------|--------|
   | `GITHUB_TOKEN` | Fine-grained or classic PAT with repo read access |

5. Deploy. Point your domain **elliotmoreau.fr** in **Project → Settings → Domains** (DNS at your registrar as instructed by Vercel).

### CLI

```bash
npm run deploy       # preview deployment
npm run deploy:prod  # production
```

The CLI is not bundled in this repo (keeps `npm audit` clean); `npm run deploy` uses `npx vercel@latest`. Link the project once with `npx vercel link` if you have not imported via the dashboard.

## Tech Stack

- **Framework**: Astro (SSR with Vercel adapter)
- **Styling**: Vanilla CSS with editorial design system
- **Fonts**: Inter, Space Grotesk, Playfair Display
- **APIs**: GitHub (repos), Deezer (flow, top artists)
- **Blog**: Markdown with Astro content collections
