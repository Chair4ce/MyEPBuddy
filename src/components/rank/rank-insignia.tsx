import { getRankInsigniaLabel, getRankInsigniaPath, hasRankInsignia } from "@/lib/rank-insignia";
import { cn } from "@/lib/utils";
import type { Rank } from "@/types/database";

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
} as const;

type RankInsigniaSize = keyof typeof SIZE_CONFIG;

interface RankInsigniaProps {
  rank: Rank | null | undefined;
  size?: RankInsigniaSize;
  className?: string;
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
        "relative flex shrink-0 items-center justify-center",
        config.canvas,
        className
      )}
      role="img"
      aria-label={getRankInsigniaLabel(rank)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        draggable={false}
        className={cn(
          "h-auto w-full max-h-full object-contain object-center",
          config.insignia
        )}
      />
    </div>
  );
}
