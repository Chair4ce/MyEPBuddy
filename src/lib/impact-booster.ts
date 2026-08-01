/**
 * Impact Booster — helpers for EPB MPA impact Q&A persistence and LLM context.
 *
 * Answers live on the section only. Never copy with statement text between MPAs.
 */

import type {
  ImpactBoosterAnswer,
  ImpactBoosterState,
  ImpactLever,
} from "@/types/database";

export const IMPACT_BOOSTER_FREEFORM_MAX = 2000;
export const IMPACT_BOOSTER_ANSWER_MAX = 1000;

export const EMPTY_IMPACT_BOOSTER: ImpactBoosterState = {
  answers: [],
};

/**
 * AF Stewardship brief for LLM Impact Booster questions.
 * Grounded in AFI 36-2406 Managing Resources / ALQ Stewardship and
 * classic AF evaluation writing (man-hours, cost avoidance, level of impact).
 * Product levers stay time | money | resources; doctrine maps them to
 * time · funds · equipment/manpower/facilities.
 */
export const AF_STEWARDSHIP_IMPACT_BRIEF = `
Air Force stewardship (Managing Resources / ALQ): ratees manage TIME, EQUIPMENT, PEOPLE (manpower), FUNDS, and/or FACILITIES to maximize mission performance.

Quantify like boards expect — then cascade to readiness/mission outcome:
- TIME → man-hours / man-days recovered, cycle-time cut, downtime/outage reduced, AND schedule compression vs baseline (N mos/wks/days/hrs early, % faster, baseline→actual). On-time alone is meets expectation; finishing early/faster is stronger. Ask who regained capacity (self, shop, flight, sq) and what mission work that funded.
- FUNDS (lever: "money") → hard $ saved OR cost avoidance (buy/contract/TDY/overtime never spent). Ask what readiness/capability that bought back. Never invent dollars.
- EQUIPMENT / MANPOWER / FACILITIES (lever: "resources") → assets recovered/redistributed/repaired/kept off the buy list; billets or overtime burden reduced; idle systems/seats restored; cross-org SMEs pulled in to prevent mission fail.

Level of impact matters: work center → flight → squadron → group/wing → MAJCOM/AF.
Prefer AF vernacular in questions (man-hours, cost avoidance, FMC, readiness, sortie, inspection) over civilian "office efficiency" language.
`.trim();

/** Fallback prompts when generate didn't return tailored questions (e.g. after Revise). */
export const DEFAULT_IMPACT_BOOSTER_PROMPTS: Array<{
  question: string;
  category: string;
  hint: string;
  lever: ImpactLever;
}> = [
  {
    question:
      "What was the normal/baseline timeline vs what was delivered — how many mos/wks/days/hrs early (or % faster), how many man-hours did that free up, for whom, and what mission work did that capacity fund?",
    category: "impact",
    hint: "Baseline → actual or N early / % faster — man-hrs — who (shop/flt/sq) — mission funded",
    lever: "time",
  },
  {
    question:
      "Was there a hard dollar save or cost avoidance (buy, contract, TDY, overtime never spent)? About how much — and what readiness or capability did that buy back?",
    category: "impact",
    hint: "Hard $ or cost avoidance — readiness bought back (blank if unknown)",
    lever: "money",
  },
  {
    question:
      "What equipment, manpower, or facility capacity did this recover, redistribute, repair, or keep off the buy list — or what cross-org help prevented a mission fail?",
    category: "impact",
    hint: "Equip, billets, facilities, or cross-org capacity recovered",
    lever: "resources",
  },
];

const VALID_LEVERS: ImpactLever[] = ["time", "money", "resources"];

export type ImpactStrengthBand = "weak" | "fair" | "strong";

export function impactStrengthBand(strength: number | undefined): ImpactStrengthBand {
  if (strength == null || Number.isNaN(strength)) return "weak";
  if (strength >= 70) return "strong";
  if (strength >= 40) return "fair";
  return "weak";
}

export function impactStrengthLabel(band: ImpactStrengthBand): string {
  switch (band) {
    case "strong":
      return "Strong";
    case "fair":
      return "Fair";
    default:
      return "Weak";
  }
}

function isImpactLever(value: unknown): value is ImpactLever {
  return typeof value === "string" && VALID_LEVERS.includes(value as ImpactLever);
}

function clampText(value: string, max: number): string {
  return value.trim().slice(0, max);
}

function normalizeSentenceNumber(raw: unknown): 1 | 2 | undefined {
  if (raw === 1 || raw === "1") return 1;
  if (raw === 2 || raw === "2") return 2;
  return undefined;
}

