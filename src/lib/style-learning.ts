/**
 * Style Learning - Server-side utilities
 * 
 * Functions for fetching user style preferences and applying them to prompts.
 * Designed to be lightweight and fast - all heavy processing is done async.
 */

import { createClient } from "@/lib/supabase/server";
import type { UserStyleProfile, UserStyleExample, StyleExampleCategory } from "@/types/database";

/**
 * Compact style context for prompt injection
 */
export interface StyleContext {
  // Learned preferences (0-100 scale)
  sentenceLengthPref: number;
  verbIntensityPref: number;
  abbreviationPref: number;
  formality: number;
  // Revision preferences
  preferredAggressiveness: number;
  prefersFillToMax: boolean;
  // Version selection pattern (helps predict which version to prioritize)
  mostSelectedVersion: 1 | 2 | 3;
  // Few-shot examples for this category
  examples: string[];
  // Has enough data to personalize?
  hasEnoughData: boolean;
}

/**
 * Default style context (used when user has no data yet)
 */
const DEFAULT_STYLE_CONTEXT: StyleContext = {
  sentenceLengthPref: 50,
  verbIntensityPref: 50,
  abbreviationPref: 50,
  formality: 50,
  preferredAggressiveness: 50,
  prefersFillToMax: true,
  mostSelectedVersion: 1,
  examples: [],
  hasEnoughData: false,
};

/**
 * Fetch user's style context for a specific MPA category
 * Returns defaults if no profile exists yet
 */
export async function getUserStyleContext(
  userId: string,
  category?: StyleExampleCategory
): Promise<StyleContext> {
  try {
    const supabase = await createClient();

    // Fetch profile and examples in parallel
    const [profileResult, examplesResult] = await Promise.all([
      supabase
        .from("user_style_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle(),
      category
        ? supabase
            .from("user_style_examples")
            .select("statement_text")
            .eq("user_id", userId)
            .eq("category", category)
            .order("created_at", { ascending: false })
            .limit(3) // Get up to 3 examples for few-shot learning
        : Promise.resolve({ data: null }),
    ]);

    const profile = profileResult.data as UserStyleProfile | null;
    const examples = (examplesResult.data as Pick<UserStyleExample, "statement_text">[] | null) || [];

    if (!profile) {
      return {
        ...DEFAULT_STYLE_CONTEXT,
        examples: examples.map((e) => e.statement_text),
      };
    }

    // Determine most selected version
    const versionCounts = [
      profile.version_1_count,
      profile.version_2_count,
      profile.version_3_count,
    ];
    const maxVersionIndex = versionCounts.indexOf(Math.max(...versionCounts));
    const mostSelectedVersion = (maxVersionIndex + 1) as 1 | 2 | 3;

    // Determine if we have enough data to personalize
    const hasEnoughData = profile.total_revisions_selected >= 5 || profile.total_statements_analyzed >= 3;

    return {
      sentenceLengthPref: profile.sentence_length_pref,
      verbIntensityPref: profile.verb_intensity_pref,
      abbreviationPref: profile.abbreviation_pref,
      formality: profile.formality_pref,
      preferredAggressiveness: profile.avg_aggressiveness,
      prefersFillToMax: profile.fill_to_max_ratio > 50,
      mostSelectedVersion,
      examples: examples.map((e) => e.statement_text),
      hasEnoughData,
    };
  } catch {
    return DEFAULT_STYLE_CONTEXT;
  }
}

/**
 * Generate style guidance instructions for LLM prompts
 * Only generates guidance if user has enough interaction data
 */
export function buildStyleGuidance(context: StyleContext): string {
  if (!context.hasEnoughData) {
    return ""; // No personalization yet - use defaults
  }

  const lines: string[] = ["**USER STYLE PREFERENCES (learned from their choices):**"];

  // Sentence length preference
  if (context.sentenceLengthPref < 35) {
    lines.push("- This user prefers SHORT, punchy sentences. Keep it concise.");
  } else if (context.sentenceLengthPref > 65) {
    lines.push("- This user prefers LONGER, detailed sentences with more context.");
  }

  // Verb intensity
  if (context.verbIntensityPref < 35) {
    lines.push("- Use moderate, professional verbs (led, managed, directed).");
  } else if (context.verbIntensityPref > 65) {
    lines.push("- Use STRONG, impactful action verbs (pioneered, revolutionized, transformed).");
  }

  // Abbreviation preference
  if (context.abbreviationPref < 35) {
    lines.push("- Prefer full words over abbreviations.");
  } else if (context.abbreviationPref > 65) {
    lines.push("- Use abbreviations freely to save space (Amn, hrs, &, etc.).");
  }

  // Formality
  if (context.formality < 35) {
    lines.push("- Keep language accessible and clear.");
  } else if (context.formality > 65) {
    lines.push("- Use formal, technical military language.");
  }

  // Only add if we have specific preferences
  if (lines.length > 1) {
    return lines.join("\n");
  }

  return "";
}

/**
 * Generate few-shot examples section for prompts
 */
export function buildFewShotExamples(context: StyleContext, label: string = "EXAMPLES FROM THIS USER"): string {
  if (context.examples.length === 0) {
    return "";
  }

  const lines = [`**${label}:**`, "Learn from these statements the user has created/approved:"];
  
  context.examples.forEach((example, i) => {
    lines.push(`${i + 1}. "${example}"`);
  });

  return lines.join("\n");
}

/**
 * Apply learned style context to revision parameters
 * Returns adjusted parameters based on user preferences
 */
export function applyStyleToRevisionParams(
  context: StyleContext,
  requestedAggressiveness?: number,
  requestedFillToMax?: boolean
): { aggressiveness: number; fillToMax: boolean } {
  // Use requested values if provided, otherwise use learned preferences
  return {
    aggressiveness: requestedAggressiveness ?? context.preferredAggressiveness,
    fillToMax: requestedFillToMax ?? context.prefersFillToMax,
  };
}

/**
 * Process pending feedback events for a user
 * Call this after user actions that might generate new learning data.
 * Also triggers a background style signature refresh.
 */
export async function triggerStyleProcessing(userId: string): Promise<void> {
  try {
    const supabase = await createClient();
    
    // Fire and forget - don't await the result
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase.rpc as any)("process_style_feedback", {
      p_user_id: userId,
      p_batch_size: 20,
    })
      .then(() => {
        // Processing complete - no action needed
      })
      .catch(() => {
        // Silent fail - background processing shouldn't break anything
      });

    // Also trigger style signature refresh in the background
    // Import dynamically to avoid circular deps
    import("@/lib/style-signatures").then(({ refreshUserSignatures }) => {
      refreshUserSignatures(userId).catch(() => {
        // Silent fail - signature refresh is non-critical
      });
    }).catch(() => {
      // Silent fail
    });
  } catch {
    // Silent fail
  }
}

