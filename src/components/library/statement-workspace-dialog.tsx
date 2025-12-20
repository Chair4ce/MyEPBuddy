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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/components/ui/sonner";
import { cn, getCharacterCountColor } from "@/lib/utils";
import { MAX_STATEMENT_CHARACTERS, STANDARD_MGAS, RANKS, AI_MODELS } from "@/lib/constants";
import {
  Loader2,
  Sparkles,
  Check,
  Plus,
  X,
  Copy,
  BookmarkPlus,
  BookMarked,
  Share2,
  Globe,
  ChevronRight,
  Wand2,
  ArrowRight,
  History,
  Save,
} from "lucide-react";
import type { Rank, RefinedStatement, SharedStatementView, CommunityStatement } from "@/types/database";

interface StatementWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatementSaved?: () => void;
  myStatements: RefinedStatement[];
  sharedStatements: SharedStatementView[];
  communityStatements: CommunityStatement[];
}

interface SelectedSource {
  id: string;
  statement: string;
  mpa: string;
  source: "my" | "shared" | "community";
}

interface GeneratedSuggestion {
  statement: string;
  copied: boolean;
}

interface DraftSnapshot {
  id: string;
  statement: string;
  timestamp: Date;
  copied: boolean;
}

export function StatementWorkspaceDialog({
  open,
  onOpenChange,
  onStatementSaved,
  myStatements,
  sharedStatements,
  communityStatements,
}: StatementWorkspaceDialogProps) {
  const { profile, epbConfig } = useUserStore();
  const supabase = createClient();

  // Source selection state
  const [sourceTab, setSourceTab] = useState<"my" | "shared" | "community">("my");
  const [selectedSources, setSelectedSources] = useState<SelectedSource[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Draft workspace state
  const [draftStatement, setDraftStatement] = useState("");
  const [selectedMpa, setSelectedMpa] = useState("");
  const [selectedAfsc, setSelectedAfsc] = useState("");
  const [selectedRank, setSelectedRank] = useState<Rank | "">("");
  const [cycleYear, setCycleYear] = useState<number>(new Date().getFullYear());

  // AI generation state
  const [maxCharLimit, setMaxCharLimit] = useState(350);
  const [selectedModel, setSelectedModel] = useState("gemini-2.0-flash");
  const [isGenerating, setIsGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState<GeneratedSuggestion[]>([]);

  // Save state
  const [isSaving, setIsSaving] = useState(false);

  // Snapshot history state
  const [snapshots, setSnapshots] = useState<DraftSnapshot[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const defaultMaxChars = epbConfig?.max_characters_per_statement || MAX_STATEMENT_CHARACTERS;
  const selectedModelInfo = AI_MODELS.find((m) => m.id === selectedModel);

  // Initialize defaults when dialog opens
  useEffect(() => {
    if (open && profile) {
      setSelectedAfsc(profile.afsc || "");
      setSelectedRank(profile.rank || "");
      setCycleYear(epbConfig?.current_cycle_year || new Date().getFullYear());
      setMaxCharLimit(defaultMaxChars);
    }
  }, [open, profile, epbConfig, defaultMaxChars]);

  function resetForm() {
    setSelectedSources([]);
    setDraftStatement("");
    setSelectedMpa("");
    setSelectedAfsc(profile?.afsc || "");
    setSelectedRank(profile?.rank || "");
    setCycleYear(epbConfig?.current_cycle_year || new Date().getFullYear());
    setMaxCharLimit(defaultMaxChars);
    setSuggestions([]);
    setSearchQuery("");
    setSnapshots([]);
    setIsHistoryOpen(false);
  }

  // Save current draft as a snapshot
  function saveSnapshot() {
    if (!draftStatement.trim()) {
      toast.error("Nothing to save - draft is empty");
      return;
    }
    const newSnapshot: DraftSnapshot = {
      id: crypto.randomUUID(),
      statement: draftStatement,
      timestamp: new Date(),
      copied: false,
    };
    setSnapshots((prev) => [newSnapshot, ...prev]);
    toast.success("Snapshot saved");
  }

  // Copy snapshot to clipboard
  async function copySnapshot(id: string) {
    const snapshot = snapshots.find((s) => s.id === id);
    if (!snapshot) return;
    
    try {
      await navigator.clipboard.writeText(snapshot.statement);
      setSnapshots((prev) =>
        prev.map((s) => ({ ...s, copied: s.id === id }))
      );
      setTimeout(() => {
        setSnapshots((prev) =>
          prev.map((s) => ({ ...s, copied: false }))
        );
      }, 2000);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  }

  // Delete a snapshot
  function deleteSnapshot(id: string) {
    setSnapshots((prev) => prev.filter((s) => s.id !== id));
    toast.success("Snapshot deleted");
  }

  // Format timestamp for display
  function formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // Get MPA label
  function getMpaLabel(key: string): string {
    return STANDARD_MGAS.find((m) => m.key === key)?.label || key;
  }

  // Filter statements by search
  function filterStatements<T extends { statement: string; mpa: string }>(statements: T[]): T[] {
    if (!searchQuery) return statements;
    const query = searchQuery.toLowerCase();
    return statements.filter(
      (s) =>
        s.statement.toLowerCase().includes(query) ||
        getMpaLabel(s.mpa).toLowerCase().includes(query)
    );
  }

  // Add a source statement
  function addSource(statement: RefinedStatement | SharedStatementView | CommunityStatement, source: "my" | "shared" | "community") {
    if (selectedSources.length >= 3) {
      toast.error("Maximum 3 source statements allowed");
      return;
    }
    if (selectedSources.some((s) => s.id === statement.id)) {
      toast.error("Statement already selected");
      return;
    }
    setSelectedSources((prev) => [
      ...prev,
      {
        id: statement.id,
        statement: statement.statement,
        mpa: statement.mpa,
        source,
      },
    ]);
    toast.success("Source added");
  }

  // Remove a source
  function removeSource(id: string) {
    setSelectedSources((prev) => prev.filter((s) => s.id !== id));
  }

  // Copy portion to draft
  function appendToDraft(text: string) {
    setDraftStatement((prev) => {
      if (prev.trim()) {
        return prev + " " + text;
      }
      return text;
    });
    toast.success("Added to draft");
  }

  // Copy suggestion text
  async function copySuggestion(text: string, index: number) {
    try {
      await navigator.clipboard.writeText(text);
      setSuggestions((prev) =>
        prev.map((s, i) => ({ ...s, copied: i === index }))
      );
      setTimeout(() => {
        setSuggestions((prev) =>
          prev.map((s, i) => (i === index ? { ...s, copied: false } : s))
        );
      }, 2000);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  }

  // Generate AI suggestions based on draft
  async function generateSuggestions() {
    if (!profile) return;

    if (!draftStatement.trim()) {
      toast.error("Please write something in the draft workspace first");
      return;
    }

    setIsGenerating(true);
    setSuggestions([]);

    try {
      const response = await fetch("/api/combine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "revise",
          draftStatement: draftStatement.trim(),
          sourceStatements: selectedSources.map((s) => s.statement),
          mpa: selectedMpa || selectedSources[0]?.mpa || "executing_mission",
          afsc: selectedAfsc || profile.afsc,
          rank: selectedRank || profile.rank,
          maxCharacters: maxCharLimit,
          model: selectedModel,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Generation failed");
      }

      const data = await response.json();
      setSuggestions(
        data.statements.map((stmt: string) => ({
          statement: stmt,
          copied: false,
        }))
      );
      toast.success("Suggestions generated!");
    } catch (error) {
      console.error("Generate error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to generate suggestions");
    } finally {
      setIsGenerating(false);
    }
  }

  // Save final draft to library
  async function saveDraft() {
    if (!profile) return;

    if (!draftStatement.trim()) {
      toast.error("Draft is empty");
      return;
    }

    if (!selectedMpa) {
      toast.error("Please select an MPA");
      return;
    }

    setIsSaving(true);

    try {
      const { error } = await supabase.from("refined_statements").insert({
        user_id: profile.id,
        mpa: selectedMpa,
        afsc: (selectedAfsc || profile.afsc || "UNKNOWN").toUpperCase(),
        rank: selectedRank || profile.rank || "AB",
        statement: draftStatement.trim(),
        cycle_year: cycleYear,
        is_favorite: false,
      } as never);

      if (error) throw error;

      toast.success("Statement saved to your library!");
      resetForm();
      onStatementSaved?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Save error:", error);
      toast.error("Failed to save statement");
    } finally {
      setIsSaving(false);
    }
  }

  const filteredMy = filterStatements(myStatements);
  const filteredShared = filterStatements(sharedStatements);
  const filteredCommunity = filterStatements(communityStatements);

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) resetForm();
        onOpenChange(value);
      }}
    >
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-5xl mx-auto max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="flex-shrink-0 px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-lg flex items-center gap-2">
            <Wand2 className="size-5" />
            Statement Workspace
          </DialogTitle>
          <DialogDescription className="text-sm">
            Select source statements, build your draft, and get AI-assisted revisions
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row min-h-0">
          {/* Left Panel: Source Selection */}
          <div className="w-full lg:w-[340px] border-b lg:border-b-0 lg:border-r flex flex-col min-h-0 max-h-[300px] lg:max-h-none">
            <div className="p-4 border-b space-y-3 flex-shrink-0">
              <Label className="text-sm font-medium">Select Source Statements</Label>
              <Input
                placeholder="Search statements..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 text-sm"
                aria-label="Search statements"
              />
            </div>

            <Tabs value={sourceTab} onValueChange={(v) => setSourceTab(v as typeof sourceTab)} className="flex-1 flex flex-col min-h-0">
              <TabsList className="mx-4 mt-2 grid grid-cols-3 h-8">
                <TabsTrigger value="my" className="text-xs gap-1 py-1">
                  <BookMarked className="size-3" />
                  My
                </TabsTrigger>
                <TabsTrigger value="shared" className="text-xs gap-1 py-1">
                  <Share2 className="size-3" />
                  Shared
                </TabsTrigger>
                <TabsTrigger value="community" className="text-xs gap-1 py-1">
                  <Globe className="size-3" />
                  Community
                </TabsTrigger>
              </TabsList>

              <ScrollArea className="flex-1 min-h-0">
                <TabsContent value="my" className="m-0 p-2">
                  <div className="space-y-1.5">
                    {filteredMy.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        No statements found
                      </p>
                    ) : (
                      filteredMy.map((stmt) => (
                        <SourceStatementCard
                          key={stmt.id}
                          statement={stmt.statement}
                          mpaLabel={getMpaLabel(stmt.mpa)}
                          isSelected={selectedSources.some((s) => s.id === stmt.id)}
                          onSelect={() => addSource(stmt, "my")}
                        />
                      ))
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="shared" className="m-0 p-2">
                  <div className="space-y-1.5">
                    {filteredShared.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        No shared statements
                      </p>
                    ) : (
                      filteredShared.map((stmt) => (
                        <SourceStatementCard
                          key={`${stmt.id}-${stmt.share_id}`}
                          statement={stmt.statement}
                          mpaLabel={getMpaLabel(stmt.mpa)}
                          ownerName={stmt.owner_name}
                          isSelected={selectedSources.some((s) => s.id === stmt.id)}
                          onSelect={() => addSource(stmt, "shared")}
                        />
                      ))
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="community" className="m-0 p-2">
                  <div className="space-y-1.5">
                    {filteredCommunity.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        No community statements
                      </p>
                    ) : (
                      filteredCommunity.map((stmt) => (
                        <SourceStatementCard
                          key={stmt.id}
                          statement={stmt.statement}
                          mpaLabel={getMpaLabel(stmt.mpa)}
                          isSelected={selectedSources.some((s) => s.id === stmt.id)}
                          onSelect={() => addSource(stmt, "community")}
                        />
                      ))
                    )}
                  </div>
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </div>

          {/* Right Panel: Workspace */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">
                {/* Selected Sources - Full text display with own scroll */}
                <div
                  className={cn(
                    "space-y-3 transition-all duration-300 ease-in-out overflow-hidden",
                    selectedSources.length > 0
                      ? "max-h-[300px] opacity-100"
                      : "max-h-0 opacity-0"
                  )}
                >
                  {selectedSources.length > 0 && (
                    <>
                      <Label className="text-sm font-medium">
                        Selected Sources ({selectedSources.length}/3)
                      </Label>
                      <div className="max-h-[200px] overflow-y-auto space-y-2 pr-1">
                        {selectedSources.map((source, idx) => (
                          <div
                            key={source.id}
                            className="p-3 rounded-lg border bg-muted/30 space-y-2 animate-in fade-in-0 slide-in-from-top-2 duration-200"
                          >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Badge variant="outline" className="text-[10px] h-5 px-1.5 shrink-0">
                                {idx + 1}
                              </Badge>
                              <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                                {getMpaLabel(source.mpa)}
                              </Badge>
                              <Badge variant="outline" className="text-[10px] h-5 px-1.5 capitalize">
                                {source.source}
                              </Badge>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-6 shrink-0"
                              onClick={() => removeSource(source.id)}
                              aria-label="Remove source"
                            >
                              <X className="size-3" />
                            </Button>
                          </div>
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            {source.statement}
                          </p>
                          </div>
                        ))}
                      </div>
                      <Separator className="transition-opacity duration-300" />
                    </>
                  )}
                </div>

                {/* Draft Workspace */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="draft" className="text-sm font-medium">
                      Draft Workspace
                    </Label>
                    <span
                      className={cn(
                        "text-xs tabular-nums",
                        getCharacterCountColor(draftStatement.length, maxCharLimit)
                      )}
                    >
                      {draftStatement.length}/{maxCharLimit}
                    </span>
                  </div>
                  <Textarea
                    id="draft"
                    value={draftStatement}
                    onChange={(e) => setDraftStatement(e.target.value)}
                    placeholder="Build your statement here... Copy portions from sources above, type your own content, or start from scratch."
                    rows={5}
                    className="resize-none text-sm min-h-[120px]"
                    aria-label="Draft statement workspace"
                  />
                  <Progress
                    value={Math.min((draftStatement.length / maxCharLimit) * 100, 100)}
                    className={cn(
                      "h-1.5",
                      draftStatement.length > maxCharLimit && "[&>*]:bg-destructive"
                    )}
                  />
                  {/* Snapshot buttons */}
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 gap-1.5 text-xs"
                      onClick={saveSnapshot}
                      disabled={!draftStatement.trim()}
                    >
                      <Save className="size-3" />
                      Save Snapshot
                    </Button>
                    {snapshots.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 gap-1.5 text-xs"
                        onClick={() => setIsHistoryOpen(true)}
                      >
                        <History className="size-3" />
                        History ({snapshots.length})
                      </Button>
                    )}
                  </div>
                </div>

                {/* Generate Button */}
                <Button
                  onClick={generateSuggestions}
                  disabled={isGenerating || !draftStatement.trim()}
                  variant="secondary"
                  className="w-full gap-2"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Generating Suggestions...
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4" />
                      Generate AI Suggestions
                    </>
                  )}
                </Button>

                {/* AI Suggestions - Scrollable */}
                <div
                  className={cn(
                    "transition-all duration-300 ease-in-out overflow-hidden",
                    suggestions.length > 0
                      ? "opacity-100"
                      : "max-h-0 opacity-0"
                  )}
                >
                  {suggestions.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-medium">AI Suggestions</Label>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Click copy button or select text to copy portions to your draft
                          </p>
                        </div>
                      </div>
                      <ScrollArea className="max-h-[200px]">
                        <div className="space-y-2 pr-3">
                          {suggestions.map((suggestion, idx) => {
                            const charCount = suggestion.statement.length;
                            const isOverLimit = charCount > maxCharLimit;

                            return (
                              <div
                                key={idx}
                                className={cn(
                                  "p-3 rounded-lg border bg-card transition-all duration-200 animate-in fade-in-0 slide-in-from-bottom-2",
                                  isOverLimit && "border-destructive/50"
                                )}
                                style={{ animationDelay: `${idx * 100}ms` }}
                              >
                                <div className="flex items-start gap-2">
                                  <Badge variant="outline" className="text-xs shrink-0 mt-0.5">
                                    {idx + 1}
                                  </Badge>
                                  <div className="flex-1 min-w-0 space-y-2">
                                    <p className="text-xs leading-relaxed break-words select-text cursor-text">
                                      {suggestion.statement}
                                    </p>
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex-1 max-w-[200px]">
                                        <Progress
                                          value={Math.min((charCount / maxCharLimit) * 100, 100)}
                                          className={cn("h-1", isOverLimit && "[&>*]:bg-destructive")}
                                        />
                                      </div>
                                      <span
                                        className={cn(
                                          "text-xs",
                                          getCharacterCountColor(charCount, maxCharLimit)
                                        )}
                                      >
                                        {charCount}/{maxCharLimit}
                                      </span>
                                    </div>
                                  </div>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 gap-1 shrink-0"
                                    onClick={() => copySuggestion(suggestion.statement, idx)}
                                    aria-label="Copy suggestion"
                                  >
                                    {suggestion.copied ? (
                                      <>
                                        <Check className="size-3 text-green-500" />
                                        <span className="text-xs">Copied</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="size-3" />
                                        <span className="text-xs">Copy</span>
                                      </>
                                    )}
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </div>

                {/* Options - At the bottom */}
                <Separator />
                <div className="space-y-3">
                  <Label className="text-xs font-medium text-muted-foreground">Final Statement Options</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">MPA *</Label>
                      <Select value={selectedMpa} onValueChange={setSelectedMpa}>
                        <SelectTrigger className="h-9 text-xs w-full">
                          <SelectValue placeholder="Select MPA" />
                        </SelectTrigger>
                        <SelectContent>
                          {STANDARD_MGAS.map((mpa) => (
                            <SelectItem key={mpa.key} value={mpa.key} className="text-xs">
                              {mpa.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Max Chars</Label>
                      <Input
                        type="number"
                        min={150}
                        max={500}
                        value={maxCharLimit}
                        onChange={(e) => setMaxCharLimit(Math.min(500, Math.max(150, parseInt(e.target.value) || 350)))}
                        className="h-9 text-xs w-full"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">AI Model</Label>
                      <Select value={selectedModel} onValueChange={setSelectedModel}>
                        <SelectTrigger className="h-9 text-xs w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {AI_MODELS.map((model) => (
                            <SelectItem key={model.id} value={model.id} className="text-xs">
                              {model.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Cycle Year</Label>
                      <Select
                        value={cycleYear.toString()}
                        onValueChange={(v) => setCycleYear(parseInt(v))}
                      >
                        <SelectTrigger className="h-9 text-xs w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(
                            (year) => (
                              <SelectItem key={year} value={year.toString()} className="text-xs">
                                {year}
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>

            {/* Footer Actions */}
            <div className="flex-shrink-0 p-4 border-t flex items-center justify-between gap-3">
              <div className="text-xs text-muted-foreground hidden sm:block">
                {draftStatement.trim()
                  ? `Draft ready • ${draftStatement.length} chars`
                  : "Start by selecting sources or typing directly"}
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={saveDraft}
                  disabled={isSaving || !draftStatement.trim() || !selectedMpa}
                  className="gap-2"
                >
                  {isSaving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <BookmarkPlus className="size-4" />
                  )}
                  Save to Library
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>

      {/* Snapshot History Modal */}
      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="size-5" />
              Draft History
            </DialogTitle>
            <DialogDescription>
              Your saved snapshots. Click copy or select text to use in your workspace.
            </DialogDescription>
          </DialogHeader>

          {snapshots.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No snapshots saved yet
            </div>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-3 pr-3">
                {snapshots.map((snapshot, idx) => (
                  <div
                    key={snapshot.id}
                    className="p-3 rounded-lg border bg-card space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          #{snapshots.length - idx}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatTime(snapshot.timestamp)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          • {snapshot.statement.length} chars
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 gap-1"
                          onClick={() => copySnapshot(snapshot.id)}
                        >
                          {snapshot.copied ? (
                            <>
                              <Check className="size-3 text-green-500" />
                              <span className="text-xs">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="size-3" />
                              <span className="text-xs">Copy</span>
                            </>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => deleteSnapshot(snapshot.id)}
                          aria-label="Delete snapshot"
                        >
                          <X className="size-3" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground select-text cursor-text">
                      {snapshot.statement}
                    </p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => setIsHistoryOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

// Sub-component for source statement cards
function SourceStatementCard({
  statement,
  mpaLabel,
  ownerName,
  isSelected,
  onSelect,
}: {
  statement: string;
  mpaLabel: string;
  ownerName?: string | null;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={cn(
        "p-2.5 rounded-lg border cursor-pointer transition-colors text-xs",
        isSelected
          ? "bg-primary/10 border-primary/30"
          : "bg-card hover:bg-muted/50"
      )}
      onClick={onSelect}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
              {mpaLabel}
            </Badge>
            {ownerName && (
              <span className="text-[10px] text-muted-foreground">
                by {ownerName}
              </span>
            )}
          </div>
          <p className="line-clamp-2 leading-relaxed">{statement}</p>
        </div>
        <Button
          variant={isSelected ? "default" : "ghost"}
          size="icon"
          className="size-6 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
        >
          {isSelected ? (
            <Check className="size-3" />
          ) : (
            <Plus className="size-3" />
          )}
        </Button>
      </div>
    </div>
  );
}

