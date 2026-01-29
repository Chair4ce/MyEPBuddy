"use client";

import { useState, useEffect } from "react";
import { Analytics } from "@/lib/posthog";
import { useUserStore } from "@/stores/user-store";
import { useAccomplishmentsStore } from "@/stores/accomplishments-store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ComboboxInput } from "@/components/ui/combobox-input";
import { toast } from "@/components/ui/sonner";
import {
  createAccomplishment,
  updateAccomplishment,
} from "@/app/actions/accomplishments";
import { DEFAULT_ACTION_VERBS, ENTRY_MGAS, getActiveCycleYear, isEnlisted } from "@/lib/constants";
import type { Rank } from "@/types/database";
import { Loader2, Sparkles, Target, BarChart3 } from "lucide-react";
import { celebrateEntry } from "@/lib/confetti";
import { cn } from "@/lib/utils";
import type { Accomplishment, AccomplishmentAssessmentScores } from "@/types/database";
import { ProjectSelector } from "@/components/entries/project-selector";
import { createClient } from "@/lib/supabase/client";

interface EntryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editEntry?: Accomplishment | null;
  targetUserId?: string | null;
  targetManagedMemberId?: string | null;
}

export function EntryFormDialog({
  open,
  onOpenChange,
  editEntry,
  targetUserId,
  targetManagedMemberId,
}: EntryFormDialogProps) {
  const { profile, epbConfig } = useUserStore();
  const { addAccomplishment, updateAccomplishment: updateStore } =
    useAccomplishmentsStore();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAssessing, setIsAssessing] = useState(false);
  const [previewAssessment, setPreviewAssessment] = useState<AccomplishmentAssessmentScores | null>(null);
  const [assessmentModel, setAssessmentModel] = useState<string | null>(null);
  const [assessmentFormUsed, setAssessmentFormUsed] = useState<string | null>(null);
  const [assessmentRateeRank, setAssessmentRateeRank] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const supabase = createClient();
  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    action_verb: "",
    details: "",
    impact: "",
    metrics: "",
    mpa: "",
    tags: "",
  });

  // Use entry MPAs (excludes HLR which is Commander's assessment)
  const mgas = ENTRY_MGAS;
  // Cycle year is computed from the user's rank and SCOD
  const cycleYear = getActiveCycleYear(profile?.rank as Rank | null);

  // Trigger background assessment for an accomplishment
  // This runs asynchronously and updates the store when complete
  const triggerAssessment = async (accomplishmentId: string) => {
    try {
      const response = await fetch("/api/assess-accomplishment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accomplishmentId }),
      });

      if (response.ok) {
        const { assessment, assessed_at, model } = await response.json();
        // Update the store with the assessment results
        updateStore(accomplishmentId, {
          assessment_scores: assessment as AccomplishmentAssessmentScores,
          assessed_at,
          assessment_model: model,
        });
      }
    } catch (error) {
      // Silent fail - assessment is optional enhancement
      console.error("Background assessment failed:", error);
    }
  };

  // Preview assessment before saving
  const handleRateAccomplishment = async () => {
    if (!form.action_verb || !form.details) {
      toast.error("Please fill in the action verb and details first");
      return;
    }

    setIsAssessing(true);
    try {
      const response = await fetch("/api/assess-accomplishment-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action_verb: form.action_verb,
          details: form.details,
          impact: form.impact || null,
          metrics: form.metrics || null,
          mpa: form.mpa,
        }),
      });

      if (response.ok) {
        const { assessment, model, formUsed, rateeRank } = await response.json();
        setPreviewAssessment(assessment);
        setAssessmentModel(model);
        setAssessmentFormUsed(formUsed);
        setAssessmentRateeRank(rateeRank);
        toast.success("Assessment complete!");
      } else {
        const { error } = await response.json();
        toast.error(error || "Failed to assess accomplishment");
      }
    } catch (error) {
      console.error("Preview assessment failed:", error);
      toast.error("Failed to assess accomplishment");
    } finally {
      setIsAssessing(false);
    }
  };

  // Helper to get score color
  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600 bg-green-500/10 border-green-500/30";
    if (score >= 60) return "text-blue-600 bg-blue-500/10 border-blue-500/30";
    if (score >= 40) return "text-amber-600 bg-amber-500/10 border-amber-500/30";
    return "text-muted-foreground bg-muted border-border";
  };

  // Helper to get score label
  const getScoreLabel = (score: number) => {
    if (score >= 80) return "Excellent";
    if (score >= 60) return "Good";
    if (score >= 40) return "Fair";
    return "Needs Work";
  };

  // Reset form when dialog opens/closes or edit entry changes
  useEffect(() => {
    if (editEntry) {
      setForm({
        date: editEntry.date,
        action_verb: editEntry.action_verb,
        details: editEntry.details,
        impact: editEntry.impact || "",
        metrics: editEntry.metrics || "",
        mpa: editEntry.mpa || "miscellaneous", // Default to Miscellaneous if null
        tags: Array.isArray(editEntry.tags) ? editEntry.tags.join(", ") : "",
      });
      // Load existing assessment if available
      setPreviewAssessment(editEntry.assessment_scores || null);
      setAssessmentModel(editEntry.assessment_model || null);
      setAssessmentFormUsed(null);
      setAssessmentRateeRank(null);
      // Load existing project link
      loadExistingProjectLink(editEntry.id);
    } else {
      setForm({
        date: new Date().toISOString().split("T")[0],
        action_verb: "",
        details: "",
        impact: "",
        metrics: "",
        mpa: "executing_mission", // Default to Executing the Mission
        tags: "",
      });
      // Clear assessment preview
      setPreviewAssessment(null);
      setAssessmentModel(null);
      setAssessmentFormUsed(null);
      setAssessmentRateeRank(null);
      setSelectedProjectId(null);
    }
  }, [editEntry, open]);

  // Load existing project link for an accomplishment
  // Type assertions needed due to Supabase type generation issue with new tables
  async function loadExistingProjectLink(accomplishmentId: string) {
    const { data } = await (supabase
      .from("accomplishment_projects") as any)
      .select("project_id")
      .eq("accomplishment_id", accomplishmentId)
      .maybeSingle() as { data: { project_id: string } | null };
    
    setSelectedProjectId(data?.project_id || null);
  }

  // Update project link for an accomplishment
  async function updateProjectLink(accomplishmentId: string) {
    // First, get the current link
    const { data: existingLink } = await (supabase
      .from("accomplishment_projects") as any)
      .select("id, project_id")
      .eq("accomplishment_id", accomplishmentId)
      .maybeSingle() as { data: { id: string; project_id: string } | null };

    const currentProjectId = existingLink?.project_id;

    // If the selected project hasn't changed, do nothing
    if (currentProjectId === selectedProjectId) return;

    // If there was a link, remove it
    if (existingLink) {
      await (supabase
        .from("accomplishment_projects") as any)
        .delete()
        .eq("id", existingLink.id);
    }

    // If a new project is selected, create the link
    if (selectedProjectId) {
      await (supabase
        .from("accomplishment_projects") as any)
        .insert({
          accomplishment_id: accomplishmentId,
          project_id: selectedProjectId,
        });
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.action_verb || !form.details) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsSubmitting(true);

    const tags = form.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    // For managed members, use supervisor's ID as user_id for RLS
    const userId = targetManagedMemberId ? profile?.id : (targetUserId || profile?.id);
    if (!userId) {
      toast.error("User not found");
      setIsSubmitting(false);
      return;
    }

    // Check if we have a pre-assessed result to include
    const hasPreAssessment = previewAssessment !== null;

    try {
      if (editEntry) {
        const updateData: Parameters<typeof updateAccomplishment>[1] = {
          date: form.date,
          action_verb: form.action_verb,
          details: form.details,
          impact: form.impact || null,
          metrics: form.metrics || null,
          mpa: form.mpa,
          tags,
        };

        // Include assessment if pre-assessed
        if (hasPreAssessment) {
          updateData.assessment_scores = previewAssessment;
          updateData.assessed_at = new Date().toISOString();
          updateData.assessment_model = assessmentModel;
        }

        const result = await updateAccomplishment(editEntry.id, updateData);

        if (result.error) {
          toast.error(result.error);
          return;
        }

        if (result.data) {
          // If pre-assessed, update store with assessment data
          if (hasPreAssessment) {
            updateStore(editEntry.id, {
              ...result.data,
              assessment_scores: previewAssessment,
              assessed_at: new Date().toISOString(),
              assessment_model: assessmentModel,
            });
          } else {
            updateStore(editEntry.id, result.data);
          }
          toast.success("Entry updated");
          // Only trigger background assessment if not pre-assessed and user is enlisted
          if (!hasPreAssessment && isEnlisted(profile?.rank as Rank)) {
            triggerAssessment(editEntry.id);
          }
          
          // Handle project link changes
          await updateProjectLink(editEntry.id);
        }
      } else {
        const result = await createAccomplishment({
          user_id: targetManagedMemberId ? profile?.id || "" : userId, // For managed members, store supervisor's ID
          created_by: profile?.id || userId,
          team_member_id: targetManagedMemberId || null, // Link to managed member
          date: form.date,
          action_verb: form.action_verb,
          details: form.details,
          impact: form.impact || null,
          metrics: form.metrics || null,
          mpa: form.mpa,
          tags,
          cycle_year: cycleYear,
          // Include assessment if pre-assessed, otherwise null
          assessment_scores: hasPreAssessment ? previewAssessment : null,
          assessed_at: hasPreAssessment ? new Date().toISOString() : null,
          assessment_model: hasPreAssessment ? assessmentModel : null,
        });

        if (result.error) {
          toast.error(result.error);
          return;
        }

        if (result.data) {
          // If pre-assessed, add with assessment data to store
          if (hasPreAssessment) {
            addAccomplishment({
              ...result.data,
              assessment_scores: previewAssessment,
              assessed_at: new Date().toISOString(),
              assessment_model: assessmentModel,
            });
          } else {
            addAccomplishment(result.data);
          }
          
          // Celebrate the new entry!
          celebrateEntry();
          toast.success("Entry created!", {
            description: "Great job tracking your accomplishment!",
            duration: 3000,
          });
          
          // Track accomplishment creation
          Analytics.accomplishmentCreated(form.mpa, !!form.metrics);
          
          // Only trigger background assessment if not pre-assessed and user is enlisted
          if (!hasPreAssessment && isEnlisted(profile?.rank as Rank)) {
            triggerAssessment(result.data.id);
          }
          
          // Link to project if selected
          if (selectedProjectId) {
            await (supabase
              .from("accomplishment_projects") as any)
              .insert({
                accomplishment_id: result.data.id,
                project_id: selectedProjectId,
              });
          }
        }
      }

      onOpenChange(false);
    } catch {
      toast.error("An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1rem)] max-w-2xl max-h-[85dvh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="pr-6">
          <DialogTitle className="text-base sm:text-lg">
            {editEntry ? "Edit Entry" : "Add Accomplishment"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="date" className="text-sm">Date *</Label>
              <Input
                id="date"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
                aria-label="Accomplishment date"
                className="h-9 sm:h-10"
              />
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="mpa" className="text-sm">Major Performance Area</Label>
              <Select
                value={form.mpa}
                onValueChange={(value) => setForm({ ...form, mpa: value })}
              >
                <SelectTrigger id="mpa" aria-label="Select MPA" className="h-9 sm:h-10">
                  <SelectValue placeholder="Select MPA" />
                </SelectTrigger>
                <SelectContent>
                  {mgas.map((mpa) => (
                    <SelectItem key={mpa.key} value={mpa.key}>
                      {mpa.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Project Selector */}
          <div className="space-y-1.5 sm:space-y-2">
            <Label className="text-sm">
              Project
              <span className="text-muted-foreground font-normal ml-1 sm:ml-2 text-xs sm:text-sm">
                (optional)
              </span>
            </Label>
            <ProjectSelector
              value={selectedProjectId}
              onChange={setSelectedProjectId}
              disabled={isSubmitting}
              className="h-9 sm:h-10"
            />
          </div>

          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="action_verb" className="text-sm">Action Verb *</Label>
            <ComboboxInput
              value={form.action_verb}
              onChange={(value) => setForm((prev) => ({ ...prev, action_verb: value }))}
              options={DEFAULT_ACTION_VERBS}
              placeholder="Select or type a verb..."
              aria-label="Action verb"
            />
          </div>

          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="details" className="text-sm">
              Details *
              <span className="text-muted-foreground font-normal ml-1 sm:ml-2 text-xs sm:text-sm">
                What did you do?
              </span>
            </Label>
            <Textarea
              id="details"
              placeholder="Describe what you accomplished in detail..."
              value={form.details}
              onChange={(e) => setForm({ ...form, details: e.target.value })}
              required
              className="min-h-[60px] sm:min-h-[80px] resize-y text-sm"
              aria-label="Accomplishment details"
            />
          </div>

          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="impact" className="text-sm">
              Impact/Result
              <span className="text-muted-foreground font-normal ml-1 sm:ml-2 text-xs sm:text-sm">
                (optional) What was the outcome?
              </span>
            </Label>
            <Textarea
              id="impact"
              placeholder="Describe the impact, results, or benefits..."
              value={form.impact}
              onChange={(e) => setForm({ ...form, impact: e.target.value })}
              className="min-h-[60px] sm:min-h-[80px] resize-y text-sm"
              aria-label="Impact or result"
            />
          </div>

          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="metrics" className="text-sm">
              Metrics
              <span className="text-muted-foreground font-normal ml-1 sm:ml-2 text-xs sm:text-sm">
                (optional)
              </span>
            </Label>
            <Input
              id="metrics"
              placeholder="e.g., 15% increase, 200 hours saved"
              value={form.metrics}
              onChange={(e) => setForm({ ...form, metrics: e.target.value })}
              aria-label="Quantifiable metrics"
              className="h-9 sm:h-10 text-sm"
            />
          </div>

          <div className="space-y-1.5 sm:space-y-2">
            <Label htmlFor="tags" className="text-sm">
              Tags
              <span className="text-muted-foreground font-normal ml-1 sm:ml-2 text-xs sm:text-sm">
                (comma separated)
              </span>
            </Label>
            <Input
              id="tags"
              placeholder="e.g., Project Alpha, LOE 1, Training"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              aria-label="Tags"
              className="h-9 sm:h-10 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Use tags to organize accomplishments by projects or Lines of Effort (LOE)
            </p>
          </div>

          {/* Rate My Accomplishment Section - Only for Enlisted (ACA rubric not available for Officers yet) */}
          {isEnlisted(profile?.rank as Rank) && (
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">AI Assessment</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRateAccomplishment}
                disabled={isAssessing || !form.action_verb || !form.details}
                className="h-8 text-xs"
              >
                {isAssessing ? (
                  <>
                    <Loader2 className="size-3 animate-spin mr-1.5" />
                    Analyzing...
                  </>
                ) : previewAssessment ? (
                  "Re-analyze"
                ) : (
                  "Rate My Accomplishment"
                )}
              </Button>
            </div>

            {/* Assessment Results */}
            {previewAssessment && (
              <div className="space-y-3 p-3 rounded-lg bg-muted/50 border">
                {/* ACA Form Info */}
                {assessmentFormUsed && (
                  <div className="flex items-center justify-between text-xs border-b pb-2 mb-1">
                    <span className="text-muted-foreground">
                      Assessed using <span className="font-medium">{assessmentFormUsed}</span>
                      {assessmentRateeRank && <> for {assessmentRateeRank}</>}
                    </span>
                  </div>
                )}
                
                {/* Overall Score - Prominent */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Overall Quality</span>
                  <div className={cn(
                    "flex items-center gap-2 px-3 py-1 rounded-full border font-semibold",
                    getScoreColor(previewAssessment.overall_score)
                  )}>
                    <span className="text-lg">{previewAssessment.overall_score}</span>
                    <span className="text-xs opacity-80">{getScoreLabel(previewAssessment.overall_score)}</span>
                  </div>
                </div>

                {/* MPA Relevancy Scores */}
                <div className="space-y-2">
                  <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Target className="size-3" />
                    MPA Fit Scores
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(previewAssessment.mpa_relevancy).map(([mpaKey, score]) => {
                      const mpaLabel = mgas.find(m => m.key === mpaKey)?.label || mpaKey;
                      const shortLabel = mpaLabel.split(" ")[0];
                      const isPrimary = previewAssessment.primary_mpa === mpaKey;
                      return (
                        <div 
                          key={mpaKey}
                          className={cn(
                            "flex items-center justify-between p-2 rounded text-xs",
                            isPrimary ? "bg-primary/10 border border-primary/30" : "bg-background"
                          )}
                        >
                          <span className={cn(
                            "truncate",
                            isPrimary && "font-medium"
                          )}>
                            {shortLabel}
                            {isPrimary && " (Best)"}
                          </span>
                          <span className={cn(
                            "font-mono font-medium",
                            getScoreColor(score as number).split(" ")[0]
                          )}>
                            {score as number}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Quality Indicators */}
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Quality Breakdown</span>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Action Clarity</span>
                      <span className={getScoreColor(previewAssessment.quality_indicators.action_clarity).split(" ")[0]}>
                        {previewAssessment.quality_indicators.action_clarity}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Impact</span>
                      <span className={getScoreColor(previewAssessment.quality_indicators.impact_significance).split(" ")[0]}>
                        {previewAssessment.quality_indicators.impact_significance}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Metrics</span>
                      <span className={getScoreColor(previewAssessment.quality_indicators.metrics_quality).split(" ")[0]}>
                        {previewAssessment.quality_indicators.metrics_quality}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Scope</span>
                      <span className={getScoreColor(previewAssessment.quality_indicators.scope_definition).split(" ")[0]}>
                        {previewAssessment.quality_indicators.scope_definition}
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-[10px] text-muted-foreground/70">
                  Tip: Add more specific details, quantifiable metrics, and clear impact to improve your score.
                </p>
              </div>
            )}

            {!previewAssessment && !isAssessing && (
              <p className="text-xs text-muted-foreground">
                Click &quot;Rate My Accomplishment&quot; to see how well this entry scores before saving.
              </p>
            )}
          </div>
          )}

          <DialogFooter className="pt-2 sm:pt-4 gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="w-full sm:w-auto h-9 sm:h-10 text-sm"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isSubmitting} 
              className="w-full sm:w-auto h-9 sm:h-10 text-sm group relative overflow-hidden"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : editEntry ? (
                "Update Entry"
              ) : (
                <>
                  <Sparkles className="size-4 mr-2 group-hover:animate-pulse" />
                  Create Entry
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

