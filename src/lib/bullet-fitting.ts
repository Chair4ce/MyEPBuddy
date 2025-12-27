/**
 * Bullet Fitting Utility for AF Form 1206
 * 
 * ============================================================================
 * ATTRIBUTION & CREDITS
 * ============================================================================
 * 
 * This utility is based on and incorporates code from the pdf-bullets project:
 * https://github.com/AF-VCD/pdf-bullets
 * 
 * Original Author: ckhordiasma (https://github.com/ckhordiasma)
 * License: MIT
 * 
 * We are deeply grateful to ckhordiasma and all contributors to the pdf-bullets
 * project for creating and maintaining this invaluable open-source tool for the
 * Air Force community. Their work on character width calculation, space optimization,
 * and PDF form fitting has been instrumental in building this feature.
 * 
 * The pdf-bullets project provides a web-based utility for writing Air Force bullets
 * (EPR/OPR/Awards) with automatic optimization to fit form constraints.
 * 
 * This is NOT our original code - it is adapted with gratitude from their open-source
 * project under the MIT license.
 * 
 * ============================================================================
 * 
 * AF Form 1206 uses Times New Roman 12pt font with fixed-width lines.
 * This utility calculates text width based on actual character widths and
 * can optimize text to fit within line constraints using space substitution.
 */

// Character width table for Times New Roman 12pt (in pixels)
// These values are extracted from the pdf-bullets project
// The keys are character codes, values are pixel widths at 12pt
const TIMES_NEW_ROMAN_12PT_WIDTHS: Record<number, number> = {
  // Space and punctuation
  32: 4,        // space
  33: 5.328125, // !
  34: 6.53125,  // "
  35: 8,        // #
  36: 8,        // $
  37: 13.328125, // %
  38: 12.4453125, // &
  39: 2.8828125, // '
  40: 5.328125, // (
  41: 5.328125, // )
  42: 8,        // *
  43: 9.0234375, // +
  44: 4,        // ,
  45: 5.328125, // - (hyphen)
  46: 4,        // .
  47: 4.4453125, // /
  
  // Numbers 0-9
  48: 8, 49: 8, 50: 8, 51: 8, 52: 8, 53: 8, 54: 8, 55: 8, 56: 8, 57: 8,
  
  // Punctuation
  58: 4.4453125, // :
  59: 4.4453125, // ;
  60: 9.0234375, // <
  61: 9.0234375, // =
  62: 9.0234375, // >
  63: 7.1015625, // ?
  64: 14.734375, // @
  
  // Uppercase A-Z
  65: 11.5546875, // A
  66: 10.671875,  // B
  67: 10.671875,  // C
  68: 11.5546875, // D
  69: 9.7734375,  // E
  70: 8.8984375,  // F
  71: 11.5546875, // G
  72: 11.5546875, // H
  73: 5.328125,   // I
  74: 6.2265625,  // J
  75: 11.5546875, // K
  76: 9.7734375,  // L
  77: 14.2265625, // M
  78: 11.5546875, // N
  79: 11.5546875, // O
  80: 8.8984375,  // P
  81: 11.5546875, // Q
  82: 10.671875,  // R
  83: 8.8984375,  // S
  84: 9.7734375,  // T
  85: 11.5546875, // U
  86: 11.5546875, // V
  87: 15.1015625, // W
  88: 11.5546875, // X
  89: 11.5546875, // Y
  90: 9.7734375,  // Z
  
  // Brackets
  91: 5.328125,   // [
  92: 4.4453125,  // \
  93: 5.328125,   // ]
  94: 7.5078125,  // ^
  95: 8,          // _
  96: 5.328125,   // `
  
  // Lowercase a-z
  97: 7.1015625,   // a
  98: 8,           // b
  99: 7.1015625,   // c
  100: 8,          // d
  101: 7.1015625,  // e
  102: 5.328125,   // f
  103: 8,          // g
  104: 8,          // h
  105: 4.4453125,  // i
  106: 4.4453125,  // j
  107: 8,          // k
  108: 4.4453125,  // l
  109: 12.4453125, // m
  110: 8,          // n
  111: 8,          // o
  112: 8,          // p
  113: 8,          // q
  114: 5.328125,   // r
  115: 6.2265625,  // s
  116: 4.4453125,  // t
  117: 8,          // u
  118: 8,          // v
  119: 11.5546875, // w
  120: 8,          // x
  121: 8,          // y
  122: 7.1015625,  // z
  
  // Braces
  123: 7.6796875, // {
  124: 3.203125,  // |
  125: 7.6796875, // }
  126: 8.65625,   // ~
  
  // Special spaces (used for optimization)
  8196: 5.33,  // \u2004 - three-per-em space (medium, wider)
  8201: 2.67,  // \u2009 - thin space
  8198: 2.67,  // \u2006 - six-per-em space (narrow)
};

