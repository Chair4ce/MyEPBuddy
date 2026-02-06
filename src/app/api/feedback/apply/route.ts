import { createClient } from "@/lib/supabase/server";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { getDecryptedApiKeys } from "@/app/actions/api-keys";

// Allow up to 60s for LLM calls
export const maxDuration = 60;

interface ApplyFeedbackRequest {
  currentText: string;
  snapshotText: string;
  suggestionType: "delete" | "replace";
  highlightedText: string;
  replacementText?: string;
  commentText?: string;
}

interface ApplyFeedbackResponse {
  success: boolean;
  newText?: string;
  error?: string;
  aborted?: boolean;
  reason?: string;
  // When AI makes changes beyond what was requested, we still return the proposed text
  // and let the user decide whether to accept it
  needsReview?: boolean;
  reviewReason?: string;
}

/**
 * Finds the longest substring from 'target' that exists in 'text'
 * Used for partial matching when user has already edited part of the highlighted text
 */
function findLongestMatchingSubstring(target: string, text: string): string | null {
  const words = target.split(/\s+/);
  
  // Try progressively smaller substrings, starting from the end
  // (user often deletes from the beginning, e.g., deleting "expertly" from "expertly guiding")
  for (let startIdx = 0; startIdx < words.length; startIdx++) {
    for (let endIdx = words.length; endIdx > startIdx; endIdx--) {
      const substring = words.slice(startIdx, endIdx).join(' ');
      if (substring.length >= 10 && text.includes(substring)) {
        return substring;
      }
    }
  }
  
  // Also try from the beginning (in case user deleted from the end)
  for (let endIdx = words.length; endIdx > 0; endIdx--) {
    for (let startIdx = 0; startIdx < endIdx; startIdx++) {
      const substring = words.slice(startIdx, endIdx).join(' ');
      if (substring.length >= 10 && text.includes(substring)) {
        return substring;
      }
    }
  }
  
  return null;
}

/**
 * Validates that the LLM only made the requested change and didn't modify other parts
 * Uses a simple heuristic: the difference in length should roughly match the expected change
 * and the surrounding text should be preserved
 */
function validateChange(
  originalText: string,
  newText: string,
  highlightedText: string,
  replacementText: string | undefined,
  suggestionType: "delete" | "replace"
): { valid: boolean; reason?: string } {
  // Calculate expected length change
  const expectedLengthChange = suggestionType === "delete"
    ? -highlightedText.length
    : (replacementText?.length || 0) - highlightedText.length;
  
  const actualLengthChange = newText.length - originalText.length;
  
  // Allow some tolerance for whitespace cleanup (e.g., removing double spaces)
  const tolerance = 5;
  
  if (Math.abs(actualLengthChange - expectedLengthChange) > tolerance + highlightedText.length * 0.3) {
    return { 
      valid: false, 
      reason: `Length change mismatch: expected ~${expectedLengthChange}, got ${actualLengthChange}` 
    };
  }
  
  // For delete: verify the highlighted text (or similar) is no longer present
  // For replace: verify the replacement text is now present
  if (suggestionType === "replace" && replacementText) {
    if (!newText.includes(replacementText)) {
      return { 
        valid: false, 
        reason: "Replacement text not found in result" 
      };
    }
  }
  
  // Check that MOST of the original text is preserved
  // Split into chunks and verify high overlap
  const originalWords = originalText.split(/\s+/).filter(w => w.length > 0);
  const newWords = newText.split(/\s+/).filter(w => w.length > 0);
  const highlightWords = highlightedText.split(/\s+/).filter(w => w.length > 0);
  
  // Words that should be preserved (original minus highlighted)
  const wordsToPreserve = originalWords.filter(w => !highlightWords.includes(w));
  
  // Count how many preserved words appear in new text
  const preservedCount = wordsToPreserve.filter(w => newWords.includes(w)).length;
  const preserveRatio = wordsToPreserve.length > 0 ? preservedCount / wordsToPreserve.length : 1;
  
  // At least 90% of non-target words should be preserved
  if (preserveRatio < 0.9) {
    return { 
      valid: false, 
      reason: `Only ${Math.round(preserveRatio * 100)}% of original text preserved` 
    };
  }
  
  return { valid: true };
}

