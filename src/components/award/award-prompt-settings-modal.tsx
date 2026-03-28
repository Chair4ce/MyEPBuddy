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

// Award-specific defaults — independent from EPB
const DEFAULT_AWARD_SYSTEM_PROMPT = `You are an expert Air Force writer specializing in award nominations on AF Form 1206 using the current **narrative-style format** (mandated since October 2022 per DAFI 36-2406 and award guidance).

CRITICAL RULES - NEVER VIOLATE THESE:
1. Every statement MUST begin with "- " (dash space) followed by a single, standalone sentence that flows naturally when read aloud.
2. NEVER use em-dashes (--). This is STRICTLY FORBIDDEN under any circumstances.
3. NEVER use semicolons (;). Use ONLY commas to connect clauses into flowing sentences.
4. NEVER use slash abbreviations (e.g., "w/", "w/o"). Write out words fully.
5. Every statement MUST contain: 1) a strong action AND 2) cascading impacts (immediate → unit → mission/AF-level).
6. AVOID the word "the" where possible - it wastes characters (e.g., "led the team" → "led 4-mbr team").
7. CONSISTENCY: Use either "&" OR "and" throughout a statement - NEVER mix them. Prefer "&" when saving space.

SENTENCE STRUCTURE (CRITICAL - THE #1 RULE):
Each statement MUST be a grammatically correct, complete sentence. Board members scan quickly - they need clear, punchy statements digestible in 2-3 seconds.

**GRAMMAR RULES:**
- Each statement is ONE grammatically correct sentence - NOT a list of comma-spliced fragments
- Use participial phrases (ending in -ing) to connect related actions naturally instead of stacking past-tense verbs separated by commas
- When listing 3+ results or impacts, use "&" or "and" before the FINAL item (e.g., "improved X, strengthened Y & advanced Z")
- Maximum 2-3 main clauses per statement - do NOT string together 4+ comma-separated verb phrases
- Place the BIGGEST IMPACT at the END for punch
- Read aloud test: If it sounds like a bullet list or run-on sentence, rewrite it

**BAD (comma-spliced fragments, no conjunctions - NOT a real sentence):**
"- Guided 20 peers through NCO course, totaling 900 hrs, cultivated leadership talent, fortified team cohesion, directly supported SOUTHCOM CC's development goals."

**GOOD (proper grammar, participial phrases, conjunction before final item):**
"- Directed 14-module NCO course, delivering 900 instructional hrs to 20 peers, enhancing leadership capabilities & fortifying sq readiness in direct support of SOUTHCOM CC's professional development goal."

**MORE EXAMPLES OF CORRECT STRUCTURE:**
"- Led 12-person team in overhauling deployment processing line, slashing preparation time by 40% & enabling rapid response for 150 personnel, directly contributing to wing's Excellent UCI rating."
"- Managed $2.3M equipment account, identifying & resolving 47 discrepancies, recovering $180K in assets & driving 99.8% accountability rate across the squadron."

AF FORM 1206 CATEGORY HEADINGS:
The two standard headings for the 1206 are:
1. PERFORMANCE IN PRIMARY DUTY — Excellence, initiative, and mission accomplishment in core role.
2. WHOLE AIRMAN CONCEPT — Self-improvement, base involvement, community service, volunteer work, education, and leadership development.

ABBREVIATION POLICY (CRITICAL - DO NOT OVER-ABBREVIATE):
- Standard acronyms are ALLOWED: NCO, SNCO, SOUTHCOM, CC, MAJCOM, AF, DoD, etc.
- Common unit abbreviations are ALLOWED: sq, flt, wg, gp, mbr, Amn
- Time/measurement abbreviations are ALLOWED: hrs, mins, mo, yr
- NEVER create truncated or apostrophe abbreviations: "prof'l", "dvlpmt", "dev'd", "crse", "maint", "ldrshp", "trng"
- NEVER use slash abbreviations: "w/", "w/o", "b/c"
- When in doubt, SPELL OUT the full word
- ONLY abbreviate additional words if they appear in the user's abbreviation list below

BANNED VERBS - NEVER USE THESE (overused clichés):
- "Spearheaded" - the most overused verb in Air Force writing
- "Orchestrated" - overused
- "Synergized" - corporate buzzword, not military
- "Leveraged" - overused
- "Facilitated" - weak and overused
- "Utilized" - just say "used" or pick a stronger verb
- "Impacted" - vague and overused

VARIETY RULE: Each version you generate MUST start with a DIFFERENT action verb. Use varied, strong verbs:
Led, Directed, Managed, Commanded, Guided, Championed, Drove, Transformed, Pioneered, Modernized, Accelerated, Streamlined, Optimized, Enhanced, Elevated, Secured, Protected, Fortified, Trained, Mentored, Developed, Resolved, Eliminated, Delivered, Produced, Established, Coordinated, Integrated, Analyzed, Assessed, Negotiated, Saved, Recovered

BANNED FILLER CLOSERS (NEVER USE - these sound impressive but say nothing specific):
- "ensuring mission success" / "ensuring mission readiness"
- "bolstering global ops" / "bolstering global operations"
- "vital to force projection"
- "critical to national defense"
The ending MUST be SPECIFIC to THIS accomplishment's actual impact with real metrics, beneficiaries, or outcomes.

RANK-APPROPRIATE STYLE FOR {{ratee_rank}}:
Primary action verbs to use: {{primary_verbs}}
{{rank_verb_guidance}}

ADDITIONAL STYLE GUIDANCE:
{{style_guidelines}}

WORD ABBREVIATIONS (ONLY abbreviate words from this list - spell out everything else):
{{abbreviations_list}}

ACRONYMS REFERENCE:
{{acronyms_list}}`;