// Default width for unknown characters
const DEFAULT_CHAR_WIDTH = 8;

// AF Form 1206 line width in pixels
// Based on pdf-bullets project: https://github.com/AF-VCD/pdf-bullets
// Form width = 202.321mm, DPI = 96, MM_PER_IN = 25.4
// Width = 202.321 * (96 / 25.4) ≈ 765.95px (matching pdf-bullets project)
export const AF1206_LINE_WIDTH_PX = 765.95;

// Unicode special spaces for optimization
const THIN_SPACE = '\u2006';   // Narrower than normal space
const MEDIUM_SPACE = '\u2004'; // Wider than normal space
const NORMAL_SPACE = ' ';

// Optimization status
export const FIT_STATUS = {
  OPTIMIZED: 0,
  FAILED: 1,
  NOT_OPTIMIZED: -1,
  MAX_UNDERFLOW: -4, // Below this threshold, text is too short
} as const;

export type FitStatus = typeof FIT_STATUS[keyof typeof FIT_STATUS];

/**
 * Get the pixel width of a single character
 */
export function getCharWidth(char: string): number {
  const charCode = char.charCodeAt(0);
  return TIMES_NEW_ROMAN_12PT_WIDTHS[charCode] ?? DEFAULT_CHAR_WIDTH;
}

/**
 * Calculate the pixel width of a text string
 */
export function getTextWidthPx(text: string): number {
  let width = 0;
  for (const char of text) {
    width += getCharWidth(char);
  }
  return width;
}

/**
 * Split text into tokens that Adobe would use for line breaking
 * Adobe breaks after: spaces, ?, /, |, -, %, !
 * but only if immediately followed by: [a-zA-z], [0-9], +, \
 */
function adobeLineSplit(text: string): string[] {
  const regex = /([\u2004\u2009\u2006\s?/|\-%!])(?=[a-zA-Z0-9+\\])/;
  return text.split(regex).filter(Boolean);
}

/**
 * Tokenize text by spaces
 */
function tokenize(sentence: string): string[] {
  return sentence.split(/[\s]+/);
}

/**
 * Simple seeded random for consistent optimization results
 */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return hash;
}

function getRandomInt(seed: string, max: number): number {
  return Math.floor(
    Math.abs((Math.floor(9 * hashCode(seed) + 5) % 100000) / 100000) * Math.floor(max)
  );
}

/**
 * Render result interface
 */
export interface RenderResult {
  textLines: string[];
  fullWidth: number;
  lines: number;
  overflow: number;
}

/**
 * Render bullet text and calculate how it fits within the target width
 */
