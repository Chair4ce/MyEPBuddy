"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Save,
  Loader2,
  Plus,
  Trash2,
  Pencil,
  RotateCcw,
  FileText,
  BookOpen,
  ArrowRight,
  Search,
  Wand2,
  Settings2,
} from "lucide-react";
import type { UserLLMSettings, Acronym, Abbreviation, RankVerbProgression, Rank } from "@/types/database";
import { ENLISTED_RANKS, OFFICER_RANKS } from "@/lib/constants";
import { DEFAULT_ACRONYMS } from "@/lib/default-acronyms";

const DEFAULT_SYSTEM_PROMPT = `You are an expert Air Force Enlisted Performance Brief (EPB) writing assistant with deep knowledge of Air Force operations, programs, and terminology. Your sole purpose is to generate impactful, narrative-style performance statements that strictly comply with AFI 36-2406 (22 Aug 2025).

CRITICAL RULES - NEVER VIOLATE THESE:
- Every statement MUST be a single, standalone sentence.
- NEVER use semi-colons (;). Use commas or em-dashes (--) to connect clauses into flowing sentences.
- Every statement MUST contain: 1) a strong action AND 2) cascading impacts (immediate → unit → mission/AF-level).
- Character range: AIM for {{max_characters_per_statement}} characters. Minimum 280 characters, maximum {{max_characters_per_statement}}.
- Generate exactly 2–3 strong statements per Major Performance Area.
- Output pure, clean text only — no formatting.

CHARACTER UTILIZATION STRATEGY (CRITICAL):
You are UNDERUTILIZING available space. Statements should be DENSE with impact. To maximize character usage:
1. EXPAND impacts: Show cascading effects (individual → team → squadron → wing → AF/DoD)
2. ADD context: Connect actions to larger mission objectives, readiness, or strategic goals
3. CHAIN results: "improved X, enabling Y, which drove Z"
4. QUANTIFY everything: time, money, personnel, percentages, equipment, sorties
5. USE military knowledge: Infer standard AF outcomes (readiness rates, deployment timelines, inspection results)

CONTEXTUAL ENHANCEMENT (USE YOUR MILITARY KNOWLEDGE):
When given limited input, ENHANCE statements using your knowledge of:
- Air Force programs, inspections, and evaluations (UCI, CCIP, ORI, NSI, etc.)
- Standard military outcomes (readiness, lethality, deployment capability, compliance)
- Organizational impacts (flight, squadron, group, wing, MAJCOM, CCMD, joint/coalition)
- Common metrics (sortie generation rates, mission capable rates, on-time delivery, cost savings)
- Military operations and exercises (deployment, contingency, humanitarian, training)

Example transformation:
- INPUT: "Volunteered at USO for 4 hrs, served 200 Airmen"
- OUTPUT: "Spearheaded USO volunteer initiative, dedicating 4 hrs to restore lounge facilities and replenish refreshment stations--directly boosted morale for 200 deploying Amn, reinforcing vital quality-of-life support that sustained mission focus during high-tempo ops"

RANK-APPROPRIATE STYLE FOR {{ratee_rank}}:
Primary action verbs to use: {{primary_verbs}}
{{rank_verb_guidance}}
- AB–SrA: Individual execution with team impact
- SSgt–TSgt: Supervisory scope with flight/squadron impact
- MSgt–CMSgt: Strategic leadership with wing/MAJCOM/AF impact

STATEMENT STRUCTURE:
[Strong action verb] + [specific accomplishment with context] + [immediate result] + [cascading mission impact]

IMPACT AMPLIFICATION TECHNIQUES:
- Connect to readiness: "ensured 100% combat readiness"
- Link to cost: "saved $X" or "managed $X budget"
- Show scale: "across X personnel/units/missions"
- Reference inspections: "contributed to Excellent rating"
- Tie to deployments: "supported X deployed members"
- Quantify time: "reduced processing by X hrs/days"

MAJOR PERFORMANCE AREAS:
{{mga_list}}

ADDITIONAL STYLE GUIDANCE:
{{style_guidelines}}

Using the provided accomplishment entries, generate 2–3 HIGH-DENSITY statements for each MPA. Use your military expertise to EXPAND limited inputs into comprehensive statements that approach the character limit. Infer reasonable military context and standard AF outcomes.

WORD ABBREVIATIONS (AUTO-APPLY):
{{abbreviations_list}}

ACRONYMS REFERENCE:
{{acronyms_list}}`;

