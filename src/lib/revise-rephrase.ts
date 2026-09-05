import { asPlainText, parseRevisionList } from "@/lib/sentence-utils";

export const REVISE_CONTEXT_MAX_CHARS = 600;
export const CLARIFYING_QUESTION_MAX = 3;

/** Weak/generic verbs that invite synonym-only "rephrases." */
const UNDERSPECIFIED_VERB_RE =
  /\b(optimiz(?:e|ing|es|ed)|enhanc(?:e|ing|es|ed)|improv(?:e|ing|es|ed)|streamlin(?:e|ing|es|ed)|support(?:ing|s|ed)?|manag(?:e|ing|es|ed)|ensur(?:e|ing|es|ed)|facilitat(?:e|ing|es|ed)|assist(?:ing|s|ed)?|help(?:ing|s|ed)?|coordinat(?:e|ing|es|ed)|overseeing|oversee|provid(?:e|ing|es|ed)|enabl(?:e|ing|es|ed))\b/i;

/**
 * True when the selection has almost no grounded facts, so a model cannot
 * meaningfully rewrite without either swapping synonyms or inventing scope.
 */
export function isUnderspecifiedSelection(text: string): boolean {
  const trimmed = asPlainText(text).replace(/\s+/g, " ").trim();
  if (trimmed.length < 12) return true;
  const hasMetric = /\d/.test(trimmed);
  const hasAcronym = /\b[A-Z]{2,}(?:-[A-Z]+)?\b/.test(trimmed);
  const namedOpPlaceholder = /\bnamed operation\b/i.test(trimmed);
  const vagueVerb = UNDERSPECIFIED_VERB_RE.test(trimmed);
  if (hasMetric && hasAcronym && !namedOpPlaceholder) return false;
  if (!hasMetric && (vagueVerb || namedOpPlaceholder)) return true;
  if (!hasMetric && !hasAcronym && trimmed.split(" ").length <= 14) return true;
  return false;
}

