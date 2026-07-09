/**
 * User Style Learning - Feedback Collection Hook
 * 
 * Lightweight, non-blocking feedback collection for learning user preferences.
 * All operations are fire-and-forget to avoid impacting UX.
 */

import { useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  StyleExampleCategory,
  StyleFeedbackEventType,
  RevisionSelectedPayload,
  RevisionCopiedPayload,
  StatementEditedPayload,
  StatementFinalizedPayload,
  SliderUsedPayload,
  ToggleUsedPayload,
  UserStyleProfile,
  UserStyleExample,
} from "@/types/database";

// Debounce duration for slider/toggle events (ms)
const SLIDER_DEBOUNCE_MS = 2000;

interface UseStyleFeedbackOptions {
  enabled?: boolean; // Allow disabling for testing
}

export function useStyleFeedback(options: UseStyleFeedbackOptions = {}) {
  const { enabled = true } = options;
  const supabase = createClient();
  
  // Refs for debouncing
  const sliderDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const toggleDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastSliderValueRef = useRef<number | null>(null);
  const lastToggleValueRef = useRef<boolean | null>(null);

  /**
   * Submit a feedback event (fire-and-forget, non-blocking)
   */
  const submitEvent = useCallback(
    async (eventType: StyleFeedbackEventType, payload: object) => {
      if (!enabled) return;

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Fire and forget - don't await
        supabase
          .from("style_feedback_events")
          .insert({
            user_id: user.id,
            event_type: eventType,
            payload,
          } as never)
          .then(({ error }) => {
            if (error) {
              console.warn("[StyleFeedback] Failed to submit event:", error.message);
            }
          });
      } catch {
        // Silent fail - feedback collection should never break the app
      }
    },
    [supabase, enabled]
  );

  /**
   * Track when user selects a revision version
   */
  const trackRevisionSelected = useCallback(
    (data: {
      version: number;
      totalVersions: number;
      charCount: number;
      category: StyleExampleCategory;
      aggressiveness?: number;
      fillToMax?: boolean;
    }) => {
      const payload: RevisionSelectedPayload = {
        version: data.version,
        total_versions: data.totalVersions,
        char_count: data.charCount,
        category: data.category,
        aggressiveness: data.aggressiveness,
        fill_to_max: data.fillToMax,
      };
      submitEvent("revision_selected", payload);
    },
    [submitEvent]
  );

  /**
   * Track when user copies a revision (stronger signal than just selecting)
   */
  const trackRevisionCopied = useCallback(
    (data: {
      version: number;
      text: string;
      category: StyleExampleCategory;
    }) => {
      const payload: RevisionCopiedPayload = {
        version: data.version,
        text: data.text,
        category: data.category,
      };
      submitEvent("revision_copied", payload);
    },
    [submitEvent]
  );

  /**
   * Track when user edits a statement after AI generation
   */
  const trackStatementEdited = useCallback(
    (data: {
      original: string;
      edited: string;
      category: StyleExampleCategory;
    }) => {
      // Calculate simple edit ratio (0-100)
      const editDistance = calculateEditDistance(data.original, data.edited);
      const maxLen = Math.max(data.original.length, data.edited.length);
      const editRatio = maxLen > 0 ? Math.round((editDistance / maxLen) * 100) : 0;

      const payload: StatementEditedPayload = {
        original: data.original,
        edited: data.edited,
        edit_distance: editDistance,
        category: data.category,
      };
      submitEvent("statement_edited", payload);

      // Also save as example if substantial edits were made
      if (editRatio > 20 && data.edited.length >= 100) {
        saveAsStyleExample({
          text: data.edited,
          category: data.category,
          wasAiAssisted: true,
          editRatio,
          isFinalized: false,
        });
      }
    },
    [submitEvent]
  );

  /**
   * Track when user finalizes a statement (marks EPB section complete)
   */
  const trackStatementFinalized = useCallback(
    (data: {
      text: string;
      category: StyleExampleCategory;
      wasAiAssisted: boolean;
      originalAiText?: string; // The AI-generated text before edits
    }) => {
      // Calculate edit ratio if we have original AI text
      let editRatio = 0;
      if (data.wasAiAssisted && data.originalAiText) {
        const editDistance = calculateEditDistance(data.originalAiText, data.text);
        const maxLen = Math.max(data.originalAiText.length, data.text.length);
        editRatio = maxLen > 0 ? Math.round((editDistance / maxLen) * 100) : 0;
      }

      const payload: StatementFinalizedPayload = {
        text: data.text,
        category: data.category,
        was_ai_assisted: data.wasAiAssisted,
        edit_ratio: editRatio,
      };
      submitEvent("statement_finalized", payload);

      // Always save finalized statements as examples (gold standard)
      saveAsStyleExample({
        text: data.text,
        category: data.category,
        wasAiAssisted: data.wasAiAssisted,
        editRatio,
        isFinalized: true,
      });
    },
    [submitEvent]
  );

  /**
   * Track aggressiveness slider usage (debounced)
   */
  const trackSliderUsed = useCallback(
    (value: number) => {
      // Skip if same value as last tracked
      if (lastSliderValueRef.current === value) return;
      lastSliderValueRef.current = value;

      // Clear existing debounce
      if (sliderDebounceRef.current) {
        clearTimeout(sliderDebounceRef.current);
      }

      // Debounce to avoid spamming during slider drag
      sliderDebounceRef.current = setTimeout(() => {
        const payload: SliderUsedPayload = { value };
        submitEvent("slider_used", payload);
      }, SLIDER_DEBOUNCE_MS);
    },
    [submitEvent]
  );

  /**
   * Track fill-to-max toggle usage (debounced)
   */
  const trackToggleUsed = useCallback(
    (fillToMax: boolean) => {
      // Skip if same value as last tracked
      if (lastToggleValueRef.current === fillToMax) return;
      lastToggleValueRef.current = fillToMax;

      // Clear existing debounce
      if (toggleDebounceRef.current) {
        clearTimeout(toggleDebounceRef.current);
      }

      // Short debounce for toggles
      toggleDebounceRef.current = setTimeout(() => {
        const payload: ToggleUsedPayload = { fill_to_max: fillToMax };
        submitEvent("toggle_used", payload);
      }, 500);
    },
    [submitEvent]
  );

  /**
   * Save a statement as a style example (bounded, FIFO per category)
   */
  const saveAsStyleExample = useCallback(
    async (data: {
      text: string;
      category: StyleExampleCategory;
      wasAiAssisted: boolean;
      editRatio: number;
      isFinalized: boolean;
    }) => {
      if (!enabled) return;

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Insert - trigger will handle max limit enforcement
        await supabase.from("user_style_examples").insert({
          user_id: user.id,
          category: data.category,
          statement_text: data.text,
          is_finalized: data.isFinalized,
          was_ai_assisted: data.wasAiAssisted,
          edit_ratio: data.editRatio,
        } as never);
      } catch {
        // Silent fail
      }
    },
    [supabase, enabled]
  );

  /**
   * Get user's style profile (for display/debugging)
   */
  const getStyleProfile = useCallback(async (): Promise<UserStyleProfile | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data } = await supabase
        .from("user_style_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      return data as UserStyleProfile | null;
    } catch {
      return null;
    }
  }, [supabase]);

  /**
   * Get user's style examples for a category
   */
  const getStyleExamples = useCallback(
    async (category?: StyleExampleCategory): Promise<UserStyleExample[]> => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];

        let query = supabase
          .from("user_style_examples")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (category) {
          query = query.eq("category", category);
        }

        const { data } = await query;
        return (data as UserStyleExample[]) || [];
      } catch {
        return [];
      }
    },
    [supabase]
  );

  /**
   * Manually trigger processing of feedback events
   * (Usually done automatically by background job, but can be called on-demand)
   */
  const processEvents = useCallback(async (): Promise<number> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("process_style_feedback", {
        p_user_id: user.id,
        p_batch_size: 50,
      });

      if (error) {
        console.warn("[StyleFeedback] Failed to process events:", error.message);
        return 0;
      }

      return data as number;
    } catch {
      return 0;
    }
  }, [supabase]);

  return {
    // Event tracking (fire-and-forget)
    trackRevisionSelected,
    trackRevisionCopied,
    trackStatementEdited,
    trackStatementFinalized,
    trackSliderUsed,
    trackToggleUsed,
    // Data access
    getStyleProfile,
    getStyleExamples,
    // Manual processing
    processEvents,
  };
}

/**
 * Simple Levenshtein distance calculation
 * Used to measure how much a user edited a statement
 */
function calculateEditDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Get the MPA category key for style tracking
 */
export function getMpaCategory(mpaKey: string): StyleExampleCategory {
  const categoryMap: Record<string, StyleExampleCategory> = {
    executing_mission: "executing_mission",
    leading_people: "leading_people",
    managing_resources: "managing_resources",
    improving_unit: "improving_unit",
    whole_airman: "whole_airman",
    duty_description: "duty_description",
  };
  return categoryMap[mpaKey] || "executing_mission";
}

