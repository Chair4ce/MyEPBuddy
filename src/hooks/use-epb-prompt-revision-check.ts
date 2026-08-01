"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  shouldAutoMigrateEpbPrompt,
  shouldShowEpbPromptUpdateModal,
} from "@/lib/default-llm-prompts";

type LlmPromptRow = {
  base_system_prompt: string;
  epb_system_prompt_revision_acknowledged: number;
};

type SupabaseClient = ReturnType<typeof createClient>;

export function useEpbPromptRevisionCheck({
  profileId,
  termsAccepted,
  hasChecked,
  supabase,
  runAutoMigrate,
  setHasChecked,
  setIsLoading,
  setIsOpen,
}: {
  profileId: string | undefined;
  termsAccepted: boolean;
  hasChecked: boolean;
  supabase: SupabaseClient;
  runAutoMigrate: (row: LlmPromptRow) => Promise<void>;
  setHasChecked: (value: boolean) => void;
  setIsLoading: (value: boolean) => void;
  setIsOpen: (value: boolean) => void;
}) {
  useEffect(() => {
    let cancelled = false;
    const openModalTimeoutRef = { current: null as ReturnType<typeof setTimeout> | null };

    async function checkPromptRevision() {
      if (!profileId) return;

      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("user_llm_settings")
          .select("base_system_prompt, epb_system_prompt_revision_acknowledged")
          .eq("user_id", profileId)
          .maybeSingle();

        if (cancelled) return;
        if (error) throw error;
        if (!data) {
          setHasChecked(true);
          return;
        }

        const row = data as unknown as LlmPromptRow;
        const ack = row.epb_system_prompt_revision_acknowledged ?? 0;

        if (shouldAutoMigrateEpbPrompt(ack, row.base_system_prompt)) {
          await runAutoMigrate(row);
          if (cancelled) return;
          setHasChecked(true);
          return;
        }

        if (shouldShowEpbPromptUpdateModal(ack, row.base_system_prompt)) {
          openModalTimeoutRef.current = setTimeout(() => {
            if (!cancelled) setIsOpen(true);
          }, 800);
        }

        setHasChecked(true);
      } catch (error) {
        console.error("EPB prompt revision check error:", error);
        setHasChecked(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    if (profileId && !hasChecked && termsAccepted) {
      void checkPromptRevision();
    }

    return () => {
      cancelled = true;
      if (openModalTimeoutRef.current) {
        clearTimeout(openModalTimeoutRef.current);
        openModalTimeoutRef.current = null;
      }
    };
  }, [profileId, hasChecked, termsAccepted, supabase, runAutoMigrate, setHasChecked, setIsLoading, setIsOpen]);
}
