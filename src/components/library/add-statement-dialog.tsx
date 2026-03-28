"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import { handleUsageLimitResponse } from "@/stores/usage-limit-store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { STANDARD_MGAS, RANKS, getActiveCycleYear } from "@/lib/constants";
import { Loader2, Wand2, ClipboardPaste, FileText, Award } from "lucide-react";
import { BulkStatementReview, type ParsedStatement } from "./bulk-statement-review";
import type { Rank, StatementType } from "@/types/database";

type BulkStep = "input" | "review";

const STORAGE_KEY = "add-statement-dialog-state";

interface SavedDialogState {
  bulkStep: BulkStep;
  bulkText: string;
  statementType: StatementType;
  mpaDetectionMode: "auto" | "manual";
  manualMpa: string;
  parsedStatements: ParsedStatement[];
  extractedDateRange: { start: string; end: string } | null;
  extractedCycleYear: number | null;
  cycleYear: number;
  selectedAfsc: string;
  selectedRank: Rank | "";
  savedAt: number;
}

interface AddStatementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatementAdded?: () => void;
}

export function AddStatementDialog({
  open,
  onOpenChange,
  onStatementAdded,
}: AddStatementDialogProps) {
  const { profile } = useUserStore();
  const [isSaving, setIsSaving] = useState(false);

  const [bulkStep, setBulkStep] = useState<BulkStep>("input");
  const [statementType, setStatementType] = useState<StatementType>("epb");

  // Shared defaults
  const [selectedAfsc, setSelectedAfsc] = useState("");
  const [selectedRank, setSelectedRank] = useState<Rank | "">("");
  const [cycleYear, setCycleYear] = useState<number>(new Date().getFullYear());

  // Bulk import state
  const [bulkText, setBulkText] = useState("");
  const [mpaDetectionMode, setMpaDetectionMode] = useState<"auto" | "manual">("auto");
  const [manualMpa, setManualMpa] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [parsedStatements, setParsedStatements] = useState<ParsedStatement[]>([]);
  const [extractedDateRange, setExtractedDateRange] = useState<{ start: string; end: string } | null>(null);
  const [extractedCycleYear, setExtractedCycleYear] = useState<number | null>(null);

  // Close confirmation state
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const supabase = createClient();

  const hasProgress = useCallback(() => {
    return bulkText.trim().length > 0 || parsedStatements.length > 0;
  }, [bulkText, parsedStatements.length]);

  const saveToStorage = useCallback(() => {
    if (!hasProgress()) return;
    
    const state: SavedDialogState = {
      bulkStep,
      bulkText,
      statementType,
      mpaDetectionMode,
      manualMpa,
      parsedStatements,
      extractedDateRange,
      extractedCycleYear,
      cycleYear,
      selectedAfsc,
      selectedRank,
      savedAt: Date.now(),
    };
    
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Failed to save dialog state to localStorage:", e);
    }
  }, [
    bulkStep, bulkText, statementType, mpaDetectionMode, manualMpa,
    parsedStatements, extractedDateRange, extractedCycleYear,
    cycleYear, selectedAfsc, selectedRank, hasProgress,
  ]);

  const loadFromStorage = useCallback((): SavedDialogState | null => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return null;
      
      const state = JSON.parse(saved) as SavedDialogState;
      
      const ONE_DAY = 24 * 60 * 60 * 1000;
      if (Date.now() - state.savedAt > ONE_DAY) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      
      return state;
    } catch (e) {
      console.warn("Failed to load dialog state from localStorage:", e);
      return null;
    }
  }, []);

  const clearStorage = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn("Failed to clear dialog state from localStorage:", e);
    }
  }, []);

  const mgas = STANDARD_MGAS.filter(m => m.key !== "hlr_assessment");

  // Initialize defaults from profile when dialog opens
  useEffect(() => {
    if (open && profile) {
      setSelectedAfsc(profile.afsc || "");
      setSelectedRank(profile.rank || "");
      setCycleYear(getActiveCycleYear(profile.rank as Rank | null));
    }
  }, [open, profile]);

  // Load saved state when dialog opens
  useEffect(() => {
    if (open) {
      const saved = loadFromStorage();
      if (saved) {
        setBulkStep(saved.bulkStep);
        setBulkText(saved.bulkText);
        setStatementType(saved.statementType || "epb");
        setMpaDetectionMode(saved.mpaDetectionMode);
        setManualMpa(saved.manualMpa);
        setParsedStatements(saved.parsedStatements);
        setExtractedDateRange(saved.extractedDateRange);
        setExtractedCycleYear(saved.extractedCycleYear);
        setCycleYear(saved.cycleYear);
        setSelectedAfsc(saved.selectedAfsc);
        setSelectedRank(saved.selectedRank);
      }
    }
  }, [open, loadFromStorage]);

  // Auto-save state periodically when there's progress
  useEffect(() => {
    if (!open) return;
    
    const timer = setTimeout(() => {
      saveToStorage();
    }, 500);
    
    return () => clearTimeout(timer);
  }, [open, saveToStorage]);

  function resetForm(clearSaved = true) {
    setStatementType("epb");
    setSelectedAfsc(profile?.afsc || "");
    setSelectedRank(profile?.rank || "");
    setCycleYear(getActiveCycleYear(profile?.rank as Rank | null));
    setBulkText("");
    setMpaDetectionMode("auto");
    setManualMpa("");
    setParsedStatements([]);
    setExtractedDateRange(null);
    setExtractedCycleYear(null);
    setBulkStep("input");
    if (clearSaved) {
      clearStorage();
    }
  }

  function handleCloseAttempt() {
    if (hasProgress()) {
      setShowCloseConfirm(true);
    } else {
      resetForm();
      onOpenChange(false);
    }
  }

  function handleConfirmDiscard() {
    setShowCloseConfirm(false);
    resetForm();
    onOpenChange(false);
  }

  function handleKeepProgress() {
    setShowCloseConfirm(false);
    saveToStorage();
    onOpenChange(false);
  }

  async function handleParseBulk() {
    if (!bulkText.trim() || bulkText.length < 10) {
      toast.error("Please paste some statement text to parse");
      return;
    }

    setIsParsing(true);

    try {
      const response = await fetch("/api/parse-bulk-statements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText: bulkText,
          mpaDetectionMode,
          manualMpa: mpaDetectionMode === "manual" ? manualMpa : undefined,
          statementType,
          defaultCycleYear: cycleYear,
          defaultAfsc: selectedAfsc,
          defaultRank: selectedRank,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        if (handleUsageLimitResponse(error)) return;
        throw new Error(error.error || "Failed to parse statements");
      }

      const result = await response.json();
      
      if (result.statements.length === 0) {
        toast.error("No statements could be extracted from the text. Try different text or check formatting.");
        return;
      }

      setParsedStatements(result.statements);
      setExtractedDateRange(result.extractedDateRange);
      setExtractedCycleYear(result.extractedCycleYear);
      setBulkStep("review");
      toast.success(`Found ${result.statements.length} statement${result.statements.length !== 1 ? "s" : ""}`);
    } catch (error) {
      console.error("Error parsing statements:", error);
      toast.error(error instanceof Error ? error.message : "Failed to parse statements");
    } finally {
      setIsParsing(false);
    }
  }

  async function handleBulkSubmit() {
    if (!profile) return;

    const validStatements = parsedStatements.filter(
      s => s.text.trim().length > 0 && s.detectedMpa !== null
    );

    if (validStatements.length === 0) {
      toast.error("No valid statements to add. Please assign MPAs to all statements.");
      return;
    }

    setIsSaving(true);

    try {
      const statementsToInsert = validStatements.map(s => ({
        user_id: profile.id,
        mpa: s.detectedMpa,
        afsc: (s.afsc || selectedAfsc).toUpperCase(),
        rank: s.rank || selectedRank,
        statement: s.text.trim(),
        cycle_year: s.cycleYear || cycleYear,
        statement_type: statementType,
        is_favorite: false,
        applicable_mpas: [s.detectedMpa],
        award_category: null,
        is_winning_package: false,
        win_level: null,
        use_as_llm_example: false,
      }));

      const { error: insertError } = await supabase
        .from("refined_statements")
        .insert(statementsToInsert as never);

      if (insertError) throw insertError;

      toast.success(`Added ${validStatements.length} statement${validStatements.length !== 1 ? "s" : ""} to your library!`);
      resetForm();
      onStatementAdded?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Error inserting statements:", error);
      toast.error("Failed to add statements");
    } finally {
      setIsSaving(false);
    }
  }

  const dialogWidth = "max-w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-4rem)] lg:max-w-[calc(100vw-6rem)]";

  return (
    <>
      <Dialog open={open} onOpenChange={(value) => {
        if (!value) {
          handleCloseAttempt();
        } else {
          onOpenChange(value);
        }
      }}>
        <DialogContent 
          className={cn(dialogWidth, "mx-auto h-[85vh] max-h-[85vh] p-0 gap-0 flex flex-col")}
          hideCloseButton
          onInteractOutside={(e) => {
            e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            handleCloseAttempt();
          }}
        >
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-lg">
                {bulkStep === "review" 
                  ? "Review Statements" 
                  : "Add Statements"}
              </DialogTitle>
              <DialogDescription className="text-sm">
                {bulkStep === "review"
                  ? "Review and edit parsed statements before adding to your library"
                  : `Paste your ${statementType === "epb" ? "EPB" : "1206 award"} statement text and AI will parse individual statements`}
              </DialogDescription>
            </div>
            {bulkStep !== "review" && (
              <div className="flex rounded-lg border p-1 bg-muted/50">
                <button
                  type="button"
                  onClick={() => setStatementType("epb")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                    statementType === "epb"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <FileText className="size-3.5" />
                  EPB
                </button>
                <button
                  type="button"
                  onClick={() => setStatementType("award")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                    statementType === "award"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Award className="size-3.5" />
                  Award
                </button>
              </div>
            )}
          </div>
        </DialogHeader>

        {bulkStep === "review" ? (
          <div className="flex-1 min-h-0 overflow-hidden px-6 py-4 flex flex-col">
            <BulkStatementReview
              statements={parsedStatements}
              extractedDateRange={extractedDateRange}
              extractedCycleYear={extractedCycleYear}
              defaultCycleYear={cycleYear}
              defaultAfsc={selectedAfsc}
              defaultRank={selectedRank as Rank}
              onStatementsChange={setParsedStatements}
              onBack={() => setBulkStep("input")}
              onSubmit={handleBulkSubmit}
              isSubmitting={isSaving}
            />
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="space-y-4">
                {/* Instructions */}
                <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                  <div className="flex items-center gap-2 font-medium text-sm">
                    <Wand2 className="size-4 text-primary" />
                    How It Works
                  </div>
                  <ul className="text-sm text-muted-foreground space-y-1 ml-6 list-disc">
                    <li>Paste one or more {statementType === "epb" ? "EPB" : "1206 award"} statements — AI will detect and separate them</li>
                    {statementType === "epb" && (
                      <li>Include MPA headers (e.g., &quot;EXECUTING THE MISSION&quot;) for better detection</li>
                    )}
                    <li>Review and edit detected statements before adding to your library</li>
                  </ul>
                </div>

                {/* Configuration row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* MPA Detection Mode - EPB only */}
                  {statementType === "epb" && (
                    <div className="space-y-2">
                      <Label className="text-sm">MPA Detection</Label>
                      <Select
                        value={mpaDetectionMode}
                        onValueChange={(v) => setMpaDetectionMode(v as "auto" | "manual")}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto-detect from text</SelectItem>
                          <SelectItem value="manual">Set manually</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Manual MPA selector (only if manual mode + EPB) */}
                  {statementType === "epb" && mpaDetectionMode === "manual" && (
                    <div className="space-y-2">
                      <Label className="text-sm">Apply MPA to all</Label>
                      <Select value={manualMpa} onValueChange={setManualMpa}>
                        <SelectTrigger className="w-full">
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
                  )}

                  {/* Default Cycle Year */}
                  <div className="space-y-2">
                    <Label className="text-sm">Default Cycle Year</Label>
                    <Select
                      value={cycleYear.toString()}
                      onValueChange={(v) => setCycleYear(parseInt(v))}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(
                          (year) => (
                            <SelectItem key={year} value={year.toString()}>
                              {year}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Default Rank */}
                  <div className="space-y-2">
                    <Label className="text-sm">Default Rank</Label>
                    <Select
                      value={selectedRank}
                      onValueChange={(v) => setSelectedRank(v as Rank)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select rank" />
                      </SelectTrigger>
                      <SelectContent>
                        {RANKS.map((rank) => (
                          <SelectItem key={rank.value} value={rank.value}>
                            {rank.value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Default AFSC */}
                  <div className="space-y-2">
                    <Label className="text-sm">Default AFSC</Label>
                    <Input
                      value={selectedAfsc}
                      onChange={(e) => setSelectedAfsc(e.target.value.toUpperCase())}
                      placeholder="e.g., 1D771A"
                      className="uppercase"
                    />
                  </div>
                </div>

                {/* Large text area for pasting */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <ClipboardPaste className="size-4" />
                      Paste Statement Text
                    </Label>
                    <span className="text-xs text-muted-foreground">
                      {bulkText.length} characters
                    </span>
                  </div>
                  <Textarea
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    placeholder={statementType === "epb"
                      ? "Paste one or more EPB statements here. Include MPA headers like 'EXECUTING THE MISSION' for better detection. AI will parse and separate individual statements..."
                      : "Paste one or more 1206 award statements here. AI will parse and separate individual statements..."
                    }
                    rows={12}
                    className="resize-none font-mono text-sm"
                    aria-label="Statement text"
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 px-6 py-4 border-t bg-background flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <Button
                variant="outline"
                onClick={handleCloseAttempt}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                onClick={handleParseBulk}
                disabled={isParsing || bulkText.length < 10 || (statementType === "epb" && mpaDetectionMode === "manual" && !manualMpa)}
                className="w-full sm:w-auto gap-2"
              >
                {isParsing ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Parsing...
                  </>
                ) : (
                  <>
                    <Wand2 className="size-4" />
                    Parse Statements
                  </>
                )}
              </Button>
            </div>
          </>
        )}
        </DialogContent>
      </Dialog>

      {/* Close confirmation dialog */}
      <AlertDialog open={showCloseConfirm} onOpenChange={setShowCloseConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>You have unsaved progress</AlertDialogTitle>
            <AlertDialogDescription>
              Would you like to save your progress and continue later, or discard your changes?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowCloseConfirm(false)}>
              Keep Editing
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleKeepProgress}
              className="bg-primary"
            >
              Save & Close
            </AlertDialogAction>
            <AlertDialogAction
              onClick={handleConfirmDiscard}
              className="bg-destructive hover:bg-destructive/90"
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
