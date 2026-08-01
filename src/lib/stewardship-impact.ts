/**
 * AF stewardship impact helpers for accomplishment intake + assessment.
 * Aligned with Impact Booster vernacular (AFI 36-2406 / ALQ Managing Resources).
 */

import type { StewardshipImpact } from "@/types/database";
import { AF_STEWARDSHIP_IMPACT_BRIEF } from "@/lib/impact-booster";

export { AF_STEWARDSHIP_IMPACT_BRIEF };

export const STEWARDSHIP_FIELD_MAX = 500;

export const EMPTY_STEWARDSHIP_IMPACT: StewardshipImpact = {};

/** Short input placeholders — keep these brief; put detail in STEWARDSHIP_HINTS. */
export const STEWARDSHIP_PLACEHOLDERS = {
  time: "e.g. 3 mos early, 40 man-hrs",
  money: "e.g. $12K cost avoidance",
  resources: "e.g. 2 billets recovered",
  outcome: "e.g. FMC / sortie / inspection",
} as const;

/** Longer hover/help copy for each stewardship field. */
export const STEWARDSHIP_HINTS = {
  time: "Baseline → actual (e.g. 6 mos → 3 wks) or N mos/wks/days/hrs early / % faster. Who regained capacity (shop/flt/sq) and what mission work that funded. On-time alone is weaker than a clear early delta.",
  money: "Hard dollar save or cost avoidance (buy/contract/TDY/overtime never spent) — and what readiness/capability that bought back. Never invent $.",
  resources: "Equipment, billets/manpower, facilities, or cross-org capacity recovered, redistributed, or kept off the buy list.",
  outcome: "Optional mission cascade — FMC, sortie, inspection, flight/sq/wg/MAJCOM impact.",
} as const;

export const STEWARDSHIP_LABELS = {
  time: "Man-hours / schedule",
  money: "Funds",
  resources: "Resources",
  outcome: "Mission outcome",
} as const;

/**
 * Writing guidance for generate/revise: when source data shows a normal
 * timeline vs what the Airman actually delivered, force a measurable delta.
 */
export const TIME_COMPRESSION_WRITING_GUIDANCE = `TIME COMPRESSION / AHEAD OF SCHEDULE (HIGH-VALUE IMPACT):
- Merely finishing on time is MEETS EXPECTATION — do not inflate it.
- When source data shows a NORMAL/BASELINE duration AND the Airman finished faster or earlier, you MUST quantify the delta in the statement:
  • Absolute early: "3 mos early", "2 wks ahead of directed timeline", "finished 45 days early"
  • Relative speed: "cut cycle time 45%", "streamlined process ~50% via new SOP", "halved qual timeline"
  • Baseline → result: "cut qual from 6 mos to 3 wks", "reduced training to fully qualified status 3 mos early"
- Prefer AF vernacular: reduced, streamlined, accelerated, cut cycle time — tied to readiness/mission cascade.
- Never invent a baseline. Only quantify early/% faster when the input supports it.
- Good: "cut qual from 6 mos to 3 wks, returning 3 mos of operator capacity to the flight"
- Weak: "completed training on time" / "finished the project as scheduled"`.trim();

function clampField(value: string): string {
  return value.trim().slice(0, STEWARDSHIP_FIELD_MAX);
}

/** Normalize DB/API JSON into a safe StewardshipImpact. */
export function normalizeStewardshipImpact(raw: unknown): StewardshipImpact {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...EMPTY_STEWARDSHIP_IMPACT };
  }
  const obj = raw as Record<string, unknown>;
  const time =
    typeof obj.time === "string" && obj.time.trim()
      ? clampField(obj.time)
      : undefined;
  const money =
    typeof obj.money === "string" && obj.money.trim()
      ? clampField(obj.money)
      : undefined;
  const resources =
    typeof obj.resources === "string" && obj.resources.trim()
      ? clampField(obj.resources)
      : undefined;
  const outcome =
    typeof obj.outcome === "string" && obj.outcome.trim()
      ? clampField(obj.outcome)
      : undefined;

  return {
    ...(time ? { time } : {}),
    ...(money ? { money } : {}),
    ...(resources ? { resources } : {}),
    ...(outcome ? { outcome } : {}),
  };
}

