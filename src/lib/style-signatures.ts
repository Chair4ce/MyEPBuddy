/**
 * Style Signatures - Server-side utilities
 *
 * Generates, stores, and retrieves LLM-readable writing style fingerprints.
 * Signatures capture HOW a user writes for a specific Rank + AFSC + MPA
 * without storing actual statement text.
 *
 * Key functions:
 * - generateStyleSignature() - Analyzes statements and creates a fingerprint
 * - refreshUserSignatures() - Regenerates all stale signatures for a user
 * - getChainStyleSignature() - Loads the chain-of-command style for a user
 * - getUserStyleSignature() - Loads a user's own style signature
 */

import { createClient } from "@/lib/supabase/server";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { createHash } from "crypto";
import type { Rank } from "@/types/database";

// Rank hierarchy for determining highest rank in a chain (index 0 = highest)
const RANK_HIERARCHY: string[] = [
  // General Officers
  "Gen", "Lt Gen", "Maj Gen", "Brig Gen",
  // Field Grade Officers
  "Col", "Lt Col", "Maj",
  // Company Grade Officers
  "Capt", "1st Lt", "2d Lt",
  // Senior Enlisted
  "CMSgt", "SMSgt", "MSgt", "TSgt", "SSgt",
  // Junior Enlisted
  "SrA", "A1C", "Amn", "AB",
  // Civilian
  "Civilian",
];

/** Get the rank's position in the hierarchy (lower index = higher rank) */
function getRankIndex(rank: string): number {
  const idx = RANK_HIERARCHY.indexOf(rank);
  return idx === -1 ? RANK_HIERARCHY.length : idx;
}

/** Valid MPA keys for style signatures */
const VALID_MPAS = [
  "executing_mission",
  "leading_people",
  "managing_resources",
  "improving_unit",
  "whole_airman",
  "general",
] as const;

type StyleMPA = typeof VALID_MPAS[number];

/** Map common MPA label variants to canonical keys */
function normalizeMPA(mpa: string): StyleMPA {
  const lower = mpa.toLowerCase().replace(/\s+/g, "_");
  if (lower.includes("executing") || lower.includes("mission")) return "executing_mission";
  if (lower.includes("leading") || lower.includes("people")) return "leading_people";
  if (lower.includes("managing") || lower.includes("resource")) return "managing_resources";
  if (lower.includes("improving") || lower.includes("unit")) return "improving_unit";
  if (lower.includes("whole") || lower.includes("airman")) return "whole_airman";
  return "general";
}

/**
 * Compute a deterministic hash of statement IDs for staleness detection.
 */
function computeSourceHash(statementIds: string[]): string {
  const sorted = [...statementIds].sort();
  return createHash("sha256").update(sorted.join(",")).digest("hex").slice(0, 16);
}

// ------------------------------------------------------------------
// Meta-prompt for fingerprint generation
// ------------------------------------------------------------------
const FINGERPRINT_META_PROMPT = `You are a military writing style analyst. You will be given a set of Air Force performance statements written by the same author.

Your task: Analyze ONLY the writing PATTERNS and STYLE in these statements. Produce a structured "writing style fingerprint" that another AI can use to generate new statements matching this author's voice.

CRITICAL RULES:
- Do NOT reproduce, quote, or paraphrase any statement content.
- Do NOT include any accomplishment details, metrics, names, units, or mission-specific information.
- Focus ONLY on structural and stylistic patterns.

Analyze and report on these dimensions:
1. SENTENCE STRUCTURE: Average clause count per statement, use of compound vs simple structures, subordinate clause placement.
2. VERB PATTERNS: Preferred verb intensity (mild like "led/managed" vs strong like "spearheaded/revolutionized"), tense usage, passive vs active voice ratio.
3. ABBREVIATION STYLE: How heavily abbreviations are used (e.g., "&" vs "and", "mbr" vs "member", "hrs" vs "hours").
4. IMPACT CHAINING: How the author connects actions to results (direct causal, implied, multi-hop). Depth of impact chains (action → result → higher impact).
5. METRICS PRESENTATION: How quantitative data is woven in (leading position, embedded, trailing). Density of metrics per statement.
6. FORMALITY LEVEL: Military formality spectrum (clinical/technical vs conversational/energetic).
7. WORD ECONOMY: How tightly packed the language is. Filler word avoidance. Compression techniques used.
8. OPENING PATTERNS: How statements typically begin (action verb, role description, context setting).
9. CLOSING PATTERNS: How statements end (impact statement, metric, organizational benefit).

Output format: Write a concise style fingerprint in 150-250 words as a continuous paragraph that another AI can directly use as style guidance. Start with "This author's style is characterized by..." and describe all key patterns naturally.

Then on a new line, output a JSON block with structured factors:
\`\`\`json
{
  "statement_patterns": {
    "avg_clause_count": <number>,
    "verb_intensity": "<low|moderate|high>",
    "abbreviation_density": "<minimal|moderate|heavy>",
    "tense_preference": "<past|present|mixed>",
    "impact_chain_depth": <1-4>,
    "metrics_per_statement": <number>,
    "formality": "<casual|professional|formal|clinical>",
    "word_economy": "<loose|moderate|tight|compressed>",
    "voice": "<active|passive|mixed>"
  }
}
\`\`\``;

