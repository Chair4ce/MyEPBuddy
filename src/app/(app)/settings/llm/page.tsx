"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useUserStore } from "@/stores/user-store";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/components/ui/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DEFAULT_ACRONYMS } from "@/lib/default-acronyms";
// DEFAULT_ABBREVIATIONS removed - abbreviations start empty for new users
import {
  Save,
  Loader2,
  Plus,
  Trash2,
  Pencil,
  RotateCcw,
  Settings,
  FileText,
  BookOpen,
  Wand2,
  Search,
  ArrowRight,
  Target,
  Info,
  Users,
  Sparkles,
} from "lucide-react";
import type { UserLLMSettings, Acronym, Abbreviation, RankVerbProgression, AwardSentencesPerCategory, MPADescriptions, Rank } from "@/types/database";
import { RANKS, STANDARD_MGAS, AWARD_1206_CATEGORIES, DEFAULT_AWARD_SENTENCES, DEFAULT_MPA_DESCRIPTIONS, ENTRY_MGAS, getStaticCloseoutDate, getActiveCycleYear, isOfficer, ENLISTED_RANKS, OFFICER_RANKS, CIVILIAN_RANK, DEFAULT_OPB_SYSTEM_PROMPT, DEFAULT_OPB_STYLE_GUIDELINES } from "@/lib/constants";
import Link from "next/link";
import { Award, Medal } from "lucide-react";

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

// Default award system prompt (AF Form 1206)
const DEFAULT_AWARD_SYSTEM_PROMPT = `You are an expert Air Force writer specializing in award nominations on AF Form 1206 using the current **narrative-style format** (mandated since October 2022 per DAFI 36-2406 and award guidance).

Key guidelines for narrative-style statements:
- Write clear, concise, plain-language paragraphs (1-3 sentences each; treat each as a standalone statement).
- Each statement MUST be dense and high-impact: clearly describe the nominee's Action, cascading Results (immediate → unit → mission/AF-level), and broader Impact.
- Start with a strong action verb in active voice; use third-person (e.g., "SSgt Smith led...") or implied subject for flow.
- Quantify everything possible: numbers, percentages, dollar amounts, time saved, personnel affected, sorties generated, readiness rates, etc.
- Chain impacts: "accomplished X, enabling Y, which drove Z across the squadron/wing/AF."
- Connect to larger context: readiness, lethality, deployment capability, inspections (UCI, CCIP, etc.), strategic goals, or Air Force priorities.
- Avoid fluff, vague words, excessive acronyms (explain on first use if needed), or personal pronouns unless natural.
- Use em-dashes (--) or commas to connect clauses; NEVER use semicolons.

CHARACTER UTILIZATION STRATEGY (CRITICAL FOR 1206 SPACE CONSTRAINTS):
The AF Form 1206 has no fixed character limit but is severely constrained by physical line/space fitting in the PDF form. Statements must maximize density to fit more content without overflowing lines.
- AIM for high-density statements: Expand impacts with cascading effects, add mission context, chain results, and quantify aggressively.
- Target 300-500 characters per statement to fill available space effectively.
- Prioritize narrow characters (e.g., i, l, t over m, w) where natural; use standard abbreviations to reduce width.

Standard headings (use exactly, in ALL CAPS):
- EXECUTING THE MISSION
- LEADING PEOPLE
- IMPROVING THE UNIT
- MANAGING RESOURCES

RANK-APPROPRIATE STYLE FOR {{ratee_rank}}:
Primary action verbs to use: {{primary_verbs}}
{{rank_verb_guidance}}

WORD ABBREVIATIONS (AUTO-APPLY):
{{abbreviations_list}}`;

const DEFAULT_AWARD_STYLE_GUIDELINES = `MAXIMIZE density for 1206 space constraints. Write in active voice. Chain impacts: action → immediate result → organizational benefit. Always quantify: numbers, percentages, dollars, time, personnel. Connect to mission readiness, compliance, or strategic goals. Use standard AF abbreviations liberally.`;

// Default decoration system prompt (citations - everything spelled out, no abbreviations/acronyms)
const DEFAULT_DECORATION_SYSTEM_PROMPT = `You are an expert Air Force decoration citation writer with extensive knowledge of DAFMAN 36-2806 and MyDecs Reimagined (October 2022+).

## FORMAT RULES (MyDecs Reimagined)

1. **ABBREVIATIONS** - Authorized ONLY if on DAF approved abbreviations list
   - Geographic locations: spell out first reference
   - Unit designations: can use common abbreviations (Sqdn, Gp, Wg)
   - NEVER abbreviate member's rank or name
   - Common approved abbreviations: NCO, SNCO, DoD, TDY, ISR

2. **NO SYMBOLS** except the dollar sign ($)
   - Write "percent" not "%"

3. **NUMBERS**
   - 1-9: spell out (one, two, three) unless space-constrained
   - 10+: numerals are acceptable

4. **DATE FORMAT** - No leading zeros (use "1 January" not "01 January")

5. **RANK FORMATTING**
   - First mention: Full rank with name
   - Subsequent mentions: Short rank with last name
   - Never separate rank from name

RANK-APPROPRIATE STYLE FOR {{ratee_rank}}:
Primary action verbs to use: {{primary_verbs}}
{{rank_verb_guidance}}

## CITATION STRUCTURE

### NARRATIVE (Your Focus)
- Start with: "During this period," or "In this important assignment,"
- 2-4 sentences describing accomplishments with quantified impacts
- Use transitions: "Additionally," "Furthermore," "Moreover," "Finally,"
- Each accomplishment should have: ACTION → SCOPE → IMPACT

## QUALITY STANDARDS

- Capture SUBSTANCE with DIGNITY and CLARITY
- Use ACTIVE VOICE and FORCEFUL VERBS
- Be SPECIFIC with facts and metrics
- Emphasize MISSION CONTRIBUTION
- Flow naturally as a single cohesive narrative`;

const DEFAULT_DECORATION_STYLE_GUIDELINES = `Write with dignity and clarity suitable for official military documentation. Use active voice and forceful verbs. Be specific with facts and metrics. Emphasize mission contribution. Do NOT use abbreviations or acronyms unless on the DAF approved list. Spell out all numbers under 10. Write "percent" not "%".`;

// Default duty description prompt (present tense, scope/responsibility, not performance)
const DEFAULT_DUTY_DESCRIPTION_PROMPT = `You are an expert Air Force writer helping to revise a DUTY DESCRIPTION for an EPB (Enlisted Performance Brief).

**⚠️ THIS IS A DUTY DESCRIPTION - NOT A PERFORMANCE STATEMENT ⚠️**

A duty description describes the member's CURRENT ROLE, SCOPE, and RESPONSIBILITIES.
It is purely factual and descriptive - it states WHAT the member's job encompasses, NOT how well they perform.

**DUTY DESCRIPTION WRITING RULES:**
1. USE PRESENT TENSE - describes a current, ongoing role (e.g., "drives", "supports", "coordinates", "manages")
2. NEVER use past tense performance verbs (e.g., "led", "directed", "ensured", "bolstered", "enhanced")
3. NEVER use subjective performance adjectives (e.g., "expertly", "skillfully", "effectively", "proficiently")
4. NEVER add accomplishment results or impact language (e.g., "ensured seamless integration", "bolstered command capabilities")
5. Describe SCOPE and RESPONSIBILITY - team size, mission area, organizations supported, programs owned
6. Use descriptive framing like "As a [role]", "Serving as [position]", or direct present-tense descriptions
7. Do NOT invent new facts or add scope that isn't in the original - only rephrase existing content

**GOOD DUTY DESCRIPTION VERBS (present tense, descriptive):**
drives, supports, coordinates, manages, oversees, advises, maintains, provides, enables, serves as, operates, sustains, ensures (only for describing an ongoing responsibility), administers, represents, liaises, synchronizes, integrates, conducts, facilitates, monitors, evaluates, governs, directs (present tense only)

**BAD - NEVER USE THESE IN DUTY DESCRIPTIONS:**
- Past-tense performance verbs: led, directed, managed, executed, ensured (past), bolstered, enhanced, strengthened, championed, pioneered
- Subjective adjectives: expertly, skillfully, proficiently, adeptly, effectively, seamlessly
- Accomplishment/result language: "resulting in", "enabling X% improvement", "saving $X", "bolstering capabilities"
- Cliché openers: "Charged as", "Selected as", "Piloted" (these imply performance, not scope)

**EXAMPLE - CORRECT DUTY DESCRIPTION STYLE:**
"As a crew operations subject matter expert, he drives a 3-member cyber event coordination team during a numbered AF transition, supporting the elevation of AFSOUTH to a Service Component Command and establishing AFSOUTH's first ever MAJCOM Cyber Coordination Center."

**PRESERVE THESE EXACTLY (never change):**
- All numbers and metrics
- Acronyms and organizational names
- Team sizes and specific scope details

CRITICAL RULES:
1. PRESENT TENSE ONLY
2. NO performance adjectives
3. NO accomplishment results beyond describing the role's scope
4. KEEP factual content identical - only rephrase, do not invent new scope
5. Prefer "&" over "and" when saving space
6. AVOID the word "the" where possible - it wastes characters`;

