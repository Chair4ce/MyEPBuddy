/**
 * Character Count Verification System
 * 
 * Provides utilities for verifying and enforcing character limits on generated statements.
 * Implements a retry-based approach to ensure LLM-generated content meets exact character requirements.
 * 
 * SAFETY FEATURES:
 * - Hard cap on max retries (MAX_ABSOLUTE_RETRIES = 3)
 * - Progress tracking - stops if retries aren't improving
 * - Oscillation detection - stops if LLM bounces between under/over
 * - "Close enough" threshold - accepts statements within acceptable tolerance
 * - Duplicate detection - prevents re-processing identical statements
 */

import { generateText, type LanguageModel } from "ai";

// ============================================================================
// SAFETY CONSTANTS - These are hard caps that cannot be overridden
// ============================================================================

/** Absolute maximum retries regardless of config - prevents runaway API calls */
const MAX_ABSOLUTE_RETRIES = 3;

/** Minimum improvement (in chars) required to continue retrying */
const MIN_IMPROVEMENT_THRESHOLD = 5;

/** If within this many chars of target, consider "close enough" and stop */
const CLOSE_ENOUGH_THRESHOLD = 15;

/** Maximum times direction can flip (under→over→under) before stopping */
const MAX_OSCILLATIONS = 2;

/**
 * Result of character validation
 */
export interface CharacterValidationResult {
  isCompliant: boolean;
  actualLength: number;
  targetMin: number;
  targetMax: number;
  variance: number; // percentage variance from target
  varianceDirection: "under" | "over" | "within";
  charsToAdjust: number; // positive = need to add, negative = need to remove
}

/**
 * Configuration for character verification
 */
export interface CharacterVerificationConfig {
  targetMax: number;
  targetMin?: number; // defaults to targetMax - 10
  tolerancePercent?: number; // defaults to 3% (±3% of target)
  maxRetries?: number; // defaults to 2, hard capped at MAX_ABSOLUTE_RETRIES
  model: LanguageModel;
  context?: string; // MPA or category context for better prompts
}

/**
 * Result from the enforcement process
 */
export interface EnforcementResult {
  statement: string;
  attempts: number;
  wasAdjusted: boolean;
  finalValidation: CharacterValidationResult;
  /** Why enforcement stopped (for debugging) */
  stopReason?: "compliant" | "max_retries" | "no_progress" | "oscillating" | "close_enough" | "duplicate" | "error";
}

/**
 * Validate a statement's character count against targets
 */
export function validateCharacterCount(
  statement: string,
  targetMax: number,
  targetMin?: number,
  tolerancePercent: number = 3
): CharacterValidationResult {
  const actualLength = statement.length;
  const effectiveMin = targetMin ?? Math.max(0, targetMax - 10);
  
  // Calculate variance as percentage of target
  const midTarget = (effectiveMin + targetMax) / 2;
  const variance = ((actualLength - midTarget) / midTarget) * 100;
  
  // Check compliance: within min-max range
  const isCompliant = actualLength >= effectiveMin && actualLength <= targetMax;
  
  // Determine direction of variance
  let varianceDirection: "under" | "over" | "within";
  if (actualLength < effectiveMin) {
    varianceDirection = "under";
  } else if (actualLength > targetMax) {
    varianceDirection = "over";
  } else {
    varianceDirection = "within";
  }
  
  // Calculate chars to adjust (positive = add, negative = remove)
  let charsToAdjust = 0;
  if (actualLength < effectiveMin) {
    charsToAdjust = effectiveMin - actualLength;
  } else if (actualLength > targetMax) {
    charsToAdjust = targetMax - actualLength; // negative
  }
  
  return {
    isCompliant,
    actualLength,
    targetMin: effectiveMin,
    targetMax,
    variance: Math.abs(variance),
    varianceDirection,
    charsToAdjust,
  };
}

/**
 * Build a character correction prompt that instructs the LLM to adjust length
 */
