import { isEnlisted } from "@/lib/constants";
import type { EnlistedRank, Rank } from "@/types/database";

/** Enlisted ranks with USAF stripe insignia assets (AB has no insignia). */
export const RANK_INSIGNIA_PATHS: Partial<Record<EnlistedRank, string>> = {
  Amn: "/ranks/svg/amn.svg",
  A1C: "/ranks/svg/a1c.svg",
  SrA: "/ranks/svg/sra.svg",
  SSgt: "/ranks/svg/ssgt.svg",
  TSgt: "/ranks/svg/tsgt.svg",
  MSgt: "/ranks/svg/msgt.svg",
  SMSgt: "/ranks/svg/smsgt.svg",
  CMSgt: "/ranks/svg/cmsgt.svg",
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