// ------------------------------------------------------------------
// Core Functions
// ------------------------------------------------------------------

interface StyleSignature {
  id: string;
  user_id: string;
  target_rank: string;
  target_afsc: string;
  mpa: string;
  signature_text: string;
  signature_factors: Record<string, unknown>;
  source_statement_count: number;
  source_hash: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

interface ChainStyleResult {
  signature: StyleSignature | null;
  sourceRank: string | null;      // rank of the person whose style we're using
  sourceDepth: number | null;     // how many levels up in the chain
  fallbackUsed: "none" | "personal" | "no_signature";
}

/**
 * Generate or refresh a style signature for a user's writing
 * for a specific target rank + AFSC + MPA combination.
 *
 * Fetches the user's finalized/approved statements matching those dimensions,
 * sends them to an LLM for style analysis, and upserts the signature.
 *
 * @returns true if signature was generated/updated, false if skipped (no statements or hash unchanged)
 */
export async function generateStyleSignature(
  userId: string,
  targetRank: string,
  targetAfsc: string,
  mpa: StyleMPA
): Promise<boolean> {
  const supabase = await createClient();

  // Only use QUALITY sources for signature generation:
  //   1. Statements from ARCHIVED EPBs (source_epb_shell_id IS NOT NULL)
  //   2. Statements explicitly starred for AI (use_as_llm_example = true)
  // NEVER use draft EPB statements -- they could throw off the signature.
  const mpaFilter = mpa === "general" ? undefined : mpa;

  // Source 1: Archived EPB statements for this AFSC
  let archivedQuery = supabase
    .from("refined_statements")
    .select("id, statement, mpa")
    .eq("user_id", userId)
    .eq("afsc", targetAfsc)
    .eq("statement_type", "epb")
    .not("source_epb_shell_id", "is", null) // Must come from an archived EPB
    .order("created_at", { ascending: false })
    .limit(20);

  if (mpaFilter) {
    archivedQuery = archivedQuery.eq("mpa", mpaFilter);
  }

  const { data: archivedStatements } = await archivedQuery;

  // Source 2: User-starred library statements for AI (use_as_llm_example = true)
  let starredQuery = supabase
    .from("refined_statements")
    .select("id, statement, mpa")
    .eq("user_id", userId)
    .eq("afsc", targetAfsc)
    .eq("statement_type", "epb")
    .eq("use_as_llm_example", true)
    .order("created_at", { ascending: false })
    .limit(15);

  if (mpaFilter) {
    starredQuery = starredQuery.eq("mpa", mpaFilter);
  }

  const { data: starredStatements } = await starredQuery;

  // Source 3: user_style_examples (curated by the system from finalized work)
  const examplesQuery = mpa === "general"
    ? supabase
        .from("user_style_examples")
        .select("id, statement_text")
        .eq("user_id", userId)
        .limit(5)
    : supabase
        .from("user_style_examples")
        .select("id, statement_text")
        .eq("user_id", userId)
        .eq("category", mpa)
        .limit(5);

  const { data: examples } = await examplesQuery;

  // Combine all quality sources, deduplicating by ID
  const allStatements: { id: string; text: string }[] = [];
  const seenIds = new Set<string>();

  const addStatements = (data: { id: string; statement: string }[] | null) => {
    if (!data) return;
    data.forEach(s => {
      if (!seenIds.has(s.id)) {
        seenIds.add(s.id);
        allStatements.push({ id: s.id, text: s.statement });
      }
    });
  };

  addStatements(archivedStatements as { id: string; statement: string }[] | null);
  addStatements(starredStatements as { id: string; statement: string }[] | null);

  if (examples) {
    (examples as { id: string; statement_text: string }[]).forEach(e => {
      if (!seenIds.has(e.id)) {
        seenIds.add(e.id);
        allStatements.push({ id: e.id, text: e.statement_text });
      }
    });
  }

  // Need at least 3 statements for a meaningful signature
  if (allStatements.length < 3) {
    return false;
  }

  // Compute source hash to detect staleness
  const sourceHash = computeSourceHash(allStatements.map(s => s.id));

  // Check if existing signature is still current
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase.from("style_signatures") as any)
    .select("id, source_hash, version")
    .eq("user_id", userId)
    .eq("target_rank", targetRank)
    .eq("target_afsc", targetAfsc)
    .eq("mpa", mpa)
    .maybeSingle();

