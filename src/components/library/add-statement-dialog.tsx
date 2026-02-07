"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { Analytics } from "@/lib/analytics";
import { cn, getCharacterCountColor } from "@/lib/utils";
import { MAX_STATEMENT_CHARACTERS, STANDARD_MGAS, RANKS, AWARD_1206_CATEGORIES, getActiveCycleYear } from "@/lib/constants";
import { Loader2, UserCheck, Users, Globe, CheckCircle2, Trophy, Sparkles, FileText, Award, Layers, ClipboardPaste, Wand2, ArrowLeft } from "lucide-react";
import { BulkStatementReview, type ParsedStatement } from "./bulk-statement-review";
import type { Rank, StatementType, WinLevel } from "@/types/database";

const WIN_LEVELS: { value: WinLevel; label: string }[] = [
  { value: "squadron", label: "Squadron" },
  { value: "group", label: "Group" },
  { value: "wing", label: "Wing" },
  { value: "tenant_unit", label: "Tenant Unit" },
  { value: "haf", label: "HAF" },
];

type DialogMode = "single" | "bulk";
type BulkStep = "input" | "review";

const STORAGE_KEY = "add-statement-dialog-state";

interface SavedDialogState {
  dialogMode: DialogMode;
  bulkStep: BulkStep;
  bulkText: string;
  mpaDetectionMode: "auto" | "manual";
  manualMpa: string;
  parsedStatements: ParsedStatement[];
  extractedDateRange: { start: string; end: string } | null;
  extractedCycleYear: number | null;
  cycleYear: number;
  selectedAfsc: string;
  selectedRank: Rank | "";
  // Single mode state
  statementText: string;
  statementType: StatementType;
  selectedMpas: string[];
  awardCategory: string;
  isWinningPackage: boolean;
  winLevel: WinLevel | "";
  useAsLlmExample: boolean;
  shareWithSupervisor: boolean;
  shareWithSubordinates: boolean;
  shareWithCommunity: boolean;
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
  const { profile, epbConfig, subordinates } = useUserStore();
  const [isSaving, setIsSaving] = useState(false);

  // Dialog mode
  const [dialogMode, setDialogMode] = useState<DialogMode>("single");
  const [bulkStep, setBulkStep] = useState<BulkStep>("input");

  // Form state - Statement Type FIRST
  const [statementType, setStatementType] = useState<StatementType>("epb");

  // Statement text
  const [statementText, setStatementText] = useState("");

  // EPB-specific fields
  const [selectedMpas, setSelectedMpas] = useState<string[]>([]);
  const [selectedAfsc, setSelectedAfsc] = useState("");
  const [selectedRank, setSelectedRank] = useState<Rank | "">("");
  const [cycleYear, setCycleYear] = useState<number>(new Date().getFullYear());

  // Award-specific fields
  const [awardCategory, setAwardCategory] = useState("");
  const [isWinningPackage, setIsWinningPackage] = useState(false);
  const [winLevel, setWinLevel] = useState<WinLevel | "">("");

  // Common fields
  const [useAsLlmExample, setUseAsLlmExample] = useState(false);

  // Granular sharing options
  const [shareWithSupervisor, setShareWithSupervisor] = useState(false);
  const [shareWithSubordinates, setShareWithSubordinates] = useState(false);
  const [shareWithCommunity, setShareWithCommunity] = useState(false);

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

  // Check if there's meaningful progress to save
  const hasProgress = useCallback(() => {
    if (dialogMode === "bulk") {
      return bulkText.trim().length > 0 || parsedStatements.length > 0;
    }
    return statementText.trim().length > 0;
  }, [dialogMode, bulkText, parsedStatements.length, statementText]);

