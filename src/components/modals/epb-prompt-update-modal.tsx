"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { Check, Copy, Loader2, RotateCcw, Wand2 } from "lucide-react";
import {
  DEFAULT_EPB_SYSTEM_PROMPT,
  EPB_SYSTEM_PROMPT_REVISION,
  isLegacyOrUnconfiguredEpbPrompt,
  promptsAreEquivalent,
  shouldAutoMigrateEpbPrompt,
  shouldShowEpbPromptUpdateModal,
} from "@/lib/default-llm-prompts";

type LlmPromptRow = {
  base_system_prompt: string;
  epb_system_prompt_revision_acknowledged: number;
};

export function EpbPromptUpdateModal() {
  const { profile } = useUserStore();
  const supabase = createClient();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  const acknowledgeRevision = useCallback(
    async (resetToDefault: boolean) => {
      if (!profile) return false;
      setIsSaving(true);
      try {
        const updateData: {
          epb_system_prompt_revision_acknowledged: number;
          base_system_prompt?: string;
        } = {
          epb_system_prompt_revision_acknowledged: EPB_SYSTEM_PROMPT_REVISION,
        };
        if (resetToDefault) {
          updateData.base_system_prompt = DEFAULT_EPB_SYSTEM_PROMPT;
        }

        const { error } = await supabase
          .from("user_llm_settings")
          .update(updateData as never)
          .eq("user_id", profile.id);

        if (error) throw error;

        toast.success(
          resetToDefault
            ? "EPB prompt reset to the new default"
            : "Keeping your custom EPB prompt"
        );
        setIsOpen(false);
        return true;
      } catch (error) {
        console.error("EPB prompt revision ack error:", error);
        toast.error("Failed to save your preference. Please try again.");
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [profile, supabase]
  );

  const runAutoMigrate = useCallback(
    async (row: LlmPromptRow) => {
      if (!profile) return;
      const needsPromptReplace =
        isLegacyOrUnconfiguredEpbPrompt(row.base_system_prompt) &&
        !promptsAreEquivalent(row.base_system_prompt, DEFAULT_EPB_SYSTEM_PROMPT);

      const updateData: {
        epb_system_prompt_revision_acknowledged: number;
        base_system_prompt?: string;
      } = {
        epb_system_prompt_revision_acknowledged: EPB_SYSTEM_PROMPT_REVISION,
      };
      if (needsPromptReplace) {
        updateData.base_system_prompt = DEFAULT_EPB_SYSTEM_PROMPT;
      }

      const { error } = await supabase
        .from("user_llm_settings")
        .update(updateData as never)
        .eq("user_id", profile.id);

      if (error) {
        console.error("EPB prompt auto-migrate error:", error);
        return;
      }

      if (needsPromptReplace) {
        toast.success("Your EPB prompt was updated to the latest default");
      }
    },
    [profile, supabase]
  );

  useEffect(() => {
    if (!profile || hasChecked) return;

    if (!profile.terms_accepted_at) return;

    let cancelled = false;

    async function checkPromptRevision() {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from("user_llm_settings")
          .select("base_system_prompt, epb_system_prompt_revision_acknowledged")
          .eq("user_id", profile!.id)
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
          setHasChecked(true);
          return;
        }

        if (shouldShowEpbPromptUpdateModal(ack, row.base_system_prompt)) {
          setTimeout(() => {
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

    checkPromptRevision();

    return () => {
      cancelled = true;
    };
  }, [profile, hasChecked, supabase, runAutoMigrate]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(DEFAULT_EPB_SYSTEM_PROMPT);
      setCopied(true);
      toast.success("New default prompt copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  function handleDismiss(open: boolean) {
    if (open || isSaving) return;
    void acknowledgeRevision(false);
  }

  if (isLoading && !isOpen) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleDismiss}>
      <DialogContent
        className="max-w-2xl w-[calc(100%-2rem)] max-h-[90dvh] flex flex-col gap-0 p-0 overflow-hidden"
        aria-labelledby="epb-prompt-update-title"
        aria-describedby="epb-prompt-update-description"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="px-4 pt-4 pb-2 sm:px-6 sm:pt-6 shrink-0">
          <DialogTitle
            id="epb-prompt-update-title"
            className="flex items-center gap-2 text-base sm:text-lg"
          >
            <Wand2 className="size-4 shrink-0" aria-hidden />
            EPB Prompt Updated
          </DialogTitle>
          <DialogDescription id="epb-prompt-update-description" className="text-xs sm:text-sm">
            The default EPB system prompt has been updated. Your account uses a custom prompt.
            Review the new default below, copy it if you want to edit it elsewhere, then choose
            whether to reset or keep your current version. This notice appears once per prompt
            update.
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 sm:px-6 pb-3 flex items-center justify-between gap-2 shrink-0">
          <p className="text-[10px] sm:text-xs text-muted-foreground font-medium">
            New default EPB system prompt
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0"
            onClick={handleCopy}
            aria-label="Copy new default EPB prompt to clipboard"
          >
            {copied ? (
              <Check className="size-3.5 mr-1.5" aria-hidden />
            ) : (
              <Copy className="size-3.5 mr-1.5" aria-hidden />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>

        <ScrollArea className="flex-1 min-h-0 max-h-[min(50dvh,420px)] border-y">
          <Textarea
            readOnly
            value={DEFAULT_EPB_SYSTEM_PROMPT}
            className="min-h-[280px] font-mono text-[10px] sm:text-xs border-0 rounded-none resize-none focus-visible:ring-0 shadow-none"
            aria-label="New default EPB system prompt (read only)"
          />
        </ScrollArea>

        <DialogFooter className="px-4 py-3 sm:px-6 sm:py-4 flex-col-reverse sm:flex-row gap-2 shrink-0">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={isSaving}
            onClick={() => acknowledgeRevision(false)}
            aria-label="Keep my current EPB prompt"
          >
            Keep my current prompt
          </Button>
          <Button
            type="button"
            className="w-full sm:w-auto"
            disabled={isSaving}
            onClick={() => acknowledgeRevision(true)}
            aria-label="Reset EPB prompt to new default"
          >
            {isSaving ? (
              <Loader2 className="size-4 mr-2 animate-spin" aria-hidden />
            ) : (
              <RotateCcw className="size-4 mr-2" aria-hidden />
            )}
            Reset to new default
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
