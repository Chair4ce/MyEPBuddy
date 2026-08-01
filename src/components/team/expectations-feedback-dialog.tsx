"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  ClipboardCheck,
  FileText,
  Loader2,
  Target,
} from "lucide-react";
import type {
  FeedbackType,
  ManagedMember,
  Profile,
  Rank,
  SupervisorFeedback,
} from "@/types/database";
import {
  getFeedbackEpbPackage,
  getFeedbackEvidenceAccomplishments,
  getFeedbacksForMember,
  type FeedbackEpbStatementItem,
  type FeedbackEvidenceItem,
} from "@/app/actions/supervisor-feedbacks";
import {
  getActiveCycleYear,
  getFeedbackTypeDescription,
  getFeedbackTypeLabel,
} from "@/lib/constants";
import { CyclePeriodLabel } from "@/components/evaluation/cycle-period-label";
import { SessionGuidePhaseEditor, type SessionGuideDraft } from "@/components/team/session-guide-phase-editor";
import { cn } from "@/lib/utils";

type CycleStep = FeedbackType | "epb";

const STEPS: { id: CycleStep; label: string; short: string }[] = [
  { id: "initial", label: "Initial", short: "1" },
  { id: "midterm", label: "Midterm", short: "2" },
  { id: "epb", label: "EPB", short: "3" },
  { id: "final", label: "Final", short: "4" },
];

/** Fixed shell — beats DialogContent `grid` / size max-width utilities */
const DIALOG_SHELL_STYLE = {
  display: "flex",
  flexDirection: "column",
  width: "min(calc(100vw - 1.5rem), 80rem)",
  maxWidth: "min(calc(100vw - 1.5rem), 80rem)",
  height: "min(98dvh, 1200px)",
  maxHeight: "min(98dvh, 1200px)",
  padding: 0,
  gap: 0,
  overflow: "hidden",
} as const;

interface ExpectationsFeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subordinate?: Profile | null;
  managedMember?: ManagedMember | null;
}

