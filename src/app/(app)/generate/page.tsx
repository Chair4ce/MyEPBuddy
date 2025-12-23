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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { AI_MODELS, MAX_STATEMENT_CHARACTERS, MAX_HLR_CHARACTERS, STANDARD_MGAS, ENTRY_MGAS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  Check,
  Loader2,
  AlertCircle,
  Key,
  Users,
  User,
  Star,
  Crown,
  FileText,
  ListChecks,
  ChevronDown,
  ChevronUp,
  Settings2,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { Accomplishment, Profile, UserAPIKeys, WritingStyle, UserLLMSettings, ManagedMember } from "@/types/database";
import { CustomContextWorkspace } from "@/components/generate/custom-context-workspace";
import { StatementSelectionWorkspace } from "@/components/generate/statement-selection-workspace";

// Union type for ratee (either a Profile or ManagedMember)
type RateeInfo = {
  id: string;
  full_name: string | null;
  rank: string | null;
  afsc: string | null;
  isManagedMember?: boolean;
};

export default function GeneratePage() {
  const { profile, subordinates, managedMembers } = useUserStore();
  const [selectedRatee, setSelectedRatee] = useState<string>("self");
  const [selectedModel, setSelectedModel] = useState<string>("gemini-2.0-flash");
  const [accomplishments, setAccomplishments] = useState<Accomplishment[]>([]);
  const [rateeInfo, setRateeInfo] = useState<RateeInfo | null>(null);
  
  // Check if selected ratee is a managed member
  const isManagedMember = selectedRatee.startsWith("managed:");
  const managedMemberId = isManagedMember ? selectedRatee.replace("managed:", "") : null;
  const [hasUserKey, setHasUserKey] = useState(false);
  const [writingStyle, setWritingStyle] = useState<WritingStyle>("personal");
  const [communityMpaFilter, setCommunityMpaFilter] = useState<string>("all"); // "all" or specific MPA key
  const [communityAfscFilter, setCommunityAfscFilter] = useState<string>("my-afsc"); // "my-afsc" = user's AFSC, or specific AFSC
  const [availableAfscs, setAvailableAfscs] = useState<string[]>([]);
  const [userSettings, setUserSettings] = useState<Partial<UserLLMSettings> | null>(null);
  
  // MPA selection state - default to all MPAs selected
  const [selectedMPAs, setSelectedMPAs] = useState<string[]>([]);
  const [includeHLR, setIncludeHLR] = useState(false);
  
  // Toggle between performance entries and custom context workspace
  const [useCustomContext, setUseCustomContext] = useState(false);
  
  // Collapsible section states - auto-collapse when in workspace mode
  const [configOpen, setConfigOpen] = useState(true);
  

  const supabase = createClient();
  const cycleYear = userSettings?.current_cycle_year || new Date().getFullYear();
  // Use standard MPAs for all users (AFI 36-2406)
  const mgas = STANDARD_MGAS;
  const maxChars = userSettings?.max_characters_per_statement || MAX_STATEMENT_CHARACTERS;
  const maxHlrChars = MAX_HLR_CHARACTERS;
  
  // Helper to get max chars based on MPA type
  const getMaxChars = (mpaKey: string) => mpaKey === "hlr_assessment" ? maxHlrChars : maxChars;

  // Load user's writing style preference and LLM settings
  useEffect(() => {
    if (profile?.writing_style) {
      setWritingStyle(profile.writing_style as WritingStyle);
    }
  }, [profile]);

  // Load available AFSCs from community statements
  useEffect(() => {
    async function loadAvailableAfscs() {
      // Get unique AFSCs from community_statements and shared community statements
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

  // Load ratee info and accomplishments
  useEffect(() => {
    async function loadRateeData() {
      if (!profile) return;

      // Set ratee info based on selection type
      if (selectedRatee === "self") {
        setRateeInfo({
          id: profile.id,
          full_name: profile.full_name,
          rank: profile.rank,
          afsc: profile.afsc,
          isManagedMember: false,
        });
      } else if (isManagedMember && managedMemberId) {
        const member = managedMembers.find((m) => m.id === managedMemberId);
        if (member) {
          setRateeInfo({
            id: member.id,
            full_name: member.full_name,
            rank: member.rank,
            afsc: member.afsc,
            isManagedMember: true,
          });
        }
      } else {
        const sub = subordinates.find((s) => s.id === selectedRatee);
        if (sub) {
          setRateeInfo({
            id: sub.id,
            full_name: sub.full_name,
            rank: sub.rank,
            afsc: sub.afsc,
            isManagedMember: false,
          });
        }
      }

      // Load accomplishments
      let query = supabase
        .from("accomplishments")
        .select("*")
        .eq("cycle_year", cycleYear)
        .order("date", { ascending: false });

      if (isManagedMember && managedMemberId) {
        // Load entries for managed member
        query = query.eq("team_member_id", managedMemberId);
      } else {
        // Load entries for self or real subordinate
        const targetUserId = selectedRatee === "self" ? profile.id : selectedRatee;
        query = query.eq("user_id", targetUserId).is("team_member_id", null);
      }

      const { data } = await query;
      setAccomplishments(data || []);
    }

    loadRateeData();
  }, [selectedRatee, profile, subordinates, managedMembers, isManagedMember, managedMemberId, cycleYear, supabase]);

  async function updateWritingStyle(style: WritingStyle) {
    if (!profile) return;
    
    setWritingStyle(style);
    
    await supabase
      .from("profiles")
      .update({ writing_style: style } as never)
      .eq("id", profile.id);
  }

  // Users can generate for subordinates if they have any (real or managed)
  const canManageTeam = subordinates.length > 0 || managedMembers.length > 0 || profile?.role === "admin";
  const hasSubordinates = subordinates.length > 0 || managedMembers.length > 0;
  const selectedModelInfo = AI_MODELS.find((m) => m.id === selectedModel);

  return (
    <div className="space-y-6 min-w-0 w-full max-w-7xl">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">Generate EPB</h1>
        <p className="text-muted-foreground text-sm sm:text-base">
          Create myEval-ready narrative statements from your accomplishments
        </p>
      </div>

      {/* Configuration - Collapsible */}
      <Collapsible open={configOpen} onOpenChange={setConfigOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings2 className="size-5 text-muted-foreground" />
                  <div>
                    <CardTitle className="text-base">Configuration</CardTitle>
                    {!configOpen && rateeInfo && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {rateeInfo.rank} {rateeInfo.full_name} • {selectedModelInfo?.name} • {selectedMPAs.length} MPAs
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
                  {canManageTeam && hasSubordinates && subordinates.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                        Registered Team
                      </div>
                      {subordinates.map((sub) => (
                        <SelectItem key={sub.id} value={sub.id}>
                          <span className="truncate">{sub.rank} {sub.full_name}</span>
                        </SelectItem>
                      ))}
                    </>
                  )}
                  {canManageTeam && managedMembers.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                        Managed Members
                      </div>
                      {managedMembers.map((member) => (
                        <SelectItem key={member.id} value={`managed:${member.id}`}>
                          <span className="truncate">
                            {member.rank} {member.full_name}
                            {member.is_placeholder && " (Managed)"}
                          </span>
                        </SelectItem>
                      ))}
                    </>
                  )}
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
              <p className="flex items-start gap-1.5"><Users className="size-4 shrink-0 mt-0.5" /> <span><strong>Community Style:</strong> Uses top-rated crowdsourced statements from your AFSC ({rateeInfo?.afsc || profile?.afsc}).</span></p>
            )}
            {writingStyle === "hybrid" && (
              <p className="flex items-start gap-1.5"><Star className="size-4 shrink-0 mt-0.5" /> <span><strong>Hybrid:</strong> Combines your personal style with crowdsourced community examples.</span></p>
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
                        My AFSC ({rateeInfo?.afsc || profile?.afsc || "—"})
                      </SelectItem>
                      {availableAfscs.filter(a => a !== (rateeInfo?.afsc || profile?.afsc)).map((afsc) => (
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
                  Using {communityMpaFilter === "all" ? "top 20 crowdsourced statements across all MPAs" : `top 20 for "${STANDARD_MGAS.find(m => m.key === communityMpaFilter)?.label}"`} from {communityAfscFilter === "my-afsc" ? (rateeInfo?.afsc || profile?.afsc || "your AFSC") : communityAfscFilter}
                </p>
            </div>
          )}

          <Separator />

          {/* Source Selection - Toggle between entries and custom context */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Source</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label
                className={cn(
                  "flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors",
                  !useCustomContext ? "bg-primary/5 border-primary/30 ring-1 ring-primary/20" : "bg-card hover:bg-muted/50"
                )}
              >
                <input
                  type="radio"
                  name="source"
                  checked={!useCustomContext}
                  onChange={() => setUseCustomContext(false)}
                  className="sr-only"
                />
                <div className={cn(
                  "size-5 rounded-full border-2 flex items-center justify-center shrink-0",
                  !useCustomContext ? "border-primary bg-primary" : "border-muted-foreground"
                )}>
                  {!useCustomContext && <div className="size-2 rounded-full bg-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <ListChecks className="size-4 text-primary" />
                    <span className="text-sm font-medium">Use Performance Entries</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Generate from your logged accomplishments ({accomplishments.length} entries)
                  </span>
                </div>
              </label>

              <label
                className={cn(
                  "flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors",
                  useCustomContext ? "bg-primary/5 border-primary/30 ring-1 ring-primary/20" : "bg-card hover:bg-muted/50"
                )}
              >
                <input
                  type="radio"
                  name="source"
                  checked={useCustomContext}
                  onChange={() => setUseCustomContext(true)}
                  className="sr-only"
                />
                <div className={cn(
                  "size-5 rounded-full border-2 flex items-center justify-center shrink-0",
                  useCustomContext ? "border-primary bg-primary" : "border-muted-foreground"
                )}>
                  {useCustomContext && <div className="size-2 rounded-full bg-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className="size-4 text-primary" />
                    <span className="text-sm font-medium">Paste Custom Context</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Quickly paste text for instant statement generation
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* MPA Selection - Only for Custom Context */}
          {useCustomContext && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Generate Statements For</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    const allSelected = ENTRY_MGAS.every(m => selectedMPAs.includes(m.key));
                    if (allSelected) {
                      setSelectedMPAs([]);
                    } else {
                      setSelectedMPAs(ENTRY_MGAS.map(m => m.key));
                    }
                  }}
                >
                  {ENTRY_MGAS.every(m => selectedMPAs.includes(m.key)) ? "Deselect All" : "Select All"}
                </Button>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ENTRY_MGAS.map((mpa) => {
                  const isSelected = selectedMPAs.includes(mpa.key);
                  
                  return (
                    <label
                      key={mpa.key}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                        isSelected ? "bg-primary/5 border-primary/30" : "bg-card hover:bg-muted/50"
                      )}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedMPAs([...selectedMPAs, mpa.key]);
                          } else {
                            setSelectedMPAs(selectedMPAs.filter(m => m !== mpa.key));
                          }
                        }}
                        aria-label={`Generate for ${mpa.label}`}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium truncate block">{mpa.label}</span>
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* HLR Toggle - separate from entry MPAs */}
              <div className="pt-2 border-t">
                <label
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                    includeHLR ? "bg-amber-50 dark:bg-amber-900/20 border-amber-300/50" : "bg-card hover:bg-muted/50"
                  )}
                >
                  <Checkbox
                    checked={includeHLR}
                    onCheckedChange={(checked) => setIncludeHLR(!!checked)}
                    aria-label="Include HLR Assessment"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Crown className="size-4 text-amber-600" />
                      <span className="text-sm font-medium">Higher Level Reviewer Assessment</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Commander&apos;s holistic assessment
                    </span>
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* Custom Context Workspace - full workspace when using custom context */}
          {useCustomContext && rateeInfo && (
            <CustomContextWorkspace
              rateeId={rateeInfo.id}
              rateeRank={rateeInfo.rank || "AB"}
              rateeAfsc={rateeInfo.afsc || "UNKNOWN"}
              maxChars={maxChars}
              model={selectedModel}
              cycleYear={cycleYear}
              selectedMPAs={selectedMPAs}
              onStartWorking={() => setConfigOpen(false)}
              onSaveStatement={async (mpa, statement) => {
                try {
                  const { error } = await supabase
                    .from("refined_statements")
                    .insert({
                      user_id: profile?.id,
                      mpa,
                      afsc: rateeInfo.afsc || "UNKNOWN",
                      rank: rateeInfo.rank || "AB",
                      statement,
                      cycle_year: cycleYear,
                      statement_type: "epb",
                    } as never);
                  if (error) throw error;
                  toast.success("Statement saved to library!");
                } catch (error) {
                  console.error(error);
                  toast.error("Failed to save statement");
                }
              }}
            />
          )}

          {/* Performance Entries mode - show API key, stats, and generate button */}
          {!useCustomContext && (
            <>
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
                  <Badge variant="outline" className="truncate">{rateeInfo?.rank || "N/A"}</Badge>
                </div>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs sm:text-sm text-muted-foreground shrink-0">AFSC:</span>
                  <Badge variant="outline" className="truncate">{rateeInfo?.afsc || "N/A"}</Badge>
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

              {accomplishments.length === 0 && (
                <div className="flex items-start gap-2 text-xs sm:text-sm text-orange-600 dark:text-orange-400">
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  <span>No accomplishments found for this ratee in {cycleYear}. Add entries first or switch to custom context mode.</span>
                </div>
              )}
            </>
          )}
        </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Statement Workspace - Assign accomplishments and generate */}
      {!useCustomContext && profile && (
        <StatementSelectionWorkspace
          accomplishments={accomplishments.map(a => ({
            id: a.id,
            mpa: a.mpa,
            action_verb: a.action_verb,
            details: a.details,
            impact: a.impact,
            metrics: a.metrics,
          }))}
          maxChars={maxChars}
          maxHlrChars={maxHlrChars}
          rateeInfo={rateeInfo}
          cycleYear={cycleYear}
          model={selectedModel}
          currentUserId={profile.id}
          onSaveStatement={async (mpa, statement) => {
            if (!profile || !rateeInfo) return;
            
            // For real subordinates: use their user_id so they can see the statement
            // For managed members: use supervisor's user_id + team_member_id
            // For self: use own user_id
            const isRealSubordinate = !rateeInfo.isManagedMember && rateeInfo.id !== profile.id;
            
            const { error } = await supabase
              .from("refined_statements")
              .insert({
                user_id: isRealSubordinate ? rateeInfo.id : profile.id,
                team_member_id: rateeInfo.isManagedMember ? rateeInfo.id : null,
                created_by: profile.id, // Track who created it
                mpa,
                afsc: rateeInfo.afsc || "UNKNOWN",
                rank: rateeInfo.rank || "AB",
                statement,
                cycle_year: cycleYear,
                statement_type: "epb",
              } as never);
            if (error) throw error;
          }}
        />
      )}

    </div>
  );
}