function normalizeAnswer(raw: unknown): ImpactBoosterAnswer | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const question = typeof obj.question === "string" ? obj.question.trim() : "";
  const answer = typeof obj.answer === "string" ? clampText(obj.answer, IMPACT_BOOSTER_ANSWER_MAX) : "";
  if (!question || !answer) return null;
  const category = typeof obj.category === "string" && obj.category.trim()
    ? obj.category.trim()
    : "general";
  const hint = typeof obj.hint === "string" && obj.hint.trim() ? obj.hint.trim() : undefined;
  const lever = isImpactLever(obj.lever) ? obj.lever : undefined;
  const sentenceNumber = normalizeSentenceNumber(obj.sentenceNumber);
  return {
    question,
    category,
    answer,
    ...(hint ? { hint } : {}),
    ...(lever ? { lever } : {}),
    ...(sentenceNumber ? { sentenceNumber } : {}),
  };
}

function normalizeSentenceFreeform(
  raw: unknown
): ImpactBoosterState["sentenceFreeform"] | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const obj = raw as Record<string, unknown>;
  const one =
    typeof obj["1"] === "string" && obj["1"].trim()
      ? clampText(obj["1"], IMPACT_BOOSTER_FREEFORM_MAX)
      : undefined;
  const two =
    typeof obj["2"] === "string" && obj["2"].trim()
      ? clampText(obj["2"], IMPACT_BOOSTER_FREEFORM_MAX)
      : undefined;
  if (!one && !two) return undefined;
  return {
    ...(one ? { "1": one } : {}),
    ...(two ? { "2": two } : {}),
  };
}

/** Draft-key helper so the same lever question can exist for sentence 1 and 2. */
export function impactBoosterDraftKey(
  question: string,
  sentenceNumber?: 1 | 2
): string {
  return `${sentenceNumber ?? 0}::${question}`;
}

/** Normalize DB/API JSON into a safe ImpactBoosterState. */
export function normalizeImpactBooster(raw: unknown): ImpactBoosterState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...EMPTY_IMPACT_BOOSTER };
  }
  const obj = raw as Record<string, unknown>;
  const answersRaw = Array.isArray(obj.answers) ? obj.answers : [];
  const answers = answersRaw
    .map(normalizeAnswer)
    .filter((a): a is ImpactBoosterAnswer => a != null);

  const strength =
    typeof obj.strength === "number" && Number.isFinite(obj.strength)
      ? Math.max(0, Math.min(100, Math.round(obj.strength)))
      : undefined;

  const missingLevers = Array.isArray(obj.missingLevers)
    ? obj.missingLevers.filter(isImpactLever)
    : undefined;

  const summary =
    typeof obj.summary === "string" && obj.summary.trim()
      ? obj.summary.trim().slice(0, 500)
      : undefined;

  const freeform =
    typeof obj.freeform === "string" && obj.freeform.trim()
      ? clampText(obj.freeform, IMPACT_BOOSTER_FREEFORM_MAX)
      : undefined;

  const sentenceFreeform = normalizeSentenceFreeform(obj.sentenceFreeform);

  return {
    ...(strength != null ? { strength } : {}),
    ...(missingLevers && missingLevers.length > 0 ? { missingLevers } : {}),
    ...(summary ? { summary } : {}),
    answers,
    ...(freeform ? { freeform } : {}),
    ...(sentenceFreeform ? { sentenceFreeform } : {}),
  };
}

export function hasImpactBoosterContent(state: ImpactBoosterState | null | undefined): boolean {
  if (!state) return false;
  const sf = state.sentenceFreeform;
  const hasSentenceNotes = !!(sf?.["1"]?.trim() || sf?.["2"]?.trim());
  return (
    state.answers.length > 0 ||
    !!(state.freeform && state.freeform.trim()) ||
    hasSentenceNotes
  );
}

/** Empty persisted payload (clear all). */
export function clearedImpactBooster(): ImpactBoosterState {
  return { answers: [] };
}

function appendAnswerBlock(parts: string[], qa: ImpactBoosterAnswer): void {
  const leverTag = qa.lever ? ` [${qa.lever}]` : "";
  parts.push(`Q${leverTag}: ${qa.question}`);
  parts.push(`A: ${clampText(qa.answer, IMPACT_BOOSTER_ANSWER_MAX)}`);
}