export function ExpectationsFeedbackDialog({
  open,
  onOpenChange,
  subordinate,
  managedMember,
}: ExpectationsFeedbackDialogProps) {
  const memberName =
    subordinate?.full_name || managedMember?.full_name || "Unknown";
  const memberRank = subordinate?.rank || managedMember?.rank || null;
  const subordinateId = subordinate?.id || null;
  const teamMemberId = managedMember?.id || null;
  const cycleYear = getActiveCycleYear(memberRank as Rank);

  const [activeStep, setActiveStep] = useState<CycleStep>("initial");
  const [feedbacks, setFeedbacks] = useState<SupervisorFeedback[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadToken, setLoadToken] = useState(0);
  const [evidenceItems, setEvidenceItems] = useState<FeedbackEvidenceItem[]>([]);
  const [evidenceTruncated, setEvidenceTruncated] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [isLoadingEvidence, setIsLoadingEvidence] = useState(false);
  const [epbItems, setEpbItems] = useState<FeedbackEpbStatementItem[]>([]);
  const [epbError, setEpbError] = useState<string | null>(null);
  const [isLoadingEpb, setIsLoadingEpb] = useState(false);
  const [draftCache, setDraftCache] = useState<
    Partial<Record<FeedbackType, SessionGuideDraft>>
  >({});

  const feedbacksLoadGenRef = useRef(0);
  const evidenceLoadGenRef = useRef(0);
  const epbLoadGenRef = useRef(0);

  async function loadFeedbacks() {
    if (!subordinateId && !teamMemberId) {
      setFeedbacks([]);
      setLoadToken((t) => t + 1);
      return;
    }
    const gen = ++feedbacksLoadGenRef.current;
    setIsLoading(true);
    try {
      const result = await getFeedbacksForMember(
        subordinateId,
        teamMemberId,
        cycleYear
      );
      if (gen !== feedbacksLoadGenRef.current) return;
      setFeedbacks(result.data ?? []);
      setLoadToken((t) => t + 1);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadEvidence() {
    if (!subordinateId && !teamMemberId) {
      setEvidenceItems([]);
      setEvidenceTruncated(false);
      setEvidenceError(null);
      return;
    }
    const gen = ++evidenceLoadGenRef.current;
    setIsLoadingEvidence(true);
    setEvidenceError(null);
    try {
      const result = await getFeedbackEvidenceAccomplishments(
        subordinateId,
        teamMemberId,
        cycleYear
      );
      if (gen !== evidenceLoadGenRef.current) return;
      if (result.error) {
        setEvidenceError(result.error);
        setEvidenceItems([]);
        setEvidenceTruncated(false);
      } else {
        setEvidenceItems(result.data);
        setEvidenceTruncated(result.truncated);
      }
    } finally {
      setIsLoadingEvidence(false);
    }
  }

  async function loadEpbPackage() {
    if (!subordinateId && !teamMemberId) {
      setEpbItems([]);
      setEpbError(null);
      return;
    }
    const gen = ++epbLoadGenRef.current;
    setIsLoadingEpb(true);
    setEpbError(null);
    try {
      const result = await getFeedbackEpbPackage(
        subordinateId,
        teamMemberId,
        cycleYear
      );
      if (gen !== epbLoadGenRef.current) return;
      if (result.error) {
        setEpbError(result.error);
        setEpbItems([]);
      } else {
        setEpbItems(result.data);
      }
    } finally {
      setIsLoadingEpb(false);
    }
  }

  function selectStep(step: CycleStep) {
    setActiveStep(step);
    if (step === "midterm") {
      void loadEvidence();
    } else if (step === "final") {
      void loadEpbPackage();
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      setFeedbacks([]);
      setActiveStep("initial");
      setLoadToken(0);
      setIsLoading(false);
      setEvidenceItems([]);
      setEvidenceTruncated(false);
      setEvidenceError(null);
      setIsLoadingEvidence(false);
      setEpbItems([]);
      setEpbError(null);
      setIsLoadingEpb(false);
      setDraftCache({});
      feedbacksLoadGenRef.current += 1;
      evidenceLoadGenRef.current += 1;
      epbLoadGenRef.current += 1;
    } else {
      setActiveStep("initial");
    }
    onOpenChange(next);
  }

  function getFeedbackForType(type: FeedbackType): SupervisorFeedback | undefined {
    return feedbacks.find((f) => f.feedback_type === type);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        size="auto"
        style={DIALOG_SHELL_STYLE}
        className="!flex flex-col gap-0 overflow-hidden p-0"
        onOpenAutoFocus={() => {
          void loadFeedbacks();
        }}
      >
        <DialogHeader className="shrink-0 space-y-1.5 border-b px-4 py-2.5 pr-12 text-left sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Target className="size-5 shrink-0 text-primary" />
              Expectations & Feedback
            </DialogTitle>
            <Badge
              variant="secondary"
              className="h-5 px-1.5 text-[10px] font-medium uppercase tracking-wide"
            >
              Beta
            </Badge>
            <Badge variant="outline" className="w-fit max-w-full gap-1.5 truncate">
              <Calendar className="size-3 shrink-0" />
              <CyclePeriodLabel rank={memberRank as Rank | null} />
            </Badge>
          </div>
          <DialogDescription className="line-clamp-1 text-sm">
            <span className="font-medium text-foreground">
              {memberRank ? `${memberRank} ` : ""}
              {memberName}
            </span>
            {" — "}
            private session guides; Share only if they are in the app.
          </DialogDescription>
        </DialogHeader>

        <nav
          aria-label="Feedback cycle steps"
          className="shrink-0 border-b px-4 py-2 sm:px-6"
        >
          <ol className="grid grid-cols-4 gap-1.5">
            {STEPS.map((step) => {
              const isActive = activeStep === step.id;
              const feedback =
                step.id !== "epb" ? getFeedbackForType(step.id) : undefined;
              const statusLabel = feedback
                ? feedback.status === "shared"
                  ? "Shared"
                  : "Draft"
                : step.id === "epb"
                  ? "Bridge"
                  : "—";
              return (
                <li key={step.id}>
                  <button
                    type="button"
                    onClick={() => selectStep(step.id)}
                    className={cn(
                      "flex h-11 w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98]",
                      "shadow-[0_0_0_0.5px_rgba(0,0,0,0.08)]",
                      isActive
                        ? "bg-primary/10 text-foreground"
                        : "bg-muted/40 text-muted-foreground hover:bg-muted/70"
                    )}
                    aria-current={isActive ? "step" : undefined}
                  >
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "bg-background"
                      )}
                    >
                      {step.short}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium leading-tight sm:text-sm">
                        {step.label}
                      </span>
                      <span className="hidden truncate text-[10px] leading-tight opacity-80 sm:block">
                        {statusLabel}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {activeStep === "epb" || activeStep === "initial" ? (
            <div className="shrink-0 space-y-1 border-b px-4 py-2 sm:px-6">
              <div className="flex h-5 items-center gap-2 text-sm font-medium">
                {activeStep === "epb" ? (
                  <>
                    <FileText className="size-4 text-primary" />
                    EPB
                  </>
                ) : (
                  <>
                    <ClipboardCheck className="size-4 text-primary" />
                    {getFeedbackTypeLabel(activeStep)}
                  </>
                )}
              </div>
              <p className="line-clamp-1 text-xs text-muted-foreground">
                {activeStep === "epb"
                  ? "Write the ratee’s EPB in Generate, then return here for the Final session guide."
                  : getFeedbackTypeDescription(activeStep)}
              </p>
            </div>
          ) : null}

          {isLoading || loadToken === 0 ? (
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : activeStep === "epb" ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 py-5 sm:px-6">
                <div className="flex max-w-lg items-start gap-3">
                  <FileText className="mt-0.5 size-5 shrink-0 text-primary" />
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Open Generate to write EPB statements for this ratee.
                      Final Generates a feedback guide grounded in that EPB
                      package — not the accomplishments list.
                    </p>
                    <Button asChild className="active:scale-[0.98]">
                      <Link href="/generate">Open Generate / EPB</Link>
                    </Button>
                  </div>
                </div>
              </div>
              <div className="h-[4.5rem] shrink-0 border-t bg-background" />
            </div>
          ) : (
            <SessionGuidePhaseEditor
              key={`${activeStep}-${getFeedbackForType(activeStep)?.id ?? "new"}-${loadToken}`}
              feedbackType={activeStep}
              subordinate={subordinate}
              managedMember={managedMember}
              cycleYear={cycleYear}
              existingFeedback={getFeedbackForType(activeStep) ?? null}
              draftSnapshot={draftCache[activeStep] ?? null}
              onDraftChange={(draft) => {
                setDraftCache((prev) => ({ ...prev, [activeStep]: draft }));
              }}
              evidenceItems={evidenceItems}
              evidenceTruncated={evidenceTruncated}
              evidenceError={evidenceError}
              isLoadingEvidence={isLoadingEvidence}
              onRefreshEvidence={() => void loadEvidence()}
              epbItems={epbItems}
              epbError={epbError}
              isLoadingEpb={isLoadingEpb}
              onRefreshEpb={() => void loadEpbPackage()}
              onFeedbackChange={(next) => {
                setFeedbacks((prev) => {
                  const others = prev.filter(
                    (f) => f.feedback_type !== activeStep
                  );
                  return next ? [...others, next] : others;
                });
              }}
              onSaved={() => void loadFeedbacks()}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** @deprecated Use ExpectationsFeedbackDialog */
const SetExpectationsDialog = ExpectationsFeedbackDialog;
