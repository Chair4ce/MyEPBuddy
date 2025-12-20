"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { AI_MODELS, MAX_STATEMENT_CHARACTERS } from "@/lib/constants";
import { getCharacterCountColor, cn } from "@/lib/utils";
import {
  Sparkles,
  Copy,
  Check,
  Download,
  Loader2,
  AlertCircle,
  Key,
  Pencil,
  Save,
  Users,
  User,
  Star,
  Crown,
} from "lucide-react";
import type { Accomplishment, Profile, UserAPIKeys, WritingStyle, UserLLMSettings, MajorGradedArea } from "@/types/database";

interface GeneratedStatement {
  mpa: string;
  statements: string[];
  historyIds?: string[];
}

const DEFAULT_MGAS: MajorGradedArea[] = [
  { key: "executing_mission", label: "Executing the Mission" },
  { key: "leading_people", label: "Leading People" },
  { key: "managing_resources", label: "Managing Resources" },
  { key: "improving_unit", label: "Improving the Unit" },
];

export default function GeneratePage() {
  const { profile, subordinates } = useUserStore();
  const [selectedRatee, setSelectedRatee] = useState<string>("self");
  const [selectedModel, setSelectedModel] = useState<string>("gemini-2.0-flash");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedStatements, setGeneratedStatements] = useState<GeneratedStatement[]>([]);
  const [accomplishments, setAccomplishments] = useState<Accomplishment[]>([]);
  const [rateeProfile, setRateeProfile] = useState<Profile | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);
  const [hasUserKey, setHasUserKey] = useState(false);
  const [writingStyle, setWritingStyle] = useState<WritingStyle>("personal");
  const [userSettings, setUserSettings] = useState<Partial<UserLLMSettings> | null>(null);
  
  // Refinement state
  const [editingStatement, setEditingStatement] = useState<{
    mpa: string;
    index: number;
    original: string;
    refined: string;
    historyId?: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const supabase = createClient();
  const cycleYear = userSettings?.current_cycle_year || new Date().getFullYear();
  const mgas = userSettings?.major_graded_areas || DEFAULT_MGAS;
  const maxChars = userSettings?.max_characters_per_statement || MAX_STATEMENT_CHARACTERS;

  // Load user's writing style preference and LLM settings
  useEffect(() => {
    if (profile?.writing_style) {
      setWritingStyle(profile.writing_style as WritingStyle);
    }
  }, [profile]);

  // Load user's LLM settings
  useEffect(() => {
    async function loadUserSettings() {
      if (!profile) return;

      const { data } = await supabase
        .from("user_llm_settings")
        .select("*")
        .eq("user_id", profile.id)
        .single();

      if (data) {
        setUserSettings(data as unknown as UserLLMSettings);
      }
    }

    loadUserSettings();
  }, [profile, supabase]);

  // Check if user has API keys
  useEffect(() => {
    async function checkUserKeys() {
      if (!profile) return;

      const { data } = await supabase
        .from("user_api_keys")
        .select("*")
        .eq("user_id", profile.id)
        .single();

      const selectedProvider = AI_MODELS.find((m) => m.id === selectedModel)?.provider;

      if (data) {
        const typedData = data as unknown as UserAPIKeys;
        const hasKey =
          (selectedProvider === "openai" && typedData.openai_key) ||
          (selectedProvider === "anthropic" && typedData.anthropic_key) ||
          (selectedProvider === "google" && typedData.google_key) ||
          (selectedProvider === "xai" && typedData.grok_key);
        setHasUserKey(!!hasKey);
      } else {
        setHasUserKey(false);
      }
    }

    checkUserKeys();
  }, [profile, selectedModel, supabase]);

  // Load ratee profile and accomplishments
  useEffect(() => {
    async function loadRateeData() {
      const rateeId = selectedRatee === "self" ? profile?.id : selectedRatee;
      if (!rateeId) return;

      if (selectedRatee === "self") {
        setRateeProfile(profile);
      } else {
        const sub = subordinates.find((s) => s.id === selectedRatee);
        setRateeProfile(sub || null);
      }

      const { data } = await supabase
        .from("accomplishments")
        .select("*")
        .eq("user_id", rateeId)
        .eq("cycle_year", cycleYear)
        .order("date", { ascending: false });

      setAccomplishments(data || []);
    }

    loadRateeData();
  }, [selectedRatee, profile, subordinates, cycleYear, supabase]);

  async function updateWritingStyle(style: WritingStyle) {
    if (!profile) return;
    
    setWritingStyle(style);
    
    await supabase
      .from("profiles")
      .update({ writing_style: style } as never)
      .eq("id", profile.id);
  }

  async function handleGenerate() {
    if (!rateeProfile) {
      toast.error("Please select a ratee");
      return;
    }

    if (accomplishments.length === 0) {
      toast.error("No accomplishments found for this cycle");
      return;
    }

    setIsGenerating(true);
    setGeneratedStatements([]);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rateeId: rateeProfile.id,
          rateeRank: rateeProfile.rank,
          rateeAfsc: rateeProfile.afsc,
          cycleYear,
          model: selectedModel,
          writingStyle,
          accomplishments: accomplishments.map((a) => ({
            mpa: a.mpa,
            action_verb: a.action_verb,
            details: a.details,
            impact: a.impact,
            metrics: a.metrics,
          })),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Generation failed");
      }

      const data = await response.json();
      setGeneratedStatements(data.statements);
      toast.success("EPB statements generated!");
    } catch (error) {
      console.error("Generation error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to generate statements");
    } finally {
      setIsGenerating(false);
    }
  }

  function openRefinementDialog(mpa: string, index: number, statement: string, historyId?: string) {
    setEditingStatement({
      mpa,
      index,
      original: statement,
      refined: statement,
      historyId,
    });
  }

  async function saveRefinedStatement(addToCommunity: boolean = false) {
    if (!editingStatement || !profile || !rateeProfile) return;
    
    setIsSaving(true);
    
    try {
      // Save to refined_statements
      const { data: refinedData, error: refinedError } = await supabase
        .from("refined_statements")
        .insert({
          user_id: profile.id,
          history_id: editingStatement.historyId || null,
          mpa: editingStatement.mpa,
          afsc: rateeProfile.afsc || "UNKNOWN",
          rank: rateeProfile.rank || "AB",
          statement: editingStatement.refined,
        } as never)
        .select()
        .single();

      if (refinedError) throw refinedError;

      // Optionally add to community pool
      if (addToCommunity && refinedData) {
        await supabase.from("community_statements").insert({
          contributor_id: profile.id,
          refined_statement_id: (refinedData as { id: string }).id,
          mpa: editingStatement.mpa,
          afsc: rateeProfile.afsc || "UNKNOWN",
          rank: rateeProfile.rank || "AB",
          statement: editingStatement.refined,
        } as never);
      }

      // Update local state
      setGeneratedStatements((prev) =>
        prev.map((g) => {
          if (g.mpa === editingStatement.mpa) {
            const newStatements = [...g.statements];
            newStatements[editingStatement.index] = editingStatement.refined;
            return { ...g, statements: newStatements };
          }
          return g;
        })
      );

      toast.success(
        addToCommunity 
          ? "Statement saved and shared with community!" 
          : "Statement saved to your library!"
      );
      setEditingStatement(null);
    } catch (error) {
      console.error("Save error:", error);
      toast.error("Failed to save statement");
    } finally {
      setIsSaving(false);
    }
  }

  async function copyToClipboard(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(id);
      setTimeout(() => setCopiedIndex(null), 2000);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  }

  function downloadAllStatements() {
    if (generatedStatements.length === 0) return;

    let content = `EPB Statements - ${rateeProfile?.rank} ${rateeProfile?.full_name}\n`;
    content += `Cycle Year: ${cycleYear}\n`;
    content += `Generated: ${new Date().toLocaleDateString()}\n\n`;
    content += "=".repeat(60) + "\n\n";

    for (const { mpa, statements } of generatedStatements) {
      const mpaLabel = mgas.find((m) => m.key === mpa)?.label || mpa;
      content += `${mpaLabel.toUpperCase()}\n`;
      content += "-".repeat(40) + "\n\n";

      statements.forEach((stmt, idx) => {
        content += `${idx + 1}. ${stmt}\n\n`;
      });

      content += "\n";
    }

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `epb-statements-${rateeProfile?.rank}-${rateeProfile?.full_name?.replace(/\s+/g, "-")}-${cycleYear}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success("Downloaded EPB statements");
  }

  // Users can generate for subordinates if they have any
  const canManageTeam = subordinates.length > 0 || profile?.role === "admin";
  const selectedModelInfo = AI_MODELS.find((m) => m.id === selectedModel);

  return (
    <div className="space-y-6 min-w-0">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">Generate EPB</h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          Create myEval-ready narrative statements from your accomplishments
        </p>
      </div>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
          <CardDescription>
            Select the ratee, AI model, and writing style for generation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 min-w-0">
          <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {/* Ratee Selection */}
            <div className="space-y-2 min-w-0">
              <Label>Ratee</Label>
              <Select value={selectedRatee} onValueChange={setSelectedRatee}>
                <SelectTrigger aria-label="Select ratee" className="w-full">
                  <SelectValue className="truncate" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="self">
                    <span className="truncate">Myself ({profile?.rank} {profile?.full_name})</span>
                  </SelectItem>
                  {canManageTeam &&
                    subordinates.map((sub) => (
                      <SelectItem key={sub.id} value={sub.id}>
                        <span className="truncate">{sub.rank} {sub.full_name}</span>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Model Selection */}
            <div className="space-y-2">
              <Label>AI Model</Label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger aria-label="Select AI model">
                  <SelectValue>
                    {selectedModelInfo?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {AI_MODELS.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      <div className="flex flex-col items-start">
                        <span>{model.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {model.description}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Writing Style */}
            <div className="space-y-2">
              <Label>Writing Style</Label>
              <Select value={writingStyle} onValueChange={(v) => updateWritingStyle(v as WritingStyle)}>
                <SelectTrigger aria-label="Select writing style">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">
                    <div className="flex items-center gap-2">
                      <User className="size-4" />
                      <span>Personal Style</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="community">
                    <div className="flex items-center gap-2">
                      <Users className="size-4" />
                      <span>Community Style</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="hybrid">
                    <div className="flex items-center gap-2">
                      <Star className="size-4" />
                      <span>Hybrid (Both)</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Cycle Year Display */}
            <div className="space-y-2">
              <Label>Cycle Year</Label>
              <div className="h-9 px-3 py-2 rounded-md border bg-muted/50 text-sm">
                {cycleYear}
              </div>
            </div>
          </div>

          {/* Style Explanation */}
          <div className="p-3 rounded-lg bg-muted/50 text-xs sm:text-sm">
            {writingStyle === "personal" && (
              <p className="flex items-start gap-1.5"><User className="size-4 shrink-0 mt-0.5" /> <span><strong>Personal Style:</strong> Uses your own refined statements as examples for consistent voice.</span></p>
            )}
            {writingStyle === "community" && (
              <p className="flex items-start gap-1.5"><Users className="size-4 shrink-0 mt-0.5" /> <span><strong>Community Style:</strong> Uses top-rated statements from your AFSC community.</span></p>
            )}
            {writingStyle === "hybrid" && (
              <p className="flex items-start gap-1.5"><Star className="size-4 shrink-0 mt-0.5" /> <span><strong>Hybrid:</strong> Combines your personal style with community best practices.</span></p>
            )}
          </div>

          {/* API Key Indicator */}
          <div className="flex items-center gap-2 text-xs sm:text-sm">
            <Key className="size-4 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground min-w-0">
              {hasUserKey ? (
                <span className="text-green-600 dark:text-green-400">
                  Using your {selectedModelInfo?.provider} API key
                </span>
              ) : (
                <span>
                  Using default API key •{" "}
                  <a href="/settings/api-keys" className="text-primary hover:underline">
                    Add your own key
                  </a>
                </span>
              )}
            </span>
          </div>

          <Separator />

          {/* Stats Summary */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-4">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs sm:text-sm text-muted-foreground shrink-0">Rank:</span>
              <Badge variant="outline" className="truncate">{rateeProfile?.rank || "N/A"}</Badge>
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs sm:text-sm text-muted-foreground shrink-0">AFSC:</span>
              <Badge variant="outline" className="truncate">{rateeProfile?.afsc || "N/A"}</Badge>
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs sm:text-sm text-muted-foreground shrink-0">Entries:</span>
              <Badge variant="secondary">{accomplishments.length}</Badge>
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs sm:text-sm text-muted-foreground shrink-0">MPAs:</span>
              <Badge variant="secondary">
                {new Set(accomplishments.map((a) => a.mpa)).size}/{mgas.length}
              </Badge>
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={isGenerating || accomplishments.length === 0}
            className="w-full sm:w-auto"
          >
            {isGenerating ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="size-4 mr-2" />
                Generate EPB Statements
              </>
            )}
          </Button>

          {accomplishments.length === 0 && (
            <div className="flex items-start gap-2 text-xs sm:text-sm text-orange-600 dark:text-orange-400">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>No accomplishments found for this ratee in {cycleYear}. Add entries first.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Generated Statements */}
      {generatedStatements.length > 0 && (
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="min-w-0">
                <CardTitle>Generated Statements</CardTitle>
                <CardDescription className="truncate">
                  {rateeProfile?.rank} {rateeProfile?.full_name} • {cycleYear} Cycle
                </CardDescription>
              </div>
              <Button variant="outline" onClick={downloadAllStatements} className="w-full sm:w-auto shrink-0">
                <Download className="size-4 mr-2" />
                Download All
              </Button>
            </div>
          </CardHeader>
          <CardContent className="min-w-0">
            <Tabs defaultValue={generatedStatements[0]?.mpa}>
              <TabsList className="flex flex-wrap h-auto gap-1 sm:gap-2 w-full justify-start p-1">
                {generatedStatements.map(({ mpa }) => {
                  const isHLR = mpa === "hlr_assessment";
                  const label = mgas.find((m) => m.key === mpa)?.label || mpa;
                  // Shorten labels for mobile
                  const shortLabel = label
                    .replace("Executing the Mission", "Mission")
                    .replace("Leading People", "Leading")
                    .replace("Managing Resources", "Resources")
                    .replace("Improving the Unit", "Improving");
                  return (
                    <TabsTrigger 
                      key={mpa} 
                      value={mpa}
                      className={cn(
                        "text-xs sm:text-sm px-2 sm:px-3",
                        isHLR && "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200"
                      )}
                    >
                      {isHLR && <Crown className="size-3 sm:size-4 mr-1" />}
                      <span className="sm:hidden">{shortLabel}</span>
                      <span className="hidden sm:inline">{label}</span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              {generatedStatements.map(({ mpa, statements, historyIds }) => {
                const isHLR = mpa === "hlr_assessment";
                return (
                <TabsContent key={mpa} value={mpa} className="space-y-3 sm:space-y-4 mt-3 sm:mt-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {isHLR && <Crown className="size-4 sm:size-5 text-amber-600 shrink-0" />}
                      <h3 className="font-medium text-sm sm:text-base truncate">
                        {mgas.find((m) => m.key === mpa)?.label || mpa}
                      </h3>
                      {isHLR && (
                        <Badge variant="outline" className="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-300 text-xs shrink-0">
                          Commander&apos;s Assessment
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() => copyToClipboard(statements.join("\n\n"), `all-${mpa}`)}
                    >
                      {copiedIndex === `all-${mpa}` ? (
                        <Check className="size-4 mr-2" />
                      ) : (
                        <Copy className="size-4 mr-2" />
                      )}
                      Copy All
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {statements.map((statement, idx) => {
                      const charCount = statement.length;
                      const isOverLimit = charCount > maxChars;

                      return (
                        <div
                          key={idx}
                          className={cn(
                            "p-3 sm:p-4 rounded-lg border bg-card group",
                            isOverLimit && "border-destructive/50"
                          )}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs sm:text-sm leading-relaxed break-words">{statement}</p>
                            </div>
                            <div className="flex gap-1 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity self-end sm:self-start">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 sm:size-9"
                                onClick={() => openRefinementDialog(mpa, idx, statement, historyIds?.[idx])}
                                aria-label="Edit and save statement"
                              >
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 sm:size-9"
                                onClick={() => copyToClipboard(statement, `${mpa}-${idx}`)}
                                aria-label="Copy statement"
                              >
                                {copiedIndex === `${mpa}-${idx}` ? (
                                  <Check className="size-4 text-green-500" />
                                ) : (
                                  <Copy className="size-4" />
                                )}
                              </Button>
                            </div>
                          </div>
                          <div className="mt-2 sm:mt-3 flex items-center justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <Progress
                                value={Math.min((charCount / maxChars) * 100, 100)}
                                className={cn("h-1.5", isOverLimit && "[&>*]:bg-destructive")}
                              />
                            </div>
                            <span className={cn("text-xs shrink-0", getCharacterCountColor(charCount, maxChars))}>
                              {charCount}/{maxChars}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </TabsContent>
              );
              })}
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Refinement Dialog */}
      <Dialog open={!!editingStatement} onOpenChange={() => setEditingStatement(null)}>
        <DialogContent className="max-w-2xl w-[calc(100%-2rem)] max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Refine Statement</DialogTitle>
            <DialogDescription>
              Edit this statement to improve it. Your refined version will be saved and used as an example for future generations.
            </DialogDescription>
          </DialogHeader>
          
          {editingStatement && (
            <div className="space-y-4 overflow-y-auto flex-1 min-h-0 pr-1">
              <div className="space-y-2">
                <Label>Original Statement</Label>
                <div className="p-3 rounded-lg bg-muted text-sm break-words">
                  {editingStatement.original}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="refined">Your Refined Version</Label>
                  <span className={cn(
                    "text-xs whitespace-nowrap",
                    getCharacterCountColor(editingStatement.refined.length, maxChars)
                  )}>
                    {editingStatement.refined.length}/{maxChars}
                  </span>
                </div>
                <Textarea
                  id="refined"
                  value={editingStatement.refined}
                  onChange={(e) => setEditingStatement({ ...editingStatement, refined: e.target.value })}
                  rows={5}
                  className="resize-none"
                />
                <Progress
                  value={Math.min((editingStatement.refined.length / maxChars) * 100, 100)}
                  className={cn(
                    "h-1.5",
                    editingStatement.refined.length > maxChars && "[&>*]:bg-destructive"
                  )}
                />
              </div>
            </div>
          )}

          <DialogFooter className="flex-shrink-0 flex-col sm:flex-row gap-2 pt-4 border-t mt-4">
            <Button
              variant="outline"
              onClick={() => saveRefinedStatement(false)}
              disabled={isSaving}
              className="w-full sm:w-auto"
            >
              {isSaving ? <Loader2 className="size-4 animate-spin mr-2" /> : <Save className="size-4 mr-2" />}
              Save to Library
            </Button>
            <Button
              onClick={() => saveRefinedStatement(true)}
              disabled={isSaving}
              className="w-full sm:w-auto"
            >
              {isSaving ? <Loader2 className="size-4 animate-spin mr-2" /> : <Users className="size-4 mr-2" />}
              Save & Share
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