export function renderBulletText(
  text: string,
  targetWidthPx: number = AF1206_LINE_WIDTH_PX
): RenderResult {
  const trimmedText = text.trimEnd();
  const fullWidth = getTextWidthPx(trimmedText);
  
  if (trimmedText === '') {
    return {
      textLines: [],
      fullWidth: 0,
      lines: 0,
      overflow: 0 - targetWidthPx,
    };
  }
  
  if (fullWidth <= targetWidthPx) {
    return {
      textLines: [trimmedText],
      fullWidth,
      lines: 1,
      overflow: fullWidth - targetWidthPx,
    };
  }
  
  // Text overflows - need to find where to break
  const textSplit = adobeLineSplit(text);
  
  if (getTextWidthPx(textSplit[0].trimEnd()) < targetWidthPx) {
    let answerIdx = 0;
    for (let i = 1; i <= textSplit.length; i++) {
      const evalText = textSplit.slice(0, i).join('').trimEnd();
      if (getTextWidthPx(evalText) > targetWidthPx) {
        answerIdx = i - 1;
        break;
      }
    }
    
    const firstLine = textSplit.slice(0, answerIdx).join('');
    const remainder = textSplit.slice(answerIdx).join('');
    
    if (remainder === text) {
      // Can't break, return as-is
      return {
        textLines: [text],
        fullWidth,
        lines: 1,
        overflow: fullWidth - targetWidthPx,
      };
    }
    
    const recursedResult = renderBulletText(remainder, targetWidthPx);
    return {
      textLines: [firstLine, ...recursedResult.textLines],
      fullWidth,
      lines: 1 + recursedResult.lines,
      overflow: fullWidth - targetWidthPx,
    };
  }
  
  // First token is wider than target - do binary search for break point
  const avgCharWidth = fullWidth / text.length;
  const guessIndex = Math.floor(targetWidthPx / avgCharWidth);
  let answerIdx = guessIndex;
  
  const firstGuessWidth = getTextWidthPx(text.substring(0, guessIndex));
  if (firstGuessWidth > targetWidthPx) {
    for (let i = guessIndex - 1; i > 0; i--) {
      if (getTextWidthPx(text.substring(0, i)) < targetWidthPx) {
        answerIdx = i;
        break;
      }
    }
  } else {
    for (let i = guessIndex; i <= text.length; i++) {
      if (getTextWidthPx(text.substring(0, i)) > targetWidthPx) {
        answerIdx = i - 1;
        break;
      }
    }
  }
  
  const firstLine = text.substring(0, answerIdx);
  const remainder = text.substring(answerIdx);
  
  if (remainder === text) {
    return {
      textLines: [text],
      fullWidth,
      lines: 1,
      overflow: fullWidth - targetWidthPx,
    };
  }
  
  const recursedResult = renderBulletText(remainder, targetWidthPx);
  return {
    textLines: [firstLine, ...recursedResult.textLines],
    fullWidth,
    lines: 1 + recursedResult.lines,
    overflow: fullWidth - targetWidthPx,
  };
}

/**
 * Optimization result interface
 */
export interface OptimizeResult {
  status: FitStatus;
  rendering: RenderResult;
  optimizedText: string;
}

/**
 * Optimize text to fit within target width by substituting spaces
 * Uses thin spaces (\u2006) to compress, medium spaces (\u2004) to expand
 */
export function optimizeBullet(
  sentence: string,
  targetWidthPx: number = AF1206_LINE_WIDTH_PX
): OptimizeResult {
  const initResults = renderBulletText(sentence, targetWidthPx);
  
  // Already fits perfectly
  if (initResults.overflow === 0) {
    return {
      status: FIT_STATUS.OPTIMIZED,
      rendering: initResults,
      optimizedText: sentence,
    };
  }
  
  let optWords = tokenize(sentence.trimEnd());
  const newSpace = initResults.overflow > 0 ? THIN_SPACE : MEDIUM_SPACE;
  
  // Check worst case - all spaces replaced
  const worstCase = optWords[0] + ' ' + optWords.slice(1).join(newSpace);
  const worstCaseResults = renderBulletText(worstCase, targetWidthPx);
  
  if (
    (newSpace === THIN_SPACE && worstCaseResults.overflow > 0) ||
    (newSpace === MEDIUM_SPACE && worstCaseResults.overflow < FIT_STATUS.MAX_UNDERFLOW)
  ) {
    // Can't optimize - even with all spaces changed, it won't fit
    return {
      status: FIT_STATUS.FAILED,
      rendering: worstCaseResults,
      optimizedText: worstCase,
    };
  }
  
  let prevResults = initResults;
  let finalResults = initResults;
  let finalOptimStatus: FitStatus = FIT_STATUS.NOT_OPTIMIZED;
  
  // Iteratively replace spaces until it fits
  while (true) {
    // Don't replace first space after dash, don't select last word
    const indexToReplace = getRandomInt(optWords.join(''), optWords.length - 2) + 1;
    
    // Merge two words with the special space
    optWords.splice(
      indexToReplace,
      2,
      optWords.slice(indexToReplace, indexToReplace + 2).join(newSpace)
    );
    
    const newSentence = optWords.join(' ');
    const newResults = renderBulletText(newSentence, targetWidthPx);
    
    if (newSpace === MEDIUM_SPACE && newResults.overflow > 0) {
      finalResults = prevResults;
      finalOptimStatus = FIT_STATUS.OPTIMIZED;
      break;
    } else if (newSpace === THIN_SPACE && newResults.overflow <= 0) {
      finalResults = newResults;
      finalOptimStatus = FIT_STATUS.OPTIMIZED;
      break;
    } else if (optWords.length <= 2) {
      finalResults = newResults;
      finalOptimStatus = 
        newSpace === MEDIUM_SPACE && finalResults.overflow > FIT_STATUS.MAX_UNDERFLOW
          ? FIT_STATUS.OPTIMIZED
          : FIT_STATUS.FAILED;
      break;
    }
    
    prevResults = newResults;
  }
  
  return {
    status: finalOptimStatus,
    rendering: finalResults,
    optimizedText: optWords.join(' '),
  };
}

