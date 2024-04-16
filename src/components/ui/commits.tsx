"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Separator } from "./separator";

export default function LatestRepos({ count }: { count: number }) {
  useEffect(() => {
    fetchRepos(count);
  }, [count]);

  const [repos, setRepos] = useState<any[]>([]);

  function fetchRepos(i: number) {
    fetch("https://api.github.com/users/cempack/repos")
      .then((response) => response.json())
      .then((data) => {
        const sortedRepos = data.sort((a: any, b: any) => {
          return (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        });
        const latestRepos = sortedRepos.slice(0, i);
        setRepos(latestRepos);
      })
      .catch((error) => {
        console.error("Error fetching GitHub repositories:", error);
      });
  }

  useEffect(() => {
    fetchRepos(count);
  }, [count]);

  return (
    <div>
      {repos.map((repo: any, index: number) => (
        <div key={repo.id}>
          <Link
            href={`https://github.com/cempack/${repo.name}`}
            target="_blank"
            className="flex flex-row items-center"
          >
            <h1 className="text-lg text-bold text-gray-500 dark:text-gray-300">
              {repo.name}
            </h1>
          </Link>
          {index !== repos.length - 1 && <Separator className="my-3" />}
        </div>
      ))}
    </div>
  );
}
