import { STANDARD_MGAS } from "@/lib/constants";
import type { createClient } from "@/lib/supabase/server";

export interface OtherMpaStatement {
  mpa: string;
  label: string;
  statement: string;
}

const ACTION_VERB_PATTERN =
  /\b(led|directed|managed|drove|championed|pioneered|transformed|accelerated|streamlined|optimized|enhanced|elevated|strengthened|bolstered|trained|mentored|developed|coached|cultivated|empowered|resolved|eliminated|eradicated|mitigated|prevented|reduced|corrected|delivered|produced|generated|created|built|established|launched|coordinated|synchronized|integrated|unified|consolidated|aligned|analyzed|assessed|evaluated|identified|diagnosed|investigated|audited|negotiated|acquired|procured|saved|recovered|reclaimed|secured|safeguarded|protected|defended|fortified|hardened|shielded|guided|commanded|supervised|executed|performed|supported|assisted|helped|contributed|participated|maintained|operated|administered|oversaw|controlled|monitored|tracked|reported|documented|recorded|compiled|organized|prepared|planned|scheduled|arranged|collaborated|partnered|engaged|interacted|communicated|liaised|consulted|advised|counseled|instructed|educated|taught|demonstrated|showed|illustrated|presented|displayed|exhibited|featured|highlighted|emphasized|promoted|advocated|endorsed|backed|upheld|sustained|preserved|guarded|modernized|revolutionized|innovated|overhauled|strengthened|influenced|reformed|rebuilt|revitalized|orchestrated|spearheaded|facilitated|leveraged|utilized|impacted)\b/gi;

const SENTENCE_START_SKIP = new Set([
  "the", "and", "but", "for", "nor", "yet", "so", "although", "because", "since", "while",
]);

/** Extract action verbs from EPB statement text for cross-MPA variety enforcement. */
export function extractVerbsFromStatementText(statementText: string): string[] {
  const usedVerbs = new Set<string>();
  const normalized = statementText.toLowerCase();

  for (const match of normalized.matchAll(ACTION_VERB_PATTERN)) {
    usedVerbs.add(match[0].toLowerCase());
  }

  for (const match of normalized.matchAll(/^([a-z]+)\s+/gm)) {
    const verb = match[1].toLowerCase();
    if (verb.length > 2 && !SENTENCE_START_SKIP.has(verb)) {
      usedVerbs.add(verb);
    }
  }

  return Array.from(usedVerbs);
}

export function extractVerbsFromStatements(statements: OtherMpaStatement[]): string[] {
  const usedVerbs = new Set<string>();
  for (const section of statements) {
    for (const verb of extractVerbsFromStatementText(section.statement)) {
      usedVerbs.add(verb);
    }
  }
  return Array.from(usedVerbs);
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pure in-memory filter: keep filled statements, optionally excluding one MPA. */
export function filterOtherMpaStatements(
  statements: OtherMpaStatement[],
  excludeMpa?: string
): OtherMpaStatement[] {
  return statements.filter((section) => !excludeMpa || section.mpa !== excludeMpa);
}

/**
 * Load ALL filled MPA statements from the ratee's EPB shell in a single query.
 * Callers that generate for multiple MPAs should fetch once and reuse the result
 * with {@link filterOtherMpaStatements} to avoid N duplicate queries.
 */
export async function fetchAllMpaStatements(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rateeId: string,
  cycleYear: number
): Promise<OtherMpaStatement[]> {
  // Guard against PostgREST filter injection via the raw `.or()` string below.
  if (!rateeId || !UUID_PATTERN.test(rateeId) || !Number.isFinite(cycleYear)) {
    return [];
  }

  try {
    const { data: epbShell } = await supabase
      .from("epb_shells")
      .select("sections:epb_shell_sections(mpa, statement_text)")
      .eq("cycle_year", cycleYear)
      .or(`user_id.eq.${rateeId},team_member_id.eq.${rateeId}`)
      .maybeSingle();

    if (!epbShell) return [];

    const typedShell = epbShell as { sections: { mpa: string; statement_text: string | null }[] };
    if (!typedShell.sections || !Array.isArray(typedShell.sections)) return [];

    return typedShell.sections
      .filter((section) =>
        Boolean(section.statement_text && section.statement_text.trim().length >= 10)
      )
      .map((section) => ({
        mpa: section.mpa,
        label: STANDARD_MGAS.find((m) => m.key === section.mpa)?.label || section.mpa,
        statement: section.statement_text!.trim(),
      }));
  } catch (error) {
    console.warn("Error fetching MPA statements for verb variety:", error);
    return [];
  }
}

/** Load filled MPA statements from the ratee's EPB shell, excluding the current MPA. */
export async function fetchOtherMpaStatements(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rateeId: string,
  cycleYear: number,
  excludeMpa?: string
): Promise<OtherMpaStatement[]> {
  const all = await fetchAllMpaStatements(supabase, rateeId, cycleYear);
  return filterOtherMpaStatements(all, excludeMpa);
}

/** Prompt block listing other MPA statements and enforcing unique verbs across the EPB. */
export function buildEpbVerbVarietyPromptSection(
  otherStatements: OtherMpaStatement[],
  additionalUsedVerbs: string[] = [],
  options?: { statementsAlreadyInPrompt?: boolean }
): string {
  const usedVerbs = [
    ...new Set([
      ...extractVerbsFromStatements(otherStatements),
      ...additionalUsedVerbs.map((verb) => verb.toLowerCase().trim()).filter(Boolean),
    ]),
  ].slice(0, 20);

  if (otherStatements.length === 0 && usedVerbs.length === 0) {
    return "";
  }

  const statementsBlock =
    otherStatements.length > 0 && !options?.statementsAlreadyInPrompt
      ? `${otherStatements.map((section) => `[${section.label}]\n${section.statement}`).join("\n\n")}\n\n`
      : otherStatements.length > 0 && options?.statementsAlreadyInPrompt
        ? "The member's other MPA statements are listed above in this prompt.\n\n"
        : "";

  const forbiddenVerbsBlock =
    usedVerbs.length > 0
      ? `\n**FORBIDDEN VERBS (already used in other MPAs):** ${usedVerbs.join(", ")}`
      : "";

  return `=== EXISTING EPB STATEMENTS IN OTHER MPAs (CRITICAL — READ BEFORE WRITING) ===
Review every statement below. Your output must sound distinct from all of them.

${statementsBlock}**VERB UNIQUENESS (CRITICAL — NON-NEGOTIABLE):**
The EPB must have variety across all MPA statements. Do NOT reuse action verbs already present above.
${forbiddenVerbsBlock}
- DO NOT start your statement with any verb listed above
- DO NOT repeat action verbs from the existing statements (users can manually edit later if they choose)
- If generating multiple versions, each version MUST start with a DIFFERENT verb from the others AND from all verbs above
- Choose fresh, strong verbs: Drove, Transformed, Pioneered, Modernized, Accelerated, Streamlined, Optimized, Secured, Fortified, Trained, Mentored, Delivered, Coordinated, Resolved, Eliminated, Negotiated, Saved`;
}