export async function POST(request: Request): Promise<NextResponse<ApplyFeedbackResponse>> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const body: ApplyFeedbackRequest = await request.json();
    const { 
      currentText, 
      snapshotText, 
      suggestionType, 
      highlightedText, 
      replacementText,
      commentText,
    } = body;

    if (!highlightedText) {
      return NextResponse.json(
        { success: false, error: "Missing highlighted text" },
        { status: 400 }
      );
    }

    // If currentText is empty, the section doesn't exist or has no content
    if (!currentText) {
      return NextResponse.json({
        success: false,
        aborted: true,
        reason: "Section is empty or not found. Cannot apply suggestion."
      });
    }

    // Try simple string replacement first (works if highlighted text is still present)
    const idx = currentText.indexOf(highlightedText);
    if (idx !== -1) {
      // Check if there are multiple occurrences - if so, we need LLM to decide
      const lastIdx = currentText.lastIndexOf(highlightedText);
      if (idx === lastIdx) {
        // Only one occurrence - safe to replace directly
        let newText: string;
        if (suggestionType === "delete") {
          newText = currentText.slice(0, idx) + currentText.slice(idx + highlightedText.length);
        } else {
          newText = currentText.slice(0, idx) + (replacementText || "") + currentText.slice(idx + highlightedText.length);
        }
        // Clean up any double spaces
        newText = newText.replace(/  +/g, " ").trim();
        return NextResponse.json({ success: true, newText });
      }
      // Multiple occurrences - fall through to LLM
    }

    // Try partial match - find the longest substring of highlightedText that exists in currentText
    // This handles cases where the user already deleted part of the highlighted text
    if (idx === -1 && suggestionType === "delete") {
      const partialMatch = findLongestMatchingSubstring(highlightedText, currentText);
      
      if (partialMatch && partialMatch.length >= 10 && partialMatch.length >= highlightedText.length * 0.4) {
        // Found a significant partial match (at least 10 chars and 40% of original)
        const partialIdx = currentText.indexOf(partialMatch);
        const partialLastIdx = currentText.lastIndexOf(partialMatch);
        
        if (partialIdx === partialLastIdx) {
          // Only one occurrence of the partial match - safe to delete
          let newText = currentText.slice(0, partialIdx) + currentText.slice(partialIdx + partialMatch.length);
          newText = newText.replace(/  +/g, " ").trim();
          
          // Return with needsReview so user can confirm
          return NextResponse.json({ 
            success: true, 
            newText,
            needsReview: true,
            reviewReason: `The exact text was not found. Deleted the remaining portion: "${partialMatch}"`
          });
        }
      }
    }

    // Text has changed or multiple occurrences - use LLM to intelligently apply the change
    // Get user's API keys (user's key takes priority over system fallback)
    const userKeys = await getDecryptedApiKeys();
    const apiKey = userKeys?.google_key || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    
    if (!apiKey) {
      console.error("Google AI API key not configured");
      return NextResponse.json({
        success: false,
        aborted: true,
        reason: "AI service not configured. Please apply this change manually."
      });
    }

    const google = createGoogleGenerativeAI({
      apiKey,
    });

    const systemPrompt = `You are a SURGICAL text editor. Apply ONE specific change to a document.

RULES:
1. Find the EXACT text to modify
2. Apply ONLY that one change (delete or replace)
3. Return the complete document with ONLY that change applied
4. If you cannot find the exact text or a very close match: ABORT

CRITICAL:
- Do NOT add quotes, formatting, or extra characters
- Do NOT change anything outside the target text
- Do NOT return the text unchanged - if you can't find it, ABORT
- The newText field should contain ONLY the plain text result, no quotes wrapping it

OUTPUT FORMAT (valid JSON only):
If found: {"success": true, "newText": "<entire document with change applied>"}
If NOT found: {"success": false, "aborted": true, "reason": "<why you cannot find the text>"}`;

    const actionDescription = suggestionType === "delete"
      ? `DELETE: "${highlightedText}"`
      : `REPLACE: "${highlightedText}" → "${replacementText}"`;

    const userPrompt = `DOCUMENT:
${currentText}

ACTION: ${actionDescription}

INSTRUCTIONS:
1. Find the text "${highlightedText}" in the document
2. ${suggestionType === "delete" ? "Remove it" : `Replace it with "${replacementText}"`}
3. Return the entire document with this ONE change
4. If you cannot find this text (or something very similar), ABORT

The user may have edited the document - if the exact phrase is gone, ABORT.
Do NOT wrap the result in quotes or add any formatting.

Return valid JSON:`;

    let text: string;
    try {
      const result = await generateText({
        model: google("gemini-2.0-flash"),
        system: systemPrompt,
        prompt: userPrompt,
        temperature: 0.1, // Low temperature for precise edits
        maxTokens: 2000,
      });
      text = result.text;
    } catch (llmError) {
      console.error("LLM API call failed:", llmError);
      return NextResponse.json({
        success: false,
        aborted: true,
        reason: "AI service temporarily unavailable. Please apply this change manually."
      });
    }

    // Parse the LLM response
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        
        if (result.success && result.newText) {
          const newText = result.newText.trim();
          
          // Check if the AI actually made any changes
          // If text is essentially unchanged, it means the AI couldn't find the target
          const normalizedCurrent = currentText.trim().replace(/\s+/g, ' ');
          const normalizedNew = newText.replace(/\s+/g, ' ');
          
          if (normalizedCurrent === normalizedNew) {
            return NextResponse.json({
              success: false,
              aborted: true,
              reason: `Could not find "${highlightedText.substring(0, 50)}${highlightedText.length > 50 ? '...' : ''}" in the current text. It may have already been edited or removed.`
            });
          }
          
          // VALIDATION: Check if the LLM made unauthorized changes
          // Instead of blocking, we flag it for user review
          const validation = validateChange(currentText, newText, highlightedText, replacementText, suggestionType);
          
          if (!validation.valid) {
            console.warn("LLM validation warning:", validation.reason);
            // Return the proposed text but flag it for user review
            return NextResponse.json({ 
              success: true,
              newText,
              needsReview: true,
              reviewReason: validation.reason
            });
          }
          
          return NextResponse.json({ 
            success: true, 
            newText 
          });
        } else if (result.aborted) {
          return NextResponse.json({ 
            success: false, 
            aborted: true, 
            reason: result.reason || "Could not apply the suggested change" 
          });
        }
      }
      
      // Fallback if response doesn't match expected format
      return NextResponse.json({ 
        success: false, 
        aborted: true, 
        reason: "Could not process the change request" 
      });
    } catch (parseError) {
      console.error("Failed to parse LLM response:", parseError, text);
      return NextResponse.json({ 
        success: false, 
        aborted: true, 
        reason: "Failed to process response from AI" 
      });
    }
  } catch (error) {
    console.error("Apply Feedback API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to apply feedback" },
      { status: 500 }
    );
  }
}
