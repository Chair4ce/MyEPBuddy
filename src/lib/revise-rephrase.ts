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

export function buildRephraseModeInstructions(
  versionCount: number,
  isDutyDescription: boolean,
): string {
  const tense = isDutyDescription
    ? "KEEP PRESENT TENSE — this describes a current role, not a past accomplishment."
    : "Keep the original tense (past for accomplishments, present participle only if the source already uses it).";

  return `**MODE: REPHRASE (same facts, different sentence architecture)**
Your goal is a true rewrite of HOW the idea is expressed — not a thesaurus pass on the first verb.

${tense}

Each of your ${versionCount} alternatives MUST change at least TWO of:
1. Syntactic frame (gerund phrase vs finite clause vs noun-led phrase)
2. Clause / object order (lead with the mission or object, then the action)
3. How compound duties are grouped (split an "&" blob into coordinated verbs, or nest one duty under the other)
4. Prepositional framing already licensed by the source ("for X" vs "of X") — do not invent a new relationship

**VERB-SWAP CLONES ARE FAILURES.** If the rest of the phrase is identical and only the opening verb changed, that alternative is invalid. Rewrite it.

**BAD (verb-only — do not do this):**
- "optimizing comm asset deployment & management for a named operation"
- "streamlining comm asset deployment & management for a named operation"
- "enhancing comm asset deployment & management for a named operation"

**GOOD (same facts, different architecture):**
- "deploys & manages comm assets for a named operation"
- "deployment & management of comm assets for a named operation"
- "named-operation comm assets: deployment & management"

If the source is vague, STAY vague. Do not invent an operation name, asset types, counts, geography, or impact. A shorter honest rewrite beats a specific fabricated one.`;
}

export function buildRephraseSystemOverride(
  versionCount: number,
  askQuestions: boolean,
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

${questionBlock}

Return JSON only in this shape:
{"revisions":[${Array.from({ length: versionCount }, (_, i) => `"revision${i + 1}"`).join(",")}],"questions":["optional question"]}

"revisions" must contain exactly ${versionCount} strings (the rewritten selection only).
"questions" is an array of 0–${CLARIFYING_QUESTION_MAX} strings.`;
}

export function buildRephraseUserAddon(askQuestions: boolean): string {
  const architecture = askQuestions
    ? `Rephrase by changing sentence architecture, not by swapping the opening verb. Same facts only.
Because this selection is thin on facts, include clarifying questions a rater could answer (what "optimizing" involved, which assets, whether the operation can be named). Do not answer those questions yourself by inventing details.`
    : "Rephrase by changing sentence architecture, not by swapping the opening verb. Same facts only. Return questions as [].";
  return `${architecture}

${buildSpanContextInstruction()}`;
}

/** The highlight is a span; surrounding sentences are context, not output. */
export function buildSpanContextInstruction(): string {
  return `**SURROUNDING STATEMENT (REQUIRED CONTEXT):**
The selected text is a SPAN inside a larger statement. Read FULL STATEMENT, TEXT BEFORE SELECTION, and TEXT AFTER SELECTION before writing.
- Rewrite ONLY the selected span so TEXT BEFORE + revision + TEXT AFTER still reads as one grammatical statement
- Do not output the surrounding sentences
- Use facts that already appear elsewhere in the statement only for coherence (tense, who, mission). Do not copy those facts into the span unless the span already contains them`;
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
