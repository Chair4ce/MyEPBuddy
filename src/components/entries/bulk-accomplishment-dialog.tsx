"use client";

import { useState } from "react";
import { Analytics } from "@/lib/analytics";
import { useUserStore } from "@/stores/user-store";
import { useAccomplishmentsStore } from "@/stores/accomplishments-store";
import { Button } from "@/components/ui/button";
import { TokenCostBadge } from "@/components/billing/token-cost-badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { createAccomplishment } from "@/app/actions/accomplishments";
import { isEnlisted } from "@/lib/constants";
import { billableFetch } from "@/lib/fetch-with-retry";
import {
  BILLABLE_BURST_BUFFER_MS,
  BYOK_BURST_LIMIT,
  DEFAULT_KEY_CLIENT_BURST_LIMIT,
  BILLABLE_BURST_WINDOW_MS,
  recordBurstAction,
  waitForBurstSlot,
} from "@/lib/burst-pacing";
import { handleUsageLimitResponse } from "@/stores/usage-limit-store";
import {
  getScanSummary,
  scanForSensitiveData,
  scanTextForLLM,
} from "@/lib/sensitive-data-scanner";
import { handleStaleDeploymentError } from "@/lib/stale-deployment";
import {
  toBulkDrafts,
  type BulkAccomplishmentDraft,
  type NormalizedExtractedAccomplishment,
} from "@/lib/extract-accomplishments";
import { BulkAccomplishmentReview } from "@/components/entries/bulk-accomplishment-review";
import { cn } from "@/lib/utils";
import { motionPressOnly } from "@/lib/motion/classes";
import { Loader2, Sparkles } from "lucide-react";
import type { Accomplishment, Rank } from "@/types/database";

type BulkStep = "input" | "review";

interface BulkAccomplishmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUserId?: string | null;
  targetManagedMemberId?: string | null;
  rateeName?: string;
  rateeRank?: Rank | null;
  cycleYear: number;
  /** Called after successful save. openGenerateEpb mirrors the primary CTA. */
  onSaved: (created: Accomplishment[], openGenerateEpb: boolean) => void;
}

function todayIsoDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function BulkAccomplishmentDialog({
  open,
  onOpenChange,
  targetUserId,
  targetManagedMemberId,
  rateeName,
  rateeRank,
  cycleYear,
  onSaved,
}: BulkAccomplishmentDialogProps) {
  const { profile } = useUserStore();
  const { addAccomplishment, updateAccomplishment: updateStore } =
    useAccomplishmentsStore();

  const [step, setStep] = useState<BulkStep>("input");
  const [bulkText, setBulkText] = useState("");
  const [drafts, setDrafts] = useState<BulkAccomplishmentDraft[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canGenerateEpb = isEnlisted(rateeRank ?? null);

  function resetForm() {
    setStep("input");
    setBulkText("");
    setDrafts([]);
    setIsExtracting(false);
    setIsSubmitting(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm();
    onOpenChange(next);
  }

  async function triggerSensitiveDataScan(accomplishmentId: string) {
    try {
      await fetch("/api/scan-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accomplishmentId }),
      });
    } catch (error) {
      console.error("Background sensitive data scan failed:", error);
    }
  }

  async function triggerAssessment(accomplishmentId: string): Promise<boolean> {
    try {
      const response = await fetch("/api/assess-accomplishment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accomplishmentId }),
      });
      if (response.ok) {
        const { assessment, assessed_at, model } = await response.json();
        updateStore(accomplishmentId, {
          assessment_scores: assessment,
          assessed_at,
          assessment_model: model,
        });
        return true;
      }
      const errorData = (await response.json().catch(() => ({}))) as {
        errorCode?: string;
      };
      return errorData.errorCode === "burst_rate_limited" ? false : true;
    } catch (error) {
      console.error("Background assessment failed:", error);
      return true;
    }
  }

  /** Serial + paced under the shared default-key pool; backoff harder on 429. */
  async function queueBackgroundAssessments(ids: string[]) {
    let recent: number[] = [];
    for (const id of ids) {
      for (let attempt = 0; attempt < 4; attempt++) {
        await waitForBurstSlot(recent, {
          limit: DEFAULT_KEY_CLIENT_BURST_LIMIT,
        });
        const consumedOrDone = await triggerAssessment(id);
        if (consumedOrDone) {
          recent = recordBurstAction(recent);
          break;
        }
        // Contended pool or BYOK 5/60 — wait a full BYOK slot before retry.
        await new Promise((r) =>
          setTimeout(
            r,
            Math.ceil(BILLABLE_BURST_WINDOW_MS / BYOK_BURST_LIMIT) +
              BILLABLE_BURST_BUFFER_MS,
          ),
        );
      }
    }
  }

  async function handleExtract() {
    if (!bulkText.trim() || bulkText.trim().length < 10) {
      toast.error("Paste at least a short note or bullet list to extract");
      return;
    }

    const { blocked, matches } = scanTextForLLM(bulkText);
    if (blocked) {
      toast.error(getScanSummary(matches), { duration: 10000 });
      return;
    }

    setIsExtracting(true);
    try {
      const response = await billableFetch("/api/extract-accomplishments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText: bulkText,
          defaultCycleYear: cycleYear,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        if (handleUsageLimitResponse(error)) return;
        throw new Error(
          (error as { error?: string }).error ||
            "Failed to extract accomplishments",
        );
      }

      const result = (await response.json()) as {
        accomplishments: NormalizedExtractedAccomplishment[];
      };

      if (!result.accomplishments?.length) {
        toast.error(
          "No accomplishments could be extracted. Try clearer bullets or more detail.",
        );
        return;
      }

      setDrafts(
        toBulkDrafts(result.accomplishments, {
          date: todayIsoDate(),
          cycleYear,
        }),
      );
      setStep("review");
      toast.success(
        `Found ${result.accomplishments.length} accomplishment${
          result.accomplishments.length !== 1 ? "s" : ""
        }`,
      );
    } catch (error) {
      console.error("Error extracting accomplishments:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to extract accomplishments",
      );
    } finally {
      setIsExtracting(false);
    }
  }

  async function saveDrafts(openGenerateEpb: boolean) {
    const toSave = drafts.filter(
      (d) =>
        d.included &&
        d.action_verb.trim() &&
        d.details.trim() &&
        d.mpa,
    );

    if (toSave.length === 0) {
      toast.error("Include at least one complete accomplishment to save");
      return;
    }

    for (const draft of toSave) {
      const sensitiveMatches = scanForSensitiveData({
        details: draft.details,
        impact: draft.impact,
        metrics: draft.metrics,
      });
      if (sensitiveMatches.length > 0) {
        toast.error(getScanSummary(sensitiveMatches), { duration: 10000 });
        return;
      }
    }

    const userId = targetManagedMemberId
      ? profile?.id
      : targetUserId || profile?.id;
    if (!userId || !profile?.id) {
      toast.error("User not found");
      return;
    }

    setIsSubmitting(true);
    const created: Accomplishment[] = [];
    const assessIds: string[] = [];

    try {
      for (const draft of toSave) {
        const result = await createAccomplishment({
          user_id: targetManagedMemberId ? profile.id : userId,
          created_by: profile.id,
          team_member_id: targetManagedMemberId || null,
          date: draft.date,
          action_verb: draft.action_verb.trim(),
          details: draft.details.trim(),
          impact: draft.impact.trim() || null,
          metrics: draft.metrics.trim() || null,
          mpa: draft.mpa,
          tags: [],
          cycle_year: draft.cycle_year,
          assessment_scores: null,
          assessed_at: null,
          assessment_model: null,
        });

        if (result.error) {
          toast.error(result.error);
          if (created.length > 0) {
            onSaved(created, false);
          }
          return;
        }

        if (result.data) {
          addAccomplishment(result.data);
          created.push(result.data);
          Analytics.accomplishmentCreated(draft.mpa, !!draft.metrics.trim());
          void triggerSensitiveDataScan(result.data.id);
          // Generate EPB plan step scores entries with burst pacing — don't race it.
          if (!openGenerateEpb && isEnlisted(rateeRank ?? null)) {
            assessIds.push(result.data.id);
          }
        }
      }

      toast.success(
        `Saved ${created.length} entr${created.length === 1 ? "y" : "ies"}`,
      );
      handleOpenChange(false);
      onSaved(created, openGenerateEpb);
      if (assessIds.length > 0) {
        void queueBackgroundAssessments(assessIds);
      }
    } catch (error) {
      if (handleStaleDeploymentError(error)) return;
      toast.error("An error occurred while saving");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        size="auto"
        className="flex h-[min(92dvh,900px)] max-h-[min(92dvh,900px)] w-[calc(100vw-1rem)] max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:w-full"
        aria-describedby="bulk-accomplishment-desc"
      >
        <DialogHeader className="shrink-0 border-b px-4 py-3 pr-12 sm:px-6 sm:py-4">
          <DialogTitle className="text-base sm:text-lg">
            {step === "input"
              ? "Bulk paste accomplishments"
              : "Review extracted entries"}
          </DialogTitle>
          <DialogDescription id="bulk-accomplishment-desc" className="text-sm">
            {step === "input"
              ? "Paste bullets, award notes, or messy stories. We’ll split them into editable entries."
              : "Tweak verbs, metrics, and MPAs before saving."}
          </DialogDescription>
          {(rateeName || cycleYear) && (
            <p className="text-xs text-muted-foreground">
              {rateeName ? `For ${rateeName}` : "For selected ratee"}
              {" · "}
              Cycle {cycleYear}
            </p>
          )}
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col px-4 py-3 sm:px-6 sm:py-5">
          {step === "input" ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <div className="flex min-h-0 flex-1 flex-col gap-1.5">
                <Label htmlFor="bulk-paste-text">Paste text</Label>
                <Textarea
                  id="bulk-paste-text"
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder={`Examples you can paste:\n• Led 12-person team through…\n• Award statement / decoration package excerpts\n• Messy notes from a feedback session or deployment\n\nWe’ll extract action verbs, details, impact, metrics, and MPAs.`}
                  className="h-full min-h-0 flex-1 resize-none font-mono text-sm [field-sizing:fixed]"
                  aria-label="Bulk paste accomplishment text"
                  disabled={isExtracting}
                />
              </div>
              <div className="flex shrink-0 justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => handleOpenChange(false)}
                  disabled={isExtracting}
                  className={cn(motionPressOnly)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleExtract()}
                  disabled={isExtracting || bulkText.trim().length < 10}
                  className={cn(motionPressOnly)}
                >
                  {isExtracting ? (
                    <>
                      <Loader2 className="mr-1.5 size-4 animate-spin" />
                      Extracting…
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-1.5 size-4" />
                      Extract
                      <TokenCostBadge
                        compact
                        className="ml-1.5 border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground"
                      />
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <BulkAccomplishmentReview
              drafts={drafts}
              onDraftsChange={setDrafts}
              onBack={() => setStep("input")}
              onSaveOnly={() => void saveDrafts(false)}
              onSaveAndGenerate={() => void saveDrafts(true)}
              isSubmitting={isSubmitting}
              canGenerateEpb={canGenerateEpb}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
