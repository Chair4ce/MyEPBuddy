"use client";

import { useEffect, type MutableRefObject } from "react";
import { createClient } from "@/lib/supabase/client";
import { useEPBShellStore } from "@/stores/epb-shell-store";
import type { EPBShell, EPBShellSection } from "@/types/database";

type SupabaseClient = ReturnType<typeof createClient>;

export function useEpbShellRealtimeSync({
  shellId,
  profileId,
  isPageVisible,
  currentShell,
  sectionStates,
  supabase,
  updateSection,
  setCurrentShell,
  prevPageVisibleRef,
}: {
  shellId: string | undefined;
  profileId: string | undefined;
  isPageVisible: boolean;
  currentShell: EPBShell | null;
  sectionStates: ReturnType<typeof useEPBShellStore.getState>["sectionStates"];
  supabase: SupabaseClient;
  updateSection: (mpa: string, patch: Partial<EPBShellSection>) => void;
  setCurrentShell: (shell: EPBShell | null) => void;
  prevPageVisibleRef: MutableRefObject<boolean>;
}) {
  useEffect(() => {
    if (!shellId || !profileId || !isPageVisible) {
      return () => {};
    }

    let aborted = false;
    const wasHidden = !prevPageVisibleRef.current;
    prevPageVisibleRef.current = isPageVisible;

    if (wasHidden) {
      void (async () => {
        const { data } = await supabase
          .from("epb_shell_sections")
          .select("*")
          .eq("shell_id", shellId);

        if (aborted || !data) return;

        (data as EPBShellSection[]).forEach((section) => {
          const currentState = useEPBShellStore.getState().sectionStates[section.mpa];
          if (!currentState?.isDirty) {
            updateSection(section.mpa, {
              statement_text: section.statement_text,
              is_complete: section.is_complete,
              last_edited_by: section.last_edited_by,
              updated_at: section.updated_at,
            });
            useEPBShellStore.getState().updateSectionState(section.mpa, {
              draftText: section.statement_text,
            });
          }
        });
      })();
    }

    return () => {
      aborted = true;
    };
  }, [shellId, profileId, isPageVisible, supabase, updateSection, prevPageVisibleRef]);

  useEffect(() => {
    if (!shellId || !profileId || !isPageVisible || !currentShell) {
      return () => {};
    }

    const sectionChannel = supabase
      .channel(`section-updates:${shellId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "epb_shell_sections",
          filter: `shell_id=eq.${shellId}`,
        },
        (payload) => {
          const updatedSection = payload.new as EPBShellSection;

          if (updatedSection.last_edited_by !== profileId) {
            updateSection(updatedSection.mpa, {
              statement_text: updatedSection.statement_text,
              is_complete: updatedSection.is_complete,
              last_edited_by: updatedSection.last_edited_by,
              updated_at: updatedSection.updated_at,
            });

            const currentSectionState = sectionStates[updatedSection.mpa];
            if (!currentSectionState?.isDirty) {
              useEPBShellStore.getState().updateSectionState(updatedSection.mpa, {
                draftText: updatedSection.statement_text,
              });
            }
          }
        }
      )
      .subscribe();

    const shellChannel = supabase
      .channel(`shell-updates:${shellId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "epb_shells",
          filter: `id=eq.${shellId}`,
        },
        (payload) => {
          const updatedShell = payload.new as EPBShell;

          if (updatedShell.duty_description !== undefined) {
            const currentDraft = useEPBShellStore.getState().dutyDescriptionDraft;
            const isDirty = useEPBShellStore.getState().isDutyDescriptionDirty;

            if (!isDirty && updatedShell.duty_description !== currentDraft) {
              useEPBShellStore.getState().setDutyDescriptionDraft(updatedShell.duty_description || "");
              setCurrentShell({
                ...currentShell,
                duty_description: updatedShell.duty_description,
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(sectionChannel);
      supabase.removeChannel(shellChannel);
    };
  }, [shellId, profileId, isPageVisible, currentShell, supabase, updateSection, sectionStates, setCurrentShell]);
}
