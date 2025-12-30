"use client";

import { cn } from "@/lib/utils";
import type { FeedAccomplishment } from "@/stores/team-feed-store";
import { useUserStore } from "@/stores/user-store";
import { User, ChevronDown, Star } from "lucide-react";

interface ChainOfCommandDisplayProps {
  accomplishment: FeedAccomplishment;
  className?: string;
}

export function ChainOfCommandDisplay({
  accomplishment,
  className,
}: ChainOfCommandDisplayProps) {
  const { profile } = useUserStore();

  // Build the chain from supervisor (top) down to the accomplishment author (bottom)
  // The supervisor_chain array contains supervisors above the author
  const chain = [...accomplishment.supervisor_chain].sort(
    (a, b) => b.depth - a.depth
  );

  // If current user is in the chain, highlight them
  const currentUserId = profile?.id;

  return (
    <div className={cn("relative", className)} role="list" aria-label="Chain of command">
      <div className="space-y-0">
        {chain.map((member, index) => {
          const isCurrentUser = member.id === currentUserId;
          const isLast = index === chain.length - 1;

          return (
            <div key={member.id} className="relative" role="listitem">
              {/* Vertical connector line */}
              {!isLast && (
                <div
                  className="absolute left-5 top-10 w-px h-6 bg-border"
                  aria-hidden="true"
                />
              )}

              <div
                className={cn(
                  "flex items-center gap-3 p-2.5 rounded-lg transition-colors",
                  isCurrentUser && "bg-primary/5 border border-primary/20"
                )}
              >
                {/* Avatar */}
                <div
                  className={cn(
                    "relative size-10 rounded-full flex items-center justify-center shrink-0 text-sm font-medium",
                    isCurrentUser
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {member.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                  {isCurrentUser && (
                    <Star
                      className="absolute -top-1 -right-1 size-4 text-yellow-500 fill-yellow-500"
                      aria-label="You"
                    />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "font-medium text-sm truncate",
                        isCurrentUser && "text-primary"
                      )}
                    >
                      {member.rank && (
                        <span className="text-muted-foreground">
                          {member.rank}{" "}
                        </span>
                      )}
                      {member.name}
                    </span>
                    {isCurrentUser && (
                      <span className="text-xs text-primary font-medium">
                        (You)
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {member.is_managed_member ? "Managed Member" : "Supervisor"}
                    {member.depth > 0 && ` • Level ${member.depth}`}
                  </span>
                </div>
              </div>

              {/* Connector arrow */}
              {!isLast && (
                <div
                  className="flex justify-center -mt-0.5 -mb-0.5"
                  aria-hidden="true"
                >
                  <ChevronDown className="size-4 text-muted-foreground/50" />
                </div>
              )}
            </div>
          );
        })}

        {/* The accomplishment author at the bottom */}
        <div className="relative" role="listitem">
          {chain.length > 0 && (
            <div
              className="absolute left-5 -top-3 w-px h-3 bg-border"
              aria-hidden="true"
            />
          )}
          {chain.length > 0 && (
            <div
              className="flex justify-center -mt-0.5 mb-1"
              aria-hidden="true"
            >
              <ChevronDown className="size-4 text-muted-foreground/50" />
            </div>
          )}
          <div className="flex items-center gap-3 p-2.5 rounded-lg bg-gradient-to-r from-emerald-500/10 to-transparent border border-emerald-500/20">
            {/* Avatar */}
            <div className="relative size-10 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 text-sm font-medium">
              {accomplishment.author_name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
              <User
                className="absolute -bottom-1 -right-1 size-4 text-emerald-500 bg-background rounded-full p-0.5"
                aria-hidden="true"
              />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm truncate text-emerald-700 dark:text-emerald-400">
                  {accomplishment.author_rank && (
                    <span className="text-muted-foreground">
                      {accomplishment.author_rank}{" "}
                    </span>
                  )}
                  {accomplishment.author_name}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {accomplishment.is_managed_member
                  ? "Managed Team Member"
                  : "Accomplishment Author"}
                {accomplishment.author_afsc && ` • ${accomplishment.author_afsc}`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


