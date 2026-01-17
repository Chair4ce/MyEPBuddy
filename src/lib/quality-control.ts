/**
 * Quality Control System for Generated Statements
 * 
 * Provides a consolidated quality check that performs all validation in a SINGLE LLM call:
 * - Character count enforcement
 * - Statement diversity check (are versions different enough?)
 * - Instruction compliance (did LLM follow the user's custom prompt?)
 * - Returns improved statements + evaluation feedback
 * 
 * DESIGN PRINCIPLE: Minimize API calls by combining all QC checks into one pass.
 * Flow: Generate → QC Pass (single call) → Return to user
 */

import { generateText, type LanguageModel } from "ai";
import { validateCharacterCount, type CharacterValidationResult } from "./character-verification";

// ============================================================================
// STATEMENT SANITIZATION
// ============================================================================

/**
 * Patterns that indicate a malformed/garbage statement
 */
const MALFORMED_PATTERNS = [
  /\.\.\s*/,  // ".." - double period (truncation indicator)
  /\.\s+[A-Z][a-z]+\s+\d+\s+[A-Za-z]+\s*$/,  // Incomplete trailing sentence at end
  /[a-z]{3,}\s*$/,  // Ends with incomplete word (no punctuation)
  /\d+\s*$/,  // Ends with just a number (truncated mid-phrase like "execute 96")
  /,\s*$/,  // Ends with comma
  /;\s*$/,  // Ends with semicolon (also banned)
  /\s{2,}/,  // Multiple consecutive spaces
  /\.{2,}/,  // Multiple consecutive periods
  /to\s+(execute|perform|complete|deliver)\s+\d+\s*$/i,  // "to execute 96" - truncated action
  /\b(with|for|of|to|and|&)\s*$/i,  // Ends with preposition/conjunction
];

/**
 * Banned words/phrases that should not appear
 */
const BANNED_WORDS = [
  "spearheaded",
  "orchestrated",
  "synergized",
  "leveraged",
  "facilitated",
  "utilized",
  "impacted",
  "w/ ",  // Banned abbreviation - not standard for EPBs
];

/**
 * Check if a statement has malformed content (garbage filler, incomplete sentences, etc.)
 */
export function detectMalformedStatement(statement: string): {
  isMalformed: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  
  // Check for malformed patterns
  for (const pattern of MALFORMED_PATTERNS) {
    if (pattern.test(statement)) {
      issues.push(`Contains malformed pattern: ${pattern.source}`);
    }
  }
  
  // Check for banned words
  const lowerStatement = statement.toLowerCase();
  for (const word of BANNED_WORDS) {
    if (lowerStatement.includes(word)) {
      issues.push(`Contains banned word: "${word}"`);
    }
  }
  
  // Check for incomplete ending (doesn't end with period or proper punctuation)
  if (!/[.!]$/.test(statement.trim())) {
    issues.push("Statement doesn't end with proper punctuation");
  }
  
  // Check for multiple sentences (shouldn't have multiple periods except abbreviations)
  const periodCount = (statement.match(/\.\s+[A-Z]/g) || []).length;
  if (periodCount > 0) {
    issues.push("Contains multiple sentences (should be single flowing statement)");
  }
  
  return {
    isMalformed: issues.length > 0,
    issues,
  };
}

/**
 * Clean up a statement by removing malformed content
 */