  if (existing && (existing as { source_hash: string | null }).source_hash === sourceHash) {
    return false; // No change in source statements, skip regeneration
  }

  // Build the analysis prompt with the statements (text only, no IDs)
  const statementsBlock = allStatements
    .map((s, i) => `${i + 1}. ${s.text}`)
    .join("\n");

  const userPrompt = `Analyze the writing style of these ${allStatements.length} Air Force performance statements written for a ${targetRank} in AFSC ${targetAfsc}${mpa !== "general" ? ` under the "${mpa.replace(/_/g, " ")}" performance area` : ""}:\n\n${statementsBlock}`;

  // Use a fast, cheap model for fingerprint generation
  const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY || "",
  });

  const { text: rawResponse } = await generateText({
    model: openai("gpt-4o-mini"),
    system: FINGERPRINT_META_PROMPT,
    prompt: userPrompt,
    maxOutputTokens: 800,
    temperature: 0.3, // Low temperature for consistent analysis
  });

  // Parse the response: extract signature text and structured factors
  let signatureText = rawResponse;
  let signatureFactors: Record<string, unknown> = {};

  const jsonMatch = rawResponse.match(/```json\s*([\s\S]*?)```/);
  if (jsonMatch) {
    // Remove the JSON block from the signature text
    signatureText = rawResponse.replace(/```json[\s\S]*?```/, "").trim();
    try {
      signatureFactors = JSON.parse(jsonMatch[1].trim());
    } catch {
      // If JSON parsing fails, still keep the text signature
      signatureFactors = {};
    }
  }

  // Upsert the signature
  const newVersion = existing
    ? ((existing as { version: number }).version + 1)
    : 1;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("style_signatures") as any)
    .upsert(
      {
        user_id: userId,
        target_rank: targetRank,
        target_afsc: targetAfsc,
        mpa,
        signature_text: signatureText,
        signature_factors: signatureFactors,
        source_statement_count: allStatements.length,
        source_hash: sourceHash,
        version: newVersion,
      },
      { onConflict: "user_id,target_rank,target_afsc,mpa" }
    );

  if (error) {
    console.error("[style-signatures] Upsert error:", error.message);
    return false;
  }

  return true;
}

/**
 * Refresh all style signatures for a user.
 * Scans their finalized statements, groups by rank + AFSC + MPA,
 * and regenerates each unique combination.
 *
 * This is a heavier operation - call sparingly (on finalization, manual refresh).
 */
