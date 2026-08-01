"use client";

import { useState, useEffect } from "react";
import type { FeedAccomplishment } from "@/stores/team-feed-store";
import { useUserStore } from "@/stores/user-store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/sonner";
import {
  STEWARDSHIP_LABELS,
  composeImpactString,
  hasStewardshipImpactContent,
  hydrateStewardshipImpact,
  normalizeStewardshipImpact,
} from "@/lib/stewardship-impact";
import {
  emptyStewardshipFormValue,
  StewardshipImpactFields,
  stewardshipFormFromImpact,
  stewardshipImpactFromForm,
} from "@/components/entries/stewardship-impact-fields";
import {
  Calendar,
  Briefcase,
  Building,
  Target,
  BarChart3,
  Tag,
  ChevronDown,
  ChevronUp,
  GitBranch,
  Pencil,
  Check,
  X,
  Loader2,
} from "lucide-react";
import { ENTRY_MGAS, DEFAULT_ACTION_VERBS } from "@/lib/constants";
import { ChainOfCommandDisplay } from "./chain-of-command-display";
import { updateAccomplishment } from "@/app/actions/accomplishments";
import { scanForSensitiveData, getScanSummary } from "@/lib/sensitive-data-scanner";
import {
  formatCreatedAgo,
  formatWeekdayShortDate,
} from "@/lib/format";

interface AccomplishmentDetailDialogProps {
  accomplishment: FeedAccomplishment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccomplishmentUpdated?: (id: string, updates: Partial<FeedAccomplishment>) => void;
}

