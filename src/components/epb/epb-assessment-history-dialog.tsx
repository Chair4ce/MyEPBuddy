"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { motionListRow } from "@/lib/motion/classes";
import { formatDateTime } from "@/lib/format";
import { EPBAssessmentDialog } from "./epb-assessment-dialog";
import type { EPBAssessmentResult } from "@/lib/constants";
import { ChevronRight, History, Loader2, ClipboardCheck } from "lucide-react";

/** A persisted EPB assessment row (see migration 209_epb_assessments). */
export interface EpbAssessmentRecord {
  id: string;
  shell_id: string;
  user_id: string;
  created_by: string;
  rank: string | null;
  afsc: string | null;
  model: string | null;
  cycle_year: number | null;
  overall_strength: string | null;
  form_used: string | null;
  assessment: EPBAssessmentResult;
  created_at: string;
}

interface EpbAssessmentHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assessments: EpbAssessmentRecord[];
  isLoading?: boolean;
}

function humanizeStrength(value: string | null): string {
  if (!value) return "—";
  return value
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function strengthBadgeClass(value: string | null): string {
  switch (value) {
    case "far_exceeds":
    case "significantly_exceeds":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
    case "exceeds":
      return "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30";
    case "meets":
      return "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30";
    case "does_not_meet":
      return "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30";
    default:
      return "bg-muted text-muted-foreground border-muted";
  }
}

export function EpbAssessmentHistoryDialog({
  open,
  onOpenChange,
  assessments,
  isLoading = false,
}: EpbAssessmentHistoryDialogProps) {
  const [selected, setSelected] = useState<EpbAssessmentRecord | null>(null);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[85vh] gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b bg-muted/30 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                <History className="size-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-lg">Assessment history</DialogTitle>
                <DialogDescription className="text-xs">
                  Every AI performance review saved for this EPB. Open one to view
                  the full report.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading assessments…</p>
            </div>
          ) : assessments.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-muted/50">
                <ClipboardCheck className="size-7 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No assessments yet</p>
              <p className="max-w-xs text-xs text-muted-foreground leading-relaxed">
                Run an AI Performance Review to create your first assessment. Each
                one is saved here so you can track progress over time.
              </p>
            </div>
          ) : (
            <ScrollArea className="max-h-[calc(85vh-88px)]">
              <ul className="divide-y">
                {assessments.map((record) => (
                  <li key={record.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(record)}
                      className={cn(
                        "flex w-full items-center gap-3 px-6 py-4 text-left",
                        motionListRow
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">
                            {formatDateTime(record.created_at)}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px]",
                              strengthBadgeClass(record.overall_strength)
                            )}
                          >
                            {humanizeStrength(record.overall_strength)}
                          </Badge>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {record.form_used || "AF Form 931/932"}
                          {record.assessment?.overallSummary
                            ? ` — ${record.assessment.overallSummary}`
                            : ""}
                        </p>
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      <EPBAssessmentDialog
        isOpen={selected !== null}
        onClose={() => setSelected(null)}
        assessment={selected?.assessment ?? null}
      />
    </>
  );
}
