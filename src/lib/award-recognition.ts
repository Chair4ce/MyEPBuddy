/**
 * Compose concise recognition phrases from linked awards for accomplishment impact.
 * Mirrors EPB generate guidance (combine multiple awards; include level; team framing).
 */

import type { Award, AwardLevel, AwardType } from "@/types/database";

const LEVEL_ABBREV: Record<AwardLevel, string> = {
  squadron: "Sq",
  group: "Gp",
  wing: "Wg",
  majcom: "MAJCOM",
  haf: "HAF",
};

export type AwardRecognitionInput = Pick<
  Award,
  | "id"
  | "award_type"
  | "award_name"
  | "coin_presenter"
  | "coin_date"
  | "quarter"
  | "award_year"
  | "award_level"
  | "is_team_award"
>;

function levelLabel(level: AwardLevel | null | undefined): string {
  if (!level) return "";
  return LEVEL_ABBREV[level] || level;
}

/** Short label for a single award (chips / pickers). */
export function formatAwardShortLabel(award: AwardRecognitionInput): string {
  const team = award.is_team_award ? " team" : "";
  if (award.award_type === "coin") {
    const who = award.coin_presenter?.trim() || "unit";
    return `${who} coin${team}`;
  }
  const lvl = levelLabel(award.award_level);
  const period =
    award.award_type === "quarterly" && award.quarter
      ? ` ${award.quarter}`
      : "";
  const year = award.award_year ? ` ${award.award_year}` : "";
  const typeWord =
    award.award_type === "quarterly"
      ? "qtr"
      : award.award_type === "annual"
        ? "annual"
        : "special";
  const name = award.award_name?.trim();
  if (name && award.award_type === "special") {
    return `${name}${team}`;
  }
  return `${lvl ? `${lvl} ` : ""}${typeWord}${period}${year}${team}`.trim();
}

function formatCoinPhrase(award: AwardRecognitionInput): string {
  const presenter = award.coin_presenter?.trim() || "unit leadership";
  return award.is_team_award
    ? `contributed to a ${presenter} team coin`
    : `earning a ${presenter} coin`;
}

function formatCompetitivePhrase(awards: AwardRecognitionInput[]): string {
  if (awards.length === 0) return "";

  if (awards.length === 1) {
    const a = awards[0];
    const lvl = levelLabel(a.award_level);
    const period =
      a.award_type === "quarterly" && a.quarter ? ` ${a.quarter}` : "";
    const typeWord =
      a.award_type === "quarterly"
        ? "qtr"
        : a.award_type === "annual"
          ? "annual"
          : "special";
    const name = a.award_name?.trim();
    const core =
      a.award_type === "special" && name
        ? name
        : `${lvl ? `${lvl} ` : ""}${typeWord}${period} award`;
    return a.is_team_award
      ? `contributed to ${core}`
      : `earning ${core.startsWith("a") || core.startsWith("A") ? "" : "a "}${core}`.replace(
          "earning  ",
          "earning "
        );
  }

  // Group competitive awards: count by level+type
  const groups = new Map<string, { count: number; team: boolean }>();
  for (const a of awards) {
    const lvl = levelLabel(a.award_level) || "unit";
    const typeWord =
      a.award_type === "quarterly"
        ? "qtr"
        : a.award_type === "annual"
          ? "annual"
          : "special";
    const key = `${lvl} ${typeWord}`;
    const prev = groups.get(key) || { count: 0, team: false };
    groups.set(key, {
      count: prev.count + 1,
      team: prev.team || a.is_team_award,
    });
  }

  const parts = Array.from(groups.entries()).map(([key, { count, team }]) => {
    const label = count > 1 ? `${count} ${key}` : key;
    return team ? `${label} team` : label;
  });

  const hasTeam = awards.some((a) => a.is_team_award);
  const joined =
    parts.length === 1
      ? parts[0]
      : parts.length === 2
        ? `${parts[0]} & ${parts[1]}`
        : `${parts.slice(0, -1).join(", ")} & ${parts[parts.length - 1]}`;

  return hasTeam && awards.every((a) => a.is_team_award)
    ? `contributed to ${joined} awards`
    : `earning ${joined} awards`;
}

/**
 * Compose a single concise recognition clause from 0–N awards.
 * Returns null when empty.
 */
export function composeRecognitionPhrase(
  awards: AwardRecognitionInput[]
): string | null {
  if (!awards.length) return null;

  const coins = awards.filter((a) => a.award_type === "coin");
  const competitive = awards.filter((a) => a.award_type !== "coin");

  const parts: string[] = [];
  if (competitive.length > 0) {
    parts.push(formatCompetitivePhrase(competitive));
  }
  if (coins.length === 1) {
    parts.push(formatCoinPhrase(coins[0]));
  } else if (coins.length > 1) {
    const presenters = coins
      .map((c) => c.coin_presenter?.trim() || "unit")
      .filter(Boolean);
    const unique = [...new Set(presenters)];
    const coinPart =
      unique.length === 1
        ? `${coins.length} ${unique[0]} coins`
        : `${coins.length} coins (${unique.join(", ")})`;
    parts.push(
      coins.every((c) => c.is_team_award)
        ? `contributed to ${coinPart}`
        : `earning ${coinPart}`
    );
  }

  if (parts.length === 0) return null;
  return parts.join("; ");
}

/**
 * Merge recognition into stewardship outcome without clobbering user text.
 * If outcome already contains the phrase, leave it. If outcome empty, set it.
 * If outcome filled and recognition new, append with "; ".
 */
export function mergeRecognitionIntoOutcome(
  outcome: string | undefined,
  recognition: string | null,
  previousRecognition: string | null
): string {
  const base = (outcome ?? "").trim();
  const next = recognition?.trim() || "";
  const prev = previousRecognition?.trim() || "";

  if (!next) {
    // Remove prior auto phrase if it was the whole outcome or a trailing segment
    if (!prev || !base) return base;
    if (base === prev) return "";
    if (base.endsWith(`; ${prev}`)) return base.slice(0, -(prev.length + 2)).trim();
    if (base.endsWith(prev) && base.length > prev.length) {
      return base.slice(0, -prev.length).replace(/[;\s]+$/, "").trim();
    }
    return base;
  }

  if (!base) return next;
  if (base.includes(next)) return base;

  // Replace previous auto-injected phrase
  if (prev && base.includes(prev)) {
    return base.replace(prev, next).replace(/;\s*;/g, ";").trim();
  }

  return `${base}; ${next}`;
}

export function awardTypeLabel(type: AwardType): string {
  switch (type) {
    case "coin":
      return "Coin";
    case "quarterly":
      return "Quarterly";
    case "annual":
      return "Annual";
    case "special":
      return "Special";
    default:
      return type;
  }
}