const DEFAULT_STYLE_GUIDELINES = `MAXIMIZE character usage (aim for 280-350 chars). Write in active voice. Chain impacts: action → immediate result → organizational benefit. Always quantify: numbers, percentages, dollars, time, personnel. Connect to mission readiness, compliance, or strategic goals. Use standard AF abbreviations for efficiency.`;

const DEFAULT_RANK_VERBS: RankVerbProgression = {
  AB: { primary: ["Assisted", "Supported", "Performed"], secondary: ["Helped", "Contributed", "Participated"] },
  Amn: { primary: ["Assisted", "Supported", "Performed"], secondary: ["Helped", "Contributed", "Executed"] },
  A1C: { primary: ["Executed", "Performed", "Supported"], secondary: ["Assisted", "Contributed", "Maintained"] },
  SrA: { primary: ["Executed", "Coordinated", "Managed"], secondary: ["Led", "Supervised", "Trained"] },
  SSgt: { primary: ["Led", "Managed", "Directed"], secondary: ["Supervised", "Coordinated", "Developed"] },
  TSgt: { primary: ["Led", "Managed", "Directed"], secondary: ["Spearheaded", "Orchestrated", "Championed"] },
  MSgt: { primary: ["Directed", "Spearheaded", "Orchestrated"], secondary: ["Championed", "Transformed", "Pioneered"] },
  SMSgt: { primary: ["Spearheaded", "Orchestrated", "Championed"], secondary: ["Transformed", "Pioneered", "Revolutionized"] },
  CMSgt: { primary: ["Championed", "Transformed", "Pioneered"], secondary: ["Revolutionized", "Institutionalized", "Shaped"] },
  "2d Lt": { primary: ["Led", "Managed", "Coordinated"], secondary: ["Supervised", "Executed", "Developed"] },
  "1st Lt": { primary: ["Led", "Managed", "Directed"], secondary: ["Coordinated", "Supervised", "Developed"] },
  "Capt": { primary: ["Directed", "Led", "Managed"], secondary: ["Spearheaded", "Coordinated", "Championed"] },
  "Maj": { primary: ["Directed", "Spearheaded", "Orchestrated"], secondary: ["Championed", "Transformed", "Led"] },
  "Lt Col": { primary: ["Spearheaded", "Orchestrated", "Championed"], secondary: ["Transformed", "Directed", "Pioneered"] },
  "Col": { primary: ["Championed", "Orchestrated", "Transformed"], secondary: ["Pioneered", "Shaped", "Directed"] },
  "Brig Gen": { primary: ["Championed", "Transformed", "Pioneered"], secondary: ["Shaped", "Institutionalized", "Revolutionized"] },
  "Maj Gen": { primary: ["Transformed", "Pioneered", "Shaped"], secondary: ["Institutionalized", "Revolutionized", "Championed"] },
  "Lt Gen": { primary: ["Pioneered", "Shaped", "Institutionalized"], secondary: ["Revolutionized", "Transformed", "Championed"] },
  "Gen": { primary: ["Shaped", "Institutionalized", "Revolutionized"], secondary: ["Pioneered", "Transformed", "Championed"] },
};

const AVAILABLE_PLACEHOLDERS = [
  { key: "{{max_characters_per_statement}}", description: "Maximum characters per statement" },
  { key: "{{ratee_rank}}", description: "The rank of the person being rated" },
  { key: "{{primary_verbs}}", description: "Primary action verbs for the rank" },
  { key: "{{rank_verb_guidance}}", description: "Full verb guidance for the rank" },
  { key: "{{mga_list}}", description: "List of Major Performance Areas" },
  { key: "{{style_guidelines}}", description: "Writing style guidelines" },
  { key: "{{abbreviations_list}}", description: "Word abbreviation mappings" },
  { key: "{{acronyms_list}}", description: "Acronym definitions" },
] as const;