/**
 * Check if text fits within the 1206 line width
 */
export function fitsOnLine(text: string, targetWidthPx: number = AF1206_LINE_WIDTH_PX): boolean {
  return getTextWidthPx(text.trimEnd()) <= targetWidthPx;
}

/**
 * Compress text by replacing regular spaces with thin spaces
 * This visibly reduces the spacing between words to fit more text on each line
 */
export function compressText(text: string): { text: string; savedPx: number } {
  const normalSpaceWidth = getCharWidth(NORMAL_SPACE);
  const thinSpaceWidth = TIMES_NEW_ROMAN_12PT_WIDTHS[8198] || 2.67; // \u2006
  const spaceSavingsPerSpace = normalSpaceWidth - thinSpaceWidth;
  
  // Count regular spaces
  const spaceCount = (text.match(/ /g) || []).length;
  
  // Replace all regular spaces with thin spaces
  const compressed = text.replace(/ /g, THIN_SPACE);
  
  return {
    text: compressed,
    savedPx: spaceCount * spaceSavingsPerSpace,
  };
}

/**
 * Expand text by replacing regular spaces with medium spaces
 * This increases spacing between words to fill more of the line
 */
export function expandText(text: string): { text: string; addedPx: number } {
  const normalSpaceWidth = getCharWidth(NORMAL_SPACE);
  const mediumSpaceWidth = TIMES_NEW_ROMAN_12PT_WIDTHS[8196] || 5.33; // \u2004
  const spaceGainPerSpace = mediumSpaceWidth - normalSpaceWidth;
  
  // Count regular spaces
  const spaceCount = (text.match(/ /g) || []).length;
  
  // Replace all regular spaces with medium spaces
  const expanded = text.replace(/ /g, MEDIUM_SPACE);
  
  return {
    text: expanded,
    addedPx: spaceCount * spaceGainPerSpace,
  };
}

/**
 * Reset text to use normal spaces (remove any thin/medium space optimization)
 */
export function normalizeSpaces(text: string): string {
  return text
    .replace(/\u2006/g, ' ')  // thin space → normal
    .replace(/\u2004/g, ' ')  // medium space → normal
    .replace(/\u2009/g, ' '); // hair space → normal
}

/**
 * Optimize multi-line text for 1206 form fitting
 * Compresses spacing to reduce overall width
 */
