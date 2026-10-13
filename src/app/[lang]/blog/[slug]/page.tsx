import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDict, getNamespaces, hasLocale, localePath } from "@/i18n";
import { I18nScope } from "@/i18n/client";
import { SITE_URL } from "@/i18n/config";
import { getLatestPosts, getPost, type GhostFullPost } from "@/lib/ghost";
import { cleanPostHtml, postText } from "@/lib/postHtml";
import { FIXTURE_POSTS, FIXTURE_POST_HTML } from "@/lib/fixtures";
import { Article } from "@/components/apps/writing/Article";

export const revalidate = 3600;

/** sample posts stand in outside production when Ghost can't be reached */
const fixturesAllowed = () => process.env.RAILWAY_ENVIRONMENT_NAME !== "production" && process.env.EM_NO_FIXTURES !== "1";

/** the post and its neighbours, or null (404); `sample` when it's stand-in text */
async function load(slug: string) {
  const post = await getPost(slug);
  if (post) {
    const list = (await getLatestPosts(50)) ?? [];
    return { post, list, sample: false };
  }
  if (post === null || !fixturesAllowed()) return null;
  const fx = FIXTURE_POSTS.find((p) => p.slug === slug);
  return fx ? { post: { ...fx, html: FIXTURE_POST_HTML } as GhostFullPost, list: FIXTURE_POSTS, sample: true } : null;
}

export async function generateStaticParams() {
  // the newest posts are built ahead; older ones render on their first visit
  const posts = (await getLatestPosts(12)) ?? [];
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/[lang]/blog/[slug]">): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!hasLocale(lang)) return {};
  const data = await load(slug);
  if (!data) return {};
  const { post } = data;
  const t = getDict(lang).meta;
  const description = post.excerpt || postText(post.html);
  return {
    title: post.title,
    description,
    // the blog is where it was published first: search engines credit it
    alternates: { canonical: post.url },
    openGraph: {
      type: "article",
      siteName: t.siteName,
      title: post.title,
      description,
      url: localePath(lang, `/blog/${post.slug}`),
      publishedTime: post.published_at,
      ...(post.feature_image ? { images: [post.feature_image] } : {}),
    },
    twitter: { card: post.feature_image ? "summary_large_image" : "summary", title: post.title, description },
  };
}

export default async function PostPage({ params }: PageProps<"/[lang]/blog/[slug]">) {
  const { lang, slug } = await params;
  if (!hasLocale(lang)) notFound();
  const data = await load(slug);
  if (!data) notFound();
  const { post, list, sample } = data;
  const i = list.findIndex((p) => p.slug === post.slug);
  const pick = (p?: (typeof list)[number]) => (p ? { slug: p.slug, title: p.title } : null);
  const { html, ...meta } = post;
  return (
    <I18nScope dict={getNamespaces(lang, "writing")}>
      <Article
        post={meta}
        html={cleanPostHtml(html, new URL(SITE_URL).origin)}
        newer={i > 0 ? pick(list[i - 1]) : null}
        older={i >= 0 ? pick(list[i + 1]) : null}
        sample={sample}
      />
    </I18nScope>
  );
}