export function sanitizeStatement(statement: string): string {
  let cleaned = statement;
  
  // AGGRESSIVE: If we see ".." anywhere, split there and only keep first part
  if (cleaned.includes("..")) {
    const parts = cleaned.split("..");
    cleaned = parts[0].trim();
    if (!cleaned.endsWith(".")) {
      cleaned += ".";
    }
    console.log(`[Sanitize] Removed content after ".." - keeping first sentence only`);
  }
  
  // Fix any remaining double periods
  cleaned = cleaned.replace(/\.{2,}/g, ".");
  
  // Check for truncated endings and fix them
  const truncatedEndings = [
    /\s+to\s+(execute|perform|complete|deliver)\s+\d+\s*\.?$/i,  // "to execute 96"
    /\s+\d+\s*\.?$/,  // ends with just a number like "execute 96"
    /\s+(with|for|of|to|and|&)\s*\.?$/i,  // ends with preposition
    /\s+[a-z]{1,3}\s*\.?$/i,  // ends with tiny word fragment
  ];
  
  for (const pattern of truncatedEndings) {
    if (pattern.test(cleaned)) {
      // Find last complete sentence before truncation
      const lastGoodPeriod = cleaned.lastIndexOf(".", cleaned.length - 15);
      if (lastGoodPeriod > cleaned.length * 0.4) {
        cleaned = cleaned.substring(0, lastGoodPeriod + 1);
        console.log(`[Sanitize] Removed truncated ending`);
      }
      break;
    }
  }
  
  // Split into sentences and validate each
  const sentences = cleaned.split(/(?<=\.)\s+/);
  const completeSentences: string[] = [];
  
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length === 0) continue;
    
    const endsWithPeriod = /\.$/.test(trimmed);
    const endsWithNumber = /\d\s*$/.test(trimmed) && !endsWithPeriod;
    const endsWithTruncation = /[a-z]{2,}$/.test(trimmed) && !endsWithPeriod;
    const endsWithComma = /,$/.test(trimmed);
    
    if (endsWithPeriod && trimmed.length > 20) {
      // Good complete sentence
      completeSentences.push(trimmed);
    } else if (endsWithTruncation || endsWithComma || endsWithNumber) {
      // Truncated - try to salvage
      const lastPeriod = trimmed.lastIndexOf(".");
      if (lastPeriod > trimmed.length * 0.5) {
        completeSentences.push(trimmed.substring(0, lastPeriod + 1));
      }
      break; // Stop processing - rest is garbage
    } else if (!endsWithPeriod && trimmed.length > 20) {
      // Might be okay, add period
      completeSentences.push(trimmed + ".");
    }
  }
  
  cleaned = completeSentences.join(" ");
  
  // Fix multiple spaces
  cleaned = cleaned.replace(/\s{2,}/g, " ");
  
  // Ensure ends with period
  cleaned = cleaned.trim();
  if (cleaned.length > 0 && !/[.!]$/.test(cleaned)) {
    cleaned += ".";
  }
  
  return cleaned;
}

/**
 * Replacement map for banned words
 */
const BANNED_WORD_REPLACEMENTS: Record<string, string> = {
  "spearheaded": "led",
  "orchestrated": "coordinated",
  "synergized": "integrated",
  "leveraged": "used",
  "facilitated": "enabled",
  "utilized": "used",
  "impacted": "improved",
};

/**
 * Replace banned words with acceptable alternatives
 */
export function replaceBannedWords(statement: string): string {
  let result = statement;
  
  for (const [banned, replacement] of Object.entries(BANNED_WORD_REPLACEMENTS)) {
    // Case-insensitive replacement, preserving case of first letter
    const regex = new RegExp(`\\b${banned}\\b`, "gi");
    result = result.replace(regex, (match) => {
      // Preserve capitalization
      if (match[0] === match[0].toUpperCase()) {
        return replacement.charAt(0).toUpperCase() + replacement.slice(1);
      }
      return replacement;
    });
  }
  
  return result;
}

/**
 * Abbreviation entry from user settings
 */
export interface Abbreviation {
  word: string;
  abbreviation: string;
}

/**
 * Acronym entry from user settings
 */
export interface Acronym {
  acronym: string;
  definition: string;
}

/**
 * Apply user's abbreviations to a statement (full word → abbreviation)
 * This helps shorten statements to fit character limits
 */
export function applyAbbreviations(statement: string, abbreviations: Abbreviation[]): string {
  let result = statement;
  
  for (const abbr of abbreviations) {
    if (!abbr.word || !abbr.abbreviation) continue;
    
    // Case-insensitive word boundary match
    const regex = new RegExp(`\\b${escapeRegExp(abbr.word)}\\b`, "gi");
    result = result.replace(regex, (match) => {
      // Try to preserve case - if original starts uppercase, capitalize abbreviation
      if (match[0] === match[0].toUpperCase() && abbr.abbreviation.length > 0) {
        return abbr.abbreviation.charAt(0).toUpperCase() + abbr.abbreviation.slice(1);
      }
      return abbr.abbreviation;
    });
  }
  
  return result;
}

