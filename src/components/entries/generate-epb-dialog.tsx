"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import { useEPBShellStore, type SelectedRatee } from "@/stores/epb-shell-store";
import { handleUsageLimitResponse } from "@/stores/usage-limit-store";
import { billableFetch } from "@/lib/fetch-with-retry";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { TokenCostBadge } from "@/components/billing/token-cost-badge";
import { cn } from "@/lib/utils";
import {
  motionChevronOpen,
  motionEnter,
  motionEnterDurList,
  motionEnterDurNormal,
  motionInputFocus,
  motionListEnterStagger,
  motionPressOnly,
  motionSurfaceCard,
} from "@/lib/motion/classes";
import {
  getActiveCycleYear,
  MAX_DUTY_DESCRIPTION_CHARACTERS,
} from "@/lib/constants";
import {
  EPB_MODEL_PREFERENCE_STORAGE_KEY,
  getStoredModelPreference,
} from "@/lib/model-preferences";
import { isSubstantialEpbStatement } from "@/lib/fuse-to-epb";
import { createEpbShell } from "@/lib/epb-shell-create";
import {
  buildGroupedMpaContexts,
  combineVersions,
  editableFromRecords,
  editableToMpaSelections,
  extractVersionArrays,
  mpaLabel,
  planToEditable,
  type ConflictPolicy,
  type EditablePlan,
  type MpaRunStatus,
} from "@/lib/generate-epb-run";
import {
  toPlanRecords,
  type EpbPlan,
  type PlanAccomplishmentRecord,
} from "@/lib/plan-epb";
import type { EpbGenerationReadiness } from "@/lib/epb-generation-readiness";
import { Analytics } from "@/lib/analytics";
import type {
  Accomplishment,
  EPBShell,
  EPBShellSection,
  Rank,
  WritingStyle,
} from "@/types/database";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  FileWarning,
  Loader2,
  Plus,
  Sparkles,
  X,
} from "lucide-react";

type DialogStep =
  | "preflight"
  | "planning"
  | "review"
  | "generating"
  | "error";

type ShellWithSections = EPBShell & { sections: EPBShellSection[] };

const VERSION_COUNT = 3;
/** Pace between MPA generations to stay under the burst limit (5 / 60s). */
const PACING_MS = 1200;

