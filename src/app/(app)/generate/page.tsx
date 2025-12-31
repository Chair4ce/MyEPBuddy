"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import { useEPBShellStore } from "@/stores/epb-shell-store";
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
import { toast } from "@/components/ui/sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { AI_MODELS, STANDARD_MGAS, ENTRY_MGAS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  Key,
  Users,
  User,
  UserPlus,
  Star,
  Settings2,
  ChevronDown,
  ChevronUp,
  ListChecks,
  Share2,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import Link from "next/link";
import type { Accomplishment, WritingStyle, UserLLMSettings, Profile, ManagedMember, EPBShell } from "@/types/database";
import { getKeyStatus } from "@/app/actions/api-keys";
import { EPBShellForm } from "@/components/epb/epb-shell-form";
import { EPBShellShareDialog } from "@/components/epb/epb-shell-share-dialog";

export default function GeneratePage() {
  const { profile, subordinates, managedMembers } = useUserStore();
  const { selectedRatee, setSelectedRatee, currentShell, reset: resetShellStore } = useEPBShellStore();
  
  const [selectedModel, setSelectedModel] = useState<string>("gemini-2.0-flash");
  const [hasUserKey, setHasUserKey] = useState(false);
  const [writingStyle, setWritingStyle] = useState<WritingStyle>("personal");
  const [communityMpaFilter, setCommunityMpaFilter] = useState<string>("all");
  const [communityAfscFilter, setCommunityAfscFilter] = useState<string>("my-afsc");
  const [availableAfscs, setAvailableAfscs] = useState<string[]>([]);
  const [userSettings, setUserSettings] = useState<Partial<UserLLMSettings> | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  
  // Accomplishment selection dialog
  const [showAccomplishmentDialog, setShowAccomplishmentDialog] = useState(false);
  const [selectedMPAForAccomplishments, setSelectedMPAForAccomplishments] = useState<string | null>(null);
  const [accomplishments, setAccomplishments] = useState<Accomplishment[]>([]);
  const [selectedAccomplishmentIds, setSelectedAccomplishmentIds] = useState<string[]>([]);

  const supabase = createClient();
  const cycleYear = userSettings?.current_cycle_year || new Date().getFullYear();

  // Build ratee selector options
  const rateeOptions = [
    {
      value: "self",
      label: `Myself (${profile?.rank} ${profile?.full_name})`,
      ratee: {
        id: profile?.id || "",
        fullName: profile?.full_name || null,
        rank: profile?.rank,
        afsc: profile?.afsc || null,
        isManagedMember: false,
      },
    },
    ...subordinates.map((sub) => ({
      value: sub.id,
      label: `${sub.rank} ${sub.full_name}`,
      ratee: {
        id: sub.id,
        fullName: sub.full_name,
        rank: sub.rank,
        afsc: sub.afsc,
        isManagedMember: false,
      },
    })),
    ...managedMembers.map((member) => ({
      value: `managed:${member.id}`,
      label: `${member.rank} ${member.full_name}${member.is_placeholder ? " (Managed)" : ""}`,
      ratee: {
        id: member.id,
        fullName: member.full_name,
        rank: member.rank,
        afsc: member.afsc,
        isManagedMember: true,
      },
    })),
  ];

  // Handle ratee selection change
  const handleRateeChange = (value: string) => {
    const option = rateeOptions.find((o) => o.value === value);
    if (option) {
      setSelectedRatee(option.ratee as Parameters<typeof setSelectedRatee>[0]);
      // Persist to localStorage
      if (profile) {
        const key = `epb-selected-ratee-${profile.id}-${cycleYear}`;
        localStorage.setItem(key, JSON.stringify({ value, ratee: option.ratee }));
      }
    }
  };

  // Compute the current select value
  const getSelectedRateeValue = (): string => {
    if (!selectedRatee) return "self";
    if (selectedRatee.id === profile?.id && !selectedRatee.isManagedMember) return "self";
    if (!selectedRatee.isManagedMember && subordinates.some((s) => s.id === selectedRatee.id)) return selectedRatee.id;
    if (selectedRatee.isManagedMember && managedMembers.some((m) => m.id === selectedRatee.id)) return `managed:${selectedRatee.id}`;
    return selectedRatee.isManagedMember ? `managed:${selectedRatee.id}` : selectedRatee.id;
  };

  // Get display name for the page title
  const getMemberDisplayName = () => {
    if (!selectedRatee) return "";
    const rank = selectedRatee.rank || "";
    const name = selectedRatee.fullName || "";
    return `${rank} ${name}`.trim();
  };

  // Load user's writing style preference
  useEffect(() => {
    if (profile?.writing_style) {
      setWritingStyle(profile.writing_style as WritingStyle);
    }
  }, [profile]);

  // Load available AFSCs from community statements
  useEffect(() => {
    async function loadAvailableAfscs() {
      const { data: communityData } = await supabase
        .from("community_statements")
        .select("afsc")
        .eq("is_approved", true);
      
      const { data: sharedData } = await supabase
        .from("shared_statements_view")
        .select("afsc")
        .eq("share_type", "community");
      
      const afscs = new Set<string>();
      communityData?.forEach((d: { afsc: string }) => d.afsc && afscs.add(d.afsc));
      sharedData?.forEach((d: { afsc: string }) => d.afsc && afscs.add(d.afsc));
      
      setAvailableAfscs(Array.from(afscs).sort());
    }
    loadAvailableAfscs();
  }, [supabase]);

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

      // Use server action to check key status (never fetches actual keys)
      const keyStatus = await getKeyStatus();
      const selectedProvider = AI_MODELS.find((m) => m.id === selectedModel)?.provider;

      const hasKey =
        (selectedProvider === "openai" && keyStatus.openai_key) ||
        (selectedProvider === "anthropic" && keyStatus.anthropic_key) ||
        (selectedProvider === "google" && keyStatus.google_key) ||
        (selectedProvider === "xai" && keyStatus.grok_key);
      setHasUserKey(hasKey);
    }

    checkUserKeys();
  }, [profile, selectedModel]);

  // Load accomplishments when ratee changes
  useEffect(() => {
    async function loadAccomplishments() {
      if (!selectedRatee || !profile) return;

      let query = supabase
        .from("accomplishments")
        .select("*")
        .eq("cycle_year", cycleYear)
        .order("date", { ascending: false });

      if (selectedRatee.isManagedMember) {
        query = query.eq("team_member_id", selectedRatee.id);
      } else {
        query = query.eq("user_id", selectedRatee.id).is("team_member_id", null);
      }

      const { data } = await query;
      setAccomplishments((data as Accomplishment[]) || []);
    }

    loadAccomplishments();
  }, [selectedRatee, cycleYear, profile, supabase]);

  async function updateWritingStyle(style: WritingStyle) {
    if (!profile) return;
    
    setWritingStyle(style);
    
    await supabase
      .from("profiles")
      .update({ writing_style: style } as never)
      .eq("id", profile.id);
  }

  // Handle opening accomplishment selection for an MPA
  const handleOpenAccomplishments = (mpa: string) => {
    setSelectedMPAForAccomplishments(mpa);
    setSelectedAccomplishmentIds([]);
    setShowAccomplishmentDialog(true);
  };

  // Toggle accomplishment selection
  const toggleAccomplishment = (id: string) => {
    setSelectedAccomplishmentIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // Confirm accomplishment selection
  const confirmAccomplishmentSelection = () => {
    if (selectedMPAForAccomplishments) {
      const { updateSectionState } = useEPBShellStore.getState();
      updateSectionState(selectedMPAForAccomplishments, {
        selectedAccomplishmentIds,
      });
    }
    setShowAccomplishmentDialog(false);
  };

  // Filter accomplishments for the selected MPA
  const filteredAccomplishments = selectedMPAForAccomplishments
    ? accomplishments.filter((a) => a.mpa === selectedMPAForAccomplishments)
    : accomplishments;

  const selectedModelInfo = AI_MODELS.find((m) => m.id === selectedModel);

  // Reset shell store on unmount
  useEffect(() => {
    return () => {
      resetShellStore();
    };
  }, [resetShellStore]);

  return (
    <div className="space-y-6 min-w-0 w-full max-w-7xl">
      {/* Page Header with Title and Share Button */}
      <div className="flex items-center justify-between gap-4 min-w-0">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight truncate">
            EPB Workspace{getMemberDisplayName() && ` - ${getMemberDisplayName()}`}
          </h1>
        </div>
        {currentShell && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowShareDialog(true)} 
            className="h-8 px-3 shrink-0"
            title="Share EPB"
          >
            <Share2 className="size-4" />
            <span className="hidden sm:inline ml-1.5">Share</span>
          </Button>
        )}
      </div>

      {/* Share Dialog */}
      {currentShell && (
        <EPBShellShareDialog
          shellId={currentShell.id}
          isOpen={showShareDialog}
          onClose={() => setShowShareDialog(false)}
          ratee={selectedRatee}
          currentUserId={profile?.id}
        />
      )}

      {/* Viewing EPB for Selector */}
      {currentShell && (
        <Card className="bg-muted/30 overflow-hidden">
          <CardContent className="py-2 sm:py-3 px-3 sm:px-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <span className="text-xs sm:text-sm text-muted-foreground shrink-0">Viewing EPB for:</span>
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Select
                  value={getSelectedRateeValue()}
                  onValueChange={handleRateeChange}
                >
                  <SelectTrigger className="bg-background h-8 sm:h-9 text-xs sm:text-sm max-w-[240px] sm:max-w-sm">
                    <SelectValue placeholder="Select member..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="self">
                      <span className="flex items-center gap-2">
                        <User className="size-4" />
                        Myself ({profile?.rank} {profile?.full_name})
                      </span>
                    </SelectItem>
                    {subordinates.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                          Team Members
                        </div>
                        {subordinates.map((sub) => (
                          <SelectItem key={sub.id} value={sub.id}>
                            <span className="flex items-center gap-2">
                              <Users className="size-4" />
                              {sub.rank} {sub.full_name}
                            </span>
                          </SelectItem>
                        ))}
                      </>
                    )}
                    {managedMembers.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                          Managed Members
                        </div>
                        {managedMembers.map((member) => (
                          <SelectItem key={member.id} value={`managed:${member.id}`}>
                            <span className="flex items-center gap-2">
                              <User className="size-4 opacity-60" />
                              {member.rank} {member.full_name}
                              {member.is_placeholder && (
                                <Badge variant="secondary" className="text-[10px]">
                                  Managed
                                </Badge>
                              )}
                            </span>
                          </SelectItem>
                        ))}
                      </>
                    )}
                    <Separator className="my-1" />
                    <Link
                      href="/team"
                      className="flex items-center gap-2 px-2 py-1.5 text-sm text-primary hover:bg-muted rounded-sm cursor-pointer"
                    >
                      <UserPlus className="size-4" />
                      Add team member
                    </Link>
                  </SelectContent>
                </Select>
                <Badge variant="outline" className="shrink-0 text-[10px] sm:text-xs">
                  {cycleYear}
                </Badge>
                {currentShell?.status === 'archived' && (
                  <Badge variant="secondary" className="shrink-0 text-[10px] sm:text-xs bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                    Archived
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Configuration - Collapsible */}
      <Collapsible open={configOpen} onOpenChange={setConfigOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings2 className="size-5 text-muted-foreground" />
                  <div>
                    <CardTitle className="text-base">AI Configuration</CardTitle>
                    {!configOpen && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {selectedModelInfo?.name} • {writingStyle} style
                      </p>
                    )}
                  </div>
                </div>
                {configOpen ? (
                  <ChevronUp className="size-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="size-4 text-muted-foreground" />
                )}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4 min-w-0">
              <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-3">
                {/* Model Selection */}
                <div className="space-y-2">
                  <Label>AI Model</Label>
                  <Select value={selectedModel} onValueChange={setSelectedModel}>
                    <SelectTrigger aria-label="Select AI model">
                      <SelectValue>{selectedModelInfo?.name}</SelectValue>
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
                  <p className="flex items-start gap-1.5">
                    <User className="size-4 shrink-0 mt-0.5" />
                    <span><strong>Personal Style:</strong> Uses your own refined statements as examples for consistent voice.</span>
                  </p>
                )}
                {writingStyle === "community" && (
                  <p className="flex items-start gap-1.5">
                    <Users className="size-4 shrink-0 mt-0.5" />
                    <span><strong>Community Style:</strong> Uses top-rated crowdsourced statements from your AFSC ({selectedRatee?.afsc || profile?.afsc}).</span>
                  </p>
                )}
                {writingStyle === "hybrid" && (
                  <p className="flex items-start gap-1.5">
                    <Star className="size-4 shrink-0 mt-0.5" />
                    <span><strong>Hybrid:</strong> Combines your personal style with crowdsourced community examples.</span>
                  </p>
                )}
              </div>

              {/* Community Filters - only show when using community or hybrid style */}
              {(writingStyle === "community" || writingStyle === "hybrid") && (
                <div className="space-y-4 p-3 rounded-lg border bg-muted/30">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* AFSC Filter */}
                    <div className="space-y-2">
                      <Label className="text-sm">AFSC for Examples</Label>
                      <Select value={communityAfscFilter} onValueChange={setCommunityAfscFilter}>
                        <SelectTrigger aria-label="Select which AFSC examples to use">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="my-afsc">
                            My AFSC ({selectedRatee?.afsc || profile?.afsc || "—"})
                          </SelectItem>
                          {availableAfscs.filter(a => a !== (selectedRatee?.afsc || profile?.afsc)).map((afsc) => (
                            <SelectItem key={afsc} value={afsc}>
                              {afsc}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* MPA Filter */}
                    <div className="space-y-2">
                      <Label className="text-sm">MPA for Examples</Label>
                      <Select value={communityMpaFilter} onValueChange={setCommunityMpaFilter}>
                        <SelectTrigger aria-label="Select which MPA examples to use">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All MPAs (Top 20)</SelectItem>
                          {STANDARD_MGAS.map((mpa) => (
                            <SelectItem key={mpa.key} value={mpa.key}>
                              {mpa.label} (Top 20)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Using {communityMpaFilter === "all" ? "top 20 crowdsourced statements across all MPAs" : `top 20 for "${STANDARD_MGAS.find(m => m.key === communityMpaFilter)?.label}"`} from {communityAfscFilter === "my-afsc" ? (selectedRatee?.afsc || profile?.afsc || "your AFSC") : communityAfscFilter}
                  </p>
                </div>
              )}

              <Separator />

              {/* API Key Status */}
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
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* EPB Shell Form - The main workspace */}
      {profile && (
        <EPBShellForm
          cycleYear={cycleYear}
          model={selectedModel}
          onOpenAccomplishments={handleOpenAccomplishments}
        />
      )}

      {/* Accomplishment Selection Dialog */}
      <Dialog open={showAccomplishmentDialog} onOpenChange={setShowAccomplishmentDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListChecks className="size-5" />
              Select Performance Actions
            </DialogTitle>
            <DialogDescription>
              Choose accomplishments to include in your{" "}
              {selectedMPAForAccomplishments && (
                <strong>{STANDARD_MGAS.find((m) => m.key === selectedMPAForAccomplishments)?.label}</strong>
              )}{" "}
              statement
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto space-y-2 py-4">
            {filteredAccomplishments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No performance actions found for this MPA.</p>
                <p className="text-sm mt-1">
                  <a href="/entries" className="text-primary hover:underline">
                    Add entries
                  </a>{" "}
                  or use custom context instead.
                </p>
              </div>
            ) : (
              filteredAccomplishments.map((acc) => {
                const isSelected = selectedAccomplishmentIds.includes(acc.id);
                return (
                  <label
                    key={acc.id}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                      isSelected
                        ? "bg-primary/5 border-primary/30 ring-1 ring-primary/20"
                        : "bg-card hover:bg-muted/50"
                    )}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleAccomplishment(acc.id)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant="outline" className="text-xs">
                          {acc.action_verb}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(acc.date).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm line-clamp-2">{acc.details}</p>
                      {acc.impact && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                          Impact: {acc.impact}
                        </p>
                      )}
                    </div>
                  </label>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <span className="text-sm text-muted-foreground">
              {selectedAccomplishmentIds.length} selected
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowAccomplishmentDialog(false)}>
                Cancel
              </Button>
              <Button onClick={confirmAccomplishmentSelection}>
                <Sparkles className="size-4 mr-1.5" />
                Use Selected
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