export function hasStewardshipImpactContent(
  state: StewardshipImpact | null | undefined
): boolean {
  if (!state) return false;
  return !!(
    state.time?.trim() ||
    state.money?.trim() ||
    state.resources?.trim() ||
    state.outcome?.trim()
  );
}

/** Compose legacy `impact` column text from stewardship fields. */
export function composeImpactString(
  state: StewardshipImpact | null | undefined
): string | null {
  const n = normalizeStewardshipImpact(state ?? {});
  const parts: string[] = [];
  if (n.time) parts.push(`Man-hours: ${n.time}`);
  if (n.money) parts.push(`Funds: ${n.money}`);
  if (n.resources) parts.push(`Resources: ${n.resources}`);
  if (n.outcome) parts.push(`Outcome: ${n.outcome}`);
  if (parts.length === 0) return null;
  return parts.join(" | ");
}

/**
 * Hydrate form fields from DB. If stewardship is empty but legacy impact
 * exists, put that text into outcome so old entries remain editable.
 */
export function hydrateStewardshipImpact(
  stewardship: unknown,
  legacyImpact?: string | null
): StewardshipImpact {
  const normalized = normalizeStewardshipImpact(stewardship);
  if (hasStewardshipImpactContent(normalized)) return normalized;
  const legacy = typeof legacyImpact === "string" ? legacyImpact.trim() : "";
  if (!legacy) return { ...EMPTY_STEWARDSHIP_IMPACT };
  return { outcome: clampField(legacy) };
}

/** Labeled block for LLM assessment / generate prompts. */
export function formatStewardshipImpactForPrompt(
  stewardship: StewardshipImpact | null | undefined,
  legacyImpact?: string | null,
  metrics?: string | null
): string {
  const n = normalizeStewardshipImpact(stewardship ?? {});
  const lines: string[] = [];

  if (hasStewardshipImpactContent(n)) {
    lines.push("Stewardship impact (AF Managing Resources):");
    if (n.time) lines.push(`- Man-hours: ${n.time}`);
    if (n.money) lines.push(`- Funds / cost avoidance: ${n.money}`);
    if (n.resources) {
      lines.push(`- Equipment / manpower / facilities: ${n.resources}`);
    }
    if (n.outcome) lines.push(`- Mission outcome: ${n.outcome}`);
  } else if (legacyImpact?.trim()) {
    lines.push(`Impact: ${legacyImpact.trim()}`);
  }

  if (metrics?.trim()) {
    lines.push(`Metrics: ${metrics.trim()}`);
  }

  return lines.join("\n");
}

/** Scoring guidance injected into accomplishment assessment prompts. */
export const STEWARDSHIP_ASSESSMENT_CRITERIA = `
### AF Stewardship impact (Managing Resources / ALQ)
When scoring impact_significance and metrics_quality (and managing_resources relevancy), prefer structured stewardship fields over vague free-text:
- TIME / man-hours / schedule: quantified man-hours or man-days recovered, cycle-time/downtime cut, who regained capacity, what mission work that funded — AND baseline→actual or N mos/wks/days/hrs early / % faster when present
- FUNDS: hard dollar save OR cost avoidance (buy/contract/TDY/overtime never spent) and readiness/capability bought back — never invent $
- RESOURCES: equipment, billets/manpower, facilities, or cross-org capacity recovered/redistributed
- OUTCOME: cascade to readiness, FMC, sortie, inspection, flight/sq/wg/MAJCOM impact

### Ahead-of-schedule vs on-time (score uplift)
- Finishing ON TIME / meeting a directed deadline = meets expectation — do NOT score as high impact just for punctuality.
- Finishing EARLY or FASTER than the normal/baseline process (e.g. "3 mos early", "cut qual 6 mos → 3 wks", "45% faster via new SOP", "fully trained 3 mos ahead of expected") is quantitatively stronger stewardship — score impact_significance and metrics_quality HIGHER when that delta is clear and credible.
- Strongest TIME signal: baseline duration + actual duration (or % reduction / absolute early) + who/what mission capacity that bought back.
- If Metrics or Man-hours fields already encode the early/% faster figure, credit them fully — do not require the same number in every field.

Blank levers must NOT auto-fail junior Airmen. Vague "improved the mission" with no stewardship lever or number should score lower on impact_significance and metrics_quality.
Prefer stewardship fields over legacy Impact text when both exist.
`.trim();
