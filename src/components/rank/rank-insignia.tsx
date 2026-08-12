import { getRankInsigniaLabel, getRankInsigniaPath, hasRankInsignia } from "@/lib/rank-insignia";
import { cn } from "@/lib/utils";
import type { Rank } from "@/types/database";
import type { CSSProperties } from "react";

const SIZE_CONFIG = {
  xs: {
    canvas: "h-10 w-7",
    insignia: "w-7",
  },
  sm: {
    canvas: "h-16 w-11",
    insignia: "w-10",
  },
  md: {
    canvas: "h-20 w-14",
    insignia: "w-12",
  },
  lg: {
    canvas: "h-24 w-16",
    insignia: "w-14",
  },
  avatar: {
    canvas: "h-full w-full",
    insignia: "w-[72%]",
  },
  /** Fits inside ReUI IconTile / other sized parents — percentage of parent box. */
  tile: {
    canvas: "h-[88%] w-[58%] max-h-full max-w-full",
    insignia: "w-full",
  },
} as const;

type RankInsigniaSize = keyof typeof SIZE_CONFIG;

interface RankInsigniaProps {
  rank: Rank | null | undefined;
  size?: RankInsigniaSize;
  className?: string;
}

function insigniaMaskStyle(src: string): CSSProperties {
  return {
    WebkitMaskImage: `url("${src}")`,
    maskImage: `url("${src}")`,
    WebkitMaskSize: "contain",
    maskSize: "contain",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
  };
}

export function MemberRankInsignia({
  rank,
  className,
}: {
  rank: Rank | null | undefined;
  className?: string;
}) {
  if (!hasRankInsignia(rank)) return null;
  return (
    <RankInsignia rank={rank} size="xs" className={cn("shrink-0", className)} />
  );
}

export function RankInsignia({
  rank,
  size = "md",
  className,
}: RankInsigniaProps) {
  const src = getRankInsigniaPath(rank);

  if (!src || !rank) return null;

  const config = SIZE_CONFIG[size];

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center text-foreground",
        config.canvas,
        className
      )}
      role="img"
      aria-label={getRankInsigniaLabel(rank)}
    >
      {/*
        White/silver stripe assets are masked and filled with currentColor so
        they stay visible in light mode and inherit theme accents (e.g. avatar).
      */}
      <span
        aria-hidden
        className={cn(
          "block h-full max-h-full bg-current",
          config.insignia
        )}
        style={insigniaMaskStyle(src)}
      />
    </div>
  );
}