export async function refreshUserSignatures(userId: string): Promise<number> {
  const supabase = await createClient();

  // Get all unique rank + AFSC + MPA combinations from the user's statements
  // We need to determine the ratee's rank from EPB shells
  const { data: shells } = await supabase
    .from("epb_shells")
    .select("id, ratee_rank, ratee_afsc")
    .eq("user_id", userId);

  if (!shells || shells.length === 0) {
    return 0;
  }

  // Build a map of AFSC → rank for the user's ratees
  const afscRankPairs = new Set<string>();
  (shells as { id: string; ratee_rank: string | null; ratee_afsc: string | null }[]).forEach(s => {
    if (s.ratee_rank && s.ratee_afsc) {
      afscRankPairs.add(`${s.ratee_rank}|${s.ratee_afsc}`);
    }
  });

  let generated = 0;

  for (const pair of afscRankPairs) {
    const [rank, afsc] = pair.split("|");

    // Generate a general signature and per-MPA signatures
    for (const mpa of VALID_MPAS) {
      try {
        const result = await generateStyleSignature(userId, rank, afsc, mpa);
        if (result) generated++;
      } catch (err) {
        console.error(`[style-signatures] Error generating for ${rank}/${afsc}/${mpa}:`, err);
        // Continue with other combinations
      }
    }
  }

  return generated;
}

/**
 * Get a user's own style signature for a specific target rank + AFSC + MPA.
 * Returns null if no signature exists.
 */
export async function getUserStyleSignature(
  userId: string,
  targetRank: string,
  targetAfsc: string,
  mpa: string
): Promise<StyleSignature | null> {
  const supabase = await createClient();
  const normalizedMpa = normalizeMPA(mpa);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromSigs = () => supabase.from("style_signatures") as any;

  // Try exact match first
  const { data: exact } = await fromSigs()
    .select("*")
    .eq("user_id", userId)
    .eq("target_rank", targetRank)
    .eq("target_afsc", targetAfsc)
    .eq("mpa", normalizedMpa)
    .maybeSingle();

  if (exact) return exact as StyleSignature;

  // Fall back to "general" MPA for this rank+AFSC
  if (normalizedMpa !== "general") {
    const { data: general } = await fromSigs()
      .select("*")
      .eq("user_id", userId)
      .eq("target_rank", targetRank)
      .eq("target_afsc", targetAfsc)
      .eq("mpa", "general")
      .maybeSingle();

    if (general) return general as StyleSignature;
  }

  // Fall back to any MPA for this rank+AFSC (most recent)
  const { data: anyMpa } = await fromSigs()
    .select("*")
    .eq("user_id", userId)
    .eq("target_rank", targetRank)
    .eq("target_afsc", targetAfsc)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (anyMpa) return anyMpa as StyleSignature;

  // Final fallback: any signature for this AFSC regardless of rank
  const { data: anyRank } = await fromSigs()
    .select("*")
    .eq("user_id", userId)
    .eq("target_afsc", targetAfsc)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return anyRank as StyleSignature | null;
}

/**
 * Get the chain-of-command style signature for a user.
 *
 * Walks up the supervision chain, finds the highest-ranking supervisor
 * who has a style signature for the target rank + AFSC + MPA,
 * and returns it.
 *
 * Security: This function runs server-side with the authenticated user's
 * Supabase client. RLS on style_signatures allows reading supervisor signatures
 * via get_supervisor_chain(). No statement text is exposed.
 *
 * @param userId - The user requesting chain style
 * @param targetRank - Rank of the ratee being written about
 * @param targetAfsc - AFSC of the ratee being written about
 * @param mpa - MPA category key
 */
