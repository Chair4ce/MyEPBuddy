/**
 * Utility functions for parsing and manipulating sentences in EPB statements
 * 
 * EPB statements typically consist of 2 sentences separated by a period.
 * This utility helps identify, split, and recombine sentences for the
 * drag-and-drop sentence swap feature.
 */

export interface ParsedSentence {
  text: string;
  index: number; // 0 for first sentence, 1 for second
  startPos: number;
  endPos: number;
}

export interface ParsedStatement {
  sentences: ParsedSentence[];
  raw: string;
  hasTwoSentences: boolean;
}

/**
 * Parse a statement into its component sentences
 * Handles edge cases like abbreviations, numbers with decimals, etc.
 */
export function parseStatement(text: string): ParsedStatement {
  if (!text || !text.trim()) {
    return {
      sentences: [],
      raw: text || "",
      hasTwoSentences: false,
    };
  }

  // Normalize whitespace - replace multiple spaces/newlines with single space
  const normalized = text.trim().replace(/\s+/g, ' ');
  
  // Find sentence boundaries - look for period followed by space and capital letter
  // or period at end of string
  const sentenceBoundaries: number[] = [];
  
  // Common abbreviations to skip (case-insensitive)
  const abbreviationPatterns = [
    /\bMr\.$/i, /\bMrs\.$/i, /\bMs\.$/i, /\bDr\.$/i, /\bProf\.$/i, /\bSr\.$/i, /\bJr\.$/i,
    /\bvs\.$/i, /\betc\.$/i, /\bi\.e\.$/i, /\be\.g\.$/i, /\bU\.S\.$/i, /\bU\.K\.$/i,
    /\bGen\.$/i, /\bCol\.$/i, /\bLt\.$/i, /\bSgt\.$/i, /\bCapt\.$/i, /\bMaj\.$/i,
    /\bTSgt\.$/i, /\bMSgt\.$/i, /\bSMSgt\.$/i, /\bCMSgt\.$/i, /\bSSgt\.$/i, /\bSrA\.$/i,
    /\bA1C\.$/i, /\bAmn\.$/i, /\bAB\.$/i, /\bNo\.$/i, /\bSt\.$/i, /\bAve\.$/i,
    /\bInc\.$/i, /\bCorp\.$/i, /\bLtd\.$/i, /\bCo\.$/i, /\bDept\.$/i,
    /\bFig\.$/i, /\bVol\.$/i, /\bpp\.$/i, /\bEd\.$/i, /\bRev\.$/i,
  ];
  
  // Find all periods
  for (let i = 0; i < normalized.length; i++) {
    if (normalized[i] === '.') {
      // Get the text leading up to and including this period
      const textUpToPeriod = normalized.slice(0, i + 1);
      
      // Check if this matches any abbreviation pattern
      const isAbbreviation = abbreviationPatterns.some(pattern => pattern.test(textUpToPeriod));
      
      // Check if it's a decimal number (digit before and after period)
      const isDecimal = i > 0 && i < normalized.length - 1 && 
        /\d/.test(normalized[i - 1]) && /\d/.test(normalized[i + 1]);
      
      // Check if it's a percentage pattern like "90%."
      const isPercentage = i > 0 && normalized[i - 1] === '%';
      
      // Check if next char is space followed by any letter or end of string
      const nextChar = normalized[i + 1];
      const charAfterSpace = normalized[i + 2];
      
      // End of sentence if: end of string, OR space followed by any letter (not just capital)
      // This allows for cases like "Sentence one. and sentence two." to be split correctly
      const isEndOfSentence = !nextChar || 
        (nextChar === ' ' && charAfterSpace && /[A-Za-z]/.test(charAfterSpace));
      
      // Also consider it end of sentence if percentage followed by space and letter
      const isPercentageEnd = isPercentage && isEndOfSentence;
      
      if (!isAbbreviation && !isDecimal && (isEndOfSentence || isPercentageEnd)) {
        sentenceBoundaries.push(i);
      }
    }
  }
  
  // If no boundaries found, treat whole text as one sentence
  if (sentenceBoundaries.length === 0) {
    return {
      sentences: [{
        text: normalized,
        index: 0,
        startPos: 0,
        endPos: normalized.length,
      }],
      raw: normalized,
      hasTwoSentences: false,
    };
  }
  
  // Split into sentences (max 2)
  const sentences: ParsedSentence[] = [];
  let lastEnd = 0;
  
  for (let i = 0; i < Math.min(sentenceBoundaries.length, 2); i++) {
    const boundaryPos = sentenceBoundaries[i];
    const sentenceText = normalized.slice(lastEnd, boundaryPos + 1).trim();
    
    if (sentenceText) {
      sentences.push({
        text: sentenceText,
        index: sentences.length,
        startPos: lastEnd,
        endPos: boundaryPos + 1,
      });
    }
    
    lastEnd = boundaryPos + 2; // Skip period and space
  }
  
  // Handle remaining text as second sentence if we only found one boundary
  if (sentences.length === 1 && lastEnd < normalized.length) {
    const remainingText = normalized.slice(lastEnd).trim();
    if (remainingText) {
      sentences.push({
        text: remainingText,
        index: 1,
        startPos: lastEnd,
        endPos: normalized.length,
      });
    }
  }
  
  return {
    sentences,
    raw: normalized,
    hasTwoSentences: sentences.length >= 2,
  };
}