export function sanitizeReviseContext(value: unknown): string {
  const raw = asPlainText(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "";
  return raw.slice(0, REVISE_CONTEXT_MAX_CHARS);
}

/** AF filler connector — adds no fact and pads the bullet. */
const THEREBY_CONNECTOR = /\s*,?\s*\bthereby\b\s*,?\s*/gi;

/**
 * Strip banned rephrase filler ("thereby") and tidy leftover commas/spaces.
 */
export function stripBannedRephraseFillers(text: string): string {
  let out = asPlainText(text).replace(THEREBY_CONNECTOR, ", ");
  out = out.replace(/^[\s,]+/, "");
  out = out.replace(/,\s*,+/g, ",");
  out = out.replace(/\s+,/g, ",");
  out = out.replace(/,\s*$/g, "");
  out = out.replace(/\s{2,}/g, " ");
  return out.trim();
}

/**
 * Fingerprint that treats "&" and "and" as the same token and ignores
 * punctuation/case, so "foo and bar" === "foo & bar".
 */
export function normalizeRephraseFingerprint(text: string): string {
  return asPlainText(text)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isRephraseClone(a: string, b: string): boolean {
  const left = normalizeRephraseFingerprint(a);
  const right = normalizeRephraseFingerprint(b);
  return Boolean(left) && left === right;
}

/**
 * Drop copies of the source and of earlier alternatives (and/&-only swaps).
 * Does not pad — identical slots are worse than fewer distinct rewrites.
 */
export function uniqueRephraseRevisions(
  revisions: string[],
  original: string,
): string[] {
  const seen = new Set<string>();
  const source = normalizeRephraseFingerprint(original);
  if (source) seen.add(source);
  const out: string[] = [];
  for (const revision of revisions) {
    const cleaned = asPlainText(revision).trim();
    if (!cleaned) continue;
    const key = normalizeRephraseFingerprint(cleaned);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

export function formatClarifyingAnswers(
  questions: string[],
  answers: string[],
): string {
  const lines: string[] = [];
  for (let i = 0; i < questions.length; i += 1) {
    const q = asPlainText(questions[i]).trim();
    const a = asPlainText(answers[i]).trim();
    if (!q || !a) continue;
    lines.push(`Q: ${q} A: ${a}`);
  }
  return sanitizeReviseContext(lines.join(" "));
}

export function parseClarifyingQuestions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const q = asPlainText(item).replace(/\s+/g, " ").trim();
    if (q.length < 12 || q.length > 180) continue;
    const key = q.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
    if (out.length >= CLARIFYING_QUESTION_MAX) break;
  }
  return out;
}

export interface ReviseSelectionLlmPayload {
  revisions: string[];
  questions: string[];
}

function tryParseJson(candidate: string): unknown | null {
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

/**
 * Accept either the legacy `["r1","r2"]` array or
 * `{ "revisions": [...], "questions": [...] }`.
 */
export function parseReviseSelectionLlmOutput(
  text: string,
  parseLimit: number,
): ReviseSelectionLlmPayload {
  const stripped = asPlainText(text)
    .replace(/```json/gi, "```")
    .replace(/```/g, "")
    .trim();

  const objectMatch = stripped.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    const parsed = tryParseJson(objectMatch[0]);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const rec = parsed as Record<string, unknown>;
      const revisions = parseRevisionList(
        rec.revisions ?? rec.alternatives,
        parseLimit,
      );
      const questions = parseClarifyingQuestions(rec.questions);
      if (revisions.length > 0) {
        return { revisions, questions };
      }
    }
  }

  const arrayMatch = stripped.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    const parsed = tryParseJson(arrayMatch[0]);
    if (parsed != null) {
      return {
        revisions: parseRevisionList(parsed, parseLimit),
        questions: [],
      };
    }
  }

  return {
    revisions: stripped
      .split("\n")
      .map((line) => line.replace(/^[-*\d.)\s]+/, "").trim())
      .filter((line) => line.length > 10),
    questions: [],
  };
}

export type RevisionTense = "past" | "present_finite" | "present_participle";

const PAST_IRREGULAR =
  /\b(led|drove|built|cut|ran|won|sent|held|made|took|gave|kept|left|spent|struck|wrote|grew|began|became|brought|caught|fought|found|got|had|hit|lost|met|paid|put|said|saw|sold|stood|thought|told|understood|went|did|was|were)\b/i;
const PRESENT_FINITE =
  /\b(drives|leads|manages|supports|coordinates|oversees|directs|provides|enables|maintains|operates|sustains|advises|administers|represents|monitors|evaluates|governs|deploys|optimizes|enhances|improves|ensures)\b/i;
const GERUND_STOP = /^(during|including|regarding|according|pending|following)$/i;

function countRe(text: string, re: RegExp): number {
  return [...text.matchAll(new RegExp(re.source, "gi"))].length;
}

const ED_ADJECTIVE =
  /^(named|based|related|detailed|united|joint|assigned|authorized|required|limited|nested)$/i;

function openingWord(text: string): string {
  return text.match(/^[A-Za-z][A-Za-z']*/)?.[0] ?? "";
}

function tenseFromOpening(word: string): RevisionTense | null {
  if (!word) return null;
  if (!GERUND_STOP.test(word) && word.length >= 5 && /ing$/i.test(word)) {
    return "present_participle";
  }
  if (PAST_IRREGULAR.test(word)) return "past";
  if (word.length >= 4 && /ed$/i.test(word) && !ED_ADJECTIVE.test(word)) {
    return "past";
  }
  if (PRESENT_FINITE.test(word)) return "present_finite";
  return null;
}

function tenseFromText(text: string): RevisionTense | null {
  const trimmed = asPlainText(text).replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  const fromOpening = tenseFromOpening(openingWord(trimmed));
  if (fromOpening) return fromOpening;

  const past =
    countRe(trimmed, PAST_IRREGULAR) +
    [...trimmed.matchAll(/\b[A-Za-z]{3,}ed\b/gi)].filter(
      (match) => !ED_ADJECTIVE.test(match[0]),
    ).length;
  const finite = countRe(trimmed, PRESENT_FINITE);
  const ings = [...trimmed.matchAll(/\b[A-Za-z]{3,}ing\b/g)].filter(
    (match) => !GERUND_STOP.test(match[0]),
  ).length;

  if (ings > 0 && past === 0 && finite === 0) return "present_participle";
  if (past > 0 && past >= finite && past >= ings) return "past";
  if (finite > 0 && finite >= past && finite >= ings) return "present_finite";
  if (ings > 0 && past === 0) return "present_participle";
  if (past > 0) return "past";
  if (finite > 0) return "present_finite";
  if (ings > 0) return "present_participle";
  return null;
}

/**
 * Match the highlighted span's tense. Duty descriptions stay present finite;
 * MPA/award spans stay past or present-participle when that is what the user wrote.
 */
export function inferRevisionTense(
  selectedText: string,
  fullStatement = "",
  isDutyDescription = false,
): RevisionTense {
  if (isDutyDescription) return "present_finite";
  return tenseFromText(selectedText) ?? tenseFromText(fullStatement) ?? "past";
}

export function buildVerbRequiredInstruction(tense: RevisionTense): string {
  if (tense === "present_finite") {
    return `**VERB REQUIRED (NON-NEGOTIABLE):** Every alternative MUST contain a present-finite action verb (deploys, manages, leads, drives).
FORBIDDEN: verb-less noun piles ("deployment & management of comm assets", "named-operation comm asset deployment"). Those are not rephrases of an action.`;
  }
  if (tense === "present_participle") {
    return `**VERB REQUIRED (NON-NEGOTIABLE):** Every alternative MUST contain a present-participle / gerund action (-ing): deploying, managing, allocating.
FORBIDDEN: dropping the verb for a noun phrase ("deployment & management of comm assets", "named-operation comm asset deployment"). Keep an -ing verb in the rewrite.`;
  }
  return `**VERB REQUIRED (NON-NEGOTIABLE):** Every alternative MUST contain a past-tense action verb (deployed, managed, led, drove).
FORBIDDEN: dropping the verb for a noun phrase ("deployment & management of comm assets", "named-operation comm asset deployment"). Keep a past-tense verb in the rewrite.`;
}

export function buildTenseLockInstruction(tense: RevisionTense): string {
  if (tense === "present_finite") {
    return `**TENSE LOCK (NON-NEGOTIABLE):** The source span is PRESENT FINITE (drives, manages, deploys).
Keep every alternative in present finite. Do not switch to past (led, deployed) or to a gerund-only rewrite.
${buildVerbRequiredInstruction(tense)}`;
  }
  if (tense === "present_participle") {
    return `**TENSE LOCK (NON-NEGOTIABLE):** The source span is a PRESENT PARTICIPLE / GERUND (optimizing, deploying, managing).
Keep every alternative in that -ing verb form. Do not "solve" tense by deleting the verb.
FORBIDDEN: flipping into present finite (optimizing → deploys / manages / leads) or into simple past (optimized, deployed).
${buildVerbRequiredInstruction(tense)}`;
  }
  return `**TENSE LOCK (NON-NEGOTIABLE):** The source span is PAST TENSE (led, deployed, managed, optimized).
Keep every alternative in past tense with a past-tense verb.
FORBIDDEN: flipping into present finite (deploys, manages, leads, drives) or rewriting a past verb as a present participle unless the source already used -ing.
${buildVerbRequiredInstruction(tense)}`;
}

function architectureExamples(tense: RevisionTense): string {
  if (tense === "present_finite") {
    return `**BAD (verb-swap clone OR verb-less noun phrase — do not do this):**
- "optimizes comm asset deployment & management for a named operation"
- "streamlines comm asset deployment & management for a named operation"
- "deployment & management of comm assets for a named operation" (NO VERB)
- "named-operation comm asset deployment & management" (NO VERB)

**GOOD (same facts, different architecture, SAME TENSE, HAS A VERB):**
- "deploys & manages comm assets for a named operation"
- "manages named-operation comm-asset deployment"
- "for a named operation, deploys & manages comm assets"`;
  }
  if (tense === "present_participle") {
    return `**BAD (verb-swap clone, tense flip, OR verb-less noun phrase — do not do this):**
- "optimizing comm asset deployment & management for a named operation" (source clone)
- "streamlining comm asset deployment & management for a named operation"
- "deploys & manages comm assets for a named operation" (WRONG TENSE — present finite)
- "deployed & managed comm assets for a named operation" (WRONG TENSE — past)
- "deployment & management of comm assets for a named operation" (NO VERB)
- "named-operation comm asset deployment & management" (NO VERB)

**GOOD (same facts, different architecture, SAME TENSE, HAS A VERB):**
- "deploying & managing comm assets for a named operation"
- "managing named-operation comm-asset deployment"
- "for a named operation, deploying & managing comm assets"`;
  }
  return `**BAD (verb-swap clone, tense flip, OR verb-less noun phrase — do not do this):**
- "spearheaded comm asset deployment & management for a named operation"
- "deploys & manages comm assets for a named operation" (WRONG TENSE — present)
- "deployment & management of comm assets for a named operation" (NO VERB)
- "named-operation comm asset deployment & management" (NO VERB)

**GOOD (same facts, different architecture, SAME TENSE, HAS A VERB):**
- "deployed & managed comm assets for a named operation"
- "managed named-operation comm-asset deployment"
- "for a named operation, deployed & managed comm assets"

**BAD (and/& clone of a 3-verb list — do not do this):**
- "Authored special instructions for communicators, streamlined IT status reporting, and expedited information flow to senior leadership"
- "Authored special instructions for communicators, streamlined IT status reporting & expedited information flow to senior leadership"

**GOOD (same three facts, regrouped):**
- "Expedited information flow to senior leadership by authoring communicator special instructions & streamlining IT status reporting"
- "Authored communicator special instructions that streamlined IT status reporting, expediting information flow to senior leadership"
- "Streamlined IT status reporting & authored communicator special instructions, expediting information flow to senior leadership"`;
}

export function buildRephraseModeInstructions(
  versionCount: number,
  tense: RevisionTense,
): string {
  return `**MODE: REPHRASE (same facts, different sentence architecture)**
Your goal is a true rewrite of HOW the idea is expressed — not a thesaurus pass on the first verb.

${buildTenseLockInstruction(tense)}

Each of your ${versionCount} alternatives MUST keep an action verb in the source tense AND change at least TWO of:
1. Syntactic frame (reorder, lead with the object/mission then the verb, split a compound) WITHOUT changing tense. Do not convert a gerund into a present-tense finite verb unless the source is already present finite. Do not replace the verb with a noun.
2. Clause / object order (lead with the mission or object, then the action — the action verb must still appear)
3. How compound duties are grouped (split an "&" blob into coordinated verbs, or nest one duty under the other)
4. Prepositional framing already licensed by the source ("for X" vs "of X") — do not invent a new relationship

**VERB-SWAP CLONES ARE FAILURES.** If the rest of the phrase is identical and only the opening verb changed, that alternative is invalid. Rewrite it.
**VERB-LESS NOUN PHRASES ARE FAILURES.** If there is no action verb, that alternative is invalid. Rewrite it.
**AND/& CLONES ARE FAILURES.** If alternatives (or the source) differ only by "and" vs "&", they are the same sentence. Invalid. Regroup clauses, change lead item, or nest one action under another.
**"thereby" IS BANNED.** Never use "thereby" (or "thus"/"hence" as a swap). Join clauses with a comma and keep the action verb.

${architectureExamples(tense)}

If the source is vague, STAY vague. Do not invent an operation name, asset types, counts, geography, or impact. A shorter honest rewrite beats a specific fabricated one.`;
}

export function buildRephraseSystemOverride(
  versionCount: number,
  askQuestions: boolean,
  tense: RevisionTense,
): string {
  const questionBlock = askQuestions
    ? `The selected text is UNDERSPECIFIED (few or no metrics, generic verbs, or a placeholder like "named operation").
After writing the revisions, also return up to ${CLARIFYING_QUESTION_MAX} SHORT questions the writer could answer so a later rewrite can be more specific.
Questions must not assume facts (no "which of the 12 radios"). Empty answers are expected — you are asking, not filling.`
    : `The selected text already has enough specifics. Return "questions": [] — do not quiz the writer.`;

  return `**REPHRASE OVERRIDE (HIGHEST PRIORITY FOR THIS REQUEST):**
Ignore any earlier instruction whose primary success criterion is "use a different opening verb." Opening-verb variety is optional spice, not the task.
Diversity = different sentence architecture across the ${versionCount} alternatives.
Do not recycle the original word order with a new first verb.
Do not drop the action verb for a noun phrase.
Never use the word "thereby".
Never return alternatives that only swap "and" and "&". Each revision must regroup the clauses.

${buildTenseLockInstruction(tense)}

${questionBlock}

Return JSON only in this shape:
{"revisions":[${Array.from({ length: versionCount }, (_, i) => `"revision${i + 1}"`).join(",")}],"questions":["optional question"]}

"revisions" must contain exactly ${versionCount} strings (the rewritten selection only).
"questions" is an array of 0–${CLARIFYING_QUESTION_MAX} strings.`;
}

export function buildRephraseUserAddon(
  askQuestions: boolean,
  tense: RevisionTense,
): string {
  const architecture = askQuestions
    ? `Rephrase by changing sentence architecture, not by swapping the opening verb and not by deleting the verb. Same facts only. Keep the source span's tense and keep an action verb.
Because this selection is thin on facts, include clarifying questions a rater could answer (what "optimizing" involved, which assets, whether the operation can be named). Do not answer those questions yourself by inventing details.`
    : "Rephrase by changing sentence architecture, not by swapping the opening verb, deleting the verb, or swapping and/&. Same facts only. Keep the source span's tense and keep an action verb. Return questions as [].";
  return `${architecture}

${buildTenseLockInstruction(tense)}

${buildSpanContextInstruction()}`;
}

/** The highlight is a span; surrounding sentences are context, not output. */
export function buildSpanContextInstruction(): string {
  return `**SURROUNDING STATEMENT (REQUIRED CONTEXT):**
The selected text is a SPAN inside a larger statement. Read FULL STATEMENT, TEXT BEFORE SELECTION, and TEXT AFTER SELECTION before writing.
- Rewrite ONLY the selected span so TEXT BEFORE + revision + TEXT AFTER still reads as one grammatical statement
- Do not output the surrounding sentences
- Match the SELECTED SPAN's verb tense. Do not copy a different tense from elsewhere in the package
- Use facts that already appear elsewhere in the statement only for coherence (who, mission). Do not copy those facts into the span unless the span already contains them`;
}

const SOURCE_FACT_STOPWORDS = new Set([
  "As",
  "During",
  "The",
  "His",
  "Her",
  "He",
  "She",
]);

export interface SourceFactTokens {
  numbers: string[];
  acronyms: string[];
  properNouns: string[];
}

export function collectSourceFactTokens(text: string): SourceFactTokens {
  const numbers = [...new Set(text.match(/\d[\d,.$%KMBkb]*/g) ?? [])];
  const acronyms = [...new Set(text.match(/\b[A-Z]{2,}(?:-[A-Z]+)?\b/g) ?? [])];
  const properNouns = [
    ...new Set(
      (text.match(/\b[A-Z][a-z]+(?:'s)?\b/g) ?? []).filter(
        (word) => !SOURCE_FACT_STOPWORDS.has(word),
      ),
    ),
  ];
  return { numbers, acronyms, properNouns };
}

function formatFactTokenLines(tokens: SourceFactTokens): string[] {
  const lines: string[] = [];
  if (tokens.numbers.length > 0) {
    lines.push(`- Numbers/metrics: ${tokens.numbers.join(", ")}`);
  }
  if (tokens.acronyms.length > 0) {
    lines.push(`- Acronyms: ${tokens.acronyms.join(", ")}`);
  }
  if (tokens.properNouns.length > 0) {
    lines.push(`- Proper nouns: ${tokens.properNouns.join(", ")}`);
  }
  return lines;
}

function tokenKey(kind: keyof SourceFactTokens, value: string): string {
  return `${kind}:${value.toLowerCase()}`;
}

function surroundingOnly(
  full: SourceFactTokens,
  selected: SourceFactTokens,
): SourceFactTokens {
  const selectedKeys = new Set<string>([
    ...selected.numbers.map((v) => tokenKey("numbers", v)),
    ...selected.acronyms.map((v) => tokenKey("acronyms", v)),
    ...selected.properNouns.map((v) => tokenKey("properNouns", v)),
  ]);
  const keep = (kind: keyof SourceFactTokens) =>
    full[kind].filter((value) => !selectedKeys.has(tokenKey(kind, value)));
  return {
    numbers: keep("numbers"),
    acronyms: keep("acronyms"),
    properNouns: keep("properNouns"),
  };
}

export function buildSourceFactsPrompt(
  selectedText: string,
  fullStatement: string,
): string {
  const selectedTokens = collectSourceFactTokens(selectedText);
  const fullTokens = collectSourceFactTokens(fullStatement);
  const selectedLines = formatFactTokenLines(selectedTokens);
  const restLines = formatFactTokenLines(
    surroundingOnly(fullTokens, selectedTokens),
  );

  const selectedBlock =
    selectedLines.length > 0
      ? selectedLines.join("\n")
      : "- No discrete numbers or acronyms in the selected span — do not invent any.";

  const restBlock =
    restLines.length > 0
      ? restLines.join("\n")
      : "- No additional metrics in the surrounding statement.";

  return `**SOURCE FACTS IN THE SELECTED SPAN (these may appear in the rewrite):**
${selectedBlock}

**FACTS IN THE REST OF THE STATEMENT (context only — already written outside the selection; do not copy them into the revision unless the span already contains them):**
${restBlock}`;
}
