import { isEnlisted } from "@/lib/constants";
import type { EnlistedRank, Rank } from "@/types/database";

/** Enlisted ranks with USAF stripe insignia assets (AB has no insignia). */
export const RANK_INSIGNIA_PATHS: Partial<Record<EnlistedRank, string>> = {
  Amn: "/ranks/amn.png",
  A1C: "/ranks/a1c.png",
  SrA: "/ranks/sra.png",
  SSgt: "/ranks/ssgt.png",
  TSgt: "/ranks/tsgt.png",
  MSgt: "/ranks/msgt.png",
  SMSgt: "/ranks/smsgt.png",
  CMSgt: "/ranks/cmsgt.png",
};

export function getRankInsigniaPath(
  rank: Rank | null | undefined
): string | null {
  if (!rank || !isEnlisted(rank)) return null;
  return RANK_INSIGNIA_PATHS[rank as EnlistedRank] ?? null;
}

export function hasRankInsignia(rank: Rank | null | undefined): boolean {
  return getRankInsigniaPath(rank) !== null;
}

export function getRankInsigniaLabel(rank: Rank): string {
  return `${rank} rank insignia`;
}
