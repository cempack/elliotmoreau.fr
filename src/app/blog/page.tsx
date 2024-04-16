import Article from "@/components/ui/article";
import {
  GlowingStarsBackgroundCard,
  GlowingStarsDescription,
  GlowingStarsTitle,
} from "@/components/ui/blog-card";
import { ArrowRight } from "lucide-react";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cempack • Blog",
  description: "Hello there 👋 ! Welcome to my blog.",
};

export default function Blog() {
  const articles: {
    id: number;
    title: string;
    description: string;
    views: number;
  }[] = [
    {
      id: 1,
      title: "Sample Article 1",
      description: "This is the first sample article.",
      views: 10,
    },
    {
      id: 2,
      title: "Sample Article 2",
      description: "This is the second sample article.",
      views: 10,
    },
    {
      id: 3,
      title: "Sample Article 3",
      description: "This is the third sample article.",
      views: 10,
    },
  ];

  const latestArticle = articles[0];
  const otherArticles = articles.slice(1);

  return (
    <main className="flex items-center justify-start h-full w-full flex-auto min-w-0 px-2 md:px-0">
      <div className="flex flex-col gap-2 w-full">
        <section className="px-4 md:px-0 w-full">
          <div className="flex flex-row items-center gap-2">
            <h1 className="text-2xl font-medium tracking-tighter">
              Have fun reading me 🗞️
            </h1>
          </div>
          <div className="flex pb-5 pt-10 items-center justify-center antialiased w-full">
            <GlowingStarsBackgroundCard className="w-full">
              <GlowingStarsTitle>{latestArticle.title}</GlowingStarsTitle>
              <div className="flex justify-between items-end">
                <GlowingStarsDescription>
                  {latestArticle.description}
                </GlowingStarsDescription>
                <div className="h-8 w-8 rounded-full bg-[hsla(0,0%,100%,.1)] flex items-center justify-center">
                  <ArrowRight className="invert dark:invert-0" />
                </div>
              </div>
            </GlowingStarsBackgroundCard>
          </div>
          <div className="flex w-full justify-center">
            <div className="w-[95%] flex gap-5 flex-col rounded-lg mt-5">
              {otherArticles.map((article) => (
                <Article
                  key={article.id}
                  title={article.title}
                  description={article.description}
                  views={article.views}
                  id={article.id}
                />
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