function buildCorrectionPrompt(
  statement: string,
  validation: CharacterValidationResult,
  context?: string
): string {
  const { actualLength, targetMin, targetMax, charsToAdjust, varianceDirection } = validation;
  
  if (varianceDirection === "under") {
    // Need to add characters
    return `**CRITICAL: CHARACTER COUNT ADJUSTMENT REQUIRED**

Current statement (${actualLength} characters):
"${statement}"

**PROBLEM**: This statement is ${Math.abs(charsToAdjust)} characters SHORT of the minimum requirement.

**TARGET**: ${targetMin}-${targetMax} characters (you MUST hit ${targetMin} AT MINIMUM)
**CURRENT**: ${actualLength} characters
**NEED TO ADD**: ${Math.abs(charsToAdjust)} characters

${context ? `**CONTEXT**: ${context}` : ""}

**TECHNIQUES TO ADD CHARACTERS (use these):**
1. Expand abbreviations: "led" → "directed", "ops" → "operations", "mbr" → "member"
2. Add scope adjectives: "systems" → "mission-critical systems", "team" → "high-performing team"
3. Quantify vagueness: "saved time" → "saved 40 man-hours monthly"
4. Add impact depth: "improved X" → "improved X, directly enabling Y"
5. Expand "&" to " and " where appropriate
6. Add organizational context: "for unit" → "for 500-member squadron"

**MANDATORY PROCESS:**
1. Rewrite the statement with added content
2. Count every character (letters, numbers, spaces, punctuation)
3. Verify you've reached AT LEAST ${targetMin} characters
4. If still short, add more until you hit the target

**FORBIDDEN:**
- Do NOT use em-dashes (--) or semicolons (;)
- Do NOT invent metrics not implied in the original
- Do NOT change the core meaning

Output ONLY the revised statement, no quotes, no explanation:`;
  } else {
    // Need to remove characters
    return `**CRITICAL: CHARACTER COUNT ADJUSTMENT REQUIRED**

Current statement (${actualLength} characters):
"${statement}"

**PROBLEM**: This statement is ${Math.abs(charsToAdjust)} characters OVER the maximum limit.

**TARGET**: ${targetMin}-${targetMax} characters (you MUST stay at ${targetMax} OR LESS)
**CURRENT**: ${actualLength} characters
**NEED TO REMOVE**: ${Math.abs(charsToAdjust)} characters

${context ? `**CONTEXT**: ${context}` : ""}

**TECHNIQUES TO REMOVE CHARACTERS (use these):**
1. Use abbreviations: "directed" → "led", "operations" → "ops", "members" → "mbrs"
2. Remove weak adjectives: "highly successful" → "successful", "mission-critical" → "critical"
3. Condense phrases: "in order to" → "to", "a total of" → ""
4. Use "&" instead of " and "
5. Remove redundant scope: "across the squadron" if scope is already implied
6. Combine clauses: two short phrases → one tighter phrase

**MANDATORY PROCESS:**
1. Rewrite the statement with condensed content
2. Count every character (letters, numbers, spaces, punctuation)
3. Verify you're at ${targetMax} characters OR LESS
4. If still over, trim more until you're within limit

**FORBIDDEN:**
- Do NOT remove critical metrics or impact
- Do NOT change the core meaning
- Do NOT use em-dashes (--) or semicolons (;)

Output ONLY the revised statement, no quotes, no explanation:`;
  }
}

/**
 * Enforce character limits on a statement with retry logic.
 * Will attempt to adjust the statement up to maxRetries times if it doesn't meet requirements.
 * 
 * SAFETY FEATURES:
 * - Hard cap at MAX_ABSOLUTE_RETRIES (3) regardless of config
 * - Stops if no meaningful progress is being made
 * - Stops if oscillating between under/over target
 * - Stops if "close enough" to target
 * - Prevents duplicate processing of same statement
 */