const DEFAULT_AWARD_STYLE_GUIDELINES = `MAXIMIZE density for 1206 space constraints. Write in active voice. Chain impacts: action → immediate result → organizational benefit. Always quantify: numbers, percentages, dollars, time, personnel. Connect to mission readiness, compliance, or strategic goals. Spell out words fully unless listed in the user's abbreviation list.`;

const DEFAULT_AWARD_RANK_VERBS: RankVerbProgression = {
  AB: { primary: ["Assisted", "Supported", "Performed"], secondary: ["Helped", "Contributed", "Participated"] },
  Amn: { primary: ["Assisted", "Supported", "Performed"], secondary: ["Helped", "Contributed", "Executed"] },
  A1C: { primary: ["Executed", "Performed", "Supported"], secondary: ["Assisted", "Contributed", "Maintained"] },
  SrA: { primary: ["Executed", "Coordinated", "Managed"], secondary: ["Led", "Supervised", "Trained"] },
  SSgt: { primary: ["Led", "Managed", "Directed"], secondary: ["Supervised", "Coordinated", "Developed"] },
  TSgt: { primary: ["Led", "Managed", "Directed"], secondary: ["Drove", "Guided", "Championed"] },
  MSgt: { primary: ["Directed", "Drove", "Guided"], secondary: ["Championed", "Transformed", "Pioneered"] },
  SMSgt: { primary: ["Drove", "Championed", "Transformed"], secondary: ["Pioneered", "Modernized", "Elevated"] },
  CMSgt: { primary: ["Championed", "Transformed", "Pioneered"], secondary: ["Modernized", "Institutionalized", "Shaped"] },
  "2d Lt": { primary: ["Led", "Managed", "Coordinated"], secondary: ["Supervised", "Executed", "Developed"] },
  "1st Lt": { primary: ["Led", "Managed", "Directed"], secondary: ["Coordinated", "Supervised", "Developed"] },
  "Capt": { primary: ["Directed", "Led", "Managed"], secondary: ["Drove", "Coordinated", "Championed"] },
  "Maj": { primary: ["Directed", "Drove", "Guided"], secondary: ["Championed", "Transformed", "Led"] },
  "Lt Col": { primary: ["Drove", "Championed", "Guided"], secondary: ["Transformed", "Directed", "Pioneered"] },
  "Col": { primary: ["Championed", "Transformed", "Guided"], secondary: ["Pioneered", "Shaped", "Directed"] },
  "Brig Gen": { primary: ["Championed", "Transformed", "Pioneered"], secondary: ["Shaped", "Institutionalized", "Modernized"] },
  "Maj Gen": { primary: ["Transformed", "Pioneered", "Shaped"], secondary: ["Institutionalized", "Modernized", "Championed"] },
  "Lt Gen": { primary: ["Pioneered", "Shaped", "Institutionalized"], secondary: ["Modernized", "Transformed", "Championed"] },
  "Gen": { primary: ["Shaped", "Institutionalized", "Modernized"], secondary: ["Pioneered", "Transformed", "Championed"] },
};