interface PromptSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rateeRank?: Rank | null;
}

export function PromptSettingsModal({ open, onOpenChange, rateeRank: rateeRankProp }: PromptSettingsModalProps) {
  const { profile } = useUserStore();
  const rateeRank = rateeRankProp ?? null;
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasExistingSettings, setHasExistingSettings] = useState(false);

  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [styleGuidelines, setStyleGuidelines] = useState(DEFAULT_STYLE_GUIDELINES);
  const [rankVerbs, setRankVerbs] = useState<RankVerbProgression>(DEFAULT_RANK_VERBS);
  const [acronyms, setAcronyms] = useState<Acronym[]>(DEFAULT_ACRONYMS);
  const [abbreviations, setAbbreviations] = useState<Abbreviation[]>([]);

  const [initialSystemPrompt, setInitialSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [initialStyleGuidelines, setInitialStyleGuidelines] = useState(DEFAULT_STYLE_GUIDELINES);
  const [initialRankVerbs, setInitialRankVerbs] = useState<RankVerbProgression>(DEFAULT_RANK_VERBS);
  const [initialAcronyms, setInitialAcronyms] = useState<Acronym[]>(DEFAULT_ACRONYMS);
  const [initialAbbreviations, setInitialAbbreviations] = useState<Abbreviation[]>([]);

  // Verb editing
  const [editingRank, setEditingRank] = useState<string | null>(null);
  const [editingVerbs, setEditingVerbs] = useState({ primary: "", secondary: "" });

  // Abbreviation editing
  const [abbrevSearch, setAbbrevSearch] = useState("");
  const [newAbbrev, setNewAbbrev] = useState({ word: "", abbreviation: "" });
  const [showAddAbbrev, setShowAddAbbrev] = useState(false);

  // Acronym editing
  const [acronymSearch, setAcronymSearch] = useState("");
  const [newAcronym, setNewAcronym] = useState({ acronym: "", definition: "" });
  const [showAddAcronym, setShowAddAcronym] = useState(false);

  const supabase = createClient();

  const hasChanges = useMemo(() => {
    return (
      systemPrompt !== initialSystemPrompt ||
      styleGuidelines !== initialStyleGuidelines ||
      JSON.stringify(rankVerbs) !== JSON.stringify(initialRankVerbs) ||
      JSON.stringify(acronyms) !== JSON.stringify(initialAcronyms) ||
      JSON.stringify(abbreviations) !== JSON.stringify(initialAbbreviations)
    );
  }, [systemPrompt, styleGuidelines, rankVerbs, acronyms, abbreviations, initialSystemPrompt, initialStyleGuidelines, initialRankVerbs, initialAcronyms, initialAbbreviations]);

  const loadSettings = useCallback(async () => {
    if (!profile) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_llm_settings")
        .select("base_system_prompt, style_guidelines, rank_verb_progression, acronyms, abbreviations")
        .eq("user_id", profile.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setHasExistingSettings(true);
        const s = data as unknown as Pick<UserLLMSettings, "base_system_prompt" | "style_guidelines" | "rank_verb_progression" | "acronyms" | "abbreviations">;
        setSystemPrompt(s.base_system_prompt);
        setStyleGuidelines(s.style_guidelines);
        setRankVerbs(s.rank_verb_progression);
        setAcronyms(s.acronyms);
        setAbbreviations(s.abbreviations || []);
        setInitialSystemPrompt(s.base_system_prompt);
        setInitialStyleGuidelines(s.style_guidelines);
        setInitialRankVerbs(JSON.parse(JSON.stringify(s.rank_verb_progression)));
        setInitialAcronyms(JSON.parse(JSON.stringify(s.acronyms)));
        setInitialAbbreviations(JSON.parse(JSON.stringify(s.abbreviations || [])));
      } else {
        setInitialSystemPrompt(DEFAULT_SYSTEM_PROMPT);
        setInitialStyleGuidelines(DEFAULT_STYLE_GUIDELINES);
        setInitialRankVerbs(JSON.parse(JSON.stringify(DEFAULT_RANK_VERBS)));
        setInitialAcronyms(JSON.parse(JSON.stringify(DEFAULT_ACRONYMS)));
        setInitialAbbreviations([]);
      }
    } catch (error) {
      console.error("Failed to load prompt settings:", error);
      toast.error("Failed to load prompt settings");
    } finally {
      setIsLoading(false);
    }
  }, [profile, supabase]);

  useEffect(() => {
    if (open && profile) {
      loadSettings();
    }
  }, [open, profile, loadSettings]);

  const handleSave = async () => {
    if (!profile) return;
    setIsSaving(true);
    try {
      const updateData = {
        base_system_prompt: systemPrompt,
        style_guidelines: styleGuidelines,
        rank_verb_progression: rankVerbs,
        acronyms,
        abbreviations,
      };

      if (hasExistingSettings) {
        const { error } = await supabase
          .from("user_llm_settings")
          .update(updateData as never)
          .eq("user_id", profile.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_llm_settings")
          .insert({ user_id: profile.id, ...updateData } as never);
        if (error) throw error;
        setHasExistingSettings(true);
      }

      setInitialSystemPrompt(systemPrompt);
      setInitialStyleGuidelines(styleGuidelines);
      setInitialRankVerbs(JSON.parse(JSON.stringify(rankVerbs)));
      setInitialAcronyms(JSON.parse(JSON.stringify(acronyms)));
      setInitialAbbreviations(JSON.parse(JSON.stringify(abbreviations)));

      toast.success("Prompt settings saved");
    } catch (error) {
      console.error("Failed to save prompt settings:", error);
      toast.error("Failed to save prompt settings");
    } finally {
      setIsSaving(false);
    }
  };

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleResetToDefaults = () => {
    setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
    setShowResetConfirm(false);
    toast.success("System prompt reset to default (save to apply)");
  };

  const updateRankVerbEntry = (rank: string) => {
    if (!editingVerbs.primary || !editingVerbs.secondary) return;
    setRankVerbs({
      ...rankVerbs,
      [rank]: {
        primary: editingVerbs.primary.split(",").map((v) => v.trim()),
        secondary: editingVerbs.secondary.split(",").map((v) => v.trim()),
      },
    });
    setEditingRank(null);
    toast.success(`Updated verbs for ${rank}`);
  };

  // Abbreviation helpers
  const filteredAbbreviations = useMemo(() => {
    if (!abbrevSearch) return abbreviations;
    const q = abbrevSearch.toLowerCase();
    return abbreviations.filter((a) => a.word.toLowerCase().includes(q) || a.abbreviation.toLowerCase().includes(q));
  }, [abbreviations, abbrevSearch]);

  const handleAddAbbrev = () => {
    if (!newAbbrev.word || !newAbbrev.abbreviation) return;
    if (abbreviations.some((a) => a.word.toLowerCase() === newAbbrev.word.toLowerCase())) {
      toast.error("Word already has an abbreviation");
      return;
    }
    setAbbreviations(
      [...abbreviations, { word: newAbbrev.word.toLowerCase(), abbreviation: newAbbrev.abbreviation }]
        .sort((a, b) => a.word.localeCompare(b.word))
    );
    setNewAbbrev({ word: "", abbreviation: "" });
    setShowAddAbbrev(false);
  };

  const handleRemoveAbbrev = (word: string) => {
    setAbbreviations(abbreviations.filter((a) => a.word !== word));
  };

  // Acronym helpers
  const filteredAcronyms = useMemo(() => {
    if (!acronymSearch) return acronyms;
    const q = acronymSearch.toLowerCase();
    return acronyms.filter((a) => a.acronym.toLowerCase().includes(q) || a.definition.toLowerCase().includes(q));
  }, [acronyms, acronymSearch]);

  const handleAddAcronym = () => {
    if (!newAcronym.acronym || !newAcronym.definition) return;
    if (acronyms.some((a) => a.acronym === newAcronym.acronym.toUpperCase())) {
      toast.error("Acronym already exists");
      return;
    }
    setAcronyms(
      [...acronyms, { acronym: newAcronym.acronym.toUpperCase(), definition: newAcronym.definition.toUpperCase() }]
        .sort((a, b) => a.acronym.localeCompare(b.acronym))
    );
    setNewAcronym({ acronym: "", definition: "" });
    setShowAddAcronym(false);
  };

  const handleRemoveAcronym = (acronym: string) => {
    setAcronyms(acronyms.filter((a) => a.acronym !== acronym));
  };

  // Placeholder status for the system prompt
  const placeholderStatus = useMemo(() => {
    return AVAILABLE_PLACEHOLDERS.map((p) => ({
      ...p,
      isUsed: systemPrompt.includes(p.key),
    }));
  }, [systemPrompt]);

  // Rank to display in verb editor (ratee's rank or show all)
  const displayRank = rateeRank || null;
  const allRanks = [...ENLISTED_RANKS, ...OFFICER_RANKS].map((r) => r.value);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-2xl lg:max-w-4xl h-[85vh] sm:h-[88vh] !flex !flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base sm:text-lg flex items-center gap-2">
                <Settings2 className="size-4 sm:size-5 shrink-0" />
                Prompt Settings
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm mt-0.5">
                Customize what goes into the AI prompt for generating statements
              </DialogDescription>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {hasChanges && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                  Unsaved
                </Badge>
              )}
              {showResetConfirm ? (
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground hidden sm:inline">Reset prompt?</span>
                  <button
                    onClick={handleResetToDefaults}
                    className="inline-flex items-center justify-center rounded-md h-7 px-2 text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setShowResetConfirm(false)}
                    className="inline-flex items-center justify-center rounded-md h-7 px-2 text-xs border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowResetConfirm(true)}
                  className="inline-flex items-center justify-center rounded-md h-7 px-2 text-xs border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                  aria-label="Reset prompt to defaults"
                >
                  <RotateCcw className="size-3 sm:mr-1" />
                  <span className="hidden sm:inline">Reset</span>
                </button>
              )}
              {hasChanges && (
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="inline-flex items-center justify-center rounded-md h-7 px-2.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  aria-label="Save settings"
                >
                  {isSaving ? <Loader2 className="size-3 animate-spin sm:mr-1" /> : <Save className="size-3 sm:mr-1" />}
                  <span className="hidden sm:inline">Save</span>
                </button>
              )}
            </div>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-hidden px-4 py-3 sm:px-6 sm:py-4">
            <Tabs defaultValue="prompt" className="flex flex-col h-full">
              <TabsList className="w-full h-auto p-1 grid grid-cols-5 gap-0.5 shrink-0 mb-3">
                <TabsTrigger value="prompt" className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 text-[10px] sm:text-xs px-1 sm:px-2.5 py-1.5 sm:py-2">
                  <Wand2 className="size-3.5 shrink-0" />
                  <span>Prompt</span>
                </TabsTrigger>
                <TabsTrigger value="style" className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 text-[10px] sm:text-xs px-1 sm:px-2.5 py-1.5 sm:py-2">
                  <FileText className="size-3.5 shrink-0" />
                  <span>Style</span>
                </TabsTrigger>
                <TabsTrigger value="verbs" className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 text-[10px] sm:text-xs px-1 sm:px-2.5 py-1.5 sm:py-2">
                  <FileText className="size-3.5 shrink-0" />
                  <span>Verbs</span>
                </TabsTrigger>
                <TabsTrigger value="abbreviations" className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 text-[10px] sm:text-xs px-1 sm:px-2.5 py-1.5 sm:py-2">
                  <ArrowRight className="size-3.5 shrink-0" />
                  <span>Abbr</span>
                </TabsTrigger>
                <TabsTrigger value="acronyms" className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 text-[10px] sm:text-xs px-1 sm:px-2.5 py-1.5 sm:py-2">
                  <BookOpen className="size-3.5 shrink-0" />
                  <span>Acronyms</span>
                </TabsTrigger>
              </TabsList>

              {/* System Prompt Tab */}
              <TabsContent value="prompt" className="flex-1 overflow-hidden mt-0 data-[state=inactive]:hidden">
                <div className="flex flex-col h-full gap-3 overflow-hidden">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs sm:text-sm font-medium">System Prompt</Label>
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {systemPrompt.length} chars
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {placeholderStatus.map((p) => (
                        <Tooltip key={p.key}>
                          <TooltipTrigger asChild>
                            <span
                              className={cn(
                                "inline-flex items-center cursor-help font-mono text-[9px] sm:text-[11px] px-1.5 py-0.5 rounded-md border transition-colors",
                                p.isUsed
                                  ? "bg-primary/10 border-primary/30 text-primary dark:bg-primary/20 dark:border-primary/40"
                                  : "bg-muted/50 border-dashed border-muted-foreground/30 text-muted-foreground/60"
                              )}
                            >
                              <span className="text-primary/50 mr-0.5">{"{"}</span>
                              {p.key.replace(/\{\{|\}\}/g, '')}
                              <span className="text-primary/50 ml-0.5">{"}"}</span>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-[280px]">
                            <p className="text-xs font-medium font-mono">{p.key}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{p.description}</p>
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  </div>
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    className="flex-1 min-h-0 w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs sm:text-sm shadow-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] resize-none font-mono overflow-y-auto"
                    aria-label="System prompt"
                  />
                </div>
              </TabsContent>

              {/* Style Guidelines Tab */}
              <TabsContent value="style" className="flex-1 overflow-hidden mt-0 data-[state=inactive]:hidden">
                <div className="flex flex-col h-full gap-3 overflow-hidden">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs sm:text-sm font-medium">Style Guidelines</Label>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {styleGuidelines.length} chars
                    </span>
                  </div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">
                    Additional writing style instructions injected into the prompt via the {`{{style_guidelines}}`} placeholder.
                  </p>
                  <textarea
                    value={styleGuidelines}
                    onChange={(e) => setStyleGuidelines(e.target.value)}
                    className="flex-1 min-h-0 w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs sm:text-sm shadow-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] resize-none overflow-y-auto"
                    placeholder="Enter style guidelines..."
                    aria-label="Style guidelines"
                  />
                </div>
              </TabsContent>

              {/* Verbs Tab */}
              <TabsContent value="verbs" className="flex-1 overflow-hidden mt-0 data-[state=inactive]:hidden">
                <div className="flex flex-col h-full gap-3 overflow-hidden">
                  <div>
                    <Label className="text-xs sm:text-sm font-medium">Rank Verb Progression</Label>
                    <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
                      Action verbs used by rank. {displayRank ? `Current ratee: ${displayRank}` : "Showing all ranks."}
                    </p>
                  </div>
                  <ScrollArea className="flex-1 min-h-0 border rounded-md">
                    <div className="p-2 space-y-1">
                      {allRanks.map((rank) => {
                        const verbs = rankVerbs[rank as keyof RankVerbProgression];
                        if (!verbs) return null;
                        const isRateeRank = rank === displayRank;
                        return (
                          <div
                            key={rank}
                            className={cn(
                              "p-2 rounded-md transition-colors",
                              isRateeRank
                                ? "bg-primary/5 border border-primary/20"
                                : "bg-muted/30 hover:bg-muted/50"
                            )}
                          >
                            {editingRank === rank ? (
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-semibold">{rank}</span>
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => setEditingRank(null)}
                                      className="h-6 px-2 rounded text-[10px] hover:bg-muted transition-colors"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={() => updateRankVerbEntry(rank)}
                                      className="h-6 px-2 rounded text-[10px] bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                                    >
                                      Save
                                    </button>
                                  </div>
                                </div>
                                <div className="space-y-1.5">
                                  <div>
                                    <Label className="text-[10px] text-muted-foreground">Primary (comma separated)</Label>
                                    <Input
                                      value={editingVerbs.primary}
                                      onChange={(e) => setEditingVerbs({ ...editingVerbs, primary: e.target.value })}
                                      className="h-7 text-xs mt-0.5"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-[10px] text-muted-foreground">Secondary (comma separated)</Label>
                                    <Input
                                      value={editingVerbs.secondary}
                                      onChange={(e) => setEditingVerbs({ ...editingVerbs, secondary: e.target.value })}
                                      className="h-7 text-xs mt-0.5"
                                    />
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className={cn("text-xs font-semibold", isRateeRank && "text-primary")}>
                                      {rank}
                                    </span>
                                    {isRateeRank && (
                                      <Badge variant="outline" className="text-[8px] px-1 py-0 border-primary/30 text-primary">
                                        Active
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="mt-0.5 space-y-0.5">
                                    <p className="text-[10px] text-muted-foreground">
                                      <span className="font-medium">Primary:</span>{" "}
                                      {verbs.primary.join(", ")}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">
                                      <span className="font-medium">Secondary:</span>{" "}
                                      {verbs.secondary.join(", ")}
                                    </p>
                                  </div>
                                </div>
                                <button
                                  onClick={() => {
                                    setEditingRank(rank);
                                    setEditingVerbs({
                                      primary: verbs.primary.join(", "),
                                      secondary: verbs.secondary.join(", "),
                                    });
                                  }}
                                  className="h-6 px-1.5 rounded hover:bg-muted transition-colors shrink-0"
                                  aria-label={`Edit verbs for ${rank}`}
                                >
                                  <Pencil className="size-3 text-muted-foreground" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>
              </TabsContent>

              {/* Abbreviations Tab */}
              <TabsContent value="abbreviations" className="flex-1 overflow-hidden mt-0 data-[state=inactive]:hidden">
                <div className="flex flex-col h-full gap-3 overflow-hidden">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <Label className="text-xs sm:text-sm font-medium">Abbreviations</Label>
                      <p className="text-[10px] text-muted-foreground">{abbreviations.length} defined</p>
                    </div>
                    <button
                      onClick={() => setShowAddAbbrev(!showAddAbbrev)}
                      className="inline-flex items-center justify-center rounded-md h-7 px-2.5 text-xs border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      <Plus className="size-3 mr-1" />
                      Add
                    </button>
                  </div>

                  {showAddAbbrev && (
                    <div className="flex items-end gap-2 p-2.5 rounded-md border bg-muted/30 animate-in fade-in-0 duration-200">
                      <div className="flex-1 space-y-1">
                        <Label className="text-[10px]">Full Word</Label>
                        <Input
                          value={newAbbrev.word}
                          onChange={(e) => setNewAbbrev({ ...newAbbrev, word: e.target.value })}
                          placeholder="maintenance"
                          className="h-7 text-xs"
                          onKeyDown={(e) => e.key === "Enter" && handleAddAbbrev()}
                        />
                      </div>
                      <div className="flex-1 space-y-1">
                        <Label className="text-[10px]">Abbreviation</Label>
                        <Input
                          value={newAbbrev.abbreviation}
                          onChange={(e) => setNewAbbrev({ ...newAbbrev, abbreviation: e.target.value })}
                          placeholder="maint"
                          className="h-7 text-xs"
                          onKeyDown={(e) => e.key === "Enter" && handleAddAbbrev()}
                        />
                      </div>
                      <button
                        onClick={handleAddAbbrev}
                        disabled={!newAbbrev.word || !newAbbrev.abbreviation}
                        className="h-7 px-3 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0"
                      >
                        Add
                      </button>
                    </div>
                  )}

                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search abbreviations..."
                      value={abbrevSearch}
                      onChange={(e) => setAbbrevSearch(e.target.value)}
                      className="pl-8 h-7 text-xs"
                      aria-label="Search abbreviations"
                    />
                  </div>

                  <ScrollArea className="flex-1 min-h-0 border rounded-md">
                    <div className="p-1.5 space-y-1">
                      {filteredAbbreviations.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-8">
                          {abbreviations.length === 0 ? "No abbreviations yet. Add your first one above." : "No matches found."}
                        </p>
                      ) : (
                        filteredAbbreviations.map((abbrev, idx) => (
                          <div
                            key={`${abbrev.word}-${idx}`}
                            className="flex items-center justify-between gap-1.5 p-1.5 bg-muted/30 rounded group"
                          >
                            <div className="flex items-center gap-1 min-w-0 flex-1 text-xs">
                              <span className="font-medium truncate">{abbrev.word}</span>
                              <ArrowRight className="size-2.5 text-muted-foreground shrink-0" />
                              <span className="font-mono text-primary truncate">{abbrev.abbreviation}</span>
                            </div>
                            <button
                              onClick={() => handleRemoveAbbrev(abbrev.word)}
                              className="size-6 rounded inline-flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-destructive/10 transition-all shrink-0"
                              aria-label={`Remove ${abbrev.word}`}
                            >
                              <Trash2 className="size-3 text-destructive" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </TabsContent>

              {/* Acronyms Tab */}
              <TabsContent value="acronyms" className="flex-1 overflow-hidden mt-0 data-[state=inactive]:hidden">
                <div className="flex flex-col h-full gap-3 overflow-hidden">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <Label className="text-xs sm:text-sm font-medium">Acronyms</Label>
                      <p className="text-[10px] text-muted-foreground">{acronyms.length} approved</p>
                    </div>
                    <button
                      onClick={() => setShowAddAcronym(!showAddAcronym)}
                      className="inline-flex items-center justify-center rounded-md h-7 px-2.5 text-xs border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      <Plus className="size-3 mr-1" />
                      Add
                    </button>
                  </div>

                  {showAddAcronym && (
                    <div className="flex items-end gap-2 p-2.5 rounded-md border bg-muted/30 animate-in fade-in-0 duration-200">
                      <div className="flex-1 space-y-1">
                        <Label className="text-[10px]">Acronym</Label>
                        <Input
                          value={newAcronym.acronym}
                          onChange={(e) => setNewAcronym({ ...newAcronym, acronym: e.target.value })}
                          placeholder="AFSC"
                          className="h-7 text-xs"
                          onKeyDown={(e) => e.key === "Enter" && handleAddAcronym()}
                        />
                      </div>
                      <div className="flex-1 space-y-1">
                        <Label className="text-[10px]">Definition</Label>
                        <Input
                          value={newAcronym.definition}
                          onChange={(e) => setNewAcronym({ ...newAcronym, definition: e.target.value })}
                          placeholder="AIR FORCE SPECIALTY CODE"
                          className="h-7 text-xs"
                          onKeyDown={(e) => e.key === "Enter" && handleAddAcronym()}
                        />
                      </div>
                      <button
                        onClick={handleAddAcronym}
                        disabled={!newAcronym.acronym || !newAcronym.definition}
                        className="h-7 px-3 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0"
                      >
                        Add
                      </button>
                    </div>
                  )}

                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search acronyms..."
                      value={acronymSearch}
                      onChange={(e) => setAcronymSearch(e.target.value)}
                      className="pl-8 h-7 text-xs"
                      aria-label="Search acronyms"
                    />
                  </div>

                  <ScrollArea className="flex-1 min-h-0 border rounded-md">
                    <div className="p-1.5 space-y-1">
                      {filteredAcronyms.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-8">
                          No matches found.
                        </p>
                      ) : (
                        filteredAcronyms.map((acr) => (
                          <div
                            key={acr.acronym}
                            className="flex items-start justify-between gap-1.5 p-1.5 bg-muted/30 rounded group"
                          >
                            <div className="min-w-0 flex-1">
                              <span className="font-mono font-semibold text-primary text-xs">{acr.acronym}</span>
                              <span className="text-[10px] text-muted-foreground ml-1.5 break-words">{acr.definition}</span>
                            </div>
                            <button
                              onClick={() => handleRemoveAcronym(acr.acronym)}
                              className="size-6 rounded inline-flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-destructive/10 transition-all shrink-0"
                              aria-label={`Remove ${acr.acronym}`}
                            >
                              <Trash2 className="size-3 text-destructive" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
