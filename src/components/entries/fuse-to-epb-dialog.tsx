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
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { TokenCostBadge } from "@/components/billing/token-cost-badge";
import { cn } from "@/lib/utils";
import {
  motionChip,
  motionEnter,
  motionEnterDurList,
  motionListEnterStagger,
  motionPressOnly,
  motionSurfaceCard,
} from "@/lib/motion/classes";
import {
  ENTRY_MGAS,
  getActiveCycleYear,
  getCycleRangeLabelForYear,
  getNextEpbShellCycleYear,
} from "@/lib/constants";
import {
  EPB_MODEL_PREFERENCE_STORAGE_KEY,
  getStoredModelPreference,
} from "@/lib/model-preferences";
import {
  isSubstantialEpbStatement,
  majorityMpa,
  toGenerateAccomplishmentPayload,
} from "@/lib/fuse-to-epb";
import {
  createEpbShell,
  listEpbShellCycleYears,
  type EpbShellWithSections,
} from "@/lib/epb-shell-create";
import { Analytics } from "@/lib/analytics";
import type {
  Accomplishment,
  EPBSavedExample,
  EPBShell,
  EPBShellSection,
  Rank,
  WritingStyle,
} from "@/types/database";
import {
  BookmarkPlus,
  Copy,
  FileText,
  Loader2,
  Plus,
  Sparkles,
  ArrowRight,
} from "lucide-react";

/** MPAs that exist as epb_shell_sections rows (no miscellaneous / HLR). */
const FUSE_TARGET_MPAS = ENTRY_MGAS.filter((m) => m.key !== "miscellaneous");
const FUSE_TARGET_KEYS = new Set(FUSE_TARGET_MPAS.map((m) => m.key));
const VERSION_COUNT = 3;

type DialogStep =
  | "configure"
  | "generating"
  | "results"
  | "confirm-replace"
  | "need-shell";

type PendingShellAction =
  | { kind: "replace"; statement: string }
  | { kind: "example"; statement: string };

export interface FuseToEpbDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accomplishments: Accomplishment[];
  ratee: SelectedRatee;
}

