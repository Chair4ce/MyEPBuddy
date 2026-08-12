"use client";

import { Badge } from "@/components/ui/badge";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { IconTile } from "@/components/reui/icon-tile";
import { RankInsignia } from "@/components/rank/rank-insignia";
import { hasRankInsignia } from "@/lib/rank-insignia";
import { ENTRY_MGAS } from "@/lib/constants";
import { formatDayOnly, formatTimeAgo } from "@/lib/format";
import { motionListRow, motionTransitionColors } from "@/lib/motion/classes";
import { cn } from "@/lib/utils";
import type { FeedAccomplishment } from "@/stores/team-feed-store";
import type { Rank } from "@/types/database";
import { Calendar, ChevronRight, Clock } from "lucide-react";

function authorInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function FeedAuthorMark({
  rank,
  name,
  emphasize,
  density,
}: {
  rank: Rank | null;
  name: string;
  emphasize: boolean;
  density: "compact" | "comfortable";
}) {
  const tileSize = density === "compact" ? "sm" : "default";

  if (hasRankInsignia(rank)) {
    return (
      <IconTile
        variant="elevated"
        size={tileSize}
        className={cn(
          "text-foreground",
          density === "comfortable" &&
            "md:[--icon-tile-size:--spacing(12)] md:[--icon-tile-icon-size:--spacing(5.5)]"
        )}
        aria-hidden="true"
      >
        <RankInsignia rank={rank} size="tile" />
      </IconTile>
    );
  }

  return (
    <IconTile
      variant="soft"
      size={tileSize}
      className={cn(
        emphasize ? "text-primary" : "text-primary/80",
        density === "comfortable" &&
          "md:[--icon-tile-size:--spacing(12)] md:[--icon-tile-icon-size:--spacing(5.5)]"
      )}
      aria-hidden="true"
    >
      <span className="text-[10px] font-medium leading-none sm:text-xs">
        {authorInitials(name)}
      </span>
    </IconTile>
  );
}

export interface FeedAccomplishmentCardProps {
  accomplishment: FeedAccomplishment;
  density?: "compact" | "comfortable";
  onSelect: (accomplishment: FeedAccomplishment) => void;
}

export function FeedAccomplishmentCard({
  accomplishment: acc,
  density = "comfortable",
  onSelect,
}: FeedAccomplishmentCardProps) {
  const mpaLabel = ENTRY_MGAS.find((m) => m.key === acc.mpa)?.label || acc.mpa;
  const isDirectSubordinate = acc.chain_depth === 1;
  const compact = density === "compact";

  return (
    <Item
      variant="outline"
      size={compact ? "sm" : "default"}
      role="button"
      tabIndex={0}
      aria-label={`View accomplishment from ${acc.author_name}`}
      className={cn(
        "w-full cursor-pointer bg-card",
        motionListRow,
        "hover:bg-muted/50 hover:shadow-sm",
        isDirectSubordinate && "border-l-2 border-l-primary/40"
      )}
      onClick={() => onSelect(acc)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(acc);
        }
      }}
    >
      <ItemMedia>
        <FeedAuthorMark
          rank={acc.author_rank}
          name={acc.author_name}
          emphasize={isDirectSubordinate}
          density={density}
        />
      </ItemMedia>

      <ItemContent className="min-w-0 gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <ItemTitle className="min-w-0">
            <span className="min-w-0 truncate">
              {acc.author_rank && (
                <span className="text-muted-foreground">{acc.author_rank} </span>
              )}
              {acc.author_name}
            </span>
          </ItemTitle>
          <ItemActions className="shrink-0 pt-0.5">
            {!compact && (
              <span className="hidden items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap sm:inline-flex">
                <Clock className="size-3" />
                {formatTimeAgo(acc.created_at)}
              </span>
            )}
            <ChevronRight
              className={cn(
                "size-4 text-muted-foreground/30 group-hover/item:text-muted-foreground",
                motionTransitionColors,
                !compact && "sm:size-5"
              )}
            />
          </ItemActions>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            variant="outline"
            className={cn(compact ? "h-4 px-1.5 text-[10px]" : "text-xs")}
          >
            {mpaLabel}
          </Badge>
          {!compact && (
            <Badge variant="secondary" className="text-xs">
              {acc.action_verb}
            </Badge>
          )}
          {compact && (
            <span className="hidden text-xs text-muted-foreground whitespace-nowrap sm:inline">
              {formatDayOnly(acc.date)}
            </span>
          )}
        </div>

        <ItemDescription
          className={cn(compact ? "line-clamp-1 text-xs" : "line-clamp-2 text-sm")}
        >
          {acc.details}
        </ItemDescription>

        {!compact && (
          <ItemFooter className="mt-0.5">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="size-3" />
              {formatDayOnly(acc.date)}
            </span>
          </ItemFooter>
        )}
      </ItemContent>
    </Item>
  );
}