export function optimizeMultiLineBullet(
  text: string,
  targetWidthPx: number = AF1206_LINE_WIDTH_PX
): OptimizeResult {
  // First normalize any existing special spaces
  const normalizedText = normalizeSpaces(text);
  const beforeWidth = getTextWidthPx(normalizedText);
  const beforeRendering = renderBulletText(normalizedText, targetWidthPx);
  
  // Compress all spaces to thin spaces
  const { text: compressedText, savedPx } = compressText(normalizedText);
  const afterWidth = getTextWidthPx(compressedText);
  const afterRendering = renderBulletText(compressedText, targetWidthPx);
  
  // Check if compression helped
  if (afterRendering.lines < beforeRendering.lines) {
    // Reduced line count - success!
    return {
      status: FIT_STATUS.OPTIMIZED,
      rendering: afterRendering,
      optimizedText: compressedText,
    };
  } else if (savedPx > 5) {
    // Saved some space even if line count didn't change
    return {
      status: FIT_STATUS.OPTIMIZED,
      rendering: afterRendering,
      optimizedText: compressedText,
    };
  } else {
    // No improvement
    return {
      status: FIT_STATUS.NOT_OPTIMIZED,
      rendering: beforeRendering,
      optimizedText: normalizedText,
    };
  }
}

/**
 * Analyze how well text fits
 */
export interface TextFitAnalysis {
  text: string;
  widthPx: number;
  targetWidthPx: number;
  fitsOnSingleLine: boolean;
  overflowPx: number;
  overflowPercent: number;
  fillPercent: number;
  estimatedLines: number;
  isOptimal: boolean; // Uses 90-100% of available space
  canBeOptimized: boolean;
}

export function analyzeTextFit(
  text: string,
  targetWidthPx: number = AF1206_LINE_WIDTH_PX
): TextFitAnalysis {
  const widthPx = getTextWidthPx(text.trimEnd());
  const overflowPx = widthPx - targetWidthPx;
  const fillPercent = (widthPx / targetWidthPx) * 100;
  const estimatedLines = Math.max(1, Math.ceil(widthPx / targetWidthPx));
  
  // Try optimization to see if it can be fixed
  const optimResult = optimizeBullet(text, targetWidthPx);
  
  return {
    text,
    widthPx,
    targetWidthPx,
    fitsOnSingleLine: widthPx <= targetWidthPx,
    overflowPx: Math.max(0, overflowPx),
    overflowPercent: Math.max(0, (overflowPx / targetWidthPx) * 100),
    fillPercent: Math.min(100, fillPercent),
    estimatedLines,
    isOptimal: fillPercent >= 90 && fillPercent <= 100,
    canBeOptimized: optimResult.status === FIT_STATUS.OPTIMIZED,
  };
}

/**
 * Character width category for optimization hints
 */
export type CharWidthCategory = 'narrow' | 'average' | 'wide';

export function getCharWidthCategory(char: string): CharWidthCategory {
  const width = getCharWidth(char);
  if (width <= 5.5) return 'narrow';
  if (width >= 11) return 'wide';
  return 'average';
}

/**
 * Analyze character distribution in text
 */
export function analyzeCharacterWidths(text: string): Record<CharWidthCategory, number> {
  const counts: Record<CharWidthCategory, number> = { narrow: 0, average: 0, wide: 0 };
  for (const char of text) {
    counts[getCharWidthCategory(char)]++;
  }
  return counts;
}

/**
 * Common abbreviations that can help reduce width
 */
export const COMMON_ABBREVIATIONS: Record<string, string> = {
  'and': '&',
  'with': 'w/',
  'without': 'w/o',
  'information': 'info',
  'approximately': 'approx',
  'percent': '%',
  'number': '#',
  'management': 'mgmt',
  'maintenance': 'maint',
  'equipment': 'equip',
  'operational': 'ops',
  'organization': 'org',
  'administration': 'admin',
  'communication': 'comm',
  'requirements': 'reqts',
  'personnel': 'psnl',
  'training': 'trng',
  'professional': 'prof',
  'development': 'dev',
  'squadron': 'sq',
  'headquarters': 'HQ',
  'department': 'dept',
  'government': 'govt',
  'commander': 'CC',
  'superintendent': 'supt',
  'technical': 'tech',
  'sergeant': 'Sgt',
};

/**
 * Get optimization suggestions for a statement
 */
