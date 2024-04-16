"use client";

import { Skeleton } from "./skeleton";

export function HoverCardSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-[50px] rounded-sm" />
      <div className="space-y-4">
        <Skeleton className="h-8 w-[200px]" />
        <Skeleton className="h-4 w-[150px]" />
      </div>
    </div>
  );
}

export function SocialsSkeleton() {
  return (
    <div className="flex flex-row gap-2">
      <Skeleton className="w-16 h-9 px-4 py-2 rounded-full" />
      <Skeleton className="w-20 h-9 px-4 py-2 rounded-full" />
      <Skeleton className="w-20 h-9 px-4 py-2 rounded-full" />
      <Skeleton className="w-16 h-9 px-4 py-2 rounded-full" />
    </div>
  );
}

export function ReposSkeleton({ reposNumber }: { reposNumber: number }) {
  return (
    <div>
      {Array.from({ length: reposNumber }).map((_, index) => (
        <Skeleton key={index} className="h-6 w-full rounded-sm mb-5" />
      ))}
    </div>
  );
}
