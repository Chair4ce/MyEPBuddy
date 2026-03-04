"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
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
import { Analytics } from "@/lib/analytics";
import { AWARD_1206_CATEGORIES } from "@/lib/constants";
import {
  AlertTriangle,
  Loader2,
  Trash2,
  FileText,
} from "lucide-react";
import type { SectionSlotState } from "@/stores/award-shell-store";

interface DeleteAwardDialogProps {
  isOpen: boolean;
  onClose: () => void;
  shellId: string;
  nomineeName: string;
  awardLevel: string;
  awardCategory: string;
  slotStates: Record<string, SectionSlotState>;
  onDeleteComplete: () => void;
}

export function DeleteAwardDialog({
  isOpen,
  onClose,
  shellId,
  nomineeName,
  awardLevel,
  awardCategory,
  slotStates,
  onDeleteComplete,
}: DeleteAwardDialogProps) {
  const supabase = createClient();
  const [isDeleting, setIsDeleting] = useState(false);

  const statementStats = useMemo(() => {
    const statementsWithContent: { category: string; label: string; charCount: number }[] = [];

    Object.entries(slotStates).forEach(([key, state]) => {
      if (state.draftText?.trim()) {
        const [category] = key.split(":");
        const cat = AWARD_1206_CATEGORIES.find((c) => c.key === category);
        statementsWithContent.push({
          category,
          label: cat?.label || category,
          charCount: state.draftText.trim().length,
        });
      }
    });

    return {
      withContent: statementsWithContent,
      totalSlots: Object.keys(slotStates).length,
    };
  }, [slotStates]);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await supabase
        .from("award_shell_sections")
        .delete()
        .eq("shell_id", shellId);

      const { error } = await supabase
        .from("award_shells")
        .delete()
        .eq("id", shellId);

      if (error) throw error;

      Analytics.awardDeleted();
      toast.success("Award package deleted");
      onDeleteComplete();
    } catch (error) {
      console.error("Error deleting award shell:", error);
      toast.error("Failed to delete award package");
    } finally {
      setIsDeleting(false);
    }
  };

  const levelLabel = awardLevel.charAt(0).toUpperCase() + awardLevel.slice(1);
  const categoryLabel = awardCategory.toUpperCase();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg mx-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-destructive" />
            Delete Award Package
          </DialogTitle>
          <DialogDescription className="text-left">
            This action is permanent and cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Award Info Summary */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
            <div>
              <p className="font-medium text-sm">{nomineeName || "Unknown Nominee"}</p>
              <p className="text-xs text-muted-foreground">
                {levelLabel} &middot; {categoryLabel}
              </p>
            </div>
            <Badge variant="secondary">
              {statementStats.withContent.length}/{statementStats.totalSlots} Statements
            </Badge>
          </div>

          {/* What will be deleted */}
          <div className="space-y-3 rounded-lg border border-destructive/30 p-4 bg-destructive/5">
            <h4 className="font-medium text-sm">What will be permanently deleted:</h4>

            <div className="flex items-start gap-3">
              <div className="size-8 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                <Trash2 className="size-4 text-destructive" />
              </div>
              <div>
                <p className="text-sm font-medium">
                  All statements and saved details
                </p>
                <p className="text-xs text-muted-foreground">
                  {statementStats.withContent.length > 0
                    ? `${statementStats.withContent.length} statement${statementStats.withContent.length !== 1 ? "s" : ""} with content will be permanently removed.`
                    : "No statements have been written yet."}
                </p>
              </div>
            </div>
          </div>

          {/* List of statements that will be lost */}
          {statementStats.withContent.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Statements that will be lost ({statementStats.withContent.length})
              </p>
              <div className="max-h-[150px] overflow-y-auto rounded-lg border bg-muted/30 p-2 space-y-1">
                {statementStats.withContent.map((statement, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-1.5 px-2 rounded bg-card"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="size-3.5 text-muted-foreground" />
                      <span className="text-sm">{statement.label}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {statement.charCount} chars
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warning */}
          {statementStats.withContent.length > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 border">
              <AlertTriangle className="size-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Consider copying your statements before deleting. This action cannot be reversed.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isDeleting}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
            className="w-full sm:w-auto gap-1.5"
          >
            {isDeleting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="size-4" />
                Delete Permanently
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
