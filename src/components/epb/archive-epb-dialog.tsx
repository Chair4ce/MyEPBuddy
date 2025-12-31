"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { createClient } from "@/lib/supabase/client";
import { STANDARD_MGAS, ENTRY_MGAS } from "@/lib/constants";
import {
  Archive,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Sparkles,
  Library,
  Trash2,
  ArrowRight,
} from "lucide-react";
import type { EPBShell, EPBShellSection } from "@/types/database";
import type { SelectedRatee } from "@/stores/epb-shell-store";
import confetti from "canvas-confetti";

interface ArchiveEPBDialogProps {
  isOpen: boolean;
  onClose: () => void;
  shell: EPBShell;
  sections: Record<string, EPBShellSection>;
  ratee: SelectedRatee | null;
  cycleYear: number;
  onArchiveComplete: () => void;
}

export function ArchiveEPBDialog({
  isOpen,
  onClose,
  shell,
  sections,
  ratee,
  cycleYear,
  onArchiveComplete,
}: ArchiveEPBDialogProps) {
  const supabase = createClient();
  const [step, setStep] = useState<"confirm" | "name" | "success">("confirm");
  const [archiveName, setArchiveName] = useState(`EPB ${cycleYear}`);
  const [isArchiving, setIsArchiving] = useState(false);
  const [statementsSaved, setStatementsSaved] = useState(0);

  // Calculate statement stats
  const statementStats = useMemo(() => {
    const coreMPAs = ENTRY_MGAS.map((m) => m.key);
    const completedSections = Object.values(sections).filter(
      (s) => coreMPAs.includes(s.mpa) && s.is_complete
    );
    const sectionsWithContent = Object.values(sections).filter(
      (s) => s.statement_text && s.statement_text.trim().length > 10
    );
    const totalCoreSections = coreMPAs.length;

    return {
      completed: completedSections.length,
      total: totalCoreSections,
      withContent: sectionsWithContent.length,
      isFullyComplete: completedSections.length === totalCoreSections,
    };
  }, [sections]);

  // Get MPA labels for sections with content
  const sectionsWithContentList = useMemo(() => {
    return Object.values(sections)
      .filter((s) => s.statement_text && s.statement_text.trim().length > 10)
      .map((s) => {
        const mga = STANDARD_MGAS.find((m) => m.key === s.mpa);
        return {
          mpa: s.mpa,
          label: mga?.label || s.mpa,
          charCount: s.statement_text.length,
          isComplete: s.is_complete,
        };
      });
  }, [sections]);

  const handleArchive = async () => {
    setIsArchiving(true);
    try {
      const { data, error } = await supabase.rpc("archive_epb_shell", {
        p_shell_id: shell.id,
        p_archive_name: archiveName.trim() || null,
        p_clear_after_archive: true, // Always clear after archive
      });

      if (error) throw error;

      const result = data?.[0] as
        | {
            success: boolean;
            statements_saved: number;
            shell_id: string;
            error_message: string | null;
          }
        | undefined;

      if (!result?.success) {
        throw new Error(result?.error_message || "Archive failed");
      }

      setStatementsSaved(result.statements_saved);
      setStep("success");

      // Trigger confetti for successful archive
      if (result.statements_saved > 0) {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ["#8b5cf6", "#6366f1", "#3b82f6"],
        });
      }

      toast.success("EPB Archived Successfully!", {
        description: `${result.statements_saved} statements saved to your library`,
      });
    } catch (err) {
      console.error("Archive error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to archive EPB");
    } finally {
      setIsArchiving(false);
    }
  };

  const handleClose = () => {
    if (step === "success") {
      onArchiveComplete();
    }
    // Reset state
    setStep("confirm");
    setArchiveName(`EPB ${cycleYear}`);
    setStatementsSaved(0);
    onClose();
  };

  const rateeName = ratee
    ? `${ratee.rank || ""} ${ratee.fullName || ""}`.trim()
    : "";

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg mx-auto">
        {step === "confirm" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Archive className="size-5 text-violet-500" />
                Archive EPB
              </DialogTitle>
              <DialogDescription className="text-left">
                Are you sure you want to archive this EPB?
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* EPB Info Summary */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                <div>
                  <p className="font-medium text-sm">{rateeName || "My EPB"}</p>
                  <p className="text-xs text-muted-foreground">
                    {cycleYear} Performance Cycle
                  </p>
                </div>
                <Badge variant="secondary">
                  {statementStats.completed}/{statementStats.total} Complete
                </Badge>
              </div>

              {/* What will happen */}
              <div className="space-y-3 rounded-lg border p-4 bg-muted/30">
                <h4 className="font-medium text-sm">What happens when you archive:</h4>
                
                <div className="space-y-3">
                  {/* Save to library */}
                  <div className="flex items-start gap-3">
                    <div className="size-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <Library className="size-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        Statements saved to library
                      </p>
                      <p className="text-xs text-muted-foreground">
                        All {sectionsWithContentList.length} statements will be saved to your Statement Library and become searchable for future use.
                      </p>
                    </div>
                  </div>

                  {/* Current view erased */}
                  <div className="flex items-start gap-3">
                    <div className="size-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <Trash2 className="size-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        Current EPB will be cleared
                      </p>
                      <p className="text-xs text-muted-foreground">
                        The current EPB workspace will be erased. You&apos;ll start fresh with a blank EPB for your next cycle.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Warning if not fully complete */}
              {!statementStats.isFullyComplete && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 border">
                  <AlertTriangle className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    Not all MPA sections are marked complete. You can still
                    archive, but consider completing all sections first.
                  </p>
                </div>
              )}
            </div>

            <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={handleClose}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                onClick={() => setStep("name")}
                disabled={sectionsWithContentList.length === 0}
                className="w-full sm:w-auto gap-1.5"
              >
                Continue
                <ArrowRight className="size-4" />
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "name" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Archive className="size-5 text-violet-500" />
                Name Your Archive
              </DialogTitle>
              <DialogDescription className="text-left">
                Give this archived EPB a name so you can find it later in your library.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Archive Name */}
              <div className="space-y-2">
                <Label htmlFor="archive-name" className="text-sm font-medium">
                  Archive Name
                </Label>
                <Input
                  id="archive-name"
                  value={archiveName}
                  onChange={(e) => setArchiveName(e.target.value)}
                  placeholder={`EPB ${cycleYear}`}
                  className="text-sm"
                  aria-label="Archive name"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  This name will appear in your library filter
                </p>
              </div>

              {/* Statements to be saved */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  Statements to Save ({sectionsWithContentList.length})
                </Label>
                <div className="max-h-[150px] overflow-y-auto rounded-lg border bg-muted/30 p-2 space-y-1">
                  {sectionsWithContentList.map((section) => (
                    <div
                      key={section.mpa}
                      className="flex items-center justify-between py-1.5 px-2 rounded bg-card"
                    >
                      <div className="flex items-center gap-2">
                        {section.isComplete ? (
                          <CheckCircle2 className="size-3.5 text-green-500" />
                        ) : (
                          <FileText className="size-3.5 text-muted-foreground" />
                        )}
                        <span className="text-sm">{section.label}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {section.charCount} chars
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={() => setStep("confirm")}
                className="w-full sm:w-auto"
              >
                Back
              </Button>
              <Button
                onClick={handleArchive}
                disabled={isArchiving}
                className="w-full sm:w-auto gap-1.5 bg-violet-600 hover:bg-violet-700"
              >
                {isArchiving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Archive className="size-4" />
                )}
                Archive EPB
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "success" && (
          <>
            {/* Success State */}
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-violet-500" />
                EPB Archived Successfully!
              </DialogTitle>
            </DialogHeader>

            <div className="py-8 text-center space-y-4">
              <div className="size-16 mx-auto rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                <Sparkles className="size-8 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {statementsSaved}
                </p>
                <p className="text-sm text-muted-foreground">
                  statements saved to your library
                </p>
              </div>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                You can find these statements in your{" "}
                <span className="font-medium text-foreground">
                  Statement Library
                </span>{" "}
                filtered by this archived EPB.
              </p>
              <p className="text-xs text-muted-foreground">
                Your EPB workspace has been cleared for your next cycle.
              </p>
            </div>

            <DialogFooter>
              <Button onClick={handleClose} className="w-full sm:w-auto">
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