/**
 * Build labeled clarifying context for generate/revise.
 * Returns empty string when there is nothing to inject.
 * When answers are tagged with sentenceNumber, blocks are separated so the
 * model applies facts only to the matching accomplishment.
 */
export function buildImpactBoosterContext(
  state: ImpactBoosterState | null | undefined
): string {
  const normalized = normalizeImpactBooster(state ?? {});
  if (!hasImpactBoosterContent(normalized)) return "";

  const s1 = normalized.answers.filter((a) => a.sentenceNumber === 1);
  const s2 = normalized.answers.filter((a) => a.sentenceNumber === 2);
  const general = normalized.answers.filter((a) => a.sentenceNumber == null);
  const hasSentenceScoped =
    s1.length > 0 ||
    s2.length > 0 ||
    !!normalized.sentenceFreeform?.["1"]?.trim() ||
    !!normalized.sentenceFreeform?.["2"]?.trim();

  const parts: string[] = [
    "=== IMPACT BOOSTER DETAILS (user-provided) ===",
  ];

  if (hasSentenceScoped) {
    parts.push(
      "These details are scoped per accomplishment. Apply each block ONLY to that sentence — do not mix metrics, savings, or stewardship facts across sentences."
    );

    if (s1.length > 0 || normalized.sentenceFreeform?.["1"]?.trim()) {
      parts.push("--- SENTENCE / ACCOMPLISHMENT 1 ---");
      for (const qa of s1) appendAnswerBlock(parts, qa);
      if (normalized.sentenceFreeform?.["1"]?.trim()) {
        parts.push("Additional notes (sentence 1):");
        parts.push(clampText(normalized.sentenceFreeform["1"]!, IMPACT_BOOSTER_FREEFORM_MAX));
      }
    }

    if (s2.length > 0 || normalized.sentenceFreeform?.["2"]?.trim()) {
      parts.push("--- SENTENCE / ACCOMPLISHMENT 2 ---");
      for (const qa of s2) appendAnswerBlock(parts, qa);
      if (normalized.sentenceFreeform?.["2"]?.trim()) {
        parts.push("Additional notes (sentence 2):");
        parts.push(clampText(normalized.sentenceFreeform["2"]!, IMPACT_BOOSTER_FREEFORM_MAX));
      }
    }

    if (general.length > 0 || normalized.freeform?.trim()) {
      parts.push("--- GENERAL (whole statement) ---");
      for (const qa of general) appendAnswerBlock(parts, qa);
      if (normalized.freeform?.trim()) {
        parts.push("Additional notes:");
        parts.push(clampText(normalized.freeform, IMPACT_BOOSTER_FREEFORM_MAX));
      }
    }
  } else {
    for (const qa of general) appendAnswerBlock(parts, qa);
    if (normalized.freeform?.trim()) {
      parts.push("Additional notes:");
      parts.push(clampText(normalized.freeform, IMPACT_BOOSTER_FREEFORM_MAX));
    }
  }

  return parts.join("\n");
}

/** Merge assessment fields from a generate response into existing saved answers/freeform. */
export function mergeImpactAssessment(
  current: ImpactBoosterState | null | undefined,
  assessment: {
    strength?: number;
    missingLevers?: ImpactLever[];
    summary?: string;
  } | null | undefined
): ImpactBoosterState {
  const base = normalizeImpactBooster(current ?? {});
  if (!assessment) return base;

  const strength =
    typeof assessment.strength === "number" && Number.isFinite(assessment.strength)
      ? Math.max(0, Math.min(100, Math.round(assessment.strength)))
      : base.strength;

  const missingLevers = Array.isArray(assessment.missingLevers)
    ? assessment.missingLevers.filter(isImpactLever)
    : base.missingLevers;

  const summary =
    typeof assessment.summary === "string" && assessment.summary.trim()
      ? assessment.summary.trim().slice(0, 500)
      : base.summary;

  return {
    ...base,
    ...(strength != null ? { strength } : {}),
    ...(missingLevers && missingLevers.length > 0
      ? { missingLevers }
      : { missingLevers: undefined }),
    ...(summary ? { summary } : {}),
  };
}

export interface ImpactAssessmentResponse {
  strength: number;
  missingLevers: ImpactLever[];
  summary: string;
}