export async function getChainStyleSignature(
  userId: string,
  targetRank: string,
  targetAfsc: string,
  mpa: string
): Promise<ChainStyleResult> {
  const supabase = await createClient();
  const normalizedMpa = normalizeMPA(mpa);

  // Get the user's supervisor chain (ordered by depth)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: chain } = await (supabase.rpc as any)("get_supervisor_chain", { subordinate_uuid: userId });

  if (!chain || (chain as { supervisor_id: string; depth: number }[]).length === 0) {
    // No chain exists - try personal signature as fallback
    const personal = await getUserStyleSignature(userId, targetRank, targetAfsc, mpa);
    return {
      signature: personal,
      sourceRank: null,
      sourceDepth: null,
      fallbackUsed: personal ? "personal" : "no_signature",
    };
  }

  const typedChain = chain as { supervisor_id: string; depth: number }[];

  // Fetch profiles for all supervisors in the chain to get their ranks
  const supervisorIds = typedChain.map(c => c.supervisor_id);

  const { data: supervisorProfiles } = await supabase
    .from("profiles")
    .select("id, rank")
    .in("id", supervisorIds);

  if (!supervisorProfiles || supervisorProfiles.length === 0) {
    const personal = await getUserStyleSignature(userId, targetRank, targetAfsc, mpa);
    return {
      signature: personal,
      sourceRank: null,
      sourceDepth: null,
      fallbackUsed: personal ? "personal" : "no_signature",
    };
  }

  // Build a lookup map: supervisor_id → { rank, depth }
  const profileMap = new Map<string, { rank: string; depth: number }>();
  (supervisorProfiles as { id: string; rank: string | null }[]).forEach(p => {
    const chainEntry = typedChain.find(c => c.supervisor_id === p.id);
    if (p.rank && chainEntry) {
      profileMap.set(p.id, { rank: p.rank, depth: chainEntry.depth });
    }
  });

  // Sort supervisors by rank hierarchy (highest rank first), then by depth (closest first for ties)
  const sortedSupervisors = Array.from(profileMap.entries())
    .sort(([, a], [, b]) => {
      const rankDiff = getRankIndex(a.rank) - getRankIndex(b.rank);
      if (rankDiff !== 0) return rankDiff;
      return a.depth - b.depth;
    });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromSigs = () => supabase.from("style_signatures") as any;

  // Try each supervisor from highest rank down, looking for a matching signature
  for (const [supId, { rank, depth }] of sortedSupervisors) {
    // Try exact match: target_rank + target_afsc + mpa
    const { data: exact } = await fromSigs()
      .select("*")
      .eq("user_id", supId)
      .eq("target_rank", targetRank)
      .eq("target_afsc", targetAfsc)
      .eq("mpa", normalizedMpa)
      .maybeSingle();

    if (exact) {
      return {
        signature: exact as StyleSignature,
        sourceRank: rank,
        sourceDepth: depth,
        fallbackUsed: "none",
      };
    }

    // Try general MPA for same rank+AFSC
    if (normalizedMpa !== "general") {
      const { data: general } = await fromSigs()
        .select("*")
        .eq("user_id", supId)
        .eq("target_rank", targetRank)
        .eq("target_afsc", targetAfsc)
        .eq("mpa", "general")
        .maybeSingle();

      if (general) {
        return {
          signature: general as StyleSignature,
          sourceRank: rank,
          sourceDepth: depth,
          fallbackUsed: "none",
        };
      }
    }

    // Try any signature for just this AFSC (regardless of rank/MPA)
    const { data: anyMatch } = await fromSigs()
      .select("*")
      .eq("user_id", supId)
      .eq("target_afsc", targetAfsc)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (anyMatch) {
      return {
        signature: anyMatch as StyleSignature,
        sourceRank: rank,
        sourceDepth: depth,
        fallbackUsed: "none",
      };
    }
  }

  // No chain supervisor has a matching signature - fall back to personal
  const personal = await getUserStyleSignature(userId, targetRank, targetAfsc, mpa);
  return {
    signature: personal,
    sourceRank: null,
    sourceDepth: null,
    fallbackUsed: personal ? "personal" : "no_signature",
  };
}

/**
 * Build a style signature section for injection into an LLM system prompt.
 * Returns empty string if no signature data is available.
 */
export function buildSignaturePromptSection(
  signatureText: string,
  sourceRank?: string | null,
  fallbackUsed?: string
): string {
  if (!signatureText) return "";

  const sections: string[] = [
    "=== WRITING STYLE FINGERPRINT ===",
    "Match the following writing style patterns when generating statements.",
    "This fingerprint describes the preferred writing voice and structural patterns.",
    "Do NOT copy content from this description - only match the STYLE.",
  ];

  if (sourceRank && fallbackUsed === "none") {
    sections.push(`(Style derived from ${sourceRank}-level writing patterns)`);
  }

  sections.push("");
  sections.push(signatureText);

  return sections.join("\n");
}

// Export types for consumers
export type { StyleSignature, ChainStyleResult, StyleMPA };