/**
 * Sanitize text input - remove potentially harmful characters and normalize
 * Preserves alphanumeric, common punctuation, and whitespace
 */
export function sanitizeStatementText(text: string): string {
  if (!text) return "";
  
  // Remove null bytes and control characters (except newline, tab, carriage return)
  let sanitized = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  
  // Normalize various unicode dashes and quotes to their ASCII equivalents
  sanitized = sanitized
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'") // Single quotes
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"') // Double quotes
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015]/g, "-") // Dashes
    .replace(/\u2026/g, "...") // Ellipsis character to three dots
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, " "); // Various spaces to regular space
  
  // Normalize multiple consecutive periods to single period (ellipsis handling)
  sanitized = sanitized.replace(/\.{2,}/g, ".");
  
  // Collapse multiple spaces into one
  sanitized = sanitized.replace(/\s+/g, " ");
  
  return sanitized.trim();
}

/**
 * Combine two sentences into a statement
 * Both sentences will have periods added when combined
 */
export function combineSentences(sentence1: string, sentence2: string): string {
  // Sanitize and trim inputs
  const s1 = sanitizeStatementText(sentence1);
  const s2 = sanitizeStatementText(sentence2);
  
  if (!s1 && !s2) return "";
  
  // Single sentence: add period if not present
  if (!s1) {
    return s2.endsWith('.') ? s2 : s2 + '.';
  }
  if (!s2) {
    return s1.endsWith('.') ? s1 : s1 + '.';
  }
  
  // Both sentences: ensure both end with periods
  const s1WithPeriod = s1.endsWith('.') ? s1 : s1 + '.';
  const s2WithPeriod = s2.endsWith('.') ? s2 : s2 + '.';
  
  return `${s1WithPeriod} ${s2WithPeriod}`;
}

/**
 * Calculate how many characters need to be trimmed/added to fit a target
 */
function calculateCharacterDelta(
  currentLength: number,
  targetMax: number
): { delta: number; needsTrimming: boolean; needsExpanding: boolean } {
  const delta = targetMax - currentLength;
  return {
    delta,
    needsTrimming: delta < 0,
    needsExpanding: delta > 20, // Only suggest expanding if more than 20 chars available
  };
}

/**
 * Estimate if a sentence swap would require AI adaptation
 */
function wouldRequireAdaptation(
  incomingSentence: string,
  existingSentence: string,
  targetMax: number
): boolean {
  const combinedLength = incomingSentence.length + existingSentence.length + 1; // +1 for space
  return combinedLength > targetMax || combinedLength < targetMax - 30;
}

