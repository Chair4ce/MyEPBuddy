"use client";

import { useState } from "react";
import { Loader2, Target, X } from "lucide-react";
import { TokenCostBadge } from "@/components/billing/token-cost-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { HideOnScroll } from "@/components/ui/hide-on-scroll";
import { toast } from "@/components/ui/sonner";
import {
  getAssessmentChrome,
  getAssessmentCoachingTips,
  INDICATOR_WEAK_THRESHOLD,
  isAssessmentStale,
  type AssessmentViewerRole,
} from "@/lib/assessment-coaching";
import { ENTRY_MGAS } from "@/lib/constants";
import { billableFetch } from "@/lib/fetch-with-retry";
import { cn } from "@/lib/utils";
import { useAccomplishmentsStore } from "@/stores/accomplishments-store";
import type { AccomplishmentAssessmentScores } from "@/types/database";

function getScoreColor(score: number) {
  if (score >= 80) return "text-green-600 bg-green-500/10 border-green-500/30";
  if (score >= 60) return "text-blue-600 bg-blue-500/10 border-blue-500/30";
  if (score >= 40) return "text-amber-600 bg-amber-500/10 border-amber-500/30";
  return "text-muted-foreground bg-muted border-border";
}

function getScoreLabel(score: number) {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  return "Needs Work";
}

type AssessmentDetailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accomplishmentId: string;
  scores: AccomplishmentAssessmentScores;
  selectedMpa: string;
  assessedAt?: string | null;
  updatedAt?: string | null;
  viewerRole?: AssessmentViewerRole;
};