export function AccomplishmentDetailDialog({
  accomplishment,
  open,
  onOpenChange,
  onAccomplishmentUpdated,
}: AccomplishmentDetailDialogProps) {
  const { profile } = useUserStore();
  const [showChain, setShowChain] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit form state
  const [editForm, setEditForm] = useState({
    date: "",
    action_verb: "",
    details: "",
    impact: "",
    stewardship: emptyStewardshipFormValue(),
    metrics: "",
    mpa: "",
    tags: "",
  });

  // Unsaved changes confirmation
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  // Check if there are unsaved changes
  const hasUnsavedChanges = () => {
    if (!accomplishment || !isEditing) return false;
    const originalTags = Array.isArray(accomplishment.tags) ? accomplishment.tags.join(", ") : "";
    const originalStewardship = stewardshipFormFromImpact(
      hydrateStewardshipImpact(accomplishment.stewardship_impact, accomplishment.impact)
    );
    return (
      editForm.date !== accomplishment.date ||
      editForm.action_verb !== accomplishment.action_verb ||
      editForm.details !== accomplishment.details ||
      editForm.impact !== (accomplishment.impact || "") ||
      editForm.metrics !== (accomplishment.metrics || "") ||
      editForm.mpa !== accomplishment.mpa ||
      editForm.tags !== originalTags ||
      JSON.stringify(editForm.stewardship) !== JSON.stringify(originalStewardship)
    );
  };

  // Handle dialog close with change detection
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && isEditing && hasUnsavedChanges()) {
      setShowDiscardDialog(true);
    } else {
      onOpenChange(newOpen);
      if (!newOpen) {
        setIsEditing(false);
      }
    }
  };

  // Discard changes and close
  const handleDiscardChanges = () => {
    setShowDiscardDialog(false);
    setIsEditing(false);
    // Reset form to original values
    if (accomplishment) {
      const stewardship = hydrateStewardshipImpact(
        accomplishment.stewardship_impact,
        accomplishment.impact
      );
      setEditForm({
        date: accomplishment.date,
        action_verb: accomplishment.action_verb,
        details: accomplishment.details,
        impact: accomplishment.impact || "",
        stewardship: stewardshipFormFromImpact(stewardship),
        metrics: accomplishment.metrics || "",
        mpa: accomplishment.mpa,
        tags: Array.isArray(accomplishment.tags) ? accomplishment.tags.join(", ") : "",
      });
    }
    onOpenChange(false);
  };

  // Check if current user is in the chain of supervision
  const isInChain = accomplishment?.supervisor_chain?.some(
    (member) => member.id === profile?.id
  ) ?? false;

  // Reset edit state when accomplishment changes
  useEffect(() => {
    if (accomplishment) {
      const stewardship = hydrateStewardshipImpact(
        accomplishment.stewardship_impact,
        accomplishment.impact
      );
      setEditForm({
        date: accomplishment.date,
        action_verb: accomplishment.action_verb,
        details: accomplishment.details,
        impact: accomplishment.impact || "",
        stewardship: stewardshipFormFromImpact(stewardship),
        metrics: accomplishment.metrics || "",
        mpa: accomplishment.mpa,
        tags: Array.isArray(accomplishment.tags) ? accomplishment.tags.join(", ") : "",
      });
    }
    setIsEditing(false);
  }, [accomplishment]);

  async function handleSubmitEdit() {
    if (!accomplishment) return;

    const stewardshipImpact = stewardshipImpactFromForm(editForm.stewardship);
    const composed = composeImpactString(stewardshipImpact);
    const impactToSend = composed ?? editForm.impact;

    // Scan for PII, CUI, and classification markings — hard block if found
    const sensitiveMatches = scanForSensitiveData({
      details: editForm.details,
      impact: impactToSend,
      metrics: editForm.metrics,
      stewardship_time: editForm.stewardship.time,
      stewardship_money: editForm.stewardship.money,
      stewardship_resources: editForm.stewardship.resources,
      stewardship_outcome: editForm.stewardship.outcome,
    });
    if (sensitiveMatches.length > 0) {
      toast.error(getScanSummary(sensitiveMatches), { duration: 10000 });
      return;
    }
    
    setIsSubmitting(true);
    try {
      const tags = editForm.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const result = await updateAccomplishment(accomplishment.id, {
        date: editForm.date,
        action_verb: editForm.action_verb,
        details: editForm.details,
        impact: impactToSend,
        stewardship_impact: stewardshipImpact,
        metrics: editForm.metrics || null,
        mpa: editForm.mpa,
        tags,
      });

      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Accomplishment updated");
        setIsEditing(false);
        onAccomplishmentUpdated?.(accomplishment.id, {
          ...editForm,
          impact: impactToSend,
          stewardship_impact: stewardshipImpact,
          metrics: editForm.metrics || null,
          tags,
        });
        fetch("/api/scan-entry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accomplishmentId: accomplishment.id }),
        }).catch(() => {});
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!accomplishment) return null;

  const mpaLabel =
    ENTRY_MGAS.find((m) => m.key === accomplishment.mpa)?.label ||
    accomplishment.mpa;

  return (
    <>
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-4xl max-h-[90dvh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header - Fixed at top */}
        <div className="shrink-0 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b px-4 py-3 sm:px-6 sm:py-4">
          <DialogHeader className="text-left space-y-0">
            {/* Mobile: Stack vertically */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="size-10 sm:size-12 rounded-full bg-primary/20 flex items-center justify-center text-base sm:text-lg font-semibold text-primary shrink-0">
                  {accomplishment.author_name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div className="flex-1">
                  <DialogTitle className="text-base sm:text-lg break-words">
                    {accomplishment.author_rank && (
                      <span className="text-muted-foreground">
                        {accomplishment.author_rank}{" "}
                      </span>
                    )}
                    {accomplishment.author_name}
                  </DialogTitle>
                  <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs sm:text-sm mt-0.5">
                    {accomplishment.author_afsc && (
                      <span className="flex items-center gap-1">
                        <Briefcase className="size-3" />
                        {accomplishment.author_afsc}
                      </span>
                    )}
                    {accomplishment.author_unit && (
                      <span className="flex items-center gap-1 truncate max-w-[150px] sm:max-w-none">
                        <Building className="size-3 shrink-0" />
                        <span className="truncate">{accomplishment.author_unit}</span>
                      </span>
                    )}
                  </DialogDescription>
                </div>
              </div>
              {/* MPA Badge - mr-8 accounts for Dialog close button */}
              <Badge variant="outline" className="text-xs shrink-0 self-start sm:self-center mr-8">
                {mpaLabel}
              </Badge>
            </div>
          </DialogHeader>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="p-4 sm:p-6 space-y-5 relative">
            {/* Edit button - positioned in top right of content area */}
            {isInChain && !isEditing && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsEditing(true)}
                className="absolute top-4 right-4 sm:top-6 sm:right-6 size-8 text-muted-foreground hover:text-foreground"
                aria-label="Edit accomplishment"
              >
                <Pencil className="size-4" />
              </Button>
            )}
            {isEditing ? (
              // Edit Form
              <div className="space-y-5">
                {/* Edit Mode Header */}
                <div className="flex items-center justify-between pb-2 border-b">
                  <div className="flex items-center gap-2">
                    <Pencil className="size-4 text-primary" />
                    <span className="text-sm font-medium">Edit Accomplishment</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditing(false)}
                      disabled={isSubmitting}
                      className="h-8 px-3 text-xs"
                    >
                      <X className="size-3.5 mr-1" />
                      Cancel
                    </Button>
                    <Button 
                      size="sm" 
                      onClick={handleSubmitEdit} 
                      disabled={isSubmitting} 
                      className="h-8 px-3 text-xs"
                    >
                      {isSubmitting ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <>
                          <Check className="size-3.5 mr-1" />
                          Save
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Row 1: Date & Action Verb */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-date" className="text-xs font-medium text-muted-foreground">
                      Date
                    </Label>
                    <Input
                      id="edit-date"
                      type="date"
                      value={editForm.date}
                      onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-action" className="text-xs font-medium text-muted-foreground">
                      Action Verb
                    </Label>
                    <Select
                      value={editForm.action_verb}
                      onValueChange={(value) => setEditForm({ ...editForm, action_verb: value })}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Select verb" />
                      </SelectTrigger>
                      <SelectContent>
                        {DEFAULT_ACTION_VERBS.map((verb) => (
                          <SelectItem key={verb} value={verb}>
                            {verb}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Row 2: MPA - Full Width */}
                <div className="space-y-1.5">
                  <Label htmlFor="edit-mpa" className="text-xs font-medium text-muted-foreground">
                    Major Performance Area
                  </Label>
                  <Select
                    value={editForm.mpa}
                    onValueChange={(value) => setEditForm({ ...editForm, mpa: value })}
                  >
                    <SelectTrigger id="edit-mpa" className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ENTRY_MGAS.map((mpa) => (
                        <SelectItem key={mpa.key} value={mpa.key}>
                          {mpa.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Row 3: Details - Full Width */}
                <div className="space-y-1.5">
                  <Label htmlFor="edit-details" className="text-xs font-medium text-muted-foreground">
                    Details
                  </Label>
                  <Textarea
                    id="edit-details"
                    value={editForm.details}
                    onChange={(e) => setEditForm({ ...editForm, details: e.target.value })}
                    className="min-h-[80px] text-sm resize-none"
                    placeholder="What was accomplished..."
                  />
                </div>

                {/* Row 4: Impact - Full Width */}
                <div className="space-y-1.5">
                  <Label htmlFor="edit-impact" className="text-xs font-medium text-muted-foreground">
                    Impact
                  </Label>
                  <Textarea
                    id="edit-impact"
                    value={editForm.impact}
                    onChange={(e) => setEditForm({ ...editForm, impact: e.target.value })}
                    className="min-h-[80px] text-sm resize-none"
                    placeholder="What was the result or impact..."
                  />
                </div>

                <StewardshipImpactFields
                  value={editForm.stewardship}
                  onChange={(stewardship) => setEditForm({ ...editForm, stewardship })}
                  disabled={isSubmitting}
                  idPrefix="detail-edit-stewardship"
                />

                {/* Row 5: Metrics & Tags */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-metrics" className="text-xs font-medium text-muted-foreground">
                      Metrics
                    </Label>
                    <Input
                      id="edit-metrics"
                      value={editForm.metrics}
                      onChange={(e) => setEditForm({ ...editForm, metrics: e.target.value })}
                      placeholder="e.g., 15% increase, 200 hours"
                      className="h-9 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-tags" className="text-xs font-medium text-muted-foreground">
                      Tags (comma separated)
                    </Label>
                    <Input
                      id="edit-tags"
                      value={editForm.tags}
                      onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                      placeholder="e.g., leadership, training"
                      className="h-9 text-sm"
                    />
                  </div>
                </div>
              </div>
            ) : (
              // View Mode
              <>
                {/* Date and action */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Calendar className="size-3.5" />
                    <span>{formatWeekdayShortDate(accomplishment.date)}</span>
                  </div>
                  <span className="text-muted-foreground/40">•</span>
                  <span className="text-muted-foreground">
                    {formatCreatedAgo(accomplishment.created_at)}
                  </span>
                  <span className="text-muted-foreground/40">•</span>
                  <Badge variant="secondary" className="font-medium text-xs">
                    {accomplishment.action_verb}
                  </Badge>
                </div>

                {/* Details */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Target className="size-4 text-primary shrink-0" />
                    What They Did
                  </h4>
                  <p className="text-sm leading-relaxed break-words text-muted-foreground">
                    {accomplishment.details}
                  </p>
                </div>

                {/* Impact — prefer structured stewardship when present */}
                {(() => {
                  const stewardship = normalizeStewardshipImpact(
                    accomplishment.stewardship_impact
                  );
                  if (hasStewardshipImpactContent(stewardship)) {
                    const rows = (
                      [
                        ["time", STEWARDSHIP_LABELS.time],
                        ["money", STEWARDSHIP_LABELS.money],
                        ["resources", STEWARDSHIP_LABELS.resources],
                        ["outcome", STEWARDSHIP_LABELS.outcome],
                      ] as const
                    ).filter(([key]) => stewardship[key]);
                    return (
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium flex items-center gap-2">
                          <BarChart3 className="size-4 text-emerald-500 shrink-0" />
                          Impact & Results
                        </h4>
                        <div className="space-y-1.5">
                          {rows.map(([key, label]) => (
                            <div key={key} className="flex gap-2 text-sm">
                              <span className="w-[6.5rem] shrink-0 text-muted-foreground">
                                {label}
                              </span>
                              <span className="text-muted-foreground break-words">
                                {stewardship[key]}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  }
                  if (accomplishment.impact) {
                    return (
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium flex items-center gap-2">
                          <BarChart3 className="size-4 text-emerald-500 shrink-0" />
                          Impact & Results
                        </h4>
                        <p className="text-sm leading-relaxed break-words text-muted-foreground">
                          {accomplishment.impact}
                        </p>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Metrics and Tags row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {/* Metrics */}
                  {accomplishment.metrics && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <BarChart3 className="size-4 text-blue-500 shrink-0" />
                        Metrics
                      </h4>
                      <p className="text-sm leading-relaxed font-mono text-blue-600 dark:text-blue-400 break-all">
                        {accomplishment.metrics}
                      </p>
                    </div>
                  )}

                  {/* Tags */}
                  {accomplishment.tags && accomplishment.tags.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium flex items-center gap-2">
                        <Tag className="size-4 text-orange-500 shrink-0" />
                        Tags
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {accomplishment.tags.map((tag) => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            <Separator />

            {/* Chain of Command - Collapsed by default */}
            <div className="space-y-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-between hover:bg-muted/50 h-9 px-2"
                onClick={() => setShowChain(!showChain)}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <GitBranch className="size-4 text-primary" />
                  Chain of Command
                </span>
                {showChain ? (
                  <ChevronUp className="size-4" />
                ) : (
                  <ChevronDown className="size-4" />
                )}
              </Button>

              {showChain && (
                <ChainOfCommandDisplay
                  accomplishment={accomplishment}
                  className="mt-2"
                />
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Unsaved Changes Confirmation Dialog */}
    <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes to this accomplishment. Are you sure you want to discard them?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => {
            setShowDiscardDialog(false);
          }}>
            Keep Editing
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleDiscardChanges} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Discard Changes
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