/**
 * Apply user's acronyms to a statement (full definition → acronym)
 * This helps shorten statements by replacing full phrases with their acronyms
 */
export function applyAcronyms(statement: string, acronyms: Acronym[]): string {
  let result = statement;
  
  // Sort by definition length descending to match longer phrases first
  const sortedAcronyms = [...acronyms].sort((a, b) => 
    b.definition.length - a.definition.length
  );
  
  for (const acro of sortedAcronyms) {
    if (!acro.acronym || !acro.definition) continue;
    
    // Case-insensitive match for the full definition
    const regex = new RegExp(`\\b${escapeRegExp(acro.definition)}\\b`, "gi");
    result = result.replace(regex, acro.acronym);
  }
  
  return result;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Apply both abbreviations and acronyms to a statement
 */
export function applyAllShortening(
  statement: string, 
  abbreviations: Abbreviation[] = [], 
  acronyms: Acronym[] = []
): { result: string; changesMade: number } {
  let result = statement;
  let changesMade = 0;
  
  // First apply acronyms (longer phrases)
  const afterAcronyms = applyAcronyms(result, acronyms);
  if (afterAcronyms !== result) {
    changesMade++;
    result = afterAcronyms;
  }
  
  // Then apply abbreviations (single words)
  const afterAbbreviations = applyAbbreviations(result, abbreviations);
  if (afterAbbreviations !== result) {
    changesMade++;
    result = afterAbbreviations;
  }
  
  return { result, changesMade };
}

/**
 * Sanitize multiple statements and log issues
 */
export function sanitizeStatements(
  statements: string[],
  abbreviations: Abbreviation[] = [],
  acronyms: Acronym[] = []
): {
  sanitized: string[];
  hadIssues: boolean;
  issueCount: number;
} {
  let issueCount = 0;
  
  const sanitized = statements.map((stmt, i) => {
    let result = stmt;
    
    // First, replace banned words
    const afterBannedReplace = replaceBannedWords(result);
    if (afterBannedReplace !== result) {
      console.log(`[QC] Statement ${i + 1}: Replaced banned words`);
      result = afterBannedReplace;
      issueCount++;
    }
    
    // Apply abbreviations and acronyms from user settings
    const shortening = applyAllShortening(result, abbreviations, acronyms);
    if (shortening.changesMade > 0) {
      console.log(`[QC] Statement ${i + 1}: Applied abbreviations/acronyms`);
      result = shortening.result;
    }
    
    // Then check for structural malformation
    const check = detectMalformedStatement(result);
    if (check.isMalformed) {
      // Filter out the "banned word" issues since we already handled those
      const structuralIssues = check.issues.filter(i => !i.includes("banned word"));
      if (structuralIssues.length > 0) {
        console.warn(`[QC] Statement ${i + 1} has structural issues:`, structuralIssues);
        result = sanitizeStatement(result);
        issueCount++;
      }
    }
    
    return result;
  });
  
  return {
    sanitized,
    hadIssues: issueCount > 0,
    issueCount,
  };
}

// ============================================================================
// TYPES
// ============================================================================

export interface QualityControlConfig {
  /** The statements to evaluate and potentially improve */
  statements: string[];
  /** The user's custom prompt/instructions that generated these statements */
  userPrompt: string;
  /** Target maximum character count */
  targetMaxChars: number;
  /** Target minimum character count (defaults to targetMaxChars - 10) */
  targetMinChars?: number;
  /** Whether to aggressively fill to max characters */
  fillToMax: boolean;
  /** Additional context (MPA label, rank, etc.) */
  context?: string;
  /** The LLM model to use for QC */
  model: LanguageModel;
  /** Minimum diversity score required (0-100, default 60) */
  minDiversityScore?: number;
  /** Minimum instruction compliance score required (0-100, default 70) */
  minComplianceScore?: number;
}

export interface StatementEvaluation {
  /** Index of the statement */
  index: number;
  /** Original statement length */
  originalLength: number;
  /** Current character count */
  characterCount: number;
  /** Whether it meets character requirements */
  meetsCharacterLimit: boolean;
  /** How well it followed the prompt instructions (0-100) */
  instructionCompliance: number;
  /** Brief feedback on what could be improved */
  feedback: string;
}

export interface QualityControlResult {
  /** The improved statements (or originals if no changes needed) */
  statements: string[];
  /** Whether any statements were adjusted */
  wasAdjusted: boolean;
  /** Overall evaluation scores */
  evaluation: {
    /** Average instruction compliance across all statements (0-100) */
    instructionCompliance: number;
    /** How different the statement versions are from each other (0-100) */
    diversityScore: number;
    /** Whether all statements meet character requirements */
    allMeetCharacterLimits: boolean;
    /** Individual statement evaluations */
    statementEvaluations: StatementEvaluation[];
    /** Summary feedback for the user */
    overallFeedback: string;
    /** Whether the QC pass was successful */
    passed: boolean;
  };
  /** Reason QC stopped */
  stopReason: "passed" | "improved" | "max_attempts" | "error" | "skipped";
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Minimum diversity score - if statements are too similar, flag it */
const DEFAULT_MIN_DIVERSITY = 60;

/** Minimum instruction compliance score */
const DEFAULT_MIN_COMPLIANCE = 70;

/** Only do QC if we have enough content to evaluate */
const MIN_STATEMENT_LENGTH = 50;

// ============================================================================
// MAIN QUALITY CONTROL FUNCTION
// ============================================================================

/**
 * Perform a single-pass quality control check on generated statements.
 * 
 * This combines:
 * - Character count validation and enforcement
 * - Statement diversity analysis
 * - Instruction compliance verification
 * 
 * All done in ONE LLM call to minimize API usage.
 */
export async function performQualityControl(
  config: QualityControlConfig
): Promise<QualityControlResult> {
  const {
    statements,
    userPrompt,
    targetMaxChars,
    targetMinChars = Math.max(0, targetMaxChars - 10),
    fillToMax,
    context,
    model,
    minDiversityScore = DEFAULT_MIN_DIVERSITY,
    minComplianceScore = DEFAULT_MIN_COMPLIANCE,
  } = config;

  // Quick validation - skip QC if no statements or statements too short
  if (statements.length === 0) {
    return createSkippedResult(statements, "No statements to evaluate");
  }

  const validStatements = statements.filter(s => s.length >= MIN_STATEMENT_LENGTH);
  if (validStatements.length === 0) {
    return createSkippedResult(statements, "Statements too short for QC");
  }

  // Pre-validate character counts
  const charValidations = statements.map(s => 
    validateCharacterCount(s, targetMaxChars, targetMinChars)
  );
  
  // Check if all statements already meet character requirements
  const allMeetCharLimits = charValidations.every(v => v.isCompliant);
  
  // If fillToMax is disabled and all meet limits, we might still want to check diversity/compliance
  // But if fillToMax is enabled and some don't meet limits, we need to fix them
  
  try {
    // Build the QC prompt
    const qcPrompt = buildQualityControlPrompt({
      statements,
      userPrompt,
      targetMaxChars,
      targetMinChars,
      fillToMax,
      context,
      charValidations,
    });

    // Single LLM call for all QC
    const { text } = await generateText({
      model,
      system: buildQCSystemPrompt(),
      prompt: qcPrompt,
      temperature: 0.3, // Lower temp for more consistent evaluation
      maxTokens: 2000, // Enough for multiple statements + evaluation
    });

    // Parse the QC response
    const qcResult = parseQCResponse(text, statements, targetMaxChars, targetMinChars);
    
    // Post-QC sanitization: clean up any malformed statements the LLM may have created
    const sanitizationResult = sanitizeStatements(qcResult.statements);
    if (sanitizationResult.hadIssues) {
      console.warn(`[QualityControl] Sanitized ${sanitizationResult.issueCount} malformed statement(s)`);
      qcResult.statements = sanitizationResult.sanitized;
      qcResult.evaluation.overallFeedback += ` (${sanitizationResult.issueCount} statement(s) were cleaned up)`;
    }
    
    return qcResult;

  } catch (error) {
    console.error("[QualityControl] Error during QC pass:", error);
    
    // Return original statements with error status
    return {
      statements,
      wasAdjusted: false,
      evaluation: {
        instructionCompliance: 0,
        diversityScore: 0,
        allMeetCharacterLimits: allMeetCharLimits,
        statementEvaluations: statements.map((s, i) => ({
          index: i,
          originalLength: s.length,
          characterCount: s.length,
          meetsCharacterLimit: charValidations[i]?.isCompliant ?? false,
          instructionCompliance: 0,
          feedback: "QC evaluation failed",
        })),
        overallFeedback: "Quality control evaluation encountered an error",
        passed: false,
      },
      stopReason: "error",
    };
  }
}

// ============================================================================
// PROMPT BUILDERS
// ============================================================================

function buildQCSystemPrompt(): string {
  return `You are a Quality Control specialist for military performance statements. Your job is to:

1. EVALUATE: Score how well statements follow the original instructions
2. ANALYZE: Check if multiple versions are distinct enough from each other
3. IMPROVE: If statements don't meet requirements, provide corrected versions
4. ENFORCE: Ensure character counts are within specified limits

You must be OBJECTIVE and PRECISE. Count characters exactly. Identify specific issues.

**CRITICAL RULES:**
- Each statement must be ONE complete, flowing sentence
- NEVER add a second sentence or fragment to "fill" character count
- NEVER end a statement with ".." or start a new thought after a period
- If you need more characters, EXPAND existing content (add adjectives, metrics, scope) - don't append new sentences
- If a statement is slightly short, it's better to be short than to add garbage filler

**BANNED WORDS (never use):** Spearheaded, Orchestrated, Synergized, Leveraged, Facilitated, Utilized, Impacted

CRITICAL: Output ONLY valid JSON. No explanations outside the JSON structure.`;
}

interface QCPromptParams {
  statements: string[];
  userPrompt: string;
  targetMaxChars: number;
  targetMinChars: number;
  fillToMax: boolean;
  context?: string;
  charValidations: CharacterValidationResult[];
}

function buildQualityControlPrompt(params: QCPromptParams): string {
  const {
    statements,
    userPrompt,
    targetMaxChars,
    targetMinChars,
    fillToMax,
    context,
    charValidations,
  } = params;

  // Build statement list with current char counts
  const statementsList = statements.map((s, i) => {
    const validation = charValidations[i];
    const status = validation.isCompliant 
      ? "✓ COMPLIANT" 
      : validation.varianceDirection === "under" 
        ? `❌ SHORT by ${Math.abs(validation.charsToAdjust)} chars`
        : `❌ OVER by ${Math.abs(validation.charsToAdjust)} chars`;
    
    return `[STATEMENT ${i + 1}] (${s.length} chars - ${status})
"${s}"`;
  }).join("\n\n");

  // Extract key requirements from user prompt (first 500 chars as summary)
  const promptSummary = userPrompt.length > 500 
    ? userPrompt.substring(0, 500) + "..."
    : userPrompt;

  return `## QUALITY CONTROL EVALUATION

### ORIGINAL INSTRUCTIONS (what the user requested):
${promptSummary}

### CONTEXT:
${context || "General EPB statement"}

### CHARACTER REQUIREMENTS:
- Target Range: ${targetMinChars}-${targetMaxChars} characters
- Fill to Max: ${fillToMax ? "YES - statements should be as close to max as possible" : "NO - just stay within range"}

### STATEMENTS TO EVALUATE:
${statementsList}

---

## YOUR TASK:

1. **INSTRUCTION COMPLIANCE** (0-100 per statement):
   - Did each statement follow the key requirements from the original instructions?
   - Did it use the right structure, avoid banned words, include impacts?

2. **DIVERSITY ANALYSIS** (0-100 overall):
   - How different are these statement versions from each other?
   - 100 = completely unique approaches
   - 50 = some variation but similar structure
   - 0 = nearly identical copies

3. **CHARACTER ENFORCEMENT** (if needed):
   ${fillToMax 
     ? `- Any statement NOT in the ${targetMinChars}-${targetMaxChars} range MUST be rewritten
   - Expand short statements: use longer synonyms, add scope, expand abbreviations
   - Compress long statements: use abbreviations, remove weak adjectives, condense phrases`
     : `- Only flag statements outside the ${targetMinChars}-${targetMaxChars} range`}

4. **IMPROVED VERSIONS** (if needed):
   - If a statement fails compliance OR character count, provide an improved version
   - If statement is good, return it unchanged

---

## REQUIRED OUTPUT FORMAT (JSON ONLY):

\`\`\`json
{
  "evaluation": {
    "diversityScore": <0-100>,
    "overallFeedback": "<1-2 sentence summary of quality>",
    "passed": <true/false - true if all statements meet requirements>
  },
  "statements": [
    {
      "index": 0,
      "instructionCompliance": <0-100>,
      "characterCount": <exact count>,
      "meetsCharacterLimit": <true/false>,
      "feedback": "<brief note on this statement>",
      "improved": "<the statement - improved if needed, original if fine>"
    }
    // ... one entry per statement
  ]
}
\`\`\`

OUTPUT ONLY THE JSON. NO OTHER TEXT.`;
}

// ============================================================================
// RESPONSE PARSER
// ============================================================================

interface ParsedQCResponse {
  evaluation: {
    diversityScore: number;
    overallFeedback: string;
    passed: boolean;
  };
  statements: Array<{
    index: number;
    instructionCompliance: number;
    characterCount: number;
    meetsCharacterLimit: boolean;
    feedback: string;
    improved: string;
  }>;
}

function parseQCResponse(
  response: string,
  originalStatements: string[],
  targetMaxChars: number,
  targetMinChars: number
): QualityControlResult {
  try {
    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = response.trim();
    
    // Remove markdown code fences if present
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }
    
    const parsed: ParsedQCResponse = JSON.parse(jsonStr);
    
    // Build the result
    const improvedStatements: string[] = [];
    const statementEvaluations: StatementEvaluation[] = [];
    let wasAdjusted = false;
    let totalCompliance = 0;
    
    for (let i = 0; i < originalStatements.length; i++) {
      const stmtResult = parsed.statements.find(s => s.index === i);
      
      if (stmtResult) {
        const improved = stmtResult.improved || originalStatements[i];
        improvedStatements.push(improved);
        
        // Check if it was actually changed
        if (improved !== originalStatements[i]) {
          wasAdjusted = true;
        }
        
        // Validate the improved statement's character count
        const validation = validateCharacterCount(improved, targetMaxChars, targetMinChars);
        
        statementEvaluations.push({
          index: i,
          originalLength: originalStatements[i].length,
          characterCount: improved.length,
          meetsCharacterLimit: validation.isCompliant,
          instructionCompliance: stmtResult.instructionCompliance || 0,
          feedback: stmtResult.feedback || "",
        });
        
        totalCompliance += stmtResult.instructionCompliance || 0;
      } else {
        // Statement not found in response - keep original
        improvedStatements.push(originalStatements[i]);
        const validation = validateCharacterCount(originalStatements[i], targetMaxChars, targetMinChars);
        
        statementEvaluations.push({
          index: i,
          originalLength: originalStatements[i].length,
          characterCount: originalStatements[i].length,
          meetsCharacterLimit: validation.isCompliant,
          instructionCompliance: 50, // Default middle score
          feedback: "Not evaluated",
        });
        
        totalCompliance += 50;
      }
    }
    
    const avgCompliance = originalStatements.length > 0 
      ? Math.round(totalCompliance / originalStatements.length) 
      : 0;
    
    const allMeetCharLimits = statementEvaluations.every(e => e.meetsCharacterLimit);
    
    return {
      statements: improvedStatements,
      wasAdjusted,
      evaluation: {
        instructionCompliance: avgCompliance,
        diversityScore: parsed.evaluation?.diversityScore ?? 50,
        allMeetCharacterLimits: allMeetCharLimits,
        statementEvaluations,
        overallFeedback: parsed.evaluation?.overallFeedback || "Quality control completed",
        passed: parsed.evaluation?.passed ?? (avgCompliance >= 70 && allMeetCharLimits),
      },
      stopReason: wasAdjusted ? "improved" : "passed",
    };
    
  } catch (parseError) {
    console.error("[QualityControl] Failed to parse QC response:", parseError);
    console.error("[QualityControl] Raw response:", response.substring(0, 500));
    
    // Return original statements with parse error
    return {
      statements: originalStatements,
      wasAdjusted: false,
      evaluation: {
        instructionCompliance: 0,
        diversityScore: 0,
        allMeetCharacterLimits: false,
        statementEvaluations: originalStatements.map((s, i) => ({
          index: i,
          originalLength: s.length,
          characterCount: s.length,
          meetsCharacterLimit: false,
          instructionCompliance: 0,
          feedback: "Failed to parse QC response",
        })),
        overallFeedback: "Quality control response could not be parsed",
        passed: false,
      },
      stopReason: "error",
    };
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function createSkippedResult(statements: string[], reason: string): QualityControlResult {
  return {
    statements,
    wasAdjusted: false,
    evaluation: {
      instructionCompliance: 100,
      diversityScore: 100,
      allMeetCharacterLimits: true,
      statementEvaluations: statements.map((s, i) => ({
        index: i,
        originalLength: s.length,
        characterCount: s.length,
        meetsCharacterLimit: true,
        instructionCompliance: 100,
        feedback: reason,
      })),
      overallFeedback: reason,
      passed: true,
    },
    stopReason: "skipped",
  };
}

/**
 * Quick check to determine if QC is worth running
 */
export function shouldRunQualityControl(
  statements: string[],
  fillToMax: boolean,
  targetMaxChars: number,
  targetMinChars?: number
): { shouldRun: boolean; reason: string } {
  // No statements
  if (statements.length === 0) {
    return { shouldRun: false, reason: "no_statements" };
  }
  
  // Single short statement - not worth QC overhead
  if (statements.length === 1 && statements[0].length < MIN_STATEMENT_LENGTH) {
    return { shouldRun: false, reason: "single_short_statement" };
  }
  
  // Check if any statements need character adjustment
  const effectiveMin = targetMinChars ?? Math.max(0, targetMaxChars - 10);
  const needsCharAdjustment = statements.some(s => {
    const len = s.length;
    return len < effectiveMin || len > targetMaxChars;
  });
  
  // If fillToMax is enabled and statements need adjustment, run QC
  if (fillToMax && needsCharAdjustment) {
    return { shouldRun: true, reason: "needs_character_adjustment" };
  }
  
  // If we have multiple statements, worth checking diversity
  if (statements.length >= 2) {
    return { shouldRun: true, reason: "check_diversity" };
  }
  
  return { shouldRun: false, reason: "no_qc_needed" };
}

/**
 * Calculate similarity between two strings (simple approach)
 * Returns 0-100 where 100 = identical
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const words1 = new Set(str1.toLowerCase().split(/\s+/));
  const words2 = new Set(str2.toLowerCase().split(/\s+/));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  if (union.size === 0) return 100;
  
  return Math.round((intersection.size / union.size) * 100);
}

/**
 * Quick local diversity check (no LLM call)
 * Returns average pairwise dissimilarity
 */
export function quickDiversityCheck(statements: string[]): number {
  if (statements.length < 2) return 100;
  
  let totalDissimilarity = 0;
  let pairs = 0;
  
  for (let i = 0; i < statements.length; i++) {
    for (let j = i + 1; j < statements.length; j++) {
      const similarity = calculateSimilarity(statements[i], statements[j]);
      totalDissimilarity += (100 - similarity);
      pairs++;
    }
  }
  
  return pairs > 0 ? Math.round(totalDissimilarity / pairs) : 100;
}