export function AssessmentDetailDialog({
  open,
  onOpenChange,
  accomplishmentId,
  scores,
  selectedMpa,
  assessedAt,
  updatedAt,
  viewerRole = "self",
}: AssessmentDetailDialogProps) {
  const chrome = getAssessmentChrome(viewerRole);
  const coachingTips = getAssessmentCoachingTips(scores, selectedMpa);
  const stale = isAssessmentStale(assessedAt, updatedAt);
  const updateAccomplishment = useAccomplishmentsStore(
    (s) => s.updateAccomplishment
  );
  const [isAssessing, setIsAssessing] = useState(false);

  const handleReassess = async () => {
    if (isAssessing) return;
    setIsAssessing(true);
    try {
      const response = await billableFetch("/api/assess-accomplishment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accomplishmentId }),
      });

      if (!response.ok) {
        const { error } = await response.json().catch(() => ({ error: null }));
        toast.error(error || "Failed to re-assess entry");
        return;
      }

      const { assessment, assessed_at, model } = await response.json();
      const assessedAtNext =
        typeof assessed_at === "string" ? assessed_at : new Date().toISOString();
      updateAccomplishment(accomplishmentId, {
        assessment_scores: assessment as AccomplishmentAssessmentScores,
        assessed_at: assessedAtNext,
        assessment_model: model,
        updated_at: assessedAtNext,
      });
      toast.success("Assessment updated");
    } catch (error) {
      console.error("Re-assess failed:", error);
      toast.error("Failed to re-assess entry");
    } finally {
      setIsAssessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        hideCloseButton
        className="gap-0 overflow-visible border-0 bg-transparent p-0 shadow-none"
        aria-describedby="assessment-detail-description"
      >
        <DialogDescription id="assessment-detail-description" className="sr-only">
          Quality score, MPA fit, and improvement notes for this entry.
        </DialogDescription>

        {/* Mobile-only dismiss — stays put when the hide-on-scroll bar yields */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-2.5 right-2.5 z-30 size-8 bg-card/90 text-muted-foreground shadow-sm backdrop-blur-sm sm:hidden active:scale-[0.98]"
          onClick={() => onOpenChange(false)}
          aria-label="Close assessment"
        >
          <X className="size-4" />
        </Button>

        {open ? (
          <HideOnScroll
            key={accomplishmentId}
            label="AI Assessment details"
            maxHeight="min(68dvh, 460px)"
            barHeight={52}
            pinned={isAssessing}
            bar={
              <>
                <DialogTitle className="min-w-0 flex-1 truncate pr-2 text-[15px] font-semibold leading-none">
                  AI Assessment
                </DialogTitle>
                <div
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold",
                    "mr-9 sm:mr-0",
                    getScoreColor(scores.overall_score)
                  )}
                >
                  <span className="text-sm tabular-nums">
                    {scores.overall_score}
                  </span>
                  <span className="text-[11px] opacity-80">
                    {getScoreLabel(scores.overall_score)}
                  </span>
                </div>
              </>
            }
            footer={
              <div className="flex items-center justify-end px-3 py-2.5">
                <Button
                  type="button"
                  variant={stale ? "default" : "outline"}
                  size="sm"
                  className="h-8 text-xs active:scale-[0.98]"
                  onClick={handleReassess}
                  disabled={isAssessing}
                  aria-label={
                    stale
                      ? `${chrome.ctaRelabel} (assessment outdated)`
                      : chrome.ctaRelabel
                  }
                >
                  {isAssessing ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      {chrome.ctaRelabel}
                      <TokenCostBadge compact className="ml-1.5" />
                    </>
                  )}
                </Button>
              </div>
            }
          >
            <div className="flex flex-col gap-5 px-4 pb-5 pt-1">
              <p className="text-xs text-muted-foreground">
                Quality score, MPA fit, and improvement notes for this entry.
              </p>

              {stale && (
                <div
                  role="status"
                  className="rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100"
                >
                  <p className="font-medium">Assessment not current</p>
                  <p className="mt-0.5 text-amber-900/80 dark:text-amber-100/80">
                    This entry changed after it was scored. Re-assess to refresh
                    the results.
                  </p>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                  <Target className="size-3" />
                  MPA Fit Scores
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {ENTRY_MGAS.map((mpa) => {
                    const score =
                      scores.mpa_relevancy[
                        mpa.key as keyof typeof scores.mpa_relevancy
                      ];
                    if (typeof score !== "number") return null;
                    const shortLabel = mpa.label.split(" ")[0];
                    const isPrimary = scores.primary_mpa === mpa.key;
                    return (
                      <div
                        key={mpa.key}
                        className={cn(
                          "flex items-center justify-between rounded-md p-2.5 text-xs",
                          isPrimary
                            ? "border border-primary/30 bg-primary/10"
                            : "bg-muted/50"
                        )}
                      >
                        <span
                          className={cn("truncate", isPrimary && "font-medium")}
                        >
                          {shortLabel}
                          {isPrimary && " (Best)"}
                        </span>
                        <span
                          className={cn(
                            "font-mono font-medium tabular-nums",
                            getScoreColor(score).split(" ")[0]
                          )}
                        >
                          {score}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Quality Breakdown
                </span>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  {(
                    [
                      [
                        "Action Clarity",
                        scores.quality_indicators.action_clarity,
                      ],
                      ["Impact", scores.quality_indicators.impact_significance],
                      ["Metrics", scores.quality_indicators.metrics_quality],
                      ["Scope", scores.quality_indicators.scope_definition],
                    ] as const
                  ).map(([label, score]) => (
                    <div key={label} className="flex justify-between gap-2">
                      <span className="text-muted-foreground">{label}</span>
                      <span
                        className={cn(
                          "tabular-nums",
                          getScoreColor(score).split(" ")[0],
                          score < INDICATOR_WEAK_THRESHOLD && "font-semibold"
                        )}
                      >
                        {score}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {coachingTips.length > 0 && (
                <div className="flex flex-col gap-2 border-t border-border/60 pt-4">
                  <span className="text-xs font-medium text-muted-foreground">
                    {chrome.tipsHeading}
                  </span>
                  <ul
                    className="flex flex-col gap-2"
                    aria-label={chrome.tipsHeading}
                  >
                    {coachingTips.map((tip) => (
                      <li
                        key={tip.id}
                        className={cn(
                          "rounded-md px-2.5 py-2 text-xs",
                          tip.severity === "weak" &&
                            "border border-amber-500/20 bg-amber-500/10 text-amber-900 dark:text-amber-100",
                          tip.severity === "info" &&
                            "border border-border/60 bg-muted/40 text-muted-foreground",
                          tip.severity === "strong" &&
                            "border border-border/40 bg-muted/60 text-muted-foreground"
                        )}
                      >
                        <p className="font-medium text-foreground">{tip.title}</p>
                        <p className="mt-0.5 break-words text-muted-foreground">
                          {tip.body}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </HideOnScroll>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
