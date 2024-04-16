import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import HoverCardUser from "@/components/ui/hover-card-user";
import Project from "@/components/ui/project";
import LatestRepos from "@/components/ui/repos";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { TechStack } from "@/components/ui/tech-stack";
import Image from "next/image";
import { Suspense } from "react";

export function Badge(props: any) {
  return (
    <a
      {...props}
      target="_blank"
      className="inline-flex items-center rounded border border-neutral-200 bg-neutral-50 p-1 text-sm leading-4 text-neutral-900 no-underline dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
    />
  );
}

export default function Home() {
  const birthday = new Date(2008, 0, 19);
  const today = new Date();
  const age = today.getFullYear() - birthday.getFullYear();

  return (
    <main className="flex items-center justify-start h-full flex-auto min-w-0 px-2 md:px-0">
      <div className="flex flex-col gap-2">
        <section className="px-4 md:px-0">
          <div className="flex flex-row items-center gap-2">
            <Avatar className="scale-105">
              <Suspense
                fallback={<Skeleton className="w-full h-full rounded-full" />}
              >
                <AvatarImage src="https://github.com/cempack.png" />
              </Suspense>
              <AvatarFallback>Cempack</AvatarFallback>
            </Avatar>
            <h1 className="text-2xl font-medium tracking-tighter">
              Hey I&apos;m
              <HoverCard>
                <HoverCardTrigger asChild>
                  <Button className="text-2xl mx-[-0.5rem]" variant="link">
                    @cempack
                  </Button>
                </HoverCardTrigger>
                <HoverCardContent className="w-80">
                  <div className="flex space-x-4">
                    <Avatar>
                      <AvatarImage src="https://github.com/cempack.png" />
                      <AvatarFallback>Cempack</AvatarFallback>
                    </Avatar>
                    <HoverCardUser />
                  </div>
                </HoverCardContent>
              </HoverCard>
              ✌️
            </h1>
          </div>
          <p className="text-lg w-full items-center">
            I&apos;m a {age}y old student and passionate developer. I live in
            <span className="mx-1">
              <Badge
                href="https://fr.wikipedia.org/wiki/France"
                className="rounded-md"
              >
                <Image
                  alt="French flag logo"
                  src="/france.svg"
                  className="!mr-1"
                  width="14"
                  height="14"
                />
                France
              </Badge>
            </span>
            and like to work with
            <span className="mx-1">
              <Badge href="https://nextjs.org" className="rounded-md">
                <Image
                  alt="Next.js logo"
                  src="/next-logo.svg"
                  className="!mr-1"
                  width="14"
                  height="14"
                />
                Next.js
              </Badge>
            </span>
            and
            <span className="mx-1">
              <Badge href="https://react.dev" className="rounded-md">
                <Image
                  alt="React logo"
                  src="/react-logo.svg"
                  className="!mr-1"
                  width="14"
                  height="14"
                />
                React
              </Badge>
            </span>
          </p>
        </section>
        <section className="mt-12 flex flex-row justify-between gap-2">
          <div className="bg-white dark:bg-black border-black/[0.2] dark:border-white/[0.2] p-5 rounded-lg w-full border">
            <h1 className="text-base text-gray-500 dark:text-gray-300 uppercase mb-1">
              Projects
            </h1>
            <Separator className="my-3" />
            <Project
              name="LaGazetteTulliste"
              icon="/lgt.png"
              href="https://journal.elliotmoreau.fr"
            />
            <Separator className="my-3" />
            <Project
              name="Winzoria"
              icon="/winzoria.png"
              href="https://winzoria.vercel.app"
            />
            <Separator className="my-3" />
            <Project
              name="Ninariot"
              icon="/ninariot.png"
              href="https://github.com/cempack/NinariotUpdates"
            />
          </div>
          <div className="bg-white dark:bg-black border-black/[0.2] dark:border-white/[0.2] p-5 rounded-lg w-full border">
            <h1 className="text-base text-gray-500 dark:text-gray-300 uppercase mb-1">
              Latest Repos
            </h1>
            <Separator className="mb-5" />
            <LatestRepos count={4} />
          </div>
        </section>
        <section className="mt-12 px-4 md:px-0">
          <h1 className="text-2xl font-bold mb-5">My tech stack</h1>
          <TechStack />
        </section>
      </div>
    </main>
  );
}