export interface GenerateEpbDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ratee: SelectedRatee;
  readiness: EpbGenerationReadiness;
  /** Pre-selected accomplishments from /entries — skips the AI selection step. */
  preselected?: Accomplishment[];
  /** Active shell (fetched by the opener) so we can gate the duty workbench. */
  initialShell?: ShellWithSections | null;
  /** Existing duty description text (from the active shell), for the preflight. */
  initialDutyDescription?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function GenerateEpbDialog({
  open,
  onOpenChange,
  ratee,
  readiness,
  preselected,
  initialShell,
  initialDutyDescription,
}: GenerateEpbDialogProps) {
  const router = useRouter();
  const supabase = createClient();
  const { profile } = useUserStore();
  const { setSelectedRatee, setSectionCollapsed, collapseAll } =
    useEPBShellStore();

  const preselectedRecords = preselected?.length
    ? toPlanRecords(preselected)
    : [];
  const isPreselected = preselectedRecords.length > 0;
  const dutyProvided = initialDutyDescription !== undefined;

  const [step, setStep] = useState<DialogStep>("preflight");
  const [records, setRecords] = useState<PlanAccomplishmentRecord[]>(
    () => preselectedRecords
  );
  const [editable, setEditable] = useState<EditablePlan>(() =>
    isPreselected ? editableFromRecords(preselectedRecords) : {}
  );
  const [rationaleByMpa, setRationaleByMpa] = useState<Record<string, string>>(
    {}
  );
  const [activeShell, setActiveShell] = useState<ShellWithSections | null>(
    initialShell ?? null
  );
  const [conflictPolicy, setConflictPolicy] =
    useState<ConflictPolicy>("overwrite");
  const [runStatus, setRunStatus] = useState<Record<string, MpaRunStatus>>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [showDuty, setShowDuty] = useState(
    () => (initialDutyDescription ?? "").trim() === "" && dutyProvided
  );
  const [dutyDraft, setDutyDraft] = useState(() => initialDutyDescription ?? "");
  const [dutyLoaded, setDutyLoaded] = useState(dutyProvided);
  const [dutyLoading, setDutyLoading] = useState(false);
  const [dutyGenerating, setDutyGenerating] = useState(false);

  const model = getStoredModelPreference(EPB_MODEL_PREFERENCE_STORAGE_KEY);
  const writingStyle: WritingStyle =
    (profile?.writing_style as WritingStyle | undefined) || "personal";

  const recordsById = new Map(records.map((r) => [r.id, r] as const));
  const selections = editableToMpaSelections(editable);

  const existingMpaText = new Map<string, string>();
  for (const section of activeShell?.sections ?? []) {
    existingMpaText.set(section.mpa, section.statement_text ?? "");
  }
  const conflictingMpas = selections
    .map((s) => s.mpaKey)
    .filter((mpa) => isSubstantialEpbStatement(existingMpaText.get(mpa)));

  const resetLocal = () => {
    setStep("preflight");
    setRecords([]);
    setEditable({});
    setRationaleByMpa({});
    setActiveShell(null);
    setConflictPolicy("overwrite");
    setRunStatus({});
    setErrorMessage("");
    setShowDuty(false);
    setDutyDraft("");
    setDutyLoaded(false);
    setDutyLoading(false);
    setDutyGenerating(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (step === "generating") return; // don't close mid-run
    if (!next) resetLocal();
    onOpenChange(next);
  };

  const findActiveShell = async (): Promise<ShellWithSections | null> => {
    let query = supabase
      .from("epb_shells")
      .select(`*, sections:epb_shell_sections(*)`)
      .neq("status", "archived")
      .order("updated_at", { ascending: false });
    query = ratee.isManagedMember
      ? query.eq("team_member_id", ratee.id)
      : query.eq("user_id", ratee.id).is("team_member_id", null);
    const { data } = await query.limit(1).maybeSingle();
    return (data as ShellWithSections | null) ?? null;
  };

  const handleToggleDuty = async () => {
    const next = !showDuty;
    setShowDuty(next);
    if (next && !dutyLoaded) {
      setDutyLoading(true);
      try {
        const shell = await findActiveShell();
        if (shell) setActiveShell(shell);
        setDutyDraft(shell?.duty_description ?? "");
      } catch {
        // best-effort: user can still type a duty description
      } finally {
        setDutyLoaded(true);
        setDutyLoading(false);
      }
    }
  };

  const persistDutyDescription = async (shell: ShellWithSections) => {
    if (!profile) return;
    const value = dutyDraft.trim();
    if (value === (shell.duty_description ?? "").trim()) return;
    await supabase
      .from("epb_shells")
      .update({
        duty_description: value,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", shell.id);
    setActiveShell({ ...shell, duty_description: value });
  };

  // Polish the drafted duty description with AI (rephrase only — same duty-safe
  // path the workspace uses; requires a seed so scope is never fabricated).
  const handleImproveDuty = async () => {
    const seed = dutyDraft.trim();
    if (!seed) {
      toast.error("Write a short duty description first, then improve it.");
      return;
    }
    setDutyGenerating(true);
    try {
      const response = await billableFetch("/api/revise-selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullStatement: seed,
          selectedText: seed,
          selectionStart: 0,
          selectionEnd: seed.length,
          model,
          mode: "general",
          isDutyDescription: true,
          versionCount: 1,
          rateeRank: ratee.rank,
          rateeAfsc: ratee.afsc,
          writingStyle,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (handleUsageLimitResponse(errorData)) return;
        throw new Error(errorData.error || "Could not improve duty description");
      }

      const data = (await response.json()) as { revisions?: string[] };
      const improved = data.revisions?.[0]?.trim();
      if (!improved) {
        toast.error("No improved version returned — try again.");
        return;
      }
      setDutyDraft(improved.slice(0, MAX_DUTY_DESCRIPTION_CHARACTERS));
      toast.success("Duty description improved");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to improve duty description"
      );
    } finally {
      setDutyGenerating(false);
    }
  };

  const handleAnalyze = async () => {
    if (!profile) return;
    setStep("planning");
    setErrorMessage("");
    try {
      const cycleYear = getActiveCycleYear(ratee.rank as Rank | null);
      const shell = await findActiveShell().catch(() => null);
      setActiveShell(shell);
      const dutyDescription = dutyDraft.trim() || shell?.duty_description || "";
      const response = await fetch("/api/plan-epb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rateeId: ratee.id,
          isManagedMember: Boolean(ratee.isManagedMember),
          rateeRank: ratee.rank,
          rateeAfsc: ratee.afsc,
          cycleYear,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (handleUsageLimitResponse(errorData)) {
          setStep("preflight");
          return;
        }
        throw new Error(errorData.error || "Planning failed");
      }

      const data = (await response.json()) as {
        plan: EpbPlan;
        records: PlanAccomplishmentRecord[];
      };
      setActiveShell(shell);
      setRecords(data.records ?? []);
      setEditable(planToEditable(data.plan));
      setRationaleByMpa(
        Object.fromEntries(
          data.plan.mpas.map((m) => [
            m.mpaKey,
            m.sentences.map((s) => s.rationale).filter(Boolean).join(" · "),
          ])
        )
      );
      setStep("review");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to analyze accomplishments"
      );
      setStep("error");
    }
  };

  const updateMpa = (
    mpaKey: string,
    updater: (prev: { enabled: boolean; groups: string[][] }) => {
      enabled: boolean;
      groups: string[][];
    }
  ) => {
    setEditable((prev) => ({ ...prev, [mpaKey]: updater(prev[mpaKey]) }));
  };

  const removeId = (mpaKey: string, groupIdx: number, id: string) =>
    updateMpa(mpaKey, (prev) => ({
      ...prev,
      groups: prev.groups.map((g, i) =>
        i === groupIdx ? g.filter((x) => x !== id) : g
      ),
    }));

  const addId = (mpaKey: string, groupIdx: number, id: string) =>
    updateMpa(mpaKey, (prev) => ({
      ...prev,
      groups: prev.groups.map((g, i) =>
        i === groupIdx && !g.includes(id) ? [...g, id] : g
      ),
    }));

  const removeGroup = (mpaKey: string, groupIdx: number) =>
    updateMpa(mpaKey, (prev) => ({
      ...prev,
      groups: prev.groups.filter((_, i) => i !== groupIdx),
    }));

  const addGroup = (mpaKey: string) =>
    updateMpa(mpaKey, (prev) =>
      prev.groups.length >= 2 ? prev : { ...prev, groups: [...prev.groups, []] }
    );

  const toggleMpa = (mpaKey: string) =>
    updateMpa(mpaKey, (prev) => ({ ...prev, enabled: !prev.enabled }));

  const chipLabel = (id: string): string => {
    const r = recordsById.get(id);
    if (!r) return id;
    return `${r.action_verb} — ${r.details}`;
  };

  const navigateToEpb = (firstMpa: string | null) => {
    setSelectedRatee(ratee);
    collapseAll();
    if (firstMpa) setSectionCollapsed(firstMpa, false);
    if (profile) {
      const storageValue = ratee.isManagedMember
        ? `managed:${ratee.id}`
        : ratee.id === profile.id
          ? "self"
          : ratee.id;
      try {
        localStorage.setItem(
          `epb-selected-ratee-${profile.id}`,
          JSON.stringify({ value: storageValue, ratee })
        );
      } catch {
        // ignore quota / private mode
      }
    }
    handleOpenChange(false);
    router.push("/epb");
  };

  const handleGenerate = async () => {
    if (!profile) return;
    const runSelections = editableToMpaSelections(editable);
    if (runSelections.length === 0) {
      toast.error("Select at least one performance area to generate.");
      return;
    }

    setStep("generating");
    setRunStatus(
      Object.fromEntries(runSelections.map((s) => [s.mpaKey, "queued"]))
    );

    let shell = activeShell;
    if (!shell) {
      try {
        const result = await createEpbShell(supabase, {
          ratee,
          profileId: profile.id,
        });
        if (
          result.status === "active_exists" ||
          result.status === "archived_conflict"
        ) {
          throw new Error(
            "Could not open an EPB shell for this cycle. Open EPB to resolve, then retry."
          );
        }
        shell = result.shell as ShellWithSections;
        setActiveShell(shell);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to create EPB shell"
        );
        setStep("error");
        return;
      }
    }

    try {
      await persistDutyDescription(shell);
    } catch {
      // non-fatal: fall back to the in-memory duty description below
    }
    const dutyDescription = dutyDraft.trim() || (shell.duty_description ?? "");

    const cycleYear = getActiveCycleYear(ratee.rank as Rank | null);
    let firstCompleted: string | null = null;

    for (const selection of runSelections) {
      setRunStatus((prev) => ({ ...prev, [selection.mpaKey]: "generating" }));
      try {
        const mpaRecords = selection.accomplishmentIds
          .map((id) => recordsById.get(id))
          .filter((r): r is PlanAccomplishmentRecord => !!r);

        const { customContext, customContext2 } = buildGroupedMpaContexts(
          selection.groups,
          recordsById
        );

        const response = await billableFetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rateeId: ratee.id,
            isManagedMember: Boolean(ratee.isManagedMember),
            rateeRank: ratee.rank,
            rateeAfsc: ratee.afsc,
            cycleYear,
            model,
            writingStyle,
            selectedMPAs: [selection.mpaKey],
            customContext,
            customContextOptions: {
              statementCount: selection.sentenceCount,
              ...(customContext2 ? { customContext2 } : {}),
            },
            dutyDescription,
            accomplishments: mpaRecords.map((r) => ({
              id: r.id,
              mpa: selection.mpaKey,
              action_verb: r.action_verb,
              details: r.details,
              impact: r.impact,
              metrics: r.metrics,
            })),
            requestClarifyingQuestions: false,
            versionCount: VERSION_COUNT,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          if (handleUsageLimitResponse(errorData)) {
            setRunStatus((prev) => ({ ...prev, [selection.mpaKey]: "failed" }));
            break;
          }
          throw new Error(errorData.error || "Generation failed");
        }

        const result = await response.json();
        const versions = combineVersions(
          extractVersionArrays(result.statements?.[0]),
          selection.sentenceCount
        );
        if (versions.length === 0) {
          setRunStatus((prev) => ({ ...prev, [selection.mpaKey]: "failed" }));
          continue;
        }

        const section = shell.sections?.find((s) => s.mpa === selection.mpaKey);
        if (!section) {
          setRunStatus((prev) => ({ ...prev, [selection.mpaKey]: "failed" }));
          continue;
        }

        // Stage all versions for one-tap swap in the workspace.
        await supabase.from("epb_saved_examples").insert(
          versions.map((statement) => ({
            shell_id: shell!.id,
            section_id: section.id,
            mpa: selection.mpaKey,
            statement_text: statement,
            created_by: profile.id,
            created_by_name: profile.full_name,
            created_by_rank: profile.rank,
            note: "Generated by Generate EPB",
          })) as never
        );

        const conflictStage =
          conflictPolicy === "stage" &&
          isSubstantialEpbStatement(existingMpaText.get(selection.mpaKey));

        if (conflictStage) {
          setRunStatus((prev) => ({ ...prev, [selection.mpaKey]: "staged" }));
        } else {
          await supabase
            .from("epb_shell_sections")
            .update({
              statement_text: versions[0],
              last_edited_by: profile.id,
              updated_at: new Date().toISOString(),
            } as never)
            .eq("id", section.id);
          setRunStatus((prev) => ({ ...prev, [selection.mpaKey]: "done" }));
        }
        if (!firstCompleted) firstCompleted = selection.mpaKey;
      } catch {
        setRunStatus((prev) => ({ ...prev, [selection.mpaKey]: "failed" }));
      }

      await sleep(PACING_MS);
    }

    Analytics.generateCompleted(model, 0, runSelections.length);

    if (firstCompleted != null) {
      toast.success("EPB generated — opening your workspace");
      navigateToEpb(firstCompleted);
    } else {
      setErrorMessage(
        "No statements were generated. Check your accomplishments or API key and try again."
      );
      setStep("error");
    }
  };

  const generateCost = selections.length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        size="2xl"
        className="flex max-h-[min(92vh,880px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
        aria-describedby="generate-epb-desc"
      >
        {step === "preflight" && (
          <>
            <DialogHeader className="shrink-0 space-y-2 border-b px-6 py-5 pr-12 sm:px-8 sm:py-6">
              <DialogTitle className="text-xl">Generate EPB</DialogTitle>
              <DialogDescription id="generate-epb-desc" className="text-sm leading-relaxed">
                We pick the strongest accomplishments for{" "}
                <span className="font-medium text-foreground">
                  {ratee.rank} {ratee.fullName || "this member"}
                </span>{" "}
                using assessment MPA fit scores — up to two sentences per
                performance area — then you review before anything is generated.
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8 sm:py-7">
              <div className="flex flex-col gap-5">
                {isPreselected && (
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
                    <p className="text-sm font-medium">
                      Using your {preselectedRecords.length} selected accomplishment
                      {preselectedRecords.length === 1 ? "" : "s"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                      Top MPA-fit entries become up to two sentences per area;
                      leftovers can fill gaps in under-covered areas.
                    </p>
                  </div>
                )}
                <div className="rounded-xl border bg-muted/20 p-4 sm:p-5">
                  <button
                    type="button"
                    onClick={handleToggleDuty}
                    aria-expanded={showDuty}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 text-left",
                      motionPressOnly
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <ClipboardList className="size-4 shrink-0 text-muted-foreground" />
                      <span className="text-sm font-semibold">
                        Duty description{" "}
                        <span className="font-normal text-muted-foreground">
                          (optional — improves quality)
                        </span>
                      </span>
                    </span>
                    <ChevronDown
                      className={cn("size-4 text-muted-foreground", motionChevronOpen)}
                      data-open={showDuty}
                    />
                  </button>

                  {showDuty ? (
                    <div className={cn("mt-3", motionEnter, motionEnterDurNormal)}>
                      {dutyLoading ? (
                        <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                          <Loader2 className="size-4 animate-spin" />
                          Loading current duty description…
                        </div>
                      ) : (
                        <>
                          <Textarea
                            value={dutyDraft}
                            onChange={(e) =>
                              setDutyDraft(
                                e.target.value.slice(
                                  0,
                                  MAX_DUTY_DESCRIPTION_CHARACTERS
                                )
                              )
                            }
                            rows={4}
                            placeholder="e.g., Serves as NCOIC of a 12-person section; responsible for $2M in network assets supporting 500+ users across the wing."
                            aria-label="Duty description"
                            className={motionInputFocus}
                          />
                          <div className="mt-1 flex items-center justify-between gap-3">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className={cn("h-8", motionPressOnly)}
                              disabled={dutyGenerating || !dutyDraft.trim()}
                              onClick={handleImproveDuty}
                            >
                              {dutyGenerating ? (
                                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                              ) : (
                                <Sparkles className="mr-1.5 size-3.5" />
                              )}
                              Revise with AI
                              <TokenCostBadge cost={1} compact className="ml-1.5" />
                            </Button>
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {dutyDraft.length}/{MAX_DUTY_DESCRIPTION_CHARACTERS}
                            </span>
                          </div>
                        </>
                      )}
                      <p className="mt-2 text-xs text-muted-foreground leading-snug">
                        Draft a short duty description, then improve it with AI
                        (rephrase only — no invented scope). Saved to this EPB and
                        used as context when writing every statement.
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                      Adding a duty description first gives the AI better context
                      for higher-quality statements. Higher-Level Reviewer (HLR)
                      is generated separately after you&apos;re happy with the
                      MPAs.
                    </p>
                  )}
                </div>

                {readiness.warnings.length > 0 && (
                  <ul className="space-y-2">
                    {readiness.warnings.map((warning, index) => (
                      <li
                        key={warning}
                        className={cn(
                          "flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200",
                          motionEnter,
                          motionEnterDurList
                        )}
                        style={motionListEnterStagger(index)}
                      >
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                        <span className="leading-snug">{warning}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <DialogFooter className="shrink-0 gap-3 border-t bg-muted/20 px-6 py-4 sm:px-8 sm:justify-between">
              <Button variant="outline" className="h-10 px-5" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              {isPreselected ? (
                <Button
                  onClick={() => setStep("review")}
                  disabled={selections.length === 0}
                  className={cn("h-10 px-5", motionPressOnly)}
                >
                  <ClipboardList className="mr-2 size-4" />
                  Review plan
                </Button>
              ) : (
                <Button
                  onClick={handleAnalyze}
                  className={cn("h-10 px-5", motionPressOnly)}
                >
                  <ClipboardList className="mr-2 size-4" />
                  Plan my EPB
                </Button>
              )}
            </DialogFooter>
          </>
        )}

        {step === "planning" && (
          <>
            <DialogHeader className="shrink-0 space-y-2 border-b px-6 py-5 pr-12 sm:px-8 sm:py-6">
              <DialogTitle className="text-xl">Selecting your best work</DialogTitle>
              <DialogDescription>
                Ranking accomplishments by MPA fit and grouping related ones
                into stronger statements…
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16">
              <Loader2 className="size-10 animate-spin text-muted-foreground" />
            </div>
          </>
        )}

        {step === "review" && (
          <>
            <DialogHeader className="shrink-0 space-y-2 border-b px-6 py-5 pr-12 sm:px-8 sm:py-6">
              <DialogTitle className="text-xl">Review the selection</DialogTitle>
              <DialogDescription className="text-sm leading-relaxed">
                Each sentence group becomes one statement (related accomplishments
                are combined). Up to two sentences per area — remove or add
                entries, or turn off an area.
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8 sm:py-7">
              <div className="flex flex-col gap-4">
                {conflictingMpas.length > 0 && (
                  <div className="rounded-xl border border-amber-400/40 bg-amber-50 p-4 dark:bg-amber-950/30">
                    <div className="flex items-start gap-2">
                      <FileWarning className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                          {conflictingMpas.length} area
                          {conflictingMpas.length === 1 ? "" : "s"} already{" "}
                          {conflictingMpas.length === 1 ? "has" : "have"} a statement
                        </p>
                        <p className="mt-0.5 text-xs text-amber-700/90 dark:text-amber-300/90">
                          {conflictingMpas.map(mpaLabel).join(", ")}
                        </p>
                        <div
                          className="mt-3 grid grid-cols-2 gap-2"
                          role="group"
                          aria-label="What to do with existing statements"
                        >
                          {(["overwrite", "stage"] as const).map((policy) => (
                            <button
                              key={policy}
                              type="button"
                              onClick={() => setConflictPolicy(policy)}
                              aria-pressed={conflictPolicy === policy}
                              className={cn(
                                "h-10 rounded-lg border text-sm font-medium",
                                motionPressOnly,
                                conflictPolicy === policy
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "bg-background hover:bg-muted"
                              )}
                            >
                              {policy === "overwrite"
                                ? "Overwrite them"
                                : "Keep & stage new"}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {selections.length === 0 && (
                  <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                    No performance areas selected. Enable at least one below.
                  </p>
                )}

                {Object.keys(editable).map((mpaKey, index) => {
                  const entry = editable[mpaKey];
                  const usedIds = new Set(entry.groups.flat());
                  const available = records.filter(
                    (r) => !usedIds.has(r.id)
                  );
                  return (
                    <section
                      key={mpaKey}
                      className={cn(
                        "rounded-xl border bg-background p-4 sm:p-5",
                        motionSurfaceCard,
                        motionEnter,
                        motionEnterDurList,
                        !entry.enabled && "opacity-60"
                      )}
                      style={motionListEnterStagger(index)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <label className="flex items-center gap-2.5">
                          <Checkbox
                            checked={entry.enabled}
                            onCheckedChange={() => toggleMpa(mpaKey)}
                            aria-label={`Include ${mpaLabel(mpaKey)}`}
                          />
                          <span className="text-sm font-semibold">
                            {mpaLabel(mpaKey)}
                          </span>
                        </label>
                        <Badge variant="outline" className="text-[10px]">
                          {entry.groups.filter((g) => g.length > 0).length || 0} sentence
                          {entry.groups.filter((g) => g.length > 0).length === 1
                            ? ""
                            : "s"}
                        </Badge>
                      </div>

                      {rationaleByMpa[mpaKey] && (
                        <p className="mt-2 text-xs italic text-muted-foreground leading-snug">
                          {rationaleByMpa[mpaKey]}
                        </p>
                      )}

                      {entry.enabled && (
                        <div className="mt-3 space-y-3">
                          {entry.groups.map((group, groupIdx) => (
                            <div
                              key={`${mpaKey}-g${groupIdx}`}
                              className="rounded-lg border bg-muted/20 p-3"
                            >
                              <div className="mb-2 flex items-center justify-between">
                                <span className="text-xs font-medium text-muted-foreground">
                                  Sentence {groupIdx + 1}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => removeGroup(mpaKey, groupIdx)}
                                  className="text-xs text-muted-foreground hover:text-destructive"
                                  aria-label={`Remove sentence ${groupIdx + 1}`}
                                >
                                  Remove
                                </button>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {group.map((id) => (
                                  <span
                                    key={id}
                                    className="flex w-full items-start gap-1.5 rounded-md border bg-background px-2 py-1 text-xs"
                                  >
                                    <span className="min-w-0 flex-1 whitespace-normal break-words leading-snug">
                                      {chipLabel(id)}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => removeId(mpaKey, groupIdx, id)}
                                      aria-label={`Remove ${chipLabel(id)}`}
                                      className="mt-0.5 shrink-0 text-muted-foreground hover:text-destructive"
                                    >
                                      <X className="size-3" />
                                    </button>
                                  </span>
                                ))}
                                {group.length === 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    Add an accomplishment to this sentence.
                                  </span>
                                )}
                              </div>
                              {available.length > 0 && (
                                <div className="mt-2">
                                  <Select
                                    value=""
                                    onValueChange={(id) => addId(mpaKey, groupIdx, id)}
                                  >
                                    <SelectTrigger
                                      className="h-8 text-xs"
                                      aria-label={`Add accomplishment to sentence ${groupIdx + 1}`}
                                    >
                                      <span className="flex items-center gap-1.5 text-muted-foreground">
                                        <Plus className="size-3.5" />
                                        Add accomplishment
                                      </span>
                                    </SelectTrigger>
                                    <SelectContent>
                                      {available.map((r) => (
                                        <SelectItem key={r.id} value={r.id}>
                                          {chipLabel(r.id)}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                            </div>
                          ))}
                          {entry.groups.length < 2 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => addGroup(mpaKey)}
                            >
                              <Plus className="mr-1.5 size-3.5" />
                              Add second sentence
                            </Button>
                          )}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            </div>

            <DialogFooter className="shrink-0 gap-3 border-t bg-muted/20 px-6 py-4 sm:px-8 sm:justify-between">
              <Button variant="outline" className="h-10 px-5" onClick={() => setStep("preflight")}>
                Back
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={selections.length === 0}
                className={cn("h-10 px-5", motionPressOnly)}
              >
                <Sparkles className="mr-2 size-4" />
                Generate my EPB
                <TokenCostBadge
                  cost={generateCost}
                  compact
                  className="ml-2 border-primary-foreground/30 bg-primary-foreground/15 text-primary-foreground"
                />
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "generating" && (
          <>
            <DialogHeader className="shrink-0 space-y-2 border-b px-6 py-5 pr-12 sm:px-8 sm:py-6">
              <DialogTitle className="text-xl">Generating your EPB</DialogTitle>
              <DialogDescription>
                Writing each performance area. This runs one area at a time —
                hang tight.
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8 sm:py-7">
              <ul className="space-y-2.5">
                {selections.map((selection) => {
                  const status = runStatus[selection.mpaKey] ?? "queued";
                  return (
                    <li
                      key={selection.mpaKey}
                      className="flex items-center justify-between gap-3 rounded-lg border bg-background px-4 py-3"
                    >
                      <span className="text-sm font-medium">
                        {mpaLabel(selection.mpaKey)}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {status === "queued" && "Queued"}
                        {status === "generating" && (
                          <>
                            <Loader2 className="size-3.5 animate-spin" />
                            Generating…
                          </>
                        )}
                        {status === "done" && (
                          <>
                            <CheckCircle2 className="size-4 text-green-600 dark:text-green-400" />
                            Written
                          </>
                        )}
                        {status === "staged" && (
                          <>
                            <Check className="size-4 text-green-600 dark:text-green-400" />
                            Staged to examples
                          </>
                        )}
                        {status === "failed" && (
                          <span className="text-destructive">Failed</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        )}

        {step === "error" && (
          <>
            <DialogHeader className="shrink-0 space-y-2 border-b px-6 py-5 pr-12 sm:px-8 sm:py-6">
              <DialogTitle className="text-xl">Something went wrong</DialogTitle>
              <DialogDescription className="text-sm leading-relaxed">
                {errorMessage}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-14 text-center">
              <div className="flex size-16 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="size-8 text-destructive" />
              </div>
            </div>
            <DialogFooter className="shrink-0 gap-3 border-t bg-muted/20 px-6 py-4 sm:px-8 sm:justify-between">
              <Button variant="outline" className="h-10 px-5" onClick={() => handleOpenChange(false)}>
                Close
              </Button>
              <Button
                className={cn("h-10 px-5", motionPressOnly)}
                onClick={() => setStep(records.length > 0 ? "review" : "preflight")}
              >
                Try again
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