  // Save state to localStorage
  const saveToStorage = useCallback(() => {
    if (!hasProgress()) return;
    
    const state: SavedDialogState = {
      dialogMode,
      bulkStep,
      bulkText,
      mpaDetectionMode,
      manualMpa,
      parsedStatements,
      extractedDateRange,
      extractedCycleYear,
      cycleYear,
      selectedAfsc,
      selectedRank,
      statementText,
      statementType,
      selectedMpas,
      awardCategory,
      isWinningPackage,
      winLevel,
      useAsLlmExample,
      shareWithSupervisor,
      shareWithSubordinates,
      shareWithCommunity,
      savedAt: Date.now(),
    };
    
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Failed to save dialog state to localStorage:", e);
    }
  }, [
    dialogMode, bulkStep, bulkText, mpaDetectionMode, manualMpa,
    parsedStatements, extractedDateRange, extractedCycleYear,
    cycleYear, selectedAfsc, selectedRank, statementText, statementType,
    selectedMpas, awardCategory, isWinningPackage, winLevel,
    useAsLlmExample, shareWithSupervisor, shareWithSubordinates,
    shareWithCommunity, hasProgress,
  ]);

  // Load state from localStorage
  const loadFromStorage = useCallback((): SavedDialogState | null => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return null;
      
      const state = JSON.parse(saved) as SavedDialogState;
      
      // Expire saved state after 24 hours
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

  // Clear saved state
  const clearStorage = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn("Failed to clear dialog state from localStorage:", e);
    }
  }, []);
  const mgas = STANDARD_MGAS.filter(m => m.key !== "hlr_assessment"); // Exclude HLR from manual entry
  // Always use hardcoded MAX_STATEMENT_CHARACTERS - user settings deprecated
  const maxChars = MAX_STATEMENT_CHARACTERS;

  // Derived state for "Share with All"
  const hasSupervisor = !!profile?.supervisor_id;
  const hasSubordinates = subordinates.length > 0;
  
  // Check if all available options are selected
  const allAvailableSelected = 
    (hasSupervisor ? shareWithSupervisor : true) && 
    (hasSubordinates ? shareWithSubordinates : true) && 
    shareWithCommunity;
  
  // For UI: show as "all selected" only if community is selected (always available)
  const allSelected = allAvailableSelected && shareWithCommunity;

  function handleShareAll(checked: boolean) {
    if (hasSupervisor) setShareWithSupervisor(checked);
    if (hasSubordinates) setShareWithSubordinates(checked);
    setShareWithCommunity(checked);
  }

  // Toggle MPA selection for multi-select
  function toggleMpa(mpaKey: string) {
    setSelectedMpas(prev => 
      prev.includes(mpaKey) 
        ? prev.filter(m => m !== mpaKey)
        : [...prev, mpaKey]
    );
  }

  // Initialize defaults from profile when dialog opens
  useEffect(() => {
    if (open && profile) {
      setSelectedAfsc(profile.afsc || "");
      setSelectedRank(profile.rank || "");
      // Cycle year is computed from the user's rank and SCOD
      setCycleYear(getActiveCycleYear(profile.rank as Rank | null));
    }
  }, [open, profile]);

  // Reset award-specific fields when switching to EPB
  useEffect(() => {
    if (statementType === "epb") {
      setAwardCategory("");
      setIsWinningPackage(false);
      setWinLevel("");
    } else {
      // Reset EPB-specific multi-select when switching to Award
      setSelectedMpas([]);
    }
  }, [statementType]);

  // Reset win level when unchecking winning package
  useEffect(() => {
    if (!isWinningPackage) {
      setWinLevel("");
    }
  }, [isWinningPackage]);

  // Load saved state when dialog opens
  useEffect(() => {
    if (open) {
      const saved = loadFromStorage();
      if (saved) {
        setDialogMode(saved.dialogMode);
        setBulkStep(saved.bulkStep);
        setBulkText(saved.bulkText);
        setMpaDetectionMode(saved.mpaDetectionMode);
        setManualMpa(saved.manualMpa);
        setParsedStatements(saved.parsedStatements);
        setExtractedDateRange(saved.extractedDateRange);
        setExtractedCycleYear(saved.extractedCycleYear);
        setCycleYear(saved.cycleYear);
        setSelectedAfsc(saved.selectedAfsc);
        setSelectedRank(saved.selectedRank);
        setStatementText(saved.statementText);
        setStatementType(saved.statementType);
        setSelectedMpas(saved.selectedMpas);
        setAwardCategory(saved.awardCategory);
        setIsWinningPackage(saved.isWinningPackage);
        setWinLevel(saved.winLevel);
        setUseAsLlmExample(saved.useAsLlmExample);
        setShareWithSupervisor(saved.shareWithSupervisor);
        setShareWithSubordinates(saved.shareWithSubordinates);
        setShareWithCommunity(saved.shareWithCommunity);
      }
    }
  }, [open, loadFromStorage]);

  // Auto-save state periodically when there's progress
  useEffect(() => {
    if (!open) return;
    
    // Save on any significant state change (debounced effect)
    const timer = setTimeout(() => {
      saveToStorage();
    }, 500);
    
    return () => clearTimeout(timer);
  }, [
    open, saveToStorage,
  ]);

  function resetForm(clearSaved = true) {
    setStatementText("");
    setStatementType("epb");
    setSelectedMpas([]);
    setSelectedAfsc(profile?.afsc || "");
    setSelectedRank(profile?.rank || "");
    // Cycle year is computed from the user's rank and SCOD
    setCycleYear(getActiveCycleYear(profile?.rank as Rank | null));
    setAwardCategory("");
    setIsWinningPackage(false);
    setWinLevel("");
    setUseAsLlmExample(false);
    setShareWithSupervisor(false);
    setShareWithSubordinates(false);
    setShareWithCommunity(false);
    // Reset bulk state
    setBulkText("");
    setMpaDetectionMode("auto");
    setManualMpa("");
    setParsedStatements([]);
    setExtractedDateRange(null);
    setExtractedCycleYear(null);
    setBulkStep("input");
    setDialogMode("single");
    // Clear localStorage if requested
    if (clearSaved) {
      clearStorage();
    }
  }

  // Handle close attempt - show confirmation if there's progress
  function handleCloseAttempt() {
    if (hasProgress()) {
      setShowCloseConfirm(true);
    } else {
      resetForm();
      onOpenChange(false);
    }
  }

  // Confirm discard and close
  function handleConfirmDiscard() {
    setShowCloseConfirm(false);
    resetForm();
    onOpenChange(false);
  }

  // Keep progress and close (save to storage before closing)
  function handleKeepProgress() {
    setShowCloseConfirm(false);
    saveToStorage();
    onOpenChange(false);
  }

  async function handleSubmit() {
    if (!profile) return;

    // Validation
    if (!statementText.trim()) {
      toast.error("Please enter a statement");
      return;
    }
    if (!selectedAfsc) {
      toast.error("Please enter an AFSC");
      return;
    }
    if (!selectedRank) {
      toast.error("Please select a rank");
      return;
    }

    // Type-specific validation
    if (statementType === "epb") {
      if (selectedMpas.length === 0) {
        toast.error("Please select at least one MPA");
        return;
      }
    } else {
      if (!awardCategory) {
        toast.error("Please select an award category");
        return;
      }
      if (isWinningPackage && !winLevel) {
        toast.error("Please select the win level");
        return;
      }
    }

    setIsSaving(true);

    try {
      // Determine primary MPA for the mpa column (first selected for EPB, category mapping for Award)
      const primaryMpa = statementType === "epb" 
        ? selectedMpas[0] 
        : awardCategory;

      // Insert the refined statement
      const { data: newStatement, error: insertError } = await supabase
        .from("refined_statements")
        .insert({
          user_id: profile.id,
          mpa: primaryMpa,
          afsc: selectedAfsc.toUpperCase(),
          rank: selectedRank,
          statement: statementText.trim(),
          cycle_year: cycleYear,
          statement_type: statementType,
          is_favorite: false,
          // New enhanced fields
          applicable_mpas: statementType === "epb" ? selectedMpas : [],
          award_category: statementType === "award" ? awardCategory : null,
          is_winning_package: statementType === "award" ? isWinningPackage : false,
          win_level: statementType === "award" && isWinningPackage ? winLevel : null,
          use_as_llm_example: useAsLlmExample,
        } as never)
        .select("id")
        .single() as { data: { id: string } | null; error: Error | null };

      if (insertError || !newStatement) throw insertError || new Error("Failed to create statement");

      // Create shares based on granular sharing options
      const shares: Array<{
        statement_id: string;
        owner_id: string;
        share_type: "user" | "team";
        shared_with_id: string | null;
      }> = [];

      // Share with supervisor (individual user share)
      if (shareWithSupervisor && profile.supervisor_id) {
        shares.push({
          statement_id: newStatement.id,
          owner_id: profile.id,
          share_type: "user",
          shared_with_id: profile.supervisor_id,
        });
      }

      // Share with subordinates (individual user shares for each)
      if (shareWithSubordinates && subordinates.length > 0) {
        for (const subordinate of subordinates) {
          shares.push({
            statement_id: newStatement.id,
            owner_id: profile.id,
            share_type: "user",
            shared_with_id: subordinate.id,
          });
        }
      }

      if (shares.length > 0) {
        const { error: shareError } = await supabase
          .from("statement_shares")
          .insert(shares as never);
        if (shareError) throw shareError;
      }

      // Share with community: COPY into dedicated community_statements table
      if (shareWithCommunity) {
        const { error: communityError } = await supabase
          .from("community_statements")
          .insert({
            contributor_id: profile.id,
            refined_statement_id: newStatement.id,
            source_statement_id: newStatement.id,
            mpa: primaryMpa,
            afsc: selectedAfsc.toUpperCase(),
            rank: selectedRank,
            statement: statementText.trim(),
            upvotes: 0,
            is_approved: true,
          } as never);
        if (communityError) throw communityError;
      }

      Analytics.libraryStatementAdded(statementType, selectedMpas[0] || "unknown");
      toast.success("Statement added to your library!");
      resetForm();
      onStatementAdded?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Error adding statement:", error);
      toast.error("Failed to add statement");
    } finally {
      setIsSaving(false);
    }
  }

  // Parse bulk text with LLM
  async function handleParseBulk() {
    if (!bulkText.trim() || bulkText.length < 50) {
      toast.error("Please paste at least 50 characters of text to parse");
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
      console.error("Error parsing bulk statements:", error);
      toast.error(error instanceof Error ? error.message : "Failed to parse statements");
    } finally {
      setIsParsing(false);
    }
  }

  // Bulk insert all statements
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
      // Prepare all statements for insert
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

      // Batch insert all statements
      const { error: insertError } = await supabase
        .from("refined_statements")
        .insert(statementsToInsert as never);

      if (insertError) throw insertError;

      toast.success(`Added ${validStatements.length} statement${validStatements.length !== 1 ? "s" : ""} to your library!`);
      resetForm();
      onStatementAdded?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Error bulk inserting statements:", error);
      toast.error("Failed to add statements");
    } finally {
      setIsSaving(false);
    }
  }

  const isValid = (() => {
    const baseValid = 
      statementText.trim() &&
      selectedAfsc &&
      selectedRank &&
      statementText.length <= maxChars;
    
    if (statementType === "epb") {
      return baseValid && selectedMpas.length > 0;
    } else {
      return baseValid && awardCategory && (!isWinningPackage || winLevel);
    }
  })();

  // Full width dialog for both modes
  const dialogWidth = "max-w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-4rem)] lg:max-w-[calc(100vw-6rem)]";

  return (
    <>
      <Dialog open={open} onOpenChange={(value) => {
        // Only intercept close attempts, not opens
        if (!value) {
          handleCloseAttempt();
        } else {
          onOpenChange(value);
        }
      }}>
        <DialogContent 
          className={cn(dialogWidth, "mx-auto h-[85vh] max-h-[85vh] p-0 gap-0 flex flex-col")}
          onInteractOutside={(e) => {
            // Prevent closing on outside click
            e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            // Prevent closing on escape key
            e.preventDefault();
            handleCloseAttempt();
          }}
        >
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-lg">
                {dialogMode === "bulk" && bulkStep === "review" 
                  ? "Review Statements" 
                  : "Add Statement"}
              </DialogTitle>
              <DialogDescription className="text-sm">
                {dialogMode === "bulk" && bulkStep === "review"
                  ? "Review and edit parsed statements before adding to your library"
                  : dialogMode === "bulk"
                    ? "Paste your EPB text and let AI parse individual statements"
                    : "Manually add a statement to your library"}
              </DialogDescription>
            </div>
            {/* Mode toggle - only show in input mode */}
            {!(dialogMode === "bulk" && bulkStep === "review") && (
              <div className="flex rounded-lg border p-1 bg-muted/50">
                <button
                  type="button"
                  onClick={() => setDialogMode("single")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                    dialogMode === "single"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <FileText className="size-3.5" />
                  Single
                </button>
                <button
                  type="button"
                  onClick={() => setDialogMode("bulk")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                    dialogMode === "bulk"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Layers className="size-3.5" />
                  Bulk Import
                </button>
              </div>
            )}
          </div>
        </DialogHeader>

        {/* Content area */}
        {dialogMode === "bulk" ? (
          bulkStep === "review" ? (
            // Review step - needs flex-1 and min-h-0 for proper scrolling
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
            // Bulk input step
            <>
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="space-y-4">
                  {/* Instructions */}
                  <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                    <div className="flex items-center gap-2 font-medium text-sm">
                      <Wand2 className="size-4 text-primary" />
                      How Bulk Import Works
                    </div>
                    <ul className="text-sm text-muted-foreground space-y-1 ml-6 list-disc">
                      <li>Paste your EPB text including MPA headers (e.g., "EXECUTING THE MISSION")</li>
                      <li>AI will identify individual statements and detect which MPA each belongs to</li>
                      <li>Each statement is typically 2 sentences with action/result/impact</li>
                      <li>Review and edit detected statements before adding to your library</li>
                    </ul>
                  </div>

                  {/* Configuration row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* MPA Detection Mode */}
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

                    {/* Manual MPA selector (only if manual mode) */}
                    {mpaDetectionMode === "manual" && (
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
                        Paste EPB Text
                      </Label>
                      <span className="text-xs text-muted-foreground">
                        {bulkText.length} characters
                      </span>
                    </div>
                    <Textarea
                      value={bulkText}
                      onChange={(e) => setBulkText(e.target.value)}
                      placeholder="Paste your EPB text here. Include MPA headers like 'EXECUTING THE MISSION' for better detection. The AI will parse and separate individual statements..."
                      rows={12}
                      className="resize-none font-mono text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Footer for bulk input */}
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
                  disabled={isParsing || bulkText.length < 50 || (mpaDetectionMode === "manual" && !manualMpa)}
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
          )
        ) : (
          // Single statement mode (original UI)
          <>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="space-y-4">
              {/* 1. Statement Type Selector - FIRST */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Statement Type</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setStatementType("epb")}
                    className={cn(
                      "flex items-center gap-2 p-3 rounded-lg border text-left transition-colors",
                      statementType === "epb"
                        ? "bg-primary/5 border-primary/30 ring-1 ring-primary/20"
                        : "bg-card hover:bg-muted/50"
                    )}
                  >
                    <FileText className={cn("size-5", statementType === "epb" ? "text-primary" : "text-muted-foreground")} />
                    <div>
                      <div className="text-sm font-medium">EPB</div>
                      <div className="text-xs text-muted-foreground">Performance statement</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatementType("award")}
                    className={cn(
                      "flex items-center gap-2 p-3 rounded-lg border text-left transition-colors",
                      statementType === "award"
                        ? "bg-primary/5 border-primary/30 ring-1 ring-primary/20"
                        : "bg-card hover:bg-muted/50"
                    )}
                  >
                    <Award className={cn("size-5", statementType === "award" ? "text-primary" : "text-muted-foreground")} />
                    <div>
                      <div className="text-sm font-medium">Award</div>
                      <div className="text-xs text-muted-foreground">1206 statement</div>
                    </div>
                  </button>
                </div>
              </div>

              <Separator />

              {/* 2. Statement Textarea - SECOND */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="statement-text" className="text-sm font-medium">
                    Statement
                  </Label>
                  <span
                    className={cn(
                      "text-xs",
                      getCharacterCountColor(statementText.length, maxChars)
                    )}
                  >
                    {statementText.length}/{maxChars}
                  </span>
                </div>
                <Textarea
                  id="statement-text"
                  value={statementText}
                  onChange={(e) => setStatementText(e.target.value)}
                  placeholder={statementType === "epb" 
                    ? "Paste or type your EPB statement..." 
                    : "Paste or type your 1206 award statement..."}
                  rows={5}
                  className="resize-none text-sm"
                  aria-label="Statement text"
                />
              </div>

              <Separator />

              {/* 3. Dynamic Options based on Type */}
              {statementType === "epb" ? (
                // EPB-specific options
                <>
                  {/* MPA Multi-Select */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">
                      Applicable MPAs
                      <span className="text-xs text-muted-foreground ml-1">(select all that apply)</span>
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {mgas.map((mpa) => (
                        <button
                          key={mpa.key}
                          type="button"
                          onClick={() => toggleMpa(mpa.key)}
                          className={cn(
                            "px-3 py-1.5 text-xs font-medium rounded-full border transition-colors",
                            selectedMpas.includes(mpa.key)
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-muted/50 hover:bg-muted border-border"
                          )}
                        >
                          {mpa.label}
                        </button>
                      ))}
                    </div>
                    {selectedMpas.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {selectedMpas.length} MPA{selectedMpas.length !== 1 ? "s" : ""} selected
                      </p>
                    )}
                  </div>

                  {/* EPB Details Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Cycle Year */}
                    <div className="space-y-2">
                      <Label htmlFor="cycle-select" className="text-sm">
                        Cycle Year
                      </Label>
                      <Select
                        value={cycleYear.toString()}
                        onValueChange={(v) => setCycleYear(parseInt(v))}
                      >
                        <SelectTrigger id="cycle-select" className="w-full">
                          <SelectValue placeholder="Select year" />
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

                    {/* Rank Selector */}
                    <div className="space-y-2">
                      <Label htmlFor="rank-select" className="text-sm">
                        Rank
                      </Label>
                      <Select
                        value={selectedRank}
                        onValueChange={(v) => setSelectedRank(v as Rank)}
                      >
                        <SelectTrigger id="rank-select" className="w-full">
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

                    {/* AFSC Input */}
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="afsc-input" className="text-sm">
                        AFSC
                      </Label>
                      <Input
                        id="afsc-input"
                        value={selectedAfsc}
                        onChange={(e) => setSelectedAfsc(e.target.value.toUpperCase())}
                        placeholder="e.g., 1A8X2"
                        className="uppercase"
                        aria-label="AFSC"
                      />
                    </div>
                  </div>
                </>
              ) : (
                // Award-specific options
                <>
                  {/* Award Category */}
                  <div className="space-y-2">
                    <Label htmlFor="award-category" className="text-sm font-medium">
                      1206 Category
                    </Label>
                    <Select value={awardCategory} onValueChange={setAwardCategory}>
                      <SelectTrigger id="award-category" className="w-full">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {AWARD_1206_CATEGORIES.map((cat) => (
                          <SelectItem key={cat.key} value={cat.key}>
                            {cat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Winning Package Toggle */}
                  <div className="space-y-3">
                    <label
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                        isWinningPackage
                          ? "bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800"
                          : "bg-card hover:bg-muted/50"
                      )}
                    >
                      <Checkbox
                        checked={isWinningPackage}
                        onCheckedChange={(checked) => setIsWinningPackage(!!checked)}
                        aria-label="Part of winning package"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Trophy className={cn("size-4", isWinningPackage ? "text-amber-600" : "text-muted-foreground")} />
                          <span className="text-sm font-medium">Part of Winning Package</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          This statement was used in an award package that won
                        </p>
                      </div>
                    </label>

                    {/* Win Level - Only show if winning package is checked */}
                    {isWinningPackage && (
                      <div className="space-y-2 ml-8">
                        <Label htmlFor="win-level" className="text-sm">
                          Win Level
                        </Label>
                        <Select value={winLevel} onValueChange={(v) => setWinLevel(v as WinLevel)}>
                          <SelectTrigger id="win-level" className="w-full">
                            <SelectValue placeholder="Select level" />
                          </SelectTrigger>
                          <SelectContent>
                            {WIN_LEVELS.map((level) => (
                              <SelectItem key={level.value} value={level.value}>
                                {level.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  {/* Award Details Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Rank Selector */}
                    <div className="space-y-2">
                      <Label htmlFor="rank-select" className="text-sm">
                        Rank
                      </Label>
                      <Select
                        value={selectedRank}
                        onValueChange={(v) => setSelectedRank(v as Rank)}
                      >
                        <SelectTrigger id="rank-select" className="w-full">
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

                    {/* AFSC Input */}
                    <div className="space-y-2">
                      <Label htmlFor="afsc-input-award" className="text-sm">
                        AFSC
                      </Label>
                      <Input
                        id="afsc-input-award"
                        value={selectedAfsc}
                        onChange={(e) => setSelectedAfsc(e.target.value.toUpperCase())}
                        placeholder="e.g., 1A8X2"
                        className="uppercase"
                        aria-label="AFSC"
                      />
                    </div>
                  </div>
                </>
              )}

              <Separator />

              {/* LLM Example Toggle - Common to both types */}
              <label
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                  useAsLlmExample
                    ? "bg-primary/5 border-primary/30"
                    : "bg-card hover:bg-muted/50"
                )}
              >
                <Checkbox
                  checked={useAsLlmExample}
                  onCheckedChange={(checked) => setUseAsLlmExample(!!checked)}
                  aria-label="Use as LLM example"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Sparkles className={cn("size-4", useAsLlmExample ? "text-primary" : "text-muted-foreground")} />
                    <span className="text-sm font-medium">Use as AI Example</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Include this statement as an example when generating new {statementType === "epb" ? "EPB" : "award"} statements
                  </p>
                </div>
              </label>

              <Separator />

              {/* Sharing Options */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Sharing (Optional)</Label>
                  <button
                    type="button"
                    onClick={() => handleShareAll(!allSelected)}
                    className={cn(
                      "flex items-center gap-1.5 text-xs font-medium transition-colors",
                      allSelected 
                        ? "text-primary" 
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <CheckCircle2 className={cn("size-3.5", allSelected && "fill-primary/20")} />
                    {allSelected ? "Deselect All" : "Select All"}
                  </button>
                </div>

                {/* Share with Supervisor */}
                <label
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border transition-colors",
                    !hasSupervisor && "opacity-50 cursor-not-allowed",
                    hasSupervisor && "cursor-pointer",
                    shareWithSupervisor && hasSupervisor
                      ? "bg-primary/5 border-primary/30"
                      : "bg-card hover:bg-muted/50"
                  )}
                >
                  <Checkbox
                    checked={shareWithSupervisor}
                    onCheckedChange={(checked) => setShareWithSupervisor(!!checked)}
                    disabled={!hasSupervisor}
                    aria-label="Share with supervisor"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <UserCheck className="size-4" />
                      <span className="text-sm font-medium">Share with Supervisor</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {hasSupervisor 
                        ? "Your supervisor will be able to view this statement"
                        : "No supervisor configured — set one up in the Team page"}
                    </p>
                  </div>
                </label>

                {/* Share with Subordinates */}
                <label
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border transition-colors",
                    !hasSubordinates && "opacity-50 cursor-not-allowed",
                    hasSubordinates && "cursor-pointer",
                    shareWithSubordinates && hasSubordinates
                      ? "bg-primary/5 border-primary/30"
                      : "bg-card hover:bg-muted/50"
                  )}
                >
                  <Checkbox
                    checked={shareWithSubordinates}
                    onCheckedChange={(checked) => setShareWithSubordinates(!!checked)}
                    disabled={!hasSubordinates}
                    aria-label="Share with subordinates"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Users className="size-4" />
                      <span className="text-sm font-medium">Share with Subordinates</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {hasSubordinates 
                        ? `${subordinates.length} team member${subordinates.length !== 1 ? "s" : ""} will be able to view this`
                        : "No subordinates — add team members in the Team page"}
                    </p>
                  </div>
                </label>

                {/* Community Share */}
                <label
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                    shareWithCommunity
                      ? "bg-primary/5 border-primary/30"
                      : "bg-card hover:bg-muted/50"
                  )}
                >
                  <Checkbox
                    checked={shareWithCommunity}
                    onCheckedChange={(checked) => setShareWithCommunity(!!checked)}
                    aria-label="Share with community"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Globe className="size-4" />
                      <span className="text-sm font-medium">Share with Community</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      A copy will be shared with the community. Future edits to your original will not affect it.
                    </p>
                  </div>
                </label>

                </div>
              </div>
            </div>

            {/* Fixed Footer */}
            <div className="shrink-0 px-6 py-4 border-t bg-background flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <Button
                variant="outline"
                onClick={handleCloseAttempt}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={isSaving || !isValid}
                className="w-full sm:w-auto"
              >
                {isSaving ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                Add Statement
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
