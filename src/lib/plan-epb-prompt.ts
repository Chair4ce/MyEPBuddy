import { ENTRY_MGAS, getRubricTierForRank } from "@/lib/constants";
import {
  ACA_PORTFOLIO_MPA_KEYS,
  type AcaPortfolioMpaKey,
} from "@/lib/cycle-portfolio";
import {
  PLAN_MAX_SENTENCES_PER_MPA,
  type PlanAccomplishmentRecord,
} from "@/lib/plan-epb";
import type { EpbCandidatePools } from "@/lib/assign-epb-sentences";
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

export interface BuildGroupEpbPromptArgs {
  pools: EpbCandidatePools;
  recordsById: Map<string, PlanAccomplishmentRecord>;
  rateeRank: Rank | string | null;
  rateeAfsc?: string | null;
  dutyDescription?: string | null;
}

/**
 * Prompt for the EPB *grouping* step. Candidate ids per MPA are already chosen
 * by score-based allocation. The model only decides which entries describe the
 * SAME action→result→impact effort (combine + accumulate metrics) vs distinct
 * efforts (separate sentences). Never use action_verb equality as the rule.
 */
export function buildGroupEpbPrompt(args: BuildGroupEpbPromptArgs): string {
  const { pools, recordsById, rateeRank, rateeAfsc, dutyDescription } = args;
  const tier = getRubricTierForRank(rateeRank);
  const tierNote =
    tier === "senior"
      ? "This ratee is a senior NCO (AF Form 932) — weight scope, leadership, and unit-level impact."
      : "This ratee is junior enlisted (AF Form 931) — weight job proficiency, initiative, and quantified results.";

  const poolBlocks = ACA_PORTFOLIO_MPA_KEYS.filter(
    (key) => pools[key].length > 0
  )
    .map((mpaKey) => {
      const label = ENTRY_MGAS.find((m) => m.key === mpaKey)?.label ?? mpaKey;
      const entries = pools[mpaKey]
        .map((id, index) => {
          const record = recordsById.get(id);
          if (!record) return null;
          return `[${mpaKey} #${index + 1}]\n${formatRecord(record)}`;
        })
        .filter(Boolean)
        .join("\n\n");
      return `=== POOL: ${mpaKey} (${label}) ===\n${entries}`;
    })
    .join("\n\n");

  const dutyBlock = dutyDescription?.trim()
    ? `\nDUTY DESCRIPTION (context only):\n${dutyDescription.trim()}\n`
    : "";

  return `You are an expert U.S. Air Force EPB writer. Candidate accomplishments are ALREADY assigned to each Major Performance Area (MPA). Your only job is to group them into at most ${PLAN_MAX_SENTENCES_PER_MPA} performance STATEMENT sentences per MPA.

RATEE
- Rank: ${rateeRank ?? "unknown"}
- AFSC: ${rateeAfsc ?? "unknown"}
- ${tierNote}
${dutyBlock}
CORE MPAS:
${mpaReference()}

HOW TO JUDGE "SAME EFFORT" (CRITICAL — DO NOT USE VERB MATCHING)
Compare action → result → impact (and metrics). Ignore whether action_verb strings match.

COMBINE into ONE sentence group when entries describe the SAME recurring / cumulative effort, even if wording or verbs differ. Example:
- "Volunteered at the USO for 4 hours on this day"
- "Spent 4 hours serving veterans at the USO" (different day)
→ SAME effort → one group; downstream writing should accumulate to ~8 hours and tell one story.

KEEP SEPARATE (different sentence groups) when efforts are substantively different even if they share a verb. Example:
- "Led squadron PT sessions…" vs "Led a network migration…" → different efforts → two groups.

METRIC RULE
When combining, note in rationale that metrics should accumulate (hours, dollars, counts). Do not invent metrics that are not present.

SELECTION RULES
1. Output at most ${PLAN_MAX_SENTENCES_PER_MPA} sentence groups per MPA.
2. Prefer the strongest overall_score / mpa_relevancy entries for that MPA when choosing which efforts become the two sentences.
3. A sentence group may be a single id when it stands alone.
4. You may omit weaker pool ids entirely (leave them unused) — do not force every candidate into a sentence.
5. Only use ids listed in that MPA's pool. Never invent ids. Never move an id to another MPA.
6. Omit an MPA from the output if its pool cannot produce a useful statement.

CANDIDATE POOLS
${poolBlocks}

OUTPUT
Return STRICT JSON only, no prose, matching exactly:
{
  "mpas": [
    {
      "mpaKey": "<one of the core MPA keys that has a pool>",
      "sentences": [
        {
          "accomplishmentIds": ["<id>", "..."],
          "rationale": "<why same/different effort; mention metric accumulation if combining>"
        }
      ]
    }
  ]
}`;
}

/** @deprecated Prefer buildGroupEpbPrompt after score-based allocation. */
export function buildPlanEpbPrompt(args: {
  records: PlanAccomplishmentRecord[];
  rateeRank: Rank | string | null;
  rateeAfsc?: string | null;
  dutyDescription?: string | null;
  isChunked?: boolean;
}): string {
  const pools = Object.fromEntries(
    ACA_PORTFOLIO_MPA_KEYS.map((key) => [
      key,
      args.records.filter((r) => r.taggedMpa === key).map((r) => r.id),
    ])
  ) as EpbCandidatePools;
  const recordsById = new Map(args.records.map((r) => [r.id, r] as const));
  return buildGroupEpbPrompt({
    pools,
    recordsById,
    rateeRank: args.rateeRank,
    rateeAfsc: args.rateeAfsc,
    dutyDescription: args.dutyDescription,
  });
}

export type { AcaPortfolioMpaKey };