export function FuseToEpbDialog({
  open,
  onOpenChange,
  accomplishments,
  ratee,
}: FuseToEpbDialogProps) {
  const router = useRouter();
  const supabase = createClient();
  const { profile } = useUserStore();
  const {
    setSelectedRatee,
    setSectionCollapsed,
    collapseAll,
    updateSectionState,
    setExamplesFocus,
  } = useEPBShellStore();

  const [step, setStep] = useState<DialogStep>("configure");
  const [targetMpa, setTargetMpa] = useState(() =>
    majorityMpa(accomplishments, FUSE_TARGET_KEYS)
  );
  const [sentenceCount, setSentenceCount] = useState<1 | 2>(1);
  const [generatedStatements, setGeneratedStatements] = useState<string[]>([]);
  const [pendingStatement, setPendingStatement] = useState<string | null>(null);
  const [pendingShellAction, setPendingShellAction] =
    useState<PendingShellAction | null>(null);
  const [existingPreview, setExistingPreview] = useState("");
  const [isCreatingShell, setIsCreatingShell] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [savingExampleFor, setSavingExampleFor] = useState<string | null>(null);
  const [nextPeriodLabel, setNextPeriodLabel] = useState("");

  const model = getStoredModelPreference(EPB_MODEL_PREFERENCE_STORAGE_KEY);
  const writingStyle: WritingStyle =
    (profile?.writing_style as WritingStyle | undefined) || "personal";
  const mpaLabel =
    FUSE_TARGET_MPAS.find((m) => m.key === targetMpa)?.label || targetMpa;

  const resetLocal = () => {
    setStep("configure");
    setTargetMpa(majorityMpa(accomplishments, FUSE_TARGET_KEYS));
    setSentenceCount(1);
    setGeneratedStatements([]);
    setPendingStatement(null);
    setPendingShellAction(null);
    setExistingPreview("");
    setIsCreatingShell(false);
    setIsSending(false);
    setSavingExampleFor(null);
    setNextPeriodLabel("");
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetLocal();
    onOpenChange(next);
  };

  const findActiveShell = async (): Promise<
    (EPBShell & { sections: EPBShellSection[] }) | null
  > => {
    let query = supabase
      .from("epb_shells")
      .select(`*, sections:epb_shell_sections(*)`)
      .neq("status", "archived")
      .order("updated_at", { ascending: false });

    if (ratee.isManagedMember) {
      query = query.eq("team_member_id", ratee.id);
    } else {
      query = query.eq("user_id", ratee.id).is("team_member_id", null);
    }

    const { data, error } = await query.limit(1).maybeSingle();
    if (error) throw error;
    return (data as (EPBShell & { sections: EPBShellSection[] }) | null) ?? null;
  };

  const prepareNeedShell = async (action: PendingShellAction) => {
    const cycleYears = await listEpbShellCycleYears(supabase, ratee);
    const nextYear = getNextEpbShellCycleYear(
      ratee.rank as Rank | null,
      cycleYears
    );
    setNextPeriodLabel(
      getCycleRangeLabelForYear(ratee.rank as Rank | null, nextYear)
    );
    setPendingShellAction(action);
    setPendingStatement(action.statement);
    setStep("need-shell");
  };

  const createShell = async (): Promise<EpbShellWithSections> => {
    if (!profile) throw new Error("Not signed in");

    const result = await createEpbShell(supabase, {
      ratee,
      profileId: profile.id,
    });

    switch (result.status) {
      case "created":
        Analytics.epbShellCreated(
          ratee.isManagedMember
            ? "managed_member"
            : ratee.id === profile.id
              ? "self"
              : "subordinate"
        );
        return result.shell;
      case "active_exists":
        throw new Error(
          "Archive the current EPB before starting a new evaluation cycle."
        );
      case "archived_conflict":
        throw new Error(
          "An archived EPB exists for this cycle. Open EPB to restore it or start the next cycle."
        );
      case "loaded_existing":
        return result.shell;
    }
  };

  const applyStatementToShell = async (
    shell: EPBShell & { sections: EPBShellSection[] },
    statement: string
  ) => {
    if (!profile) throw new Error("Not signed in");

    const section = (shell.sections || []).find((s) => s.mpa === targetMpa);
    if (!section) {
      throw new Error(`No ${mpaLabel} section found on this EPB shell`);
    }

    const { error } = await supabase
      .from("epb_shell_sections")
      .update({
        statement_text: statement,
        last_edited_by: profile.id,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", section.id);

    if (error) throw error;
  };

  const saveExampleToShell = async (
    shell: EPBShell & { sections: EPBShellSection[] },
    statement: string
  ): Promise<EPBSavedExample> => {
    if (!profile) throw new Error("Not signed in");

    const section = (shell.sections || []).find((s) => s.mpa === targetMpa);
    if (!section) {
      throw new Error(`No ${mpaLabel} section found on this EPB shell`);
    }

    const { data, error } = await supabase
      .from("epb_saved_examples")
      .insert({
        shell_id: shell.id,
        section_id: section.id,
        mpa: targetMpa,
        statement_text: statement,
        created_by: profile.id,
        created_by_name: profile.full_name,
        created_by_rank: profile.rank,
        note: "Staged from Entries",
      } as never)
      .select()
      .single();

    if (error) throw error;
    if (!data) throw new Error("No example returned from insert");
    return data as EPBSavedExample;
  };

  const navigateToEpb = (opts?: { exampleIds?: string[] }) => {
    setSelectedRatee(ratee);
    collapseAll();
    setSectionCollapsed(targetMpa, false);
    updateSectionState(targetMpa, {
      sourceType: "actions",
      usesTwoStatements: sentenceCount === 2,
      statement1ActionIds: accomplishments.map((a) => a.id),
      statement2ActionIds: [],
      actionsExpanded: true,
    });
    if (opts?.exampleIds?.length) {
      setExamplesFocus({ mpa: targetMpa, highlightIds: opts.exampleIds });
    }
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
    if (!profile || accomplishments.length === 0) return;

    setStep("generating");
    setGeneratedStatements([]);
    const started = Date.now();

    try {
      const cycleYear = getActiveCycleYear(ratee.rank as Rank | null);
      const accPayload = accomplishments.map(toGenerateAccomplishmentPayload);

      // Match /epb: pass fused customContext so statementCount (1|2) is honored.
      // Accomplishments-only path ignores statementCount and writes one sentence per entry.
      const customContext = accPayload
        .map((a) => {
          const impact = a.impact ? `. Impact: ${a.impact}` : "";
          const metrics = a.metrics ? `. Metrics: ${a.metrics}` : "";
          return `${a.action_verb}: ${a.details}${impact}${metrics}`;
        })
        .join("\n\n");

      // Same as /epb multi-version generate: one request, one credit, N alternatives
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
          selectedMPAs: [targetMpa],
          customContext,
          customContextOptions: {
            statementCount: sentenceCount,
          },
          accomplishments: accPayload,
          requestClarifyingQuestions: false,
          versionCount: VERSION_COUNT,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (handleUsageLimitResponse(errorData)) {
          setStep("configure");
          return;
        }
        throw new Error(errorData.error || "Generation failed");
      }

      const result = await response.json();
      const mpaResult = result.statements?.[0];
      const versionArrays: string[][] =
        Array.isArray(mpaResult?.statementVersions) &&
        mpaResult.statementVersions.length > 0
          ? mpaResult.statementVersions
          : mpaResult?.statements?.length
            ? [mpaResult.statements]
            : [];

      const combine = (statements: string[]): string | null => {
        const capped = statements.slice(0, sentenceCount).filter(Boolean);
        if (!capped.length) return null;
        if (capped.length === 1) return capped[0];
        const separator = capped[0]?.trim().endsWith(".") ? " " : ". ";
        return `${capped[0]}${separator}${capped[1]}`;
      };

      const valid = versionArrays
        .map(combine)
        .filter((r): r is string => !!r?.trim());

      if (valid.length === 0) {
        toast.error("No statements generated");
        setStep("configure");
        return;
      }

      Analytics.generateCompleted(model, Date.now() - started, valid.length);
      setGeneratedStatements(valid);
      setStep("results");
    } catch (error) {
      console.error(error);
      Analytics.generateFailed(
        model,
        error instanceof Error ? error.message : "Unknown error"
      );
      toast.error(
        error instanceof Error ? error.message : "Failed to generate statements"
      );
      setStep("configure");
    }
  };

  const replaceMpaWithStatement = async (statement: string) => {
    setIsSending(true);
    try {
      const shell = await findActiveShell();
      if (!shell) {
        await prepareNeedShell({ kind: "replace", statement });
        return;
      }

      await applyStatementToShell(shell, statement);
      Analytics.statementGenerated(targetMpa, "actions");
      toast.success(`Statement sent to ${mpaLabel}`);
      navigateToEpb();
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Failed to send statement to EPB"
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleUseOnMpa = async (statement: string) => {
    setIsSending(true);
    try {
      const shell = await findActiveShell();
      if (!shell) {
        await prepareNeedShell({ kind: "replace", statement });
        return;
      }

      const existingText =
        shell.sections?.find((s) => s.mpa === targetMpa)?.statement_text ?? "";

      if (isSubstantialEpbStatement(existingText)) {
        setExistingPreview(existingText);
        setPendingStatement(statement);
        setStep("confirm-replace");
        return;
      }

      await applyStatementToShell(shell, statement);
      Analytics.statementGenerated(targetMpa, "actions");
      toast.success(`Statement sent to ${mpaLabel}`);
      navigateToEpb();
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Failed to send statement to EPB"
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleSaveAsExample = async (statement: string) => {
    setSavingExampleFor(statement);
    try {
      const shell = await findActiveShell();
      if (!shell) {
        await prepareNeedShell({ kind: "example", statement });
        return;
      }

      const saved = await saveExampleToShell(shell, statement);
      toast.success(`Saved to ${mpaLabel} examples — opening EPB`);
      navigateToEpb({ exampleIds: [saved.id] });
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Failed to save example"
      );
    } finally {
      setSavingExampleFor(null);
    }
  };

  const handleCreateShellAndContinue = async () => {
    if (!pendingShellAction) return;
    setIsCreatingShell(true);
    try {
      const shell = await createShell();
      if (pendingShellAction.kind === "example") {
        const saved = await saveExampleToShell(
          shell,
          pendingShellAction.statement
        );
        toast.success(`EPB created — opening ${mpaLabel} examples`);
        navigateToEpb({ exampleIds: [saved.id] });
        return;
      }

      await applyStatementToShell(shell, pendingShellAction.statement);
      Analytics.statementGenerated(targetMpa, "actions");
      toast.success(`EPB created — statement sent to ${mpaLabel}`);
      navigateToEpb();
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : "Failed to create EPB shell"
      );
    } finally {
      setIsCreatingShell(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        size="2xl"
        className="flex max-h-[min(92vh,880px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
        aria-describedby="fuse-to-epb-desc"
      >
        {step === "configure" && (
          <>
            <DialogHeader className="shrink-0 space-y-2 border-b px-6 py-5 pr-12 sm:px-8 sm:py-6">
              <DialogTitle className="text-xl">Generate EPB statement</DialogTitle>
              <DialogDescription
                id="fuse-to-epb-desc"
                className="text-sm leading-relaxed"
              >
                Draft from {accomplishments.length} selected accomplishment
                {accomplishments.length === 1 ? "" : "s"} for{" "}
                <span className="font-medium text-foreground">
                  {ratee.rank} {ratee.fullName || "this member"}
                </span>
                . You&apos;ll pick a version next — save it as an example or put
                it on the MPA.
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8 sm:py-7">
              <div className="flex flex-col gap-8">
                <section className="space-y-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-sm font-semibold tracking-tight">
                      Selected accomplishments
                    </h3>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {accomplishments.length} selected
                    </span>
                  </div>
                  <ul className="space-y-3 rounded-xl border bg-muted/20 p-3 sm:p-4 max-h-56 overflow-y-auto">
                    {accomplishments.map((a) => (
                      <li
                        key={a.id}
                        className={cn(
                          "rounded-lg border bg-background px-3.5 py-3",
                          motionSurfaceCard
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <p className="text-sm font-semibold leading-none">
                            {a.action_verb}
                          </p>
                          <Badge
                            variant="outline"
                            className="text-[10px] font-normal"
                          >
                            {FUSE_TARGET_MPAS.find((m) => m.key === a.mpa)
                              ?.label ||
                              ENTRY_MGAS.find((m) => m.key === a.mpa)?.label ||
                              a.mpa}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {a.details}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="space-y-4">
                  <h3 className="text-sm font-semibold tracking-tight">
                    Generation options
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-3 rounded-xl border bg-background p-4 sm:p-5">
                      <label htmlFor="fuse-mpa" className="text-sm font-medium">
                        Target MPA
                      </label>
                      <p className="text-xs text-muted-foreground leading-snug -mt-1">
                        Where this draft will land on the EPB.
                      </p>
                      <Select value={targetMpa} onValueChange={setTargetMpa}>
                        <SelectTrigger
                          id="fuse-mpa"
                          className="h-11 mt-auto"
                          aria-label="Target MPA"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FUSE_TARGET_MPAS.map((mpa) => (
                            <SelectItem key={mpa.key} value={mpa.key}>
                              {mpa.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-col gap-3 rounded-xl border bg-background p-4 sm:p-5">
                      <span className="text-sm font-medium">
                        Statements in this MPA
                      </span>
                      <p className="text-xs text-muted-foreground leading-snug -mt-1">
                        Each MPA holds up to two (S1 + S2). Always generates{" "}
                        {VERSION_COUNT} versions to compare.
                      </p>
                      <div
                        className="mt-auto grid grid-cols-2 gap-2"
                        role="group"
                        aria-label="How many statements to generate for this MPA"
                      >
                        {([1, 2] as const).map((num) => (
                          <button
                            key={num}
                            type="button"
                            onClick={() => setSentenceCount(num)}
                            aria-pressed={sentenceCount === num}
                            className={cn(
                              "h-11 rounded-lg border text-sm font-medium",
                              motionChip,
                              sentenceCount === num
                                ? "border-primary bg-primary text-primary-foreground"
                                : "bg-muted/40 hover:bg-muted"
                            )}
                          >
                            {num === 1 ? "1 statement" : "2 statements"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </div>

            <DialogFooter className="shrink-0 gap-3 border-t bg-muted/20 px-6 py-4 sm:px-8 sm:justify-between">
              <Button
                variant="outline"
                className="h-10 px-5"
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                className={cn("h-10 px-5", motionPressOnly)}
              >
                <Sparkles className="size-4 mr-2" />
                Generate {VERSION_COUNT} versions
                <TokenCostBadge
                  cost={1}
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
              <DialogTitle className="text-xl">Generating statements</DialogTitle>
              <DialogDescription>
                Building {VERSION_COUNT} versions for {mpaLabel}…
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16">
              <Loader2 className="size-10 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Drafting {sentenceCount} statement
                {sentenceCount > 1 ? "s" : ""} × {VERSION_COUNT} versions…
              </p>
            </div>
          </>
        )}

        {step === "results" && (
          <>
            <DialogHeader className="shrink-0 space-y-2 border-b px-6 py-5 pr-12 sm:px-8 sm:py-6">
              <DialogTitle className="text-xl">Pick a version</DialogTitle>
              <DialogDescription className="text-sm leading-relaxed">
                Save as example opens EPB with Saved Examples expanded, or use it
                on the MPA to polish there.
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8 sm:py-7">
              <div className="grid gap-4">
                {generatedStatements.map((statement, index) => {
                  const saving = savingExampleFor === statement;
                  return (
                    <div
                      key={`fuse-${statement.slice(0, 48)}-${statement.length}`}
                      className={cn(
                        "space-y-3 rounded-xl border bg-background p-5",
                        motionSurfaceCard,
                        motionEnter,
                        motionEnterDurList
                      )}
                      style={motionListEnterStagger(index)}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <Badge variant="secondary" className="text-xs">
                          Version {index + 1}
                        </Badge>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-9 px-3"
                            onClick={() => {
                              navigator.clipboard.writeText(statement);
                              toast.success("Copied to clipboard");
                            }}
                          >
                            <Copy className="size-3.5 mr-1.5" />
                            Copy
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className={cn("h-9 px-3", motionPressOnly)}
                            disabled={saving || isSending}
                            onClick={() => handleSaveAsExample(statement)}
                          >
                            {saving ? (
                              <Loader2 className="size-3.5 animate-spin mr-1.5" />
                            ) : (
                              <BookmarkPlus className="size-3.5 mr-1.5" />
                            )}
                            Save as example
                          </Button>
                          <Button
                            size="sm"
                            className={cn("h-9 px-3", motionPressOnly)}
                            disabled={isSending || saving}
                            onClick={() => handleUseOnMpa(statement)}
                          >
                            {isSending ? (
                              <Loader2 className="size-3.5 animate-spin mr-1.5" />
                            ) : (
                              <ArrowRight className="size-3.5 mr-1.5" />
                            )}
                            Use on MPA
                          </Button>
                        </div>
                      </div>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {statement}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {statement.length} characters
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <DialogFooter className="shrink-0 gap-3 border-t bg-muted/20 px-6 py-4 sm:px-8">
              <Button
                variant="outline"
                className="h-10 px-5"
                onClick={() => setStep("configure")}
              >
                Back to options
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "confirm-replace" && pendingStatement && (
          <>
            <DialogHeader className="shrink-0 space-y-2 border-b px-6 py-5 pr-12 sm:px-8 sm:py-6">
              <DialogTitle className="text-xl">
                Replace existing {mpaLabel} statement?
              </DialogTitle>
              <DialogDescription className="text-sm leading-relaxed">
                This MPA already has a statement. Using this draft will overwrite
                what&apos;s there.
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8 sm:py-7">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-3 rounded-xl border bg-muted/20 p-4 sm:p-5">
                  <p className="text-sm font-semibold">Currently on EPB</p>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap max-h-56 overflow-y-auto">
                    {existingPreview}
                  </p>
                </div>
                <div className="space-y-3 rounded-xl border p-4 sm:p-5">
                  <p className="text-sm font-semibold">New draft</p>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap max-h-56 overflow-y-auto">
                    {pendingStatement}
                  </p>
                </div>
              </div>
            </div>

            <DialogFooter className="shrink-0 gap-3 border-t bg-muted/20 px-6 py-4 sm:px-8 sm:justify-between">
              <Button
                variant="outline"
                className="h-10 px-5"
                disabled={isSending}
                onClick={() => {
                  setPendingStatement(null);
                  setExistingPreview("");
                  setStep("results");
                }}
              >
                Back
              </Button>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className={cn("h-10 px-5", motionPressOnly)}
                  disabled={isSending}
                  onClick={() => handleSaveAsExample(pendingStatement)}
                >
                  <BookmarkPlus className="size-4 mr-2" />
                  Save as example instead
                </Button>
                <Button
                  className={cn("h-10 px-5", motionPressOnly)}
                  disabled={isSending}
                  onClick={() => replaceMpaWithStatement(pendingStatement)}
                >
                  {isSending ? (
                    <Loader2 className="size-4 animate-spin mr-2" />
                  ) : (
                    <ArrowRight className="size-4 mr-2" />
                  )}
                  Replace &amp; open EPB
                </Button>
              </div>
            </DialogFooter>
          </>
        )}

        {step === "need-shell" && (
          <>
            <DialogHeader className="shrink-0 space-y-2 border-b px-6 py-5 pr-12 sm:px-8 sm:py-6">
              <DialogTitle className="text-xl">Create an EPB shell first</DialogTitle>
              <DialogDescription className="text-sm leading-relaxed">
                {ratee.id === profile?.id
                  ? "You need an EPB shell before this draft can be saved."
                  : `${ratee.rank} ${ratee.fullName || "This member"} needs an EPB shell before this draft can be saved.`}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-14 text-center">
              <div className="size-16 rounded-full bg-muted/50 flex items-center justify-center">
                <FileText className="size-8 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
                Create the shell for the next evaluation period, then we&apos;ll
                {pendingShellAction?.kind === "example"
                  ? ` save your draft to ${mpaLabel} examples.`
                  : ` put your draft on ${mpaLabel} and open EPB.`}
              </p>
              {nextPeriodLabel && (
                <p className="text-sm font-medium tabular-nums">
                  Next period: {nextPeriodLabel}
                </p>
              )}
            </div>

            <DialogFooter className="shrink-0 gap-3 border-t bg-muted/20 px-6 py-4 sm:px-8 sm:justify-between">
              <Button
                variant="outline"
                className="h-10 px-5"
                onClick={() => {
                  setPendingShellAction(null);
                  setStep("results");
                }}
                disabled={isCreatingShell}
              >
                Back
              </Button>
              <Button
                onClick={handleCreateShellAndContinue}
                disabled={isCreatingShell}
                className={cn("h-10 px-5", motionPressOnly)}
              >
                {isCreatingShell ? (
                  <Loader2 className="size-4 animate-spin mr-2" />
                ) : (
                  <Plus className="size-4 mr-2" />
                )}
                {pendingShellAction?.kind === "example"
                  ? "Create EPB & Save Example"
                  : "Create EPB & Use on MPA"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