export function getOptimizationSuggestions(statement: string): string[] {
  const suggestions: string[] = [];
  const analysis = analyzeTextFit(statement);
  
  if (analysis.fitsOnSingleLine && analysis.isOptimal) {
    return ['Statement is already optimally sized.'];
  }
  
  if (!analysis.fitsOnSingleLine) {
    suggestions.push(`Statement overflows by ${analysis.overflowPercent.toFixed(1)}%`);
    
    if (analysis.canBeOptimized) {
      suggestions.push('Can be optimized using space compression.');
    } else {
      suggestions.push('Consider shortening the statement or using abbreviations.');
    }
  } else if (analysis.fillPercent < 90) {
    suggestions.push(`Statement only fills ${analysis.fillPercent.toFixed(1)}% - consider adding more impact details.`);
  }
  
  // Check for words that could be abbreviated
  const lowerStatement = statement.toLowerCase();
  for (const [word, abbr] of Object.entries(COMMON_ABBREVIATIONS)) {
    if (lowerStatement.includes(word)) {
      suggestions.push(`Consider replacing "${word}" with "${abbr}"`);
    }
  }
  
  // Check character distribution
  const charAnalysis = analyzeCharacterWidths(statement);
  const wideRatio = charAnalysis.wide / statement.length;
  if (wideRatio > 0.15) {
    suggestions.push('Statement has many wide characters (M, W, etc.) - consider rephrasing.');
  }
  
  return suggestions;
}

/**
 * Format optimized text for display, showing special spaces visually if needed
 */
export function visualizeOptimizedText(text: string): string {
  return text
    .replace(/\u2006/g, '⋅')  // thin space → middle dot
    .replace(/\u2004/g, '·'); // medium space → bullet
}

/**
 * Visual line segment representing a portion of text that fits on one line
 */
export interface VisualLineSegment {
  text: string;
  startIndex: number;
  endIndex: number;
  width: number;
  isCompressed: boolean;
}

/**
 * Get visual line segments based on text width wrapping.
 * This calculates where text would naturally wrap at the given line width.
 */
export function getVisualLineSegments(
  text: string,
  targetWidthPx: number = AF1206_LINE_WIDTH_PX
): VisualLineSegment[] {
  if (!text.trim()) return [];
  
  const segments: VisualLineSegment[] = [];
  let currentLineStart = 0;
  let currentLineWidth = 0;
  let lastBreakableIndex = 0;
  let lastBreakableWidth = 0;
  
  // Characters after which we can break (similar to PDF word wrap behavior)
  const breakableChars = new Set([' ', '-', '/', '|', '?', '!', '\u2006', '\u2004']);
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const charWidth = getCharWidth(char);
    
    // Track last breakable position
    if (breakableChars.has(char)) {
      lastBreakableIndex = i + 1; // Break after this character
      lastBreakableWidth = currentLineWidth + charWidth;
    }
    
    // Check if adding this character would overflow
    if (currentLineWidth + charWidth > targetWidthPx && currentLineStart < i) {
      // We need to wrap - use last breakable position if available
      const breakIndex = lastBreakableIndex > currentLineStart ? lastBreakableIndex : i;
      const lineText = text.substring(currentLineStart, breakIndex);
      
      segments.push({
        text: lineText,
        startIndex: currentLineStart,
        endIndex: breakIndex,
        width: getTextWidthPx(lineText),
        isCompressed: lineText.includes('\u2006'),
      });
      
      currentLineStart = breakIndex;
      currentLineWidth = lastBreakableIndex > currentLineStart ? 
        currentLineWidth + charWidth - lastBreakableWidth : charWidth;
      lastBreakableIndex = currentLineStart;
      lastBreakableWidth = 0;
    } else {
      currentLineWidth += charWidth;
    }
  }
  
  // Add the last line
  if (currentLineStart < text.length) {
    const lineText = text.substring(currentLineStart);
    segments.push({
      text: lineText,
      startIndex: currentLineStart,
      endIndex: text.length,
      width: getTextWidthPx(lineText),
      isCompressed: lineText.includes('\u2006'),
    });
  }
  
  return segments;
}