export async function enforceCharacterLimits(
  statement: string,
  config: CharacterVerificationConfig
): Promise<EnforcementResult> {
  const {
    targetMax,
    targetMin = Math.max(0, targetMax - 10),
    tolerancePercent = 3,
    maxRetries = 2,
    model,
    context,
  } = config;
  
  // SAFETY: Hard cap on retries regardless of what's passed in
  const effectiveMaxRetries = Math.min(maxRetries, MAX_ABSOLUTE_RETRIES);
  
  let currentStatement = statement;
  let attempts = 0;
  let wasAdjusted = false;
  let stopReason: EnforcementResult["stopReason"] = "compliant";
  
  // Track history to detect oscillation and lack of progress
  const seenStatements = new Set<string>();
  const directionHistory: Array<"under" | "over" | "within"> = [];
  let previousDeficit = Infinity;
  
  // Initial validation
  let validation = validateCharacterCount(currentStatement, targetMax, targetMin, tolerancePercent);
  
  // If already compliant, return immediately
  if (validation.isCompliant) {
    return {
      statement: currentStatement,
      attempts: 0,
      wasAdjusted: false,
      finalValidation: validation,
      stopReason: "compliant",
    };
  }
  
  // Check if already "close enough" - avoid API calls for minor deviations
  if (Math.abs(validation.charsToAdjust) <= CLOSE_ENOUGH_THRESHOLD) {
    return {
      statement: currentStatement,
      attempts: 0,
      wasAdjusted: false,
      finalValidation: validation,
      stopReason: "close_enough",
    };
  }
  
  // Track initial state
  seenStatements.add(currentStatement);
  directionHistory.push(validation.varianceDirection);
  previousDeficit = Math.abs(validation.charsToAdjust);
  
  // Retry loop with safety checks
  while (!validation.isCompliant && attempts < effectiveMaxRetries) {
    attempts++;
    wasAdjusted = true;
    
    try {
      const correctionPrompt = buildCorrectionPrompt(currentStatement, validation, context);
      
      const { text } = await generateText({
        model,
        system: `You are a precise text editor. Your ONLY job is to adjust the character count of a statement to meet exact requirements. You must be meticulous about counting characters. Every letter, number, space, and punctuation mark counts.`,
        prompt: correctionPrompt,
        temperature: 0.3, // Lower temperature for more precise adjustments
        maxTokens: 500,
      });
      
      // Clean the output
      const newStatement = text.trim().replace(/^["']|["']$/g, "");
      
      // SAFETY CHECK 1: Duplicate detection - LLM returned same statement
      if (seenStatements.has(newStatement)) {
        console.warn(`[CharVerify] Duplicate statement detected at attempt ${attempts}, stopping`);
        stopReason = "duplicate";
        break;
      }
      seenStatements.add(newStatement);
      
      // Update current statement
      currentStatement = newStatement;
      
      // Re-validate
      validation = validateCharacterCount(currentStatement, targetMax, targetMin, tolerancePercent);
      
      // If now compliant, we're done
      if (validation.isCompliant) {
        stopReason = "compliant";
        break;
      }
      
      // SAFETY CHECK 2: Close enough threshold
      const currentDeficit = Math.abs(validation.charsToAdjust);
      if (currentDeficit <= CLOSE_ENOUGH_THRESHOLD) {
        console.log(`[CharVerify] Within close-enough threshold (${currentDeficit} chars off), stopping`);
        stopReason = "close_enough";
        break;
      }
      
      // SAFETY CHECK 3: No meaningful progress
      const improvement = previousDeficit - currentDeficit;
      if (improvement < MIN_IMPROVEMENT_THRESHOLD && attempts > 1) {
        console.warn(`[CharVerify] Insufficient progress (${improvement} chars improved), stopping`);
        stopReason = "no_progress";
        break;
      }
      
      // SAFETY CHECK 4: Oscillation detection (under→over→under or vice versa)
      directionHistory.push(validation.varianceDirection);
      const oscillationCount = countOscillations(directionHistory);
      if (oscillationCount >= MAX_OSCILLATIONS) {
        console.warn(`[CharVerify] Oscillation detected (${oscillationCount} flips), stopping`);
        stopReason = "oscillating";
        break;
      }
      
      // Update for next iteration
      previousDeficit = currentDeficit;
      
    } catch (error) {
      console.error(`[CharVerify] Attempt ${attempts} failed:`, error);
      stopReason = "error";
      break;
    }
  }
  
  // If we exited due to max retries
  if (stopReason === "compliant" && !validation.isCompliant) {
    stopReason = "max_retries";
  }
  
  return {
    statement: currentStatement,
    attempts,
    wasAdjusted,
    finalValidation: validation,
    stopReason,
  };
}

/**
 * Count direction changes (oscillations) in the history
 * e.g., [under, over, under] = 2 oscillations
 */
function countOscillations(history: Array<"under" | "over" | "within">): number {
  let oscillations = 0;
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const curr = history[i];
    // Count a flip between under and over (ignoring "within")
    if (
      (prev === "under" && curr === "over") ||
      (prev === "over" && curr === "under")
    ) {
      oscillations++;
    }
  }
  return oscillations;
}

/** Maximum concurrent enforcement operations to prevent API overload */
const MAX_CONCURRENT_ENFORCEMENTS = 3;

/**
 * Enforce character limits on multiple statements with controlled concurrency.
 * Processes statements in batches to prevent overwhelming the API.
 */
export async function enforceCharacterLimitsMultiple(
  statements: string[],
  config: CharacterVerificationConfig
): Promise<EnforcementResult[]> {
  const results: EnforcementResult[] = [];
  
  // Process in batches to limit concurrency
  for (let i = 0; i < statements.length; i += MAX_CONCURRENT_ENFORCEMENTS) {
    const batch = statements.slice(i, i + MAX_CONCURRENT_ENFORCEMENTS);
    const batchResults = await Promise.all(
      batch.map((stmt) => enforceCharacterLimits(stmt, config))
    );
    results.push(...batchResults);
  }
  
  return results;
}

/**
 * Quick pre-check to determine if enforcement is even needed.
 * Use this before calling enforceCharacterLimits to skip unnecessary API calls.
 */
export function shouldAttemptEnforcement(
  statement: string,
  targetMax: number,
  targetMin?: number
): { shouldEnforce: boolean; reason: string } {
  const validation = validateCharacterCount(statement, targetMax, targetMin);
  
  if (validation.isCompliant) {
    return { shouldEnforce: false, reason: "already_compliant" };
  }
  
  // Don't bother if within "close enough" threshold
  if (Math.abs(validation.charsToAdjust) <= CLOSE_ENOUGH_THRESHOLD) {
    return { shouldEnforce: false, reason: "close_enough" };
  }
  
  // Don't attempt if way too far off (likely bad generation, not worth fixing)
  const extremeThreshold = targetMax * 0.5; // 50% off is too extreme
  if (Math.abs(validation.charsToAdjust) > extremeThreshold) {
    return { shouldEnforce: false, reason: "too_far_off" };
  }
  
  return { shouldEnforce: true, reason: "needs_adjustment" };
}

/**
 * Build enhanced generation prompt that emphasizes character requirements
 * This is injected into generation prompts to improve first-pass accuracy
 */
export function buildCharacterEmphasisPrompt(
  targetMin: number,
  targetMax: number,
  mode: "expand" | "compress" | "generate" = "generate"
): string {
  const midTarget = Math.floor((targetMin + targetMax) / 2);
  
  return `
**⚠️ MANDATORY CHARACTER COUNT REQUIREMENT ⚠️**

Your output MUST be EXACTLY ${targetMin}-${targetMax} characters.
Target sweet spot: ~${midTarget} characters.

**CHARACTER COUNTING PROCESS (DO THIS FOR EVERY STATEMENT):**
1. Write your statement
2. Count EVERY character:
   - Letters (a-z, A-Z) = 1 each
   - Numbers (0-9) = 1 each  
   - Spaces = 1 each
   - Punctuation (.,;:!?-()) = 1 each
3. If count is below ${targetMin}: ADD words, expand abbreviations, add adjectives
4. If count is above ${targetMax}: TRIM words, use abbreviations, condense phrases
5. VERIFY final count is ${targetMin}-${targetMax} before outputting

**${mode === "expand" ? "EXPANSION" : mode === "compress" ? "COMPRESSION" : "GENERATION"} TECHNIQUES:**
${mode === "expand" || mode === "generate" ? `
TO ADD CHARACTERS:
- "led" → "directed" (+5), "built" → "established" (+6)
- "ops" → "operations" (+7), "mbr" → "member" (+4)
- Add scope: "team" → "12-member team" (+10)
- Add adjectives: "results" → "exceptional results" (+12)
- Expand "&" to " and " (+3 each)
` : ""}
${mode === "compress" || mode === "generate" ? `
TO REMOVE CHARACTERS:
- "directed" → "led" (-5), "established" → "built" (-6)
- "operations" → "ops" (-7), "members" → "mbrs" (-4)
- " and " → "&" (-3 each)
- Remove weak words: "very", "highly", "overall"
` : ""}

**COMPLIANCE IS NON-NEGOTIABLE**: Statements outside ${targetMin}-${targetMax} range will be rejected.
`;
}

/**
 * Quick check if a statement is within acceptable range
 */
export function isWithinRange(
  statement: string,
  targetMax: number,
  targetMin?: number
): boolean {
  const len = statement.length;
  const min = targetMin ?? Math.max(0, targetMax - 10);
  return len >= min && len <= targetMax;
}

/**
 * Calculate how far off a statement is from the target
 */
export function getCharacterDeficit(
  statement: string,
  targetMax: number,
  targetMin?: number
): { deficit: number; direction: "under" | "over" | "ok" } {
  const len = statement.length;
  const min = targetMin ?? Math.max(0, targetMax - 10);
  
  if (len < min) {
    return { deficit: min - len, direction: "under" };
  } else if (len > targetMax) {
    return { deficit: len - targetMax, direction: "over" };
  }
  return { deficit: 0, direction: "ok" };
}