const AWARD_PLACEHOLDERS = [
  { key: "{{ratee_rank}}", description: "The rank of the nominee" },
  { key: "{{primary_verbs}}", description: "Primary action verbs for the rank" },
  { key: "{{rank_verb_guidance}}", description: "Full verb guidance for the rank" },
  { key: "{{style_guidelines}}", description: "Award style guidelines" },
  { key: "{{abbreviations_list}}", description: "Word abbreviation mappings" },
  { key: "{{acronyms_list}}", description: "Acronym definitions" },
] as const;

interface AwardPromptSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nomineeRank?: Rank | null;
}

export function AwardPromptSettingsModal({ open, onOpenChange, nomineeRank: nomineeRankProp }: AwardPromptSettingsModalProps) {
  const { profile } = useUserStore();
  const nomineeRank = nomineeRankProp ?? null;
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasExistingSettings, setHasExistingSettings] = useState(false);

  // Award-specific state
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_AWARD_SYSTEM_PROMPT);
  const [styleGuidelines, setStyleGuidelines] = useState(DEFAULT_AWARD_STYLE_GUIDELINES);
  const [rankVerbs, setRankVerbs] = useState<RankVerbProgression>(DEFAULT_AWARD_RANK_VERBS);
  const [abbreviations, setAbbreviations] = useState<Abbreviation[]>([]);
  // Acronyms are shared with EPB
  const [acronyms, setAcronyms] = useState<Acronym[]>(DEFAULT_ACRONYMS);

  // Initial copies for change detection
  const [initialSystemPrompt, setInitialSystemPrompt] = useState(DEFAULT_AWARD_SYSTEM_PROMPT);
  const [initialStyleGuidelines, setInitialStyleGuidelines] = useState(DEFAULT_AWARD_STYLE_GUIDELINES);
  const [initialRankVerbs, setInitialRankVerbs] = useState<RankVerbProgression>(DEFAULT_AWARD_RANK_VERBS);
  const [initialAbbreviations, setInitialAbbreviations] = useState<Abbreviation[]>([]);
  const [initialAcronyms, setInitialAcronyms] = useState<Acronym[]>(DEFAULT_ACRONYMS);

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
      JSON.stringify(abbreviations) !== JSON.stringify(initialAbbreviations) ||
      JSON.stringify(acronyms) !== JSON.stringify(initialAcronyms)
    );
  }, [systemPrompt, styleGuidelines, rankVerbs, abbreviations, acronyms, initialSystemPrompt, initialStyleGuidelines, initialRankVerbs, initialAbbreviations, initialAcronyms]);

  const loadSettings = useCallback(async () => {
    if (!profile) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_llm_settings")
        .select("award_system_prompt, award_style_guidelines, award_rank_verb_progression, award_abbreviations, acronyms")
        .eq("user_id", profile.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setHasExistingSettings(true);
        const s = data as unknown as Pick<UserLLMSettings, "award_system_prompt" | "award_style_guidelines" | "award_rank_verb_progression" | "award_abbreviations" | "acronyms">;
        setSystemPrompt(s.award_system_prompt || DEFAULT_AWARD_SYSTEM_PROMPT);
        setStyleGuidelines(s.award_style_guidelines || DEFAULT_AWARD_STYLE_GUIDELINES);
        setRankVerbs(s.award_rank_verb_progression || DEFAULT_AWARD_RANK_VERBS);
        setAbbreviations(s.award_abbreviations || []);
        setAcronyms(s.acronyms || DEFAULT_ACRONYMS);

        setInitialSystemPrompt(s.award_system_prompt || DEFAULT_AWARD_SYSTEM_PROMPT);
        setInitialStyleGuidelines(s.award_style_guidelines || DEFAULT_AWARD_STYLE_GUIDELINES);
        setInitialRankVerbs(JSON.parse(JSON.stringify(s.award_rank_verb_progression || DEFAULT_AWARD_RANK_VERBS)));
        setInitialAbbreviations(JSON.parse(JSON.stringify(s.award_abbreviations || [])));
        setInitialAcronyms(JSON.parse(JSON.stringify(s.acronyms || DEFAULT_ACRONYMS)));
      } else {
        setInitialSystemPrompt(DEFAULT_AWARD_SYSTEM_PROMPT);
        setInitialStyleGuidelines(DEFAULT_AWARD_STYLE_GUIDELINES);
        setInitialRankVerbs(JSON.parse(JSON.stringify(DEFAULT_AWARD_RANK_VERBS)));
        setInitialAbbreviations([]);
        setInitialAcronyms(JSON.parse(JSON.stringify(DEFAULT_ACRONYMS)));
      }
    } catch (error) {
      console.error("Failed to load award prompt settings:", error);
      toast.error("Failed to load award prompt settings");
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
        award_system_prompt: systemPrompt,
        award_style_guidelines: styleGuidelines,
        award_rank_verb_progression: rankVerbs,
        award_abbreviations: abbreviations,
        acronyms,
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
      setInitialAbbreviations(JSON.parse(JSON.stringify(abbreviations)));
      setInitialAcronyms(JSON.parse(JSON.stringify(acronyms)));

      toast.success("Award prompt settings saved");
    } catch (error) {
      console.error("Failed to save award prompt settings:", error);
      toast.error("Failed to save award prompt settings");
    } finally {
      setIsSaving(false);
    }
  };

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleResetToDefaults = () => {
    setSystemPrompt(DEFAULT_AWARD_SYSTEM_PROMPT);
    setShowResetConfirm(false);
    toast.success("Award system prompt reset to default (save to apply)");
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
    return AWARD_PLACEHOLDERS.map((p) => ({
      ...p,
      isUsed: systemPrompt.includes(p.key),
    }));
  }, [systemPrompt]);

  const displayRank = nomineeRank || null;
  const allRanks = [...ENLISTED_RANKS, ...OFFICER_RANKS].map((r) => r.value);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-2xl lg:max-w-4xl h-[85vh] sm:h-[88vh] !flex !flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base sm:text-lg flex items-center gap-2">
                <Settings2 className="size-4 sm:size-5 shrink-0" />
                Award Prompt Settings
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm mt-0.5">
                Customize the AI prompt for generating AF Form 1206 award statements
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
                      <Label className="text-xs sm:text-sm font-medium">Award System Prompt</Label>
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
                    aria-label="Award system prompt"
                  />
                </div>
              </TabsContent>

              {/* Style Guidelines Tab */}
              <TabsContent value="style" className="flex-1 overflow-hidden mt-0 data-[state=inactive]:hidden">
                <div className="flex flex-col h-full gap-3 overflow-hidden">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-xs sm:text-sm font-medium">Award Style Guidelines</Label>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {styleGuidelines.length} chars
                    </span>
                  </div>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">
                    Writing style rules for AF Form 1206 award statements, injected via the {`{{style_guidelines}}`} placeholder.
                  </p>
                  <textarea
                    value={styleGuidelines}
                    onChange={(e) => setStyleGuidelines(e.target.value)}
                    className="flex-1 min-h-0 w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs sm:text-sm shadow-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] resize-none overflow-y-auto"
                    placeholder="Enter award style guidelines..."
                    aria-label="Award style guidelines"
                  />
                </div>
              </TabsContent>

              {/* Verbs Tab */}
              <TabsContent value="verbs" className="flex-1 overflow-hidden mt-0 data-[state=inactive]:hidden">
                <div className="flex flex-col h-full gap-3 overflow-hidden">
                  <div>
                    <Label className="text-xs sm:text-sm font-medium">Award Verb Progression</Label>
                    <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
                      Action verbs by rank for 1206 statements. {displayRank ? `Current nominee: ${displayRank}` : "Showing all ranks."}
                    </p>
                  </div>
                  <ScrollArea className="flex-1 min-h-0 border rounded-md">
                    <div className="p-2 space-y-1">
                      {allRanks.map((rank) => {
                        const verbs = rankVerbs[rank as keyof RankVerbProgression];
                        if (!verbs) return null;
                        const isNomineeRank = rank === displayRank;
                        return (
                          <div
                            key={rank}
                            className={cn(
                              "p-2 rounded-md transition-colors",
                              isNomineeRank
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
                                    <span className={cn("text-xs font-semibold", isNomineeRank && "text-primary")}>
                                      {rank}
                                    </span>
                                    {isNomineeRank && (
                                      <Badge variant="outline" className="text-[8px] px-1 py-0 border-primary/30 text-primary">
                                        Nominee
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
                      <Label className="text-xs sm:text-sm font-medium">Award Abbreviations</Label>
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

              {/* Acronyms Tab (shared with EPB) */}
              <TabsContent value="acronyms" className="flex-1 overflow-hidden mt-0 data-[state=inactive]:hidden">
                <div className="flex flex-col h-full gap-3 overflow-hidden">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <Label className="text-xs sm:text-sm font-medium">Acronyms</Label>
                      <p className="text-[10px] text-muted-foreground">{acronyms.length} approved (shared across EPB &amp; Awards)</p>
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
