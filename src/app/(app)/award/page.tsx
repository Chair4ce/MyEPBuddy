"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import { useAwardShellStore, type SelectedNominee } from "@/stores/award-shell-store";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import {
  AI_MODELS,
  AWARD_1206_CATEGORIES,
  AWARD_LEVELS,
  AWARD_CATEGORIES,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { getKeyStatus } from "@/app/actions/api-keys";
import {
  Award,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Eye,
  Printer,
  Settings,
  RefreshCw,
  Loader2,
  Plus,
  Save,
  Share2,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AwardCategorySectionCard } from "@/components/award/award-category-section";
import { AwardShellShareDialog } from "@/components/award/award-shell-share-dialog";
import { BulletCanvasPreview } from "@/components/award/bullet-canvas-preview";
import type {
  Accomplishment,
  AwardLevel,
  AwardCategory,
  AwardShell,
  AwardShellSection,
  Rank,
} from "@/types/database";

// ============================================================================
// Component
// ============================================================================

export default function AwardPage() {
  const supabase = createClient();
  const { profile, subordinates, managedMembers, epbConfig } = useUserStore();
  const cycleYear = epbConfig?.current_cycle_year || new Date().getFullYear();
  
  // Award shell store
  const {
    selectedNominee,
    setSelectedNominee,
    currentShell,
    setCurrentShell,
    sections,
    setSections,
    updateSection,
    addSection,
    removeSection,
    slotStates,
    updateSlotState,
    collapsedCategories,
    toggleCategoryCollapsed,
    expandAll,
    collapseAll,
    awardLevel,
    awardCategory,
    sentencesPerStatement,
    setAwardLevel,
    setAwardCategory,
    setSentencesPerStatement,
    selectedModel,
    setSelectedModel,
    isLoadingShell,
    setIsLoadingShell,
    isCreatingShell,
    setIsCreatingShell,
    getAllStatements,
    reset,
  } = useAwardShellStore();

  // Track if we've checked for existing shell
  const [hasCheckedForShell, setHasCheckedForShell] = useState(false);

  // ---- Local State ----
  const [selectedNomineeId, setSelectedNomineeId] = useState<string>("self");
  const [accomplishments, setAccomplishments] = useState<Accomplishment[]>([]);
  const [showConfig, setShowConfig] = useState(true);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [hasUserKey, setHasUserKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Derived
  const isManagedMember = selectedNomineeId.startsWith("managed:");
  const managedMemberId = isManagedMember ? selectedNomineeId.replace("managed:", "") : null;
  const canManageTeam = subordinates.length > 0 || managedMembers.length > 0;

  // ============================================================================
  // Effects
  // ============================================================================

  // Check for user API keys
  useEffect(() => {
    async function checkKeys() {
      const status = await getKeyStatus();
      setHasUserKey(
        status.openai_key ||
        status.anthropic_key ||
        status.google_key ||
        status.grok_key
      );
    }
    checkKeys();
  }, []);

  // Update nominee info when selection changes
  useEffect(() => {
    let nominee: SelectedNominee | null = null;
    
    if (selectedNomineeId === "self" && profile) {
      nominee = {
        id: profile.id,
        fullName: profile.full_name,
        rank: profile.rank as Rank | null,
        afsc: profile.afsc,
        isManagedMember: false,
      };
    } else if (isManagedMember && managedMemberId) {
      const member = managedMembers.find((m) => m.id === managedMemberId);
      if (member) {
        nominee = {
          id: member.id,
          fullName: member.full_name,
          rank: member.rank as Rank | null,
          afsc: member.afsc,
          isManagedMember: true,
        };
      }
    } else {
      const sub = subordinates.find((s) => s.id === selectedNomineeId);
      if (sub) {
        nominee = {
          id: sub.id,
          fullName: sub.full_name,
          rank: sub.rank as Rank | null,
          afsc: sub.afsc,
          isManagedMember: false,
        };
      }
    }
    
    setSelectedNominee(nominee);
  }, [selectedNomineeId, profile, subordinates, managedMembers, isManagedMember, managedMemberId, setSelectedNominee]);

  // Check for existing shell when nominee changes
  useEffect(() => {
    async function checkForShell() {
      if (!selectedNominee || !profile) return;
      
      setIsLoadingShell(true);
      setHasCheckedForShell(false);
      
      try {
        // Try to find existing shell
        let query = supabase
          .from("award_shells")
          .select("*, award_shell_sections(*)")
          .eq("cycle_year", cycleYear);
        
        if (selectedNominee.isManagedMember) {
          query = query.eq("team_member_id", selectedNominee.id);
        } else {
          query = query.eq("user_id", selectedNominee.id).is("team_member_id", null);
        }
        
        const { data: existingShell } = await query.single();
        
        if (existingShell) {
          const sections = (existingShell as any).award_shell_sections || [];
          setCurrentShell(existingShell as AwardShell);
          setSections(sections as AwardShellSection[]);
        } else {
          // No shell exists - don't initialize sections yet
          setCurrentShell(null);
          setSections([]);
        }
      } catch (error) {
        // No shell found or error - show create prompt
        setCurrentShell(null);
        setSections([]);
      } finally {
        setIsLoadingShell(false);
        setHasCheckedForShell(true);
      }
    }
    
    checkForShell();
  }, [selectedNominee, profile, cycleYear, supabase, setCurrentShell, setSections, setIsLoadingShell]);

  // Load accomplishments for the selected nominee
  useEffect(() => {
    async function loadAccomplishments() {
      if (!selectedNominee) return;

      if (selectedNominee.isManagedMember) {
        const { data } = await supabase
          .from("accomplishments")
          .select("*")
          .eq("team_member_id", selectedNominee.id)
          .order("date", { ascending: false });
        setAccomplishments((data as Accomplishment[]) || []);
      } else {
        const { data } = await supabase
          .from("accomplishments")
          .select("*")
          .eq("user_id", selectedNominee.id)
          .is("team_member_id", null)
          .order("date", { ascending: false });
        setAccomplishments((data as Accomplishment[]) || []);
      }
    }
    loadAccomplishments();
  }, [selectedNominee, supabase]);

  // ============================================================================
  // Handlers
  // ============================================================================

  // Create a new award shell
  const handleCreateShell = useCallback(async () => {
    if (!selectedNominee || !profile) return;
    
    setIsCreatingShell(true);
    
    try {
      const { data: newShell, error: createError } = await supabase
        .from("award_shells")
        .insert({
          user_id: selectedNominee.isManagedMember ? profile.id : selectedNominee.id,
          team_member_id: selectedNominee.isManagedMember ? selectedNominee.id : null,
          created_by: profile.id,
          cycle_year: cycleYear,
          award_level: awardLevel,
          award_category: awardCategory,
          sentences_per_statement: sentencesPerStatement,
        } as never)
        .select("*, award_shell_sections(*)")
        .single();
      
      if (createError) throw createError;
      
      const newSections = (newShell as any).award_shell_sections || [];
      setCurrentShell(newShell as AwardShell);
      setSections(newSections as AwardShellSection[]);
      
      toast.success("Award package created successfully");
    } catch (error) {
      console.error("Error creating award shell:", error);
      toast.error("Failed to create award package");
    } finally {
      setIsCreatingShell(false);
    }
  }, [selectedNominee, profile, cycleYear, awardLevel, awardCategory, sentencesPerStatement, supabase, setCurrentShell, setSections, setIsCreatingShell]);

  // Save shell and all sections
  const handleSaveShell = useCallback(async () => {
    if (!selectedNominee || !profile || !currentShell) return;
    
    setIsSaving(true);
    
    try {
      const shellId = currentShell.id;
      
      // Update shell config
      await supabase
        .from("award_shells")
        .update({
          award_level: awardLevel,
          award_category: awardCategory,
          sentences_per_statement: sentencesPerStatement,
        } as never)
        .eq("id", shellId);
      
      // Save all sections
      for (const [key, slotState] of Object.entries(slotStates)) {
        const [category, slotIndexStr] = key.split(":");
        const slotIndex = parseInt(slotIndexStr);
        const section = sections[key];
        
        if (section?.id?.startsWith("temp-")) {
          // Insert new section
          await supabase
            .from("award_shell_sections")
            .insert({
              shell_id: shellId,
              category,
              slot_index: slotIndex,
              statement_text: slotState.draftText,
              source_type: slotState.sourceType,
              custom_context: slotState.customContext,
              selected_action_ids: slotState.selectedActionIds,
              last_edited_by: profile.id,
            } as never);
        } else if (section) {
          // Update existing section
          await supabase
            .from("award_shell_sections")
            .update({
              statement_text: slotState.draftText,
              source_type: slotState.sourceType,
              custom_context: slotState.customContext,
              selected_action_ids: slotState.selectedActionIds,
              last_edited_by: profile.id,
            } as never)
            .eq("id", section.id);
        }
      }
      
      toast.success("Award package saved successfully");
    } catch (error) {
      console.error("Error saving award shell:", error);
      toast.error("Failed to save award package");
    } finally {
      setIsSaving(false);
    }
  }, [selectedNominee, profile, currentShell, awardLevel, awardCategory, sentencesPerStatement, slotStates, sections, supabase]);

  // Clear all statements
  const handleClearAll = useCallback(() => {
    const initialSections: AwardShellSection[] = AWARD_1206_CATEGORIES.map((cat) => ({
      id: `temp-${cat.key}-0-${Date.now()}`,
      shell_id: currentShell?.id || "",
      category: cat.key,
      slot_index: 0,
      statement_text: "",
      source_type: "actions" as const,
      custom_context: "",
      selected_action_ids: [],
      last_edited_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    setSections(initialSections);
    toast.success("All statements cleared");
  }, [currentShell, setSections]);

  // Combine all statements for preview
  const allStatementsForPreview = useMemo(() => {
    const result: { category: string; heading: string; statements: string[] }[] = [];
    
    AWARD_1206_CATEGORIES.forEach((cat) => {
      const texts: string[] = [];
      Object.entries(slotStates).forEach(([key, state]) => {
        if (key.startsWith(`${cat.key}:`) && state.draftText.trim()) {
          texts.push(state.draftText.trim());
        }
      });
      if (texts.length > 0) {
        result.push({
          category: cat.key,
          heading: cat.heading,
          statements: texts,
        });
      }
    });
    
    return result;
  }, [slotStates]);

  const handleCopyAll = async () => {
    const text = allStatementsForPreview
      .map((cat) => `${cat.heading}\n${cat.statements.join("\n")}`)
      .join("\n\n");
    
    await navigator.clipboard.writeText(text);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
    toast.success("All statements copied to clipboard");
  };

  // Count total statements with content
  const totalStatementsWithContent = useMemo(() => {
    return Object.values(slotStates).filter((s) => s.draftText.trim()).length;
  }, [slotStates]);

  // Get sections for a category
  const getSectionsForCategory = useCallback((categoryKey: string) => {
    return Object.entries(sections)
      .filter(([key]) => key.startsWith(`${categoryKey}:`))
      .map(([key, section]) => {
        const slotIndex = parseInt(key.split(":")[1]);
        const slotState = slotStates[key];
        return { key, section, slotIndex, slotState };
      })
      .sort((a, b) => a.slotIndex - b.slotIndex);
  }, [sections, slotStates]);

  // ============================================================================
  // Render
  // ============================================================================

  if (!profile) {
    return (
      <div className="container max-w-5xl mx-auto py-6 px-4">
        <Skeleton className="h-10 w-64 mb-4" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  // Show "Create Award" prompt when no shell exists
  if (hasCheckedForShell && !currentShell && !isLoadingShell) {
    return (
      <TooltipProvider>
        <div className="container max-w-5xl mx-auto py-6 px-4 space-y-6">
          {/* Page Header */}
          <div className="flex items-center gap-3">
            <Award className="size-6" />
            <div>
              <h1 className="text-xl font-bold">Award Statement Generator</h1>
              <p className="text-sm text-muted-foreground">
                Build AF Form 1206 narrative statements
              </p>
            </div>
            <Badge variant="outline" className="text-[10px] h-5 bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-700">
              BETA
            </Badge>
          </div>

          {/* Nominee Selector Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Select Nominee</CardTitle>
              <CardDescription className="text-xs">
                Choose whose award package to create or manage
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Row 1: Nominee (constrained width) */}
              <div className="space-y-2 max-w-sm">
                <Label className="text-xs">Nominee</Label>
                <Select value={selectedNomineeId} onValueChange={setSelectedNomineeId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select nominee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="self">
                      {profile?.rank} {profile?.full_name} (Self)
                    </SelectItem>
                    {canManageTeam && <Separator className="my-1" />}
                    {subordinates.map((sub) => (
                      <SelectItem key={sub.id} value={sub.id}>
                        {sub.rank} {sub.full_name}
                      </SelectItem>
                    ))}
                    {managedMembers.map((member) => (
                      <SelectItem key={member.id} value={`managed:${member.id}`}>
                        {member.rank} {member.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Row 2: Award options */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Award Level</Label>
                  <Select value={awardLevel} onValueChange={(v) => setAwardLevel(v as AwardLevel)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AWARD_LEVELS.map((l) => (
                        <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Award Category</Label>
                  <Select value={awardCategory} onValueChange={(v) => setAwardCategory(v as AwardCategory)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AWARD_CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Create Award Shell Prompt */}
          <Card className="border-dashed border-2">
            <CardContent className="py-12 flex flex-col items-center justify-center text-center">
              <div className="size-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                <Award className="size-8 text-muted-foreground" />
              </div>
              <h3 className="font-medium text-lg mb-2">No Award Package Found</h3>
              <p className="text-muted-foreground text-sm max-w-md mb-6">
                {selectedNominee?.id === profile?.id
                  ? "Create an Award Package to start building your AF Form 1206 narrative statements for this cycle."
                  : `Create an Award Package for ${selectedNominee?.rank} ${selectedNominee?.fullName} to manage their 1206 statements.`}
              </p>
              <Button onClick={handleCreateShell} disabled={isCreatingShell} size="lg">
                {isCreatingShell ? (
                  <Loader2 className="size-4 animate-spin mr-2" />
                ) : (
                  <Plus className="size-4 mr-2" />
                )}
                Create Award Package
              </Button>
            </CardContent>
          </Card>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className="container max-w-5xl mx-auto py-6 px-4 space-y-6">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Award className="size-6" />
            <div>
              <h1 className="text-xl font-bold">Award Statement Generator</h1>
              <p className="text-sm text-muted-foreground">
                Build AF Form 1206 narrative statements
              </p>
            </div>
            <Badge variant="outline" className="text-[10px] h-5 bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-700">
              BETA
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveShell}
                  disabled={isSaving || isLoadingShell || !currentShell}
                >
                  {isSaving ? (
                    <Loader2 className="size-4 mr-1 animate-spin" />
                  ) : (
                    <Save className="size-4 mr-1" />
                  )}
                  Save
                </Button>
              </TooltipTrigger>
              <TooltipContent>Save all changes</TooltipContent>
            </Tooltip>
            {currentShell && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowShareDialog(true)}
                  >
                    <Share2 className="size-4 mr-1" />
                    Share
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Share this award package</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPreviewDialog(true)}
                  disabled={totalStatementsWithContent === 0}
                >
                  <Eye className="size-4 mr-1" />
                  Preview All
                  {totalStatementsWithContent > 0 && (
                    <Badge variant="secondary" className="ml-1.5 text-xs">
                      {totalStatementsWithContent}
                    </Badge>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>View and copy all statements for 1206</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Configuration Card */}
        <Collapsible open={showConfig} onOpenChange={setShowConfig}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Settings className="size-5" />
                    <div>
                      <CardTitle className="text-base">Configuration</CardTitle>
                      <CardDescription className="text-xs">
                        {selectedNominee ? `${selectedNominee.rank} ${selectedNominee.fullName}` : "Select nominee"} • {awardLevel} level • {awardCategory}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {showConfig ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                  </div>
                </div>
              </CardHeader>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <CardContent className="pt-0 space-y-4">
                {/* Row 1: Nominee (full width) */}
                <div className="space-y-2 max-w-sm">
                  <Label className="text-xs">Nominee</Label>
                  <Select value={selectedNomineeId} onValueChange={setSelectedNomineeId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select nominee" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="self">
                        {profile?.rank} {profile?.full_name} (Self)
                      </SelectItem>
                      {canManageTeam && <Separator className="my-1" />}
                      {subordinates.map((sub) => (
                        <SelectItem key={sub.id} value={sub.id}>
                          {sub.rank} {sub.full_name}
                        </SelectItem>
                      ))}
                      {managedMembers.map((member) => (
                        <SelectItem key={member.id} value={`managed:${member.id}`}>
                          {member.rank} {member.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Row 2: Award options */}
                <div className="grid grid-cols-3 gap-4">
                  {/* Level */}
                  <div className="space-y-2">
                    <Label className="text-xs">Award Level</Label>
                    <Select value={awardLevel} onValueChange={(v) => setAwardLevel(v as AwardLevel)}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AWARD_LEVELS.map((l) => (
                          <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Category */}
                  <div className="space-y-2">
                    <Label className="text-xs">Award Category</Label>
                    <Select value={awardCategory} onValueChange={(v) => setAwardCategory(v as AwardCategory)}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AWARD_CATEGORIES.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Model */}
                  <div className="space-y-2">
                    <Label className="text-xs">AI Model</Label>
                    <Select value={selectedModel} onValueChange={setSelectedModel}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AI_MODELS.map((m) => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Actions Row */}
                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={expandAll}>
                      Expand All
                    </Button>
                    <Button variant="ghost" size="sm" onClick={collapseAll}>
                      Collapse All
                    </Button>
                  </div>
                  <Button variant="ghost" size="sm" onClick={handleClearAll} className="text-destructive hover:text-destructive">
                    <RefreshCw className="size-4 mr-1" />
                    Clear All
                  </Button>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Loading State */}
        {isLoadingShell ? (
          <div className="space-y-4">
            {AWARD_1206_CATEGORIES.map((cat) => (
              <Skeleton key={cat.key} className="h-40 w-full" />
            ))}
          </div>
        ) : (
          /* Category Sections */
          <div className="space-y-4">
            {AWARD_1206_CATEGORIES.map((cat) => {
              const categorySections = getSectionsForCategory(cat.key);
              
              return (
                <AwardCategorySectionCard
                  key={cat.key}
                  categoryKey={cat.key}
                  categoryLabel={cat.label}
                  categoryHeading={cat.heading}
                  categoryDescription={cat.description}
                  sections={categorySections}
                  accomplishments={accomplishments}
                  nomineeRank={selectedNominee?.rank || ""}
                  nomineeName={selectedNominee?.fullName || ""}
                  nomineeAfsc={selectedNominee?.afsc || ""}
                  awardLevel={awardLevel}
                  awardCategory={awardCategory}
                  model={selectedModel}
                  isCollapsed={collapsedCategories[cat.key] || false}
                  onToggleCollapse={() => toggleCategoryCollapsed(cat.key)}
                  onUpdateSlotState={updateSlotState}
                  onAddSection={() => addSection(cat.key)}
                  onRemoveSection={(slotIndex) => removeSection(cat.key, slotIndex)}
                />
              );
            })}
          </div>
        )}

        {/* Preview Dialog */}
        <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
          <DialogContent className="max-w-3xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Printer className="size-5" />
                1206 Statement Preview
              </DialogTitle>
              <DialogDescription>
                Review all statements before copying to your AF Form 1206
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="max-h-[50vh] pr-4">
              <div className="space-y-6">
                {allStatementsForPreview.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No statements generated yet. Add content to the category sections above.
                  </p>
                ) : (
                  allStatementsForPreview.map((cat) => (
                    <div key={cat.category} className="space-y-2">
                      <h3 className="font-bold text-sm tracking-wide">{cat.heading}</h3>
                      <div className="space-y-3 pl-2">
                        {cat.statements.map((stmt, idx) => (
                          <div key={idx} className="border-l-2 border-primary/30 pl-3">
                            <BulletCanvasPreview
                              statement={stmt}
                              showLineMetrics={true}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPreviewDialog(false)}>
                Close
              </Button>
              <Button onClick={handleCopyAll} disabled={allStatementsForPreview.length === 0}>
                {copiedAll ? (
                  <>
                    <Check className="size-4 mr-1" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="size-4 mr-1" />
                    Copy All Statements
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Share Dialog */}
        {currentShell && (
          <AwardShellShareDialog
            shellId={currentShell.id}
            isOpen={showShareDialog}
            onClose={() => setShowShareDialog(false)}
            nominee={selectedNominee}
            currentUserId={profile?.id}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
