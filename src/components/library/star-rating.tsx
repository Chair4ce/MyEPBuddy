"use client";

import { useState } from "react";
import { Star, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

interface StarRatingProps {
  /** Current user's rating (1-5) or null if not rated */
  userRating: number | null;
  /** Average rating from all users (0-5) */
  averageRating: number;
  /** Total number of ratings */
  ratingCount: number;
  /** Whether the rating is being submitted */
  isLoading?: boolean;
  /** Callback when user selects a rating */
  onRate: (rating: number) => void;
  /** Callback to remove rating */
  onRemoveRating?: () => void;
  /** Size variant */
  size?: "sm" | "default";
}

export function StarRating({
  userRating,
  averageRating,
  ratingCount,
  isLoading = false,
  onRate,
  onRemoveRating,
  size = "default",
}: StarRatingProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);

  const iconSize = size === "sm" ? "size-3.5" : "size-4";
  const buttonSize = size === "sm" ? "size-7" : "size-8";

  function handleRate(rating: number) {
    onRate(rating);
    setIsOpen(false);
  }

  function handleRemove() {
    if (onRemoveRating) {
      onRemoveRating();
      setIsOpen(false);
    }
  }

  // Render filled/empty stars for display
  function renderDisplayStars(rating: number, showEmpty = true) {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating - fullStars >= 0.5;
    const stars = [];

    for (let i = 1; i <= 5; i++) {
      if (i <= fullStars) {
        stars.push(
          <Star
            key={i}
            className={cn(iconSize, "text-primary fill-primary")}
          />
        );
      } else if (i === fullStars + 1 && hasHalfStar) {
        // Half star - use gradient or just show filled
        stars.push(
          <Star
            key={i}
            className={cn(iconSize, "text-primary fill-primary/50")}
          />
        );
      } else if (showEmpty) {
        stars.push(
          <Star
            key={i}
            className={cn(iconSize, "text-muted-foreground/40")}
          />
        );
      }
    }

    return stars;
  }

  // Render interactive stars for selection
  function renderSelectableStars() {
    const displayRating = hoveredRating ?? userRating ?? 0;

    return (
      <div
        className="flex items-center gap-1"
        onMouseLeave={() => setHoveredRating(null)}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            className={cn(
              "p-1 rounded transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary/50",
              star <= displayRating ? "text-primary" : "text-muted-foreground/40"
            )}
            onMouseEnter={() => setHoveredRating(star)}
            onClick={() => handleRate(star)}
            aria-label={`Rate ${star} star${star !== 1 ? "s" : ""}`}
          >
            <Star
              className={cn(
                "size-6",
                star <= displayRating && "fill-primary"
              )}
            />
          </button>
        ))}
      </div>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            buttonSize,
            "relative",
            userRating && "text-primary"
          )}
          disabled={isLoading}
          aria-label={userRating ? `Your rating: ${userRating} stars` : "Rate this statement"}
        >
          {isLoading ? (
            <Loader2 className={cn(iconSize, "animate-spin")} />
          ) : (
            <Star
              className={cn(
                iconSize,
                userRating ? "fill-primary text-primary" : "text-muted-foreground"
              )}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-3"
        align="start"
        sideOffset={8}
      >
        <div className="flex flex-col gap-2">
          <div className="text-xs text-muted-foreground font-medium">
            {userRating ? "Update your rating" : "Rate this statement"}
          </div>
          {renderSelectableStars()}
          {userRating && onRemoveRating && (
            <button
              type="button"
              onClick={handleRemove}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors text-left"
            >
              Remove rating
            </button>
          )}
          {ratingCount > 0 && (
            <div className="text-xs text-muted-foreground pt-1 border-t">
              {averageRating.toFixed(1)} avg · {ratingCount} rating{ratingCount !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface StarRatingDisplayProps {
  /** Average rating (0-5) */
  averageRating: number;
  /** Total number of ratings */
  ratingCount: number;
  /** Size variant */
  size?: "sm" | "default";
  /** Show rating count text */
  showCount?: boolean;
}

/** Read-only star rating display */
export function StarRatingDisplay({
  averageRating,
  ratingCount,
  size = "default",
  showCount = true,
}: StarRatingDisplayProps) {
  const iconSize = size === "sm" ? "size-3" : "size-3.5";

  // Render partial stars based on average
  function renderStars() {
    const stars = [];
    const fullStars = Math.floor(averageRating);
    const partialFill = averageRating - fullStars;

    for (let i = 1; i <= 5; i++) {
      if (i <= fullStars) {
        stars.push(
          <Star
            key={i}
            className={cn(iconSize, "text-primary fill-primary")}
          />
        );
      } else if (i === fullStars + 1 && partialFill > 0) {
        // Partial star
        stars.push(
          <div key={i} className="relative">
            <Star className={cn(iconSize, "text-muted-foreground/30")} />
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ width: `${partialFill * 100}%` }}
            >
              <Star className={cn(iconSize, "text-primary fill-primary")} />
            </div>
          </div>
        );
      } else {
        stars.push(
          <Star
            key={i}
            className={cn(iconSize, "text-muted-foreground/30")}
          />
        );
      }
    }

    return stars;
  }

  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center gap-0.5">{renderStars()}</div>
      {showCount && (
        <span className="text-xs text-muted-foreground tabular-nums">
          {averageRating > 0 ? averageRating.toFixed(1) : "—"}
          {ratingCount > 0 && ` (${ratingCount})`}
        </span>
      )}
    </div>
  );
}
