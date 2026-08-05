import { ENTRY_MGAS, getRubricTierForRank } from "@/lib/constants";
import { ACA_PORTFOLIO_MPA_KEYS } from "@/lib/cycle-portfolio";
import {
  PLAN_MAX_SENTENCES_PER_MPA,
  type PlanAccomplishmentRecord,
} from "@/lib/plan-epb";
import type { Rank } from "@/types/database";

function mpaReference(): string {
  return ACA_PORTFOLIO_MPA_KEYS.map((key) => {
    const label = ENTRY_MGAS.find((m) => m.key === key)?.label ?? key;
    return `- ${key} (${label})`;
  }).join("\n");
}

function formatRecord(record: PlanAccomplishmentRecord): string {
  const rel = record.mpaRelevancy
    ? ACA_PORTFOLIO_MPA_KEYS.map(
        (key) => `${key}=${record.mpaRelevancy![key]}`
      ).join(", ")
    : "n/a";
  const lines = [
    `id: ${record.id}`,
    `tagged_mpa: ${record.taggedMpa}`,
    `action_verb: ${record.action_verb}`,
    `details: ${record.details}`,
    `impact: ${record.impact ?? "(none)"}`,
    `metrics: ${record.metrics ?? "(none)"}`,
    `overall_score: ${record.overallScore ?? "unassessed"}`,
    `primary_mpa: ${record.primaryMpa ?? "n/a"}`,
    `mpa_relevancy: ${rel}`,
  ];
  return lines.map((l) => `  ${l}`).join("\n");
}

export interface BuildPlanEpbPromptArgs {
  records: PlanAccomplishmentRecord[];
  rateeRank: Rank | string | null;
  rateeAfsc?: string | null;
  /** Ratee duty description — context for how accomplishments map to the role. */
  dutyDescription?: string | null;
  /** True when the input is one of several chunks (selection still per-MPA). */
  isChunked?: boolean;
}

/**
 * Prompt for the EPB planning step. The model selects the strongest
 * accomplishments per core MPA and groups the ones that should be COMBINED into
 * a single statement sentence. Returns strict JSON only.
 */
export function buildPlanEpbPrompt(args: BuildPlanEpbPromptArgs): string {
  const { records, rateeRank, rateeAfsc, dutyDescription, isChunked } = args;
  const tier = getRubricTierForRank(rateeRank);
  const tierNote =
    tier === "senior"
      ? "This ratee is a senior NCO (AF Form 932) — weight scope, leadership, and unit-level impact."
      : "This ratee is junior enlisted (AF Form 931) — weight job proficiency, initiative, and quantified results.";

  const recordBlock = records
    .map((record, index) => `[#${index + 1}]\n${formatRecord(record)}`)
    .join("\n\n");

  const dutyBlock = dutyDescription?.trim()
    ? `\nDUTY DESCRIPTION (use to judge relevance and MPA fit):\n${dutyDescription.trim()}\n`
    : "";

  return `You are an expert U.S. Air Force EPB writer planning which accomplishments to turn into performance statements.

RATEE
- Rank: ${rateeRank ?? "unknown"}
- AFSC: ${rateeAfsc ?? "unknown"}
- ${tierNote}
${dutyBlock}
CORE MPAS (only these):
${mpaReference()}

YOUR TASK
For each core MPA, choose the accomplishments that will produce the strongest 1-2 performance statements, and GROUP the accomplishments that should be combined into a single sentence.

SELECTION RULES
1. Prioritize higher overall_score and higher mpa_relevancy for the target MPA, but DO NOT simply filter by score.
2. Combine "like" accomplishments (same effort/initiative recurring across the cycle) into ONE sentence group so their metrics accumulate (man-hours, dollars saved, counts). A low-scoring entry on its own can be valuable when combined.
3. A sentence group may contain a single accomplishment when it stands strongly on its own.
4. Prefer the accomplishment's tagged_mpa, but you may place an entry under its primary_mpa when relevancy clearly favors it.
5. Output at most ${PLAN_MAX_SENTENCES_PER_MPA} sentence groups per MPA. Omit an MPA entirely if nothing fits.
6. Only use accomplishment ids from the list below. Never invent ids.
${
  isChunked
    ? "7. This is a partial batch of the ratee's accomplishments; select from what is provided. Results are merged later."
    : ""
}

ACCOMPLISHMENTS
${recordBlock}

OUTPUT
Return STRICT JSON only, no prose, matching exactly:
{
  "mpas": [
    {
      "mpaKey": "<one of the core MPA keys>",
      "sentences": [
        {
          "accomplishmentIds": ["<id>", "..."],
          "rationale": "<one short line on why these, and why combined>"
        }
      ]
    }
  ]
}`;
}
