"use client";

import { fetchGithub } from "@/lib/fetch-github";
import { CalendarIcon } from "lucide-react";
import { Suspense } from "react";
import { HoverCardSkeleton } from "./skeletons";

export default function HoverCardUser() {
  return (
    <div>
      <Suspense fallback={<HoverCardSkeleton />}>
        <div className="space-y-1">
          <h4 className="text-sm font-semibold">@cempack</h4>
          <p className="text-sm">{fetchGithub("bio")}</p>
          <div className="flex items-center pt-2">
            <CalendarIcon className="mr-2 h-4 w-4 opacity-70" />{" "}
            <span className="text-xs text-muted-foreground">
              Joined on the{" "}
              {fetchGithub("created_at").then((date) =>
                new Date(date).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })
              )}
            </span>
          </div>
        </div>
      </Suspense>
    </div>
  );
}