/** Parse LLM impactAssessment JSON into a typed object (or null). */
export function parseImpactAssessment(raw: unknown): ImpactAssessmentResponse | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const strength =
    typeof obj.strength === "number" && Number.isFinite(obj.strength)
      ? Math.max(0, Math.min(100, Math.round(obj.strength)))
      : null;
  if (strength == null) return null;

  const missingLevers = Array.isArray(obj.missingLevers)
    ? obj.missingLevers.filter(isImpactLever)
    : [];

  const summary =
    typeof obj.summary === "string" && obj.summary.trim()
      ? obj.summary.trim().slice(0, 500)
      : "Impact details could be stronger.";

  return { strength, missingLevers, summary };
}

export function upsertImpactBoosterAnswer(
  state: ImpactBoosterState,
  answer: ImpactBoosterAnswer
): ImpactBoosterState {
  const normalized = normalizeImpactBooster(state);
  const sentenceNumber = normalizeSentenceNumber(answer.sentenceNumber);
  const cleaned: ImpactBoosterAnswer = {
    question: answer.question.trim(),
    category: answer.category?.trim() || "general",
    answer: clampText(answer.answer, IMPACT_BOOSTER_ANSWER_MAX),
    ...(answer.hint?.trim() ? { hint: answer.hint.trim() } : {}),
    ...(answer.lever && isImpactLever(answer.lever) ? { lever: answer.lever } : {}),
    ...(sentenceNumber ? { sentenceNumber } : {}),
  };
  if (!cleaned.question || !cleaned.answer) return normalized;

  const idx = normalized.answers.findIndex(
    (a) =>
      a.question.toLowerCase() === cleaned.question.toLowerCase() &&
      (a.sentenceNumber ?? null) === (cleaned.sentenceNumber ?? null)
  );
  const answers = [...normalized.answers];
  if (idx >= 0) {
    answers[idx] = cleaned;
  } else {
    answers.push(cleaned);
  }
  return { ...normalized, answers };
}

export function removeImpactBoosterAnswer(
  state: ImpactBoosterState,
  question: string,
  sentenceNumber?: 1 | 2
): ImpactBoosterState {
  const normalized = normalizeImpactBooster(state);
  const q = question.trim().toLowerCase();
  return {
    ...normalized,
    answers: normalized.answers.filter((a) => {
      if (a.question.toLowerCase() !== q) return true;
      if (sentenceNumber == null) return false;
      return (a.sentenceNumber ?? null) !== sentenceNumber;
    }),
  };
}

export function setImpactBoosterFreeform(
  state: ImpactBoosterState,
  freeform: string
): ImpactBoosterState {
  const normalized = normalizeImpactBooster(state);
  const trimmed = clampText(freeform, IMPACT_BOOSTER_FREEFORM_MAX);
  if (!trimmed) {
    const { freeform: _drop, ...rest } = normalized;
    return { ...rest, answers: normalized.answers };
  }
  return { ...normalized, freeform: trimmed };
}

export function setImpactBoosterSentenceFreeform(
  state: ImpactBoosterState,
  sentenceNumber: 1 | 2,
  notes: string
): ImpactBoosterState {
  const normalized = normalizeImpactBooster(state);
  const key = String(sentenceNumber) as "1" | "2";
  const trimmed = clampText(notes, IMPACT_BOOSTER_FREEFORM_MAX);
  const next = { ...(normalized.sentenceFreeform ?? {}) };
  if (!trimmed) {
    delete next[key];
  } else {
    next[key] = trimmed;
  }
  const hasAny = !!(next["1"]?.trim() || next["2"]?.trim());
  if (!hasAny) {
    const { sentenceFreeform: _drop, ...rest } = normalized;
    return { ...rest, answers: normalized.answers };
  }
  return { ...normalized, sentenceFreeform: next };
}

/** Prompts to show for a given accomplishment tab. */
export function promptsForSentence(
  prompts: Array<{
    question: string;
    category: string;
    hint?: string;
    lever?: ImpactLever;
    sentenceNumber?: 1 | 2;
  }>,
  sentenceNumber: 1 | 2 | undefined,
  dual: boolean
): Array<{
  question: string;
  category: string;
  hint?: string;
  lever?: ImpactLever;
  sentenceNumber?: 1 | 2;
}> {
  if (!dual || sentenceNumber == null) {
    return prompts.length > 0 ? prompts : DEFAULT_IMPACT_BOOSTER_PROMPTS;
  }
  const tagged = prompts.filter((p) => p.sentenceNumber === sentenceNumber);
  if (tagged.length > 0) return tagged;
  const untagged = prompts.filter((p) => p.sentenceNumber == null);
  const base = untagged.length > 0 ? untagged : DEFAULT_IMPACT_BOOSTER_PROMPTS;
  return base.map((p) => ({ ...p, sentenceNumber }));
}