const DEFAULT_RANK_VERBS: RankVerbProgression = {
  // Enlisted Ranks
  AB: { primary: ["Assisted", "Supported", "Performed"], secondary: ["Helped", "Contributed", "Participated"] },
  Amn: { primary: ["Assisted", "Supported", "Performed"], secondary: ["Helped", "Contributed", "Executed"] },
  A1C: { primary: ["Executed", "Performed", "Supported"], secondary: ["Assisted", "Contributed", "Maintained"] },
  SrA: { primary: ["Executed", "Coordinated", "Managed"], secondary: ["Led", "Supervised", "Trained"] },
  SSgt: { primary: ["Led", "Managed", "Directed"], secondary: ["Supervised", "Coordinated", "Developed"] },
  TSgt: { primary: ["Led", "Managed", "Directed"], secondary: ["Spearheaded", "Orchestrated", "Championed"] },
  MSgt: { primary: ["Directed", "Spearheaded", "Orchestrated"], secondary: ["Championed", "Transformed", "Pioneered"] },
  SMSgt: { primary: ["Spearheaded", "Orchestrated", "Championed"], secondary: ["Transformed", "Pioneered", "Revolutionized"] },
  CMSgt: { primary: ["Championed", "Transformed", "Pioneered"], secondary: ["Revolutionized", "Institutionalized", "Shaped"] },
  // Officer Ranks
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


// Available placeholders for system prompt
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

// Component to show placeholder status
function PlaceholderStatus({ systemPrompt }: { systemPrompt: string }) {
  const placeholderStatus = useMemo(() => {
    return AVAILABLE_PLACEHOLDERS.map((p) => ({
      ...p,
      isUsed: systemPrompt.includes(p.key),
    }));
  }, [systemPrompt]);

  const usedCount = placeholderStatus.filter((p) => p.isUsed).length;
  const missingCount = placeholderStatus.length - usedCount;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-[10px] sm:text-xs text-muted-foreground">
          Placeholders
        </Label>
        <span className="text-[10px] sm:text-xs text-muted-foreground">
          {usedCount}/{placeholderStatus.length}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {placeholderStatus.map((p) => (
          <Tooltip key={p.key}>
            <TooltipTrigger asChild>
              <Badge
                variant={p.isUsed ? "secondary" : "outline"}
                className={cn(
                  "cursor-help font-mono text-[8px] sm:text-[10px] px-1 sm:px-1.5 py-0",
                  !p.isUsed && "opacity-50"
                )}
              >
                {p.key.replace(/\{\{|\}\}/g, '')}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[200px]">
              <p className="text-xs font-medium">{p.key}</p>
              <p className="text-[10px] text-muted-foreground">{p.description}</p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

// Separate component for abbreviations
function AbbreviationEditor({
  abbreviations,
  onChange,
}: {
  abbreviations: Abbreviation[];
  onChange: (abbreviations: Abbreviation[]) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [newAbbrev, setNewAbbrev] = useState({ word: "", abbreviation: "" });
  const [editingAbbrev, setEditingAbbrev] = useState<{ originalWord: string; word: string; abbreviation: string } | null>(null);

  const filteredAbbreviations = useMemo(() => {
    if (!searchQuery) return abbreviations;
    const query = searchQuery.toLowerCase();
    return abbreviations.filter(
      (a) =>
        a.word.toLowerCase().includes(query) ||
        a.abbreviation.toLowerCase().includes(query)
    );
  }, [abbreviations, searchQuery]);

  const handleAdd = useCallback(() => {
    if (!newAbbrev.word || !newAbbrev.abbreviation) return;
    
    if (abbreviations.some((a) => a.word.toLowerCase() === newAbbrev.word.toLowerCase())) {
      toast.error("This word already has an abbreviation");
      return;
    }

    const updated = [
      ...abbreviations,
      { word: newAbbrev.word.toLowerCase(), abbreviation: newAbbrev.abbreviation },
    ].sort((a, b) => a.word.localeCompare(b.word));
    
    onChange(updated);
    setNewAbbrev({ word: "", abbreviation: "" });
    setShowAddDialog(false);
    toast.success("Abbreviation added");
  }, [abbreviations, newAbbrev, onChange]);

  const handleEdit = useCallback((abbrev: Abbreviation) => {
    setEditingAbbrev({ originalWord: abbrev.word, word: abbrev.word, abbreviation: abbrev.abbreviation });
    setShowEditDialog(true);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingAbbrev || !editingAbbrev.word || !editingAbbrev.abbreviation) return;
    
    // Check if the new word conflicts with another existing abbreviation (but not itself)
    if (editingAbbrev.word !== editingAbbrev.originalWord && 
        abbreviations.some((a) => a.word.toLowerCase() === editingAbbrev.word.toLowerCase())) {
      toast.error("This word already has an abbreviation");
      return;
    }

    const updated = abbreviations
      .map((a) => a.word === editingAbbrev.originalWord 
        ? { word: editingAbbrev.word.toLowerCase(), abbreviation: editingAbbrev.abbreviation } 
        : a
      )
      .sort((a, b) => a.word.localeCompare(b.word));
    
    onChange(updated);
    setEditingAbbrev(null);
    setShowEditDialog(false);
    toast.success("Abbreviation updated");
  }, [abbreviations, editingAbbrev, onChange]);

  const handleRemove = useCallback((word: string) => {
    onChange(abbreviations.filter((a) => a.word !== word));
  }, [abbreviations, onChange]);

  return (
    <Card className="w-full">
      <CardHeader className="px-3 py-3 sm:px-6 sm:py-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base sm:text-lg">Abbreviations</CardTitle>
            <CardDescription className="text-xs sm:text-sm mt-0.5">
              {abbreviations.length} defined
            </CardDescription>
          </div>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8 px-2 sm:px-3 flex-shrink-0">
                <Plus className="size-3.5 sm:mr-1.5" />
                <span className="hidden sm:inline">Add</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-base">Add Abbreviation</DialogTitle>
                <DialogDescription className="text-xs sm:text-sm">
                  Enter word and abbreviation
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs sm:text-sm">Full Word</Label>
                  <Input
                    value={newAbbrev.word}
                    onChange={(e) => setNewAbbrev({ ...newAbbrev, word: e.target.value })}
                    placeholder="maintenance"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs sm:text-sm">Abbreviation</Label>
                  <Input
                    value={newAbbrev.abbreviation}
                    onChange={(e) => setNewAbbrev({ ...newAbbrev, abbreviation: e.target.value })}
                    placeholder="maint"
                    className="h-9 text-sm"
                  />
                </div>
              </div>
              <DialogFooter className="flex-col gap-2 sm:flex-row">
                <Button onClick={handleAdd} className="w-full sm:w-auto">Add</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">Edit Abbreviation</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Modify word or abbreviation
            </DialogDescription>
          </DialogHeader>
          {editingAbbrev && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm">Full Word</Label>
                <Input
                  value={editingAbbrev.word}
                  onChange={(e) => setEditingAbbrev({ ...editingAbbrev, word: e.target.value })}
                  placeholder="maintenance"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm">Abbreviation</Label>
                <Input
                  value={editingAbbrev.abbreviation}
                  onChange={(e) => setEditingAbbrev({ ...editingAbbrev, abbreviation: e.target.value })}
                  placeholder="maint"
                  className="h-9 text-sm"
                />
              </div>
            </div>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setShowEditDialog(false)} className="w-full sm:w-auto">Cancel</Button>
            <Button onClick={handleSaveEdit} className="w-full sm:w-auto">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CardContent className="px-3 pb-4 sm:px-6 sm:pb-6 space-y-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 sm:h-9 text-sm"
            aria-label="Search abbreviations"
          />
        </div>
        
        {/* Mobile: Card layout */}
        <ScrollArea className="h-[300px] sm:h-[400px] border rounded-md md:hidden">
          <div className="p-1.5 space-y-1">
            {filteredAbbreviations.map((abbrev, idx) => (
              <div 
                key={`${abbrev.word}-${idx}`} 
                className="flex items-center justify-between gap-1.5 p-2 bg-muted/30 rounded"
              >
                <div className="flex items-center gap-1 min-w-0 flex-1 text-xs sm:text-sm">
                  <span className="font-medium truncate max-w-[80px] sm:max-w-none">{abbrev.word}</span>
                  <ArrowRight className="size-2.5 text-muted-foreground flex-shrink-0" />
                  <span className="font-mono text-primary truncate">{abbrev.abbreviation}</span>
                </div>
                <div className="flex items-center flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(abbrev)}
                    className="size-7"
                    aria-label={`Edit ${abbrev.word}`}
                  >
                    <Pencil className="size-3 text-muted-foreground" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemove(abbrev.word)}
                    className="size-7"
                    aria-label={`Remove ${abbrev.word}`}
                  >
                    <Trash2 className="size-3 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Desktop: Table layout */}
        <ScrollArea className="h-[400px] border rounded-md hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky top-0 bg-background">Full Word</TableHead>
                <TableHead className="w-12 sticky top-0 bg-background"></TableHead>
                <TableHead className="sticky top-0 bg-background">Abbreviation</TableHead>
                <TableHead className="w-24 sticky top-0 bg-background text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAbbreviations.map((abbrev, idx) => (
                <TableRow key={`${abbrev.word}-${idx}`} className="group">
                  <TableCell className="font-medium">{abbrev.word}</TableCell>
                  <TableCell>
                    <ArrowRight className="size-4 text-muted-foreground" />
                  </TableCell>
                  <TableCell className="font-mono text-primary">{abbrev.abbreviation}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(abbrev)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label={`Edit ${abbrev.word}`}
                      >
                        <Pencil className="size-4 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemove(abbrev.word)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label={`Remove ${abbrev.word}`}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// Separate component for acronyms with search and virtualization
function AcronymEditor({
  acronyms,
  onChange,
}: {
  acronyms: Acronym[];
  onChange: (acronyms: Acronym[]) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newAcronym, setNewAcronym] = useState({ acronym: "", definition: "" });

  const filteredAcronyms = useMemo(() => {
    if (!searchQuery) return acronyms;
    const query = searchQuery.toLowerCase();
    return acronyms.filter(
      (a) =>
        a.acronym.toLowerCase().includes(query) ||
        a.definition.toLowerCase().includes(query)
    );
  }, [acronyms, searchQuery]);

  const handleAdd = useCallback(() => {
    if (!newAcronym.acronym || !newAcronym.definition) return;
    
    if (acronyms.some((a) => a.acronym === newAcronym.acronym.toUpperCase())) {
      toast.error("This acronym already exists");
      return;
    }

    const updated = [
      ...acronyms,
      { acronym: newAcronym.acronym.toUpperCase(), definition: newAcronym.definition.toUpperCase() },
    ].sort((a, b) => a.acronym.localeCompare(b.acronym));
    
    onChange(updated);
    setNewAcronym({ acronym: "", definition: "" });
    setShowAddDialog(false);
    toast.success("Acronym added");
  }, [acronyms, newAcronym, onChange]);

  const handleRemove = useCallback((acronym: string) => {
    onChange(acronyms.filter((a) => a.acronym !== acronym));
  }, [acronyms, onChange]);

  return (
    <Card className="w-full">
      <CardHeader className="px-3 py-3 sm:px-6 sm:py-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base sm:text-lg">Acronyms</CardTitle>
            <CardDescription className="text-xs sm:text-sm mt-0.5">
              {acronyms.length} approved
            </CardDescription>
          </div>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8 px-2 sm:px-3 flex-shrink-0">
                <Plus className="size-3.5 sm:mr-1.5" />
                <span className="hidden sm:inline">Add</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-base">Add Acronym</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs sm:text-sm">Acronym</Label>
                  <Input
                    value={newAcronym.acronym}
                    onChange={(e) => setNewAcronym({ ...newAcronym, acronym: e.target.value })}
                    placeholder="AFSC"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs sm:text-sm">Definition</Label>
                  <Input
                    value={newAcronym.definition}
                    onChange={(e) => setNewAcronym({ ...newAcronym, definition: e.target.value })}
                    placeholder="AIR FORCE SPECIALTY CODE"
                    className="h-9 text-sm"
                  />
                </div>
              </div>
              <DialogFooter className="flex-col gap-2 sm:flex-row">
                <Button onClick={handleAdd} className="w-full sm:w-auto">Add</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-4 sm:px-6 sm:pb-6 space-y-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 sm:h-9 text-sm"
            aria-label="Search acronyms"
          />
        </div>

        {/* Mobile: Card layout */}
        <ScrollArea className="h-[300px] sm:h-[400px] border rounded-md md:hidden">
          <div className="p-1.5 space-y-1">
            {filteredAcronyms.map((acr) => (
              <div 
                key={acr.acronym} 
                className="flex items-start justify-between gap-1.5 p-2 bg-muted/30 rounded"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-mono font-semibold text-primary text-xs sm:text-sm block">{acr.acronym}</span>
                  <span className="text-[10px] sm:text-xs text-muted-foreground break-words leading-tight">{acr.definition}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemove(acr.acronym)}
                  className="size-7 flex-shrink-0"
                  aria-label={`Remove ${acr.acronym}`}
                >
                  <Trash2 className="size-3 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Desktop: Table layout */}
        <ScrollArea className="h-[400px] border rounded-md hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32 sticky top-0 bg-background">Acronym</TableHead>
                <TableHead className="sticky top-0 bg-background">Definition</TableHead>
                <TableHead className="w-16 sticky top-0 bg-background"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAcronyms.map((acr) => (
                <TableRow key={acr.acronym} className="group">
                  <TableCell className="font-mono font-medium">{acr.acronym}</TableCell>
                  <TableCell className="text-sm">{acr.definition}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemove(acr.acronym)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label={`Remove ${acr.acronym}`}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// Type for stored settings state (excludes MPAs since they're not user-editable)
interface SettingsState {
  // SCOD date and cycle year are now computed from user's rank, not stored
  styleGuidelines: string;
  systemPrompt: string;
  rankVerbs: RankVerbProgression;
  acronyms: Acronym[];
  abbreviations: Abbreviation[];
  // MPA descriptions for relevancy scoring
  mpaDescriptions: MPADescriptions;
  // Award settings
  awardSystemPrompt: string;
  awardAbbreviations: Abbreviation[];
  awardStyleGuidelines: string;
  awardSentencesPerCategory: AwardSentencesPerCategory;
  // OPB settings (Officer Performance Brief)
  opbSystemPrompt: string;
  opbStyleGuidelines: string;
  // Decoration settings
  decorationSystemPrompt: string;
  decorationStyleGuidelines: string;
  decorationAbbreviations: Abbreviation[];
  // Duty description prompt (present tense, scope/responsibility)
  dutyDescriptionPrompt: string;
}

export default function LLMSettingsPage() {
  const { profile } = useUserStore();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshingSignatures, setIsRefreshingSignatures] = useState(false);
  const [hasExistingSettings, setHasExistingSettings] = useState(false);

  // SCOD date and cycle year are computed from the user's rank
  // These are standardized by AFI and should not be manually configured
  const userRank = profile?.rank as Rank | null;
  const scodInfo = getStaticCloseoutDate(userRank);
  const computedScodDate = scodInfo?.label || null;
  const computedCycleYear = getActiveCycleYear(userRank);
  
  // Check if user is an officer (ACA rubrics don't apply to officers)
  const userIsOfficer = isOfficer(userRank);
  
  // Separate state for each section to prevent unnecessary re-renders
  const [styleGuidelines, setStyleGuidelines] = useState(DEFAULT_STYLE_GUIDELINES);
  // MPAs are standardized by AFI 36-2406 and not user-editable
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [rankVerbs, setRankVerbs] = useState<RankVerbProgression>(DEFAULT_RANK_VERBS);
  const [acronyms, setAcronyms] = useState<Acronym[]>(DEFAULT_ACRONYMS);
  const [abbreviations, setAbbreviations] = useState<Abbreviation[]>([]);
  
  // MPA descriptions for relevancy scoring
  const [mpaDescriptions, setMpaDescriptions] = useState<MPADescriptions>(DEFAULT_MPA_DESCRIPTIONS);
  
  // Award-specific settings
  const [awardSystemPrompt, setAwardSystemPrompt] = useState(DEFAULT_AWARD_SYSTEM_PROMPT);
  const [awardAbbreviations, setAwardAbbreviations] = useState<Abbreviation[]>([]);
  const [awardStyleGuidelines, setAwardStyleGuidelines] = useState(DEFAULT_AWARD_STYLE_GUIDELINES);
  const [awardSentencesPerCategory, setAwardSentencesPerCategory] = useState<AwardSentencesPerCategory>(
    DEFAULT_AWARD_SENTENCES as unknown as AwardSentencesPerCategory
  );
  
  // OPB-specific settings (Officer Performance Brief)
  const [opbSystemPrompt, setOpbSystemPrompt] = useState(DEFAULT_OPB_SYSTEM_PROMPT);
  const [opbStyleGuidelines, setOpbStyleGuidelines] = useState(DEFAULT_OPB_STYLE_GUIDELINES);
  
  // Decoration-specific settings
  const [decorationSystemPrompt, setDecorationSystemPrompt] = useState(DEFAULT_DECORATION_SYSTEM_PROMPT);
  const [decorationStyleGuidelines, setDecorationStyleGuidelines] = useState(DEFAULT_DECORATION_STYLE_GUIDELINES);
  const [decorationAbbreviations, setDecorationAbbreviations] = useState<Abbreviation[]>([]);
  
  // Duty description prompt (present tense, scope/responsibility)
  const [dutyDescriptionPrompt, setDutyDescriptionPrompt] = useState(DEFAULT_DUTY_DESCRIPTION_PROMPT);

  // Track initial state to detect changes (use state, not ref, to trigger re-renders)
  const [initialState, setInitialState] = useState<SettingsState | null>(null);

  // Navigation interception state
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);

  // Dialog state for rank verb editing
  const [editingRank, setEditingRank] = useState<string | null>(null);
  const [editingVerbs, setEditingVerbs] = useState({ primary: "", secondary: "" });

  const supabase = createClient();

  // Check if there are unsaved changes
  // Note: SCOD date and cycle year are now computed from rank, not user-editable
  const hasChanges = useMemo(() => {
    if (!initialState || isLoading) return false;
    
    return (
      styleGuidelines !== initialState.styleGuidelines ||
      systemPrompt !== initialState.systemPrompt ||
      JSON.stringify(rankVerbs) !== JSON.stringify(initialState.rankVerbs) ||
      JSON.stringify(acronyms) !== JSON.stringify(initialState.acronyms) ||
      JSON.stringify(abbreviations) !== JSON.stringify(initialState.abbreviations) ||
      JSON.stringify(mpaDescriptions) !== JSON.stringify(initialState.mpaDescriptions) ||
      awardSystemPrompt !== initialState.awardSystemPrompt ||
      JSON.stringify(awardAbbreviations) !== JSON.stringify(initialState.awardAbbreviations) ||
      awardStyleGuidelines !== initialState.awardStyleGuidelines ||
      JSON.stringify(awardSentencesPerCategory) !== JSON.stringify(initialState.awardSentencesPerCategory) ||
      opbSystemPrompt !== initialState.opbSystemPrompt ||
      opbStyleGuidelines !== initialState.opbStyleGuidelines ||
      decorationSystemPrompt !== initialState.decorationSystemPrompt ||
      decorationStyleGuidelines !== initialState.decorationStyleGuidelines ||
      JSON.stringify(decorationAbbreviations) !== JSON.stringify(initialState.decorationAbbreviations) ||
      dutyDescriptionPrompt !== initialState.dutyDescriptionPrompt
    );
  }, [styleGuidelines, systemPrompt, rankVerbs, acronyms, abbreviations, mpaDescriptions, awardSystemPrompt, awardAbbreviations, awardStyleGuidelines, awardSentencesPerCategory, opbSystemPrompt, opbStyleGuidelines, decorationSystemPrompt, decorationStyleGuidelines, decorationAbbreviations, dutyDescriptionPrompt, isLoading, initialState]);

  // Warn user before leaving with unsaved changes (browser close/refresh)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasChanges) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasChanges]);

  // Intercept in-app navigation clicks when there are unsaved changes
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!hasChanges) return;
      
      const target = e.target as HTMLElement;
      const link = target.closest('a');
      
      if (link) {
        const href = link.getAttribute('href');
        // Only intercept internal navigation (not external links or same-page anchors)
        if (href && href.startsWith('/') && !href.startsWith('/settings/llm')) {
          e.preventDefault();
          e.stopPropagation();
          setPendingNavigation(href);
          setShowUnsavedDialog(true);
        }
      }
    };

    // Use capture phase to intercept before other handlers
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [hasChanges]);

  // Handle confirmed navigation after user chooses to discard changes
  const handleConfirmNavigation = useCallback(() => {
    if (pendingNavigation) {
      setShowUnsavedDialog(false);
      router.push(pendingNavigation);
      setPendingNavigation(null);
    }
  }, [pendingNavigation, router]);

  useEffect(() => {
    if (profile) {
      loadSettings();
    }
  }, [profile]);

  async function loadSettings() {
    if (!profile) return;
    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from("user_llm_settings")
        .select("*")
        .eq("user_id", profile.id)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data) {
        setHasExistingSettings(true);
        const settings = data as unknown as UserLLMSettings;
        // SCOD date and cycle year are now computed from rank, not loaded from settings
        const loadedStyleGuidelines = settings.style_guidelines;
        const loadedSystemPrompt = settings.base_system_prompt;
        const loadedRankVerbs = settings.rank_verb_progression;
        const loadedAcronyms = settings.acronyms;
        const loadedAbbreviations = settings.abbreviations || [];

        setStyleGuidelines(loadedStyleGuidelines);
        // MPAs are not user-editable, always use STANDARD_MGAS
        setSystemPrompt(loadedSystemPrompt);
        setRankVerbs(loadedRankVerbs);
        setAcronyms(loadedAcronyms);
        setAbbreviations(loadedAbbreviations);

        // Load MPA descriptions
        const loadedMpaDescriptions = settings.mpa_descriptions || DEFAULT_MPA_DESCRIPTIONS;
        setMpaDescriptions(loadedMpaDescriptions);

        // Load award settings
        const loadedAwardPrompt = settings.award_system_prompt || DEFAULT_AWARD_SYSTEM_PROMPT;
        const loadedAwardAbbreviations = settings.award_abbreviations || [];
        const loadedAwardStyleGuidelines = settings.award_style_guidelines || DEFAULT_AWARD_STYLE_GUIDELINES;
        const loadedAwardSentences = settings.award_sentences_per_category || DEFAULT_AWARD_SENTENCES as unknown as AwardSentencesPerCategory;
        
        setAwardSystemPrompt(loadedAwardPrompt);
        setAwardAbbreviations(loadedAwardAbbreviations);
        setAwardStyleGuidelines(loadedAwardStyleGuidelines);
        setAwardSentencesPerCategory(loadedAwardSentences);

        // Load OPB settings
        const loadedOpbSystemPrompt = settings.opb_system_prompt || DEFAULT_OPB_SYSTEM_PROMPT;
        const loadedOpbStyleGuidelines = settings.opb_style_guidelines || DEFAULT_OPB_STYLE_GUIDELINES;
        
        setOpbSystemPrompt(loadedOpbSystemPrompt);
        setOpbStyleGuidelines(loadedOpbStyleGuidelines);

        // Load Decoration settings
        const loadedDecorationSystemPrompt = settings.decoration_system_prompt || DEFAULT_DECORATION_SYSTEM_PROMPT;
        const loadedDecorationStyleGuidelines = settings.decoration_style_guidelines || DEFAULT_DECORATION_STYLE_GUIDELINES;
        const loadedDecorationAbbreviations = settings.decoration_abbreviations || [];
        
        setDecorationSystemPrompt(loadedDecorationSystemPrompt);
        setDecorationStyleGuidelines(loadedDecorationStyleGuidelines);
        setDecorationAbbreviations(loadedDecorationAbbreviations);

        // Load Duty Description prompt
        const loadedDutyDescriptionPrompt = settings.duty_description_prompt || DEFAULT_DUTY_DESCRIPTION_PROMPT;
        setDutyDescriptionPrompt(loadedDutyDescriptionPrompt);

        // Store initial state for change detection (SCOD/cycle year now computed from rank)
        setInitialState({
          styleGuidelines: loadedStyleGuidelines,
          systemPrompt: loadedSystemPrompt,
          rankVerbs: JSON.parse(JSON.stringify(loadedRankVerbs)),
          acronyms: JSON.parse(JSON.stringify(loadedAcronyms)),
          abbreviations: JSON.parse(JSON.stringify(loadedAbbreviations)),
          mpaDescriptions: JSON.parse(JSON.stringify(loadedMpaDescriptions)),
          awardSystemPrompt: loadedAwardPrompt,
          awardAbbreviations: JSON.parse(JSON.stringify(loadedAwardAbbreviations)),
          awardStyleGuidelines: loadedAwardStyleGuidelines,
          awardSentencesPerCategory: JSON.parse(JSON.stringify(loadedAwardSentences)),
          opbSystemPrompt: loadedOpbSystemPrompt,
          opbStyleGuidelines: loadedOpbStyleGuidelines,
          decorationSystemPrompt: loadedDecorationSystemPrompt,
          decorationStyleGuidelines: loadedDecorationStyleGuidelines,
          decorationAbbreviations: JSON.parse(JSON.stringify(loadedDecorationAbbreviations)),
          dutyDescriptionPrompt: loadedDutyDescriptionPrompt,
        });
      } else {
        // No existing settings - store defaults as initial state
        setInitialState({
          styleGuidelines: DEFAULT_STYLE_GUIDELINES,
          systemPrompt: DEFAULT_SYSTEM_PROMPT,
          rankVerbs: JSON.parse(JSON.stringify(DEFAULT_RANK_VERBS)),
          acronyms: JSON.parse(JSON.stringify(DEFAULT_ACRONYMS)),
          abbreviations: [],
          mpaDescriptions: JSON.parse(JSON.stringify(DEFAULT_MPA_DESCRIPTIONS)),
          awardSystemPrompt: DEFAULT_AWARD_SYSTEM_PROMPT,
          awardAbbreviations: [],
          awardStyleGuidelines: DEFAULT_AWARD_STYLE_GUIDELINES,
          awardSentencesPerCategory: JSON.parse(JSON.stringify(DEFAULT_AWARD_SENTENCES)),
          opbSystemPrompt: DEFAULT_OPB_SYSTEM_PROMPT,
          opbStyleGuidelines: DEFAULT_OPB_STYLE_GUIDELINES,
          decorationSystemPrompt: DEFAULT_DECORATION_SYSTEM_PROMPT,
          decorationStyleGuidelines: DEFAULT_DECORATION_STYLE_GUIDELINES,
          decorationAbbreviations: [],
          dutyDescriptionPrompt: DEFAULT_DUTY_DESCRIPTION_PROMPT,
        });
      }
    } catch (error) {
      console.error("Error loading settings:", error);
      toast.error("Failed to load settings");
    } finally {
      setIsLoading(false);
    }
  }

  async function saveSettings() {
    if (!profile) return;
    setIsSaving(true);

    try {
      // SCOD date and cycle year are computed from rank
      const settingsData = {
        scod_date: computedScodDate || "Unknown",
        current_cycle_year: computedCycleYear,
        major_graded_areas: STANDARD_MGAS, // Always use standard MPAs
        rank_verb_progression: rankVerbs,
        style_guidelines: styleGuidelines,
        base_system_prompt: systemPrompt,
        acronyms: acronyms,
        abbreviations: abbreviations,
        // MPA descriptions for relevancy scoring
        mpa_descriptions: mpaDescriptions,
        // Award settings
        award_system_prompt: awardSystemPrompt,
        award_abbreviations: awardAbbreviations,
        award_style_guidelines: awardStyleGuidelines,
        award_sentences_per_category: awardSentencesPerCategory,
        // OPB settings
        opb_system_prompt: opbSystemPrompt,
        opb_style_guidelines: opbStyleGuidelines,
        // Decoration settings
        decoration_system_prompt: decorationSystemPrompt,
        decoration_style_guidelines: decorationStyleGuidelines,
        decoration_abbreviations: decorationAbbreviations,
        // Duty description prompt
        duty_description_prompt: dutyDescriptionPrompt,
      };

      if (hasExistingSettings) {
        await supabase
          .from("user_llm_settings")
          .update(settingsData as never)
          .eq("user_id", profile.id);
      } else {
        await supabase.from("user_llm_settings").insert({
          user_id: profile.id,
          ...settingsData,
        } as never);
        setHasExistingSettings(true);
      }

      // Update initial state to match saved state (SCOD/cycle year now computed from rank)
      setInitialState({
        styleGuidelines,
        systemPrompt,
        rankVerbs: JSON.parse(JSON.stringify(rankVerbs)),
        acronyms: JSON.parse(JSON.stringify(acronyms)),
        abbreviations: JSON.parse(JSON.stringify(abbreviations)),
        mpaDescriptions: JSON.parse(JSON.stringify(mpaDescriptions)),
        awardSystemPrompt,
        awardAbbreviations: JSON.parse(JSON.stringify(awardAbbreviations)),
        awardStyleGuidelines,
        awardSentencesPerCategory: JSON.parse(JSON.stringify(awardSentencesPerCategory)),
        opbSystemPrompt,
        opbStyleGuidelines,
        decorationSystemPrompt,
        decorationStyleGuidelines,
        decorationAbbreviations: JSON.parse(JSON.stringify(decorationAbbreviations)),
        dutyDescriptionPrompt,
      });

      toast.success("Settings saved successfully");
      return true;
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("Failed to save settings");
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  // Handle save and navigate
  async function handleSaveAndNavigate() {
    const saved = await saveSettings();
    if (saved && pendingNavigation) {
      router.push(pendingNavigation);
      setPendingNavigation(null);
    }
    setShowUnsavedDialog(false);
  }

  function resetToDefaults() {
    // SCOD date and cycle year are now computed from rank, not reset
    setStyleGuidelines(DEFAULT_STYLE_GUIDELINES);
    // MPAs are not user-editable, always use STANDARD_MGAS
    setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
    setRankVerbs(DEFAULT_RANK_VERBS);
    setAcronyms(DEFAULT_ACRONYMS);
    setAbbreviations([]);
    // Reset award settings
    setAwardSystemPrompt(DEFAULT_AWARD_SYSTEM_PROMPT);
    setAwardAbbreviations([]);
    setAwardStyleGuidelines(DEFAULT_AWARD_STYLE_GUIDELINES);
    setAwardSentencesPerCategory(DEFAULT_AWARD_SENTENCES as unknown as AwardSentencesPerCategory);
    // Reset decoration settings
    setDecorationSystemPrompt(DEFAULT_DECORATION_SYSTEM_PROMPT);
    setDecorationStyleGuidelines(DEFAULT_DECORATION_STYLE_GUIDELINES);
    // Reset duty description prompt
    setDutyDescriptionPrompt(DEFAULT_DUTY_DESCRIPTION_PROMPT);
    toast.success("Settings reset to defaults (save to apply)");
  }

  function updateRankVerbs(rank: string) {
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
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 sm:space-y-6 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-2xl font-bold tracking-tight">LLM Settings</h1>
            {hasChanges && (
              <Badge variant="secondary" className="text-[10px] sm:text-xs px-1.5 py-0 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                Unsaved
              </Badge>
            )}
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
            Customize your AI generation settings and system prompt
          </p>
        </div>
        <div className="flex gap-1.5 sm:gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={resetToDefaults} className="h-8 sm:h-9 px-2 sm:px-3">
            <RotateCcw className="size-3.5 sm:size-4" />
            <span className="hidden md:inline ml-2">Reset</span>
          </Button>
          {hasChanges && (
            <Button size="sm" onClick={saveSettings} disabled={isSaving} className="h-8 sm:h-9 px-2 sm:px-3">
              {isSaving ? <Loader2 className="size-3.5 sm:size-4 animate-spin" /> : <Save className="size-3.5 sm:size-4" />}
              <span className="hidden md:inline ml-2">Save</span>
            </Button>
          )}
        </div>
      </div>

      {/* Officer Notice */}
      {userIsOfficer && (
        <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Info className="size-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div className="space-y-2 min-w-0">
                <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                  Officer Performance Settings
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  As an officer, your OPB (Officer Performance Brief) uses narrative statements aligned with 
                  Airman Leadership Qualities (ALQs) per AFI 36-2406. The enlisted ACA rubrics don&apos;t apply to your personal evaluations, 
                  but these settings are still used when generating EPB statements for your enlisted subordinates.
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  Access your OPB workspace from the <Link href="/generate" className="underline hover:text-blue-500">Generate page</Link> using the &quot;My OPB&quot; toggle.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="general" className="w-full space-y-3 sm:space-y-4">
        <TabsList className={cn(
          "w-full h-auto p-1 grid gap-0.5",
          userIsOfficer ? "grid-cols-8" : "grid-cols-7"
        )}>
          <TabsTrigger value="general" className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 text-[10px] sm:text-xs px-1 sm:px-2.5 py-1.5 sm:py-2 data-[state=active]:text-foreground">
            <Settings className="size-4 sm:size-3.5 shrink-0" />
            <span className="hidden sm:inline">General</span>
          </TabsTrigger>
          <TabsTrigger value="epb-prompt" className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 text-[10px] sm:text-xs px-1 sm:px-2.5 py-1.5 sm:py-2 data-[state=active]:text-foreground">
            <Wand2 className="size-4 sm:size-3.5 shrink-0" />
            <span className="hidden sm:inline">EPB</span>
          </TabsTrigger>
          {userIsOfficer && (
            <TabsTrigger value="opb-prompt" className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 text-[10px] sm:text-xs px-1 sm:px-2.5 py-1.5 sm:py-2 data-[state=active]:text-foreground data-[state=active]:bg-blue-100 dark:data-[state=active]:bg-blue-900/30">
              <Sparkles className="size-4 sm:size-3.5 shrink-0" />
              <span className="hidden sm:inline">OPB</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="award-prompt" className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 text-[10px] sm:text-xs px-1 sm:px-2.5 py-1.5 sm:py-2 data-[state=active]:text-foreground">
            <Award className="size-4 sm:size-3.5 shrink-0" />
            <span className="hidden sm:inline">Award</span>
          </TabsTrigger>
          <TabsTrigger value="decoration-prompt" className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 text-[10px] sm:text-xs px-1 sm:px-2.5 py-1.5 sm:py-2 data-[state=active]:text-foreground">
            <Medal className="size-4 sm:size-3.5 shrink-0" />
            <span className="hidden sm:inline">Decs</span>
          </TabsTrigger>
          <TabsTrigger value="verbs" className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 text-[10px] sm:text-xs px-1 sm:px-2.5 py-1.5 sm:py-2 data-[state=active]:text-foreground">
            <FileText className="size-4 sm:size-3.5 shrink-0" />
            <span className="hidden sm:inline">Verbs</span>
          </TabsTrigger>
          <TabsTrigger value="abbreviations" className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 text-[10px] sm:text-xs px-1 sm:px-2.5 py-1.5 sm:py-2 data-[state=active]:text-foreground">
            <ArrowRight className="size-4 sm:size-3.5 shrink-0" />
            <span className="hidden sm:inline">Abbr</span>
          </TabsTrigger>
          <TabsTrigger value="acronyms" className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 text-[10px] sm:text-xs px-1 sm:px-2.5 py-1.5 sm:py-2 data-[state=active]:text-foreground">
            <BookOpen className="size-4 sm:size-3.5 shrink-0" />
            <span className="hidden sm:inline">Acronyms</span>
          </TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general" className="w-full min-h-[580px]">
          <Card>
            <CardHeader className="px-3 py-3 sm:px-6 sm:py-4">
              <CardTitle className="text-base sm:text-lg">General Settings</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Configure basic EPB generation parameters
              </CardDescription>
            </CardHeader>
            <CardContent className="px-3 pb-4 sm:px-6 sm:pb-6 space-y-4 sm:space-y-6">
              {/* SCOD Date and Cycle Year - Auto-computed from rank */}
              {userRank ? (
                <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs sm:text-sm">SCOD Date</Label>
                    <div className="flex items-center h-9 px-3 rounded-md border bg-muted/50">
                      <span className="text-sm font-medium">{computedScodDate}</span>
                    </div>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">
                      Static Close Out Date (based on your rank: {userRank})
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs sm:text-sm">Cycle Year</Label>
                    <div className="flex items-center h-9 px-3 rounded-md border bg-muted/50">
                      <span className="text-sm font-medium">{computedCycleYear}</span>
                    </div>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">
                      Current evaluation cycle
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4">
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 mt-0.5">
                      <Settings className="size-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                        Set your rank to see SCOD information
                      </p>
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        Your SCOD (Static Close Out Date) and cycle year are automatically determined by your rank. 
                        Update your profile to set your rank.
                      </p>
                      <Link 
                        href="/settings" 
                        className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300 hover:underline mt-2"
                      >
                        Go to Profile Settings
                        <ArrowRight className="size-3" />
                      </Link>
                    </div>
                  </div>
                </div>
              )}

              <Separator />

              <div className="space-y-1.5">
                <Label htmlFor="style" className="text-xs sm:text-sm">Style Guidelines</Label>
                <Textarea
                  id="style"
                  value={styleGuidelines}
                  onChange={(e) => setStyleGuidelines(e.target.value)}
                  rows={3}
                  placeholder="Enter your writing style guidelines..."
                  className="text-sm min-h-[80px]"
                />
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  Injected via {"{{style_guidelines}}"}
                </p>
              </div>

              <Separator />

              {/* Style Signature Refresh */}
              <div className="space-y-2">
                <Label className="text-xs sm:text-sm">Writing Style Signatures</Label>
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  Style signatures capture your unique writing patterns (sentence structure, verb choices, formality) for each rank, AFSC, and MPA combination. They are automatically refreshed when you finalize EPBs or update library examples. Use this button to manually regenerate them.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isRefreshingSignatures}
                  onClick={async () => {
                    setIsRefreshingSignatures(true);
                    try {
                      const response = await fetch("/api/refresh-style-signatures", { method: "POST" });
                      if (!response.ok) throw new Error("Refresh failed");
                      const result = await response.json();
                      toast.success(
                        result.signaturesGenerated > 0
                          ? `Refreshed ${result.signaturesGenerated} style signature${result.signaturesGenerated > 1 ? "s" : ""}`
                          : "All signatures are up to date"
                      );
                    } catch {
                      toast.error("Failed to refresh style signatures");
                    } finally {
                      setIsRefreshingSignatures(false);
                    }
                  }}
                  className="gap-1.5"
                >
                  {isRefreshingSignatures ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="size-3.5" />
                  )}
                  {isRefreshingSignatures ? "Refreshing..." : "Refresh Style Signatures"}
                </Button>
              </div>

            
            </CardContent>
          </Card>
        </TabsContent>

        {/* EPB System Prompt */}
        <TabsContent value="epb-prompt" className="w-full space-y-4">
          <Card>
            <CardHeader className="px-3 py-3 sm:px-6 sm:py-4">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Wand2 className="size-4" />
                EPB System Prompt
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Customize the AI prompt for Enlisted Performance Brief (EPB) statement generation.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-3 pb-4 sm:px-6 sm:pb-6 space-y-3 sm:space-y-4">
              <PlaceholderStatus systemPrompt={systemPrompt} />
              <Textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={12}
                className="font-mono text-xs sm:text-sm min-h-[200px] sm:min-h-[400px]"
                placeholder="Enter your custom EPB system prompt..."
              />
            </CardContent>
          </Card>

          {/* Duty Description Prompt */}
          <Card>
            <CardHeader className="px-3 py-3 sm:px-6 sm:py-4">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Users className="size-4" />
                Duty Description Prompt
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Customize the AI prompt used when revising the Duty Description section of an EPB. This is separate from the performance statement prompt above.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-3 pb-4 sm:px-6 sm:pb-6 space-y-3 sm:space-y-4">
              <div className="p-3 bg-blue-50/50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800/50">
                <div className="flex items-start gap-2">
                  <Info className="size-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
                    <p className="font-medium">Duty Description vs Performance Statements</p>
                    <p className="text-blue-700 dark:text-blue-300">
                      Duty descriptions use <strong>present tense</strong> to describe the member&apos;s current role, scope, and 
                      responsibilities. They are factual and descriptive - NOT performance-based. The MPA statements above 
                      use past tense action verbs to describe accomplishments and performance.
                    </p>
                  </div>
                </div>
              </div>

              <Textarea
                value={dutyDescriptionPrompt}
                onChange={(e) => setDutyDescriptionPrompt(e.target.value)}
                rows={10}
                className="font-mono text-xs sm:text-sm min-h-[200px] sm:min-h-[350px]"
                placeholder="Enter your custom duty description prompt..."
              />

              <div className="flex items-center justify-between gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDutyDescriptionPrompt(DEFAULT_DUTY_DESCRIPTION_PROMPT)}
                  className="h-8"
                >
                  <RotateCcw className="size-3 mr-1.5" />
                  Reset to Default
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* MPA Descriptions */}
          <Card>
            <CardHeader className="px-3 py-3 sm:px-6 sm:py-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                    <Target className="size-4" />
                    MPA Descriptions
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm mt-1">
                    Define what each Major Performance Area covers. The AI uses these to assess accomplishment relevancy.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMpaDescriptions(DEFAULT_MPA_DESCRIPTIONS)}
                  className="h-8 shrink-0"
                >
                  <RotateCcw className="size-3 mr-1.5" />
                  Reset
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-4 sm:px-6 sm:pb-6">
              <div className="space-y-3">
                {ENTRY_MGAS.map((mpa) => {
                  const desc = mpaDescriptions[mpa.key] || DEFAULT_MPA_DESCRIPTIONS[mpa.key];
                  const subComps = Object.entries(desc?.sub_competencies || {});
                  
                  return (
                    <details key={mpa.key} className="group border rounded-lg">
                      <summary className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                        <Badge variant="secondary" className="text-xs">{mpa.label}</Badge>
                        <span className="text-xs text-muted-foreground group-open:hidden">Click to edit</span>
                      </summary>
                      <div className="p-3 pt-0 space-y-3 border-t">
                        <div className="space-y-2">
                          <Label className="text-xs">Core Description</Label>
                          <Textarea
                            value={desc?.description || ""}
                            onChange={(e) => setMpaDescriptions({
                              ...mpaDescriptions,
                              [mpa.key]: {
                                ...desc,
                                description: e.target.value,
                              },
                            })}
                            rows={2}
                            className="text-sm resize-none"
                            placeholder="Describe what this MPA covers..."
                          />
                        </div>
                        
                        {subComps.length > 0 && (
                          <div className="space-y-2 pl-3 border-l-2 border-muted">
                            <Label className="text-xs text-muted-foreground">Sub-competencies</Label>
                            {subComps.map(([key, value]) => {
                              const label = key.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
                              return (
                                <div key={key} className="space-y-1">
                                  <Label className="text-[10px] font-medium">{label}</Label>
                                  <Textarea
                                    value={value}
                                    onChange={(e) => setMpaDescriptions({
                                      ...mpaDescriptions,
                                      [mpa.key]: {
                                        ...desc,
                                        sub_competencies: {
                                          ...desc.sub_competencies,
                                          [key]: e.target.value,
                                        },
                                      },
                                    })}
                                    rows={2}
                                    className="text-xs resize-none"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </details>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* OPB System Prompt - Officers Only */}
        {userIsOfficer && (
          <TabsContent value="opb-prompt" className="w-full space-y-4">
            <Card className="border-blue-200 dark:border-blue-800/50">
              <CardHeader className="px-3 py-3 sm:px-6 sm:py-4">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <Sparkles className="size-4 text-blue-600 dark:text-blue-400" />
                  OPB System Prompt
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Customize the AI prompt for Officer Performance Brief (OPB) statement generation. This prompt is used when you generate your own OPB statements.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-3 pb-4 sm:px-6 sm:pb-6 space-y-3 sm:space-y-4">
                <PlaceholderStatus systemPrompt={opbSystemPrompt} />
                
                <div className="p-3 bg-blue-50/50 dark:bg-blue-900/10 rounded-lg border border-blue-200 dark:border-blue-800/50">
                  <div className="flex items-start gap-2">
                    <Info className="size-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                    <div className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
                      <p className="font-medium">Officer-Specific Prompt</p>
                      <p className="text-blue-700 dark:text-blue-300">
                        This prompt emphasizes strategic leadership, organizational impact, and future potential—key elements of OPB narratives per AFI 36-2406.
                        The same abbreviations and acronyms from your EPB settings are used.
                      </p>
                    </div>
                  </div>
                </div>

                <Textarea
                  value={opbSystemPrompt}
                  onChange={(e) => setOpbSystemPrompt(e.target.value)}
                  rows={12}
                  className="font-mono text-xs sm:text-sm min-h-[200px] sm:min-h-[400px]"
                  placeholder="Enter your custom OPB system prompt..."
                />
                
                <div className="flex items-center justify-between gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOpbSystemPrompt(DEFAULT_OPB_SYSTEM_PROMPT)}
                    className="h-8"
                  >
                    <RotateCcw className="size-3 mr-1.5" />
                    Reset to Default
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* OPB Style Guidelines */}
            <Card className="border-blue-200 dark:border-blue-800/50">
              <CardHeader className="px-3 py-3 sm:px-6 sm:py-4">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <FileText className="size-4 text-blue-600 dark:text-blue-400" />
                  OPB Style Guidelines
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Additional style guidance appended to OPB statements. Focus on strategic language and command presence.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-3 pb-4 sm:px-6 sm:pb-6 space-y-3 sm:space-y-4">
                <Textarea
                  value={opbStyleGuidelines}
                  onChange={(e) => setOpbStyleGuidelines(e.target.value)}
                  rows={4}
                  className="font-mono text-xs sm:text-sm min-h-[100px] sm:min-h-[150px]"
                  placeholder="Enter OPB-specific style guidelines..."
                />
                
                <div className="flex items-center justify-between gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOpbStyleGuidelines(DEFAULT_OPB_STYLE_GUIDELINES)}
                    className="h-8"
                  >
                    <RotateCcw className="size-3 mr-1.5" />
                    Reset to Default
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Award System Prompt */}
        <TabsContent value="award-prompt" className="w-full min-h-[580px]">
          <Card>
            <CardHeader className="px-3 py-3 sm:px-6 sm:py-4">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Award className="size-4" />
                Award Prompt (AF Form 1206)
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Customize the AI prompt for award nomination statement generation.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-3 pb-4 sm:px-6 sm:pb-6 space-y-4 sm:space-y-6">
              {/* Sentences per category */}
              <div className="space-y-3">
                <Label className="text-xs sm:text-sm">Statements per Category</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {AWARD_1206_CATEGORIES.map((cat) => (
                    <div key={cat.key} className="space-y-1.5">
                      <Label htmlFor={`award-${cat.key}`} className="text-[10px] sm:text-xs text-muted-foreground">
                        {cat.label.split(" ")[0]}
                      </Label>
                      <Input
                        id={`award-${cat.key}`}
                        type="number"
                        min={1}
                        max={10}
                        value={awardSentencesPerCategory[cat.key as keyof AwardSentencesPerCategory] || 3}
                        onChange={(e) => setAwardSentencesPerCategory({
                          ...awardSentencesPerCategory,
                          [cat.key]: Math.min(10, Math.max(1, parseInt(e.target.value) || 3))
                        })}
                        className="h-9"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Award Style Guidelines */}
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm">Award Style Guidelines</Label>
                <Textarea
                  value={awardStyleGuidelines}
                  onChange={(e) => setAwardStyleGuidelines(e.target.value)}
                  rows={3}
                  placeholder="Enter award-specific style guidelines..."
                  className="text-sm min-h-[80px]"
                />
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  General guidance for 1206 narrative-style statements.
                </p>
              </div>

              <Separator />

              {/* Award Abbreviations */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs sm:text-sm">Award Abbreviations</Label>
                  <Badge variant="secondary" className="text-[10px]">
                    {awardAbbreviations.length} defined
                  </Badge>
                </div>
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  Separate abbreviation list for award statements. Uses the same Verbs as EPB.
                </p>
                <AbbreviationEditor 
                  abbreviations={awardAbbreviations} 
                  onChange={setAwardAbbreviations} 
                />
              </div>

              <Separator />

              {/* Award System Prompt */}
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm">Award System Prompt</Label>
                <Textarea
                  value={awardSystemPrompt}
                  onChange={(e) => setAwardSystemPrompt(e.target.value)}
                  rows={12}
                  className="font-mono text-xs sm:text-sm min-h-[200px] sm:min-h-[400px]"
                  placeholder="Enter your custom award system prompt..."
                />
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  Available placeholders: {"{{ratee_rank}}"}, {"{{primary_verbs}}"}, {"{{rank_verb_guidance}}"}, {"{{abbreviations_list}}"}
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Decoration System Prompt */}
        <TabsContent value="decoration-prompt" className="w-full space-y-4">
          <Card>
            <CardHeader className="px-3 py-3 sm:px-6 sm:py-4">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Medal className="size-4" />
                Decoration Citation Prompt
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Customize the AI prompt for decoration citation generation (AFAM, AFCM, MSM, LOM, BSM).
              </CardDescription>
            </CardHeader>
            <CardContent className="px-3 pb-4 sm:px-6 sm:pb-6 space-y-4 sm:space-y-6">
              <div className="p-3 bg-amber-50/50 dark:bg-amber-900/10 rounded-lg border border-amber-200 dark:border-amber-800/50">
                <div className="flex items-start gap-2">
                  <Info className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-800 dark:text-amber-200 space-y-1">
                    <p className="font-medium">Decoration-Specific Rules</p>
                    <p className="text-amber-700 dark:text-amber-300">
                      By default, decorations spell out all abbreviations for readability per DAFMAN 36-2806.
                      You can add approved abbreviations below that the AI is allowed to use in citations.
                      EPB/Award abbreviations are <strong>not</strong> shared — manage decoration abbreviations separately.
                    </p>
                  </div>
                </div>
              </div>

              <PlaceholderStatus systemPrompt={decorationSystemPrompt} />

              <Textarea
                value={decorationSystemPrompt}
                onChange={(e) => setDecorationSystemPrompt(e.target.value)}
                rows={12}
                className="font-mono text-xs sm:text-sm min-h-[200px] sm:min-h-[400px]"
                placeholder="Enter your custom decoration system prompt..."
              />
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                Available placeholders: {"{{ratee_rank}}"}, {"{{primary_verbs}}"}, {"{{rank_verb_guidance}}"}, {"{{decoration_abbreviations_list}}"}
              </p>

              <div className="flex items-center justify-between gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDecorationSystemPrompt(DEFAULT_DECORATION_SYSTEM_PROMPT)}
                  className="h-8"
                >
                  <RotateCcw className="size-3 mr-1.5" />
                  Reset to Default
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Decoration Style Guidelines */}
          <Card>
            <CardHeader className="px-3 py-3 sm:px-6 sm:py-4">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <FileText className="size-4" />
                Decoration Style Guidelines
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Additional style guidance for decoration citations. Focus on dignity, clarity, and formal military documentation standards.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-3 pb-4 sm:px-6 sm:pb-6 space-y-3 sm:space-y-4">
              <Textarea
                value={decorationStyleGuidelines}
                onChange={(e) => setDecorationStyleGuidelines(e.target.value)}
                rows={4}
                className="font-mono text-xs sm:text-sm min-h-[100px] sm:min-h-[150px]"
                placeholder="Enter decoration-specific style guidelines..."
              />
              
              <div className="flex items-center justify-between gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDecorationStyleGuidelines(DEFAULT_DECORATION_STYLE_GUIDELINES)}
                  className="h-8"
                >
                  <RotateCcw className="size-3 mr-1.5" />
                  Reset to Default
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Decoration Approved Abbreviations */}
          <AbbreviationEditor
            abbreviations={decorationAbbreviations}
            onChange={setDecorationAbbreviations}
          />
        </TabsContent>

        {/* Rank Verbs */}
        <TabsContent value="verbs" className="w-full min-h-[580px]">
          <Card>
            <CardHeader className="px-3 py-3 sm:px-6 sm:py-4">
              <CardTitle className="text-base sm:text-lg">Rank Verb Progression</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Define action verbs for each rank level
              </CardDescription>
            </CardHeader>
            <CardContent className="px-3 pb-4 sm:px-6 sm:pb-6">
              {/* Mobile: Card layout */}
              <div className="grid gap-2 md:hidden">
                {/* Enlisted Ranks */}
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-b">
                  Enlisted
                </div>
                {ENLISTED_RANKS.map(({ value: rank }) => {
                  const verbs = rankVerbs[rank] || { primary: [], secondary: [] };
                  return (
                    <div key={rank} className="p-2 sm:p-3 border rounded-lg space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm sm:text-base">{rank}</span>
                        <Dialog
                          open={editingRank === rank}
                          onOpenChange={(open) => {
                            if (open) {
                              setEditingRank(rank);
                              setEditingVerbs({
                                primary: verbs.primary.join(", "),
                                secondary: verbs.secondary.join(", "),
                              });
                            } else {
                              setEditingRank(null);
                            }
                          }}
                        >
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 px-2">
                              <Pencil className="size-3" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
                            <DialogHeader>
                              <DialogTitle className="text-base">Edit Verbs for {rank}</DialogTitle>
                              <DialogDescription className="text-xs sm:text-sm">
                                Enter comma-separated verbs
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-3">
                              <div className="space-y-1.5">
                                <Label className="text-xs sm:text-sm">Primary Verbs</Label>
                                <Input
                                  value={editingVerbs.primary}
                                  onChange={(e) => setEditingVerbs({ ...editingVerbs, primary: e.target.value })}
                                  placeholder="Led, Managed, Directed"
                                  className="h-9 text-sm"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs sm:text-sm">Secondary Verbs</Label>
                                <Input
                                  value={editingVerbs.secondary}
                                  onChange={(e) => setEditingVerbs({ ...editingVerbs, secondary: e.target.value })}
                                  placeholder="Supervised, Coordinated"
                                  className="h-9 text-sm"
                                />
                              </div>
                            </div>
                            <DialogFooter className="flex-col gap-2 sm:flex-row">
                              <Button onClick={() => updateRankVerbs(rank)} className="w-full sm:w-auto">Save</Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                      <div className="space-y-1.5">
                        <div>
                          <p className="text-[10px] text-muted-foreground mb-1">Primary</p>
                          <div className="flex flex-wrap gap-0.5">
                            {verbs.primary.map((v) => (
                              <Badge key={v} variant="secondary" className="text-[10px] px-1.5 py-0">{v}</Badge>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground mb-1">Secondary</p>
                          <div className="flex flex-wrap gap-0.5">
                            {verbs.secondary.map((v) => (
                              <Badge key={v} variant="outline" className="text-[10px] px-1.5 py-0">{v}</Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                
                {/* Officer Ranks */}
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-b mt-2">
                  Officer
                </div>
                {OFFICER_RANKS.map(({ value: rank }) => {
                  const verbs = rankVerbs[rank] || { primary: [], secondary: [] };
                  return (
                    <div key={rank} className="p-2 sm:p-3 border rounded-lg space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm sm:text-base">{rank}</span>
                        <Dialog
                          open={editingRank === rank}
                          onOpenChange={(open) => {
                            if (open) {
                              setEditingRank(rank);
                              setEditingVerbs({
                                primary: verbs.primary.join(", "),
                                secondary: verbs.secondary.join(", "),
                              });
                            } else {
                              setEditingRank(null);
                            }
                          }}
                        >
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 px-2">
                              <Pencil className="size-3" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
                            <DialogHeader>
                              <DialogTitle className="text-base">Edit Verbs for {rank}</DialogTitle>
                              <DialogDescription className="text-xs sm:text-sm">
                                Enter comma-separated verbs
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-3">
                              <div className="space-y-1.5">
                                <Label className="text-xs sm:text-sm">Primary Verbs</Label>
                                <Input
                                  value={editingVerbs.primary}
                                  onChange={(e) => setEditingVerbs({ ...editingVerbs, primary: e.target.value })}
                                  placeholder="Led, Managed, Directed"
                                  className="h-9 text-sm"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs sm:text-sm">Secondary Verbs</Label>
                                <Input
                                  value={editingVerbs.secondary}
                                  onChange={(e) => setEditingVerbs({ ...editingVerbs, secondary: e.target.value })}
                                  placeholder="Supervised, Coordinated"
                                  className="h-9 text-sm"
                                />
                              </div>
                            </div>
                            <DialogFooter className="flex-col gap-2 sm:flex-row">
                              <Button onClick={() => updateRankVerbs(rank)} className="w-full sm:w-auto">Save</Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                      <div className="space-y-1.5">
                        <div>
                          <p className="text-[10px] text-muted-foreground mb-1">Primary</p>
                          <div className="flex flex-wrap gap-0.5">
                            {verbs.primary.map((v) => (
                              <Badge key={v} variant="secondary" className="text-[10px] px-1.5 py-0">{v}</Badge>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground mb-1">Secondary</p>
                          <div className="flex flex-wrap gap-0.5">
                            {verbs.secondary.map((v) => (
                              <Badge key={v} variant="outline" className="text-[10px] px-1.5 py-0">{v}</Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop: Table layout */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Rank</TableHead>
                      <TableHead>Primary Verbs</TableHead>
                      <TableHead>Secondary Verbs</TableHead>
                      <TableHead className="w-16 text-right">Edit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Enlisted Section Header */}
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableCell colSpan={4} className="py-1.5 text-xs font-semibold text-muted-foreground">
                        Enlisted
                      </TableCell>
                    </TableRow>
                    {ENLISTED_RANKS.map(({ value: rank }) => {
                      const verbs = rankVerbs[rank] || { primary: [], secondary: [] };
                      return (
                        <TableRow key={rank} className="group">
                          <TableCell className="font-medium">{rank}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {verbs.primary.map((v) => (
                                <Badge key={v} variant="secondary" className="text-xs">{v}</Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {verbs.secondary.map((v) => (
                                <Badge key={v} variant="outline" className="text-xs">{v}</Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Dialog
                              open={editingRank === rank}
                              onOpenChange={(open) => {
                                if (open) {
                                  setEditingRank(rank);
                                  setEditingVerbs({
                                    primary: verbs.primary.join(", "),
                                    secondary: verbs.secondary.join(", "),
                                  });
                                } else {
                                  setEditingRank(null);
                                }
                              }}
                            >
                              <DialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Pencil className="size-3.5" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
                                <DialogHeader>
                                  <DialogTitle className="text-base">Edit Verbs for {rank}</DialogTitle>
                                  <DialogDescription className="text-xs sm:text-sm">
                                    Enter comma-separated verbs
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-3">
                                  <div className="space-y-1.5">
                                    <Label className="text-xs sm:text-sm">Primary Verbs</Label>
                                    <Input
                                      value={editingVerbs.primary}
                                      onChange={(e) => setEditingVerbs({ ...editingVerbs, primary: e.target.value })}
                                      placeholder="Led, Managed, Directed"
                                      className="h-9 text-sm"
                                    />
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label className="text-xs sm:text-sm">Secondary Verbs</Label>
                                    <Input
                                      value={editingVerbs.secondary}
                                      onChange={(e) => setEditingVerbs({ ...editingVerbs, secondary: e.target.value })}
                                      placeholder="Supervised, Coordinated"
                                      className="h-9 text-sm"
                                    />
                                  </div>
                                </div>
                                <DialogFooter>
                                  <Button onClick={() => updateRankVerbs(rank)}>Save</Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {/* Officer Section Header */}
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableCell colSpan={4} className="py-1.5 text-xs font-semibold text-muted-foreground">
                        Officer
                      </TableCell>
                    </TableRow>
                    {OFFICER_RANKS.map(({ value: rank }) => {
                      const verbs = rankVerbs[rank] || { primary: [], secondary: [] };
                      return (
                        <TableRow key={rank} className="group">
                          <TableCell className="font-medium">{rank}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {verbs.primary.map((v) => (
                                <Badge key={v} variant="secondary" className="text-xs">{v}</Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {verbs.secondary.map((v) => (
                                <Badge key={v} variant="outline" className="text-xs">{v}</Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Dialog
                              open={editingRank === rank}
                              onOpenChange={(open) => {
                                if (open) {
                                  setEditingRank(rank);
                                  setEditingVerbs({
                                    primary: verbs.primary.join(", "),
                                    secondary: verbs.secondary.join(", "),
                                  });
                                } else {
                                  setEditingRank(null);
                                }
                              }}
                            >
                              <DialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Pencil className="size-3.5" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
                                <DialogHeader>
                                  <DialogTitle className="text-base">Edit Verbs for {rank}</DialogTitle>
                                  <DialogDescription className="text-xs sm:text-sm">
                                    Enter comma-separated verbs
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-3">
                                  <div className="space-y-1.5">
                                    <Label className="text-xs sm:text-sm">Primary Verbs</Label>
                                    <Input
                                      value={editingVerbs.primary}
                                      onChange={(e) => setEditingVerbs({ ...editingVerbs, primary: e.target.value })}
                                      placeholder="Led, Managed, Directed"
                                      className="h-9 text-sm"
                                    />
                                  </div>
                                  <div className="space-y-1.5">
                                    <Label className="text-xs sm:text-sm">Secondary Verbs</Label>
                                    <Input
                                      value={editingVerbs.secondary}
                                      onChange={(e) => setEditingVerbs({ ...editingVerbs, secondary: e.target.value })}
                                      placeholder="Supervised, Coordinated"
                                      className="h-9 text-sm"
                                    />
                                  </div>
                                </div>
                                <DialogFooter>
                                  <Button onClick={() => updateRankVerbs(rank)}>Save</Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Abbreviations */}
        <TabsContent value="abbreviations" className="w-full min-h-[580px]">
          <AbbreviationEditor abbreviations={abbreviations} onChange={setAbbreviations} />
        </TabsContent>

        {/* Acronyms */}
        <TabsContent value="acronyms" className="w-full min-h-[580px]">
          <AcronymEditor acronyms={acronyms} onChange={setAcronyms} />
        </TabsContent>
      </Tabs>

      {/* Unsaved Changes Dialog */}
      <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Would you like to save them before leaving?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel onClick={() => setPendingNavigation(null)} className="w-full sm:w-auto">
              Cancel
            </AlertDialogCancel>
            <Button
              variant="outline"
              onClick={handleConfirmNavigation}
              className="w-full sm:w-auto"
            >
              Discard Changes
            </Button>
            <AlertDialogAction onClick={handleSaveAndNavigate} className="w-full sm:w-auto">
              {isSaving ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Save & Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
