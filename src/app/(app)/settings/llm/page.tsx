"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
import { DEFAULT_ABBREVIATIONS } from "@/lib/default-abbreviations";
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
} from "lucide-react";
import type { UserLLMSettings, Acronym, Abbreviation, RankVerbProgression } from "@/types/database";
import { RANKS, STANDARD_MGAS } from "@/lib/constants";

const DEFAULT_SYSTEM_PROMPT = `You are an expert Air Force Enlisted Performance Brief (EPB) writing assistant with deep knowledge of Air Force operations, programs, and terminology. Your sole purpose is to generate impactful, narrative-style performance statements that strictly comply with AFI 36-2406 (22 Aug 2025).

CRITICAL RULES - NEVER VIOLATE THESE:
- Every statement MUST be a single, standalone sentence.
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
    <Card>
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
    <Card>
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
  maxChars: number;
  scodDate: string;
  cycleYear: number;
  styleGuidelines: string;
  systemPrompt: string;
  rankVerbs: RankVerbProgression;
  acronyms: Acronym[];
  abbreviations: Abbreviation[];
}

export default function LLMSettingsPage() {
  const { profile } = useUserStore();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasExistingSettings, setHasExistingSettings] = useState(false);

  // Separate state for each section to prevent unnecessary re-renders
  const [maxChars, setMaxChars] = useState(350);
  const [scodDate, setScodDate] = useState("31 March");
  const [cycleYear, setCycleYear] = useState(new Date().getFullYear());
  const [styleGuidelines, setStyleGuidelines] = useState(DEFAULT_STYLE_GUIDELINES);
  // MPAs are standardized by AFI 36-2406 and not user-editable
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [rankVerbs, setRankVerbs] = useState<RankVerbProgression>(DEFAULT_RANK_VERBS);
  const [acronyms, setAcronyms] = useState<Acronym[]>(DEFAULT_ACRONYMS);
  const [abbreviations, setAbbreviations] = useState<Abbreviation[]>(DEFAULT_ABBREVIATIONS);

  // Track initial state to detect changes
  const initialStateRef = useRef<SettingsState | null>(null);

  // Navigation interception state
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);

  // Dialog state for rank verb editing
  const [editingRank, setEditingRank] = useState<string | null>(null);
  const [editingVerbs, setEditingVerbs] = useState({ primary: "", secondary: "" });

  const supabase = createClient();

  // Check if there are unsaved changes
  const hasChanges = useMemo(() => {
    if (!initialStateRef.current || isLoading) return false;
    
    const initial = initialStateRef.current;
    return (
      maxChars !== initial.maxChars ||
      scodDate !== initial.scodDate ||
      cycleYear !== initial.cycleYear ||
      styleGuidelines !== initial.styleGuidelines ||
      systemPrompt !== initial.systemPrompt ||
      JSON.stringify(rankVerbs) !== JSON.stringify(initial.rankVerbs) ||
      JSON.stringify(acronyms) !== JSON.stringify(initial.acronyms) ||
      JSON.stringify(abbreviations) !== JSON.stringify(initial.abbreviations)
    );
  }, [maxChars, scodDate, cycleYear, styleGuidelines, systemPrompt, rankVerbs, acronyms, abbreviations, isLoading]);

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
        .single();

      if (error && error.code !== "PGRST116") {
        throw error;
      }

      if (data) {
        setHasExistingSettings(true);
        const settings = data as unknown as UserLLMSettings;
        const loadedMaxChars = settings.max_characters_per_statement;
        const loadedScodDate = settings.scod_date;
        const loadedCycleYear = settings.current_cycle_year;
        const loadedStyleGuidelines = settings.style_guidelines;
        const loadedSystemPrompt = settings.base_system_prompt;
        const loadedRankVerbs = settings.rank_verb_progression;
        const loadedAcronyms = settings.acronyms;
        const loadedAbbreviations = settings.abbreviations || DEFAULT_ABBREVIATIONS;

        setMaxChars(loadedMaxChars);
        setScodDate(loadedScodDate);
        setCycleYear(loadedCycleYear);
        setStyleGuidelines(loadedStyleGuidelines);
        // MPAs are not user-editable, always use STANDARD_MGAS
        setSystemPrompt(loadedSystemPrompt);
        setRankVerbs(loadedRankVerbs);
        setAcronyms(loadedAcronyms);
        setAbbreviations(loadedAbbreviations);

        // Store initial state for change detection (excludes MPAs)
        initialStateRef.current = {
          maxChars: loadedMaxChars,
          scodDate: loadedScodDate,
          cycleYear: loadedCycleYear,
          styleGuidelines: loadedStyleGuidelines,
          systemPrompt: loadedSystemPrompt,
          rankVerbs: JSON.parse(JSON.stringify(loadedRankVerbs)),
          acronyms: JSON.parse(JSON.stringify(loadedAcronyms)),
          abbreviations: JSON.parse(JSON.stringify(loadedAbbreviations)),
        };
      } else {
        // No existing settings - store defaults as initial state
        initialStateRef.current = {
          maxChars: 350,
          scodDate: "31 March",
          cycleYear: new Date().getFullYear(),
          styleGuidelines: DEFAULT_STYLE_GUIDELINES,
          systemPrompt: DEFAULT_SYSTEM_PROMPT,
          rankVerbs: JSON.parse(JSON.stringify(DEFAULT_RANK_VERBS)),
          acronyms: JSON.parse(JSON.stringify(DEFAULT_ACRONYMS)),
          abbreviations: JSON.parse(JSON.stringify(DEFAULT_ABBREVIATIONS)),
        };
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
      const settingsData = {
        max_characters_per_statement: maxChars,
        scod_date: scodDate,
        current_cycle_year: cycleYear,
        major_graded_areas: STANDARD_MGAS, // Always use standard MPAs
        rank_verb_progression: rankVerbs,
        style_guidelines: styleGuidelines,
        base_system_prompt: systemPrompt,
        acronyms: acronyms,
        abbreviations: abbreviations,
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

      // Update initial state to match saved state (excludes MPAs)
      initialStateRef.current = {
        maxChars,
        scodDate,
        cycleYear,
        styleGuidelines,
        systemPrompt,
        rankVerbs: JSON.parse(JSON.stringify(rankVerbs)),
        acronyms: JSON.parse(JSON.stringify(acronyms)),
        abbreviations: JSON.parse(JSON.stringify(abbreviations)),
      };

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
    setMaxChars(350);
    setScodDate("31 March");
    setCycleYear(new Date().getFullYear());
    setStyleGuidelines(DEFAULT_STYLE_GUIDELINES);
    // MPAs are not user-editable, always use STANDARD_MGAS
    setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
    setRankVerbs(DEFAULT_RANK_VERBS);
    setAcronyms(DEFAULT_ACRONYMS);
    setAbbreviations(DEFAULT_ABBREVIATIONS);
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
    <div className="space-y-4 sm:space-y-6 min-w-0">
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

      <Tabs defaultValue="general" className="space-y-3 sm:space-y-4">
        <TabsList className="w-full h-auto p-1 grid grid-cols-5 gap-0.5">
          <TabsTrigger value="general" className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 text-[10px] sm:text-xs px-1 sm:px-2.5 py-1.5 sm:py-2 data-[state=active]:text-foreground">
            <Settings className="size-4 sm:size-3.5 flex-shrink-0" />
            <span className="hidden sm:inline">General</span>
          </TabsTrigger>
          <TabsTrigger value="prompt" className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 text-[10px] sm:text-xs px-1 sm:px-2.5 py-1.5 sm:py-2 data-[state=active]:text-foreground">
            <Wand2 className="size-4 sm:size-3.5 flex-shrink-0" />
            <span className="hidden sm:inline">Prompt</span>
          </TabsTrigger>
          <TabsTrigger value="verbs" className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 text-[10px] sm:text-xs px-1 sm:px-2.5 py-1.5 sm:py-2 data-[state=active]:text-foreground">
            <FileText className="size-4 sm:size-3.5 flex-shrink-0" />
            <span className="hidden sm:inline">Verbs</span>
          </TabsTrigger>
          <TabsTrigger value="abbreviations" className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 text-[10px] sm:text-xs px-1 sm:px-2.5 py-1.5 sm:py-2 data-[state=active]:text-foreground">
            <ArrowRight className="size-4 sm:size-3.5 flex-shrink-0" />
            <span className="hidden sm:inline">Abbr</span>
          </TabsTrigger>
          <TabsTrigger value="acronyms" className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 text-[10px] sm:text-xs px-1 sm:px-2.5 py-1.5 sm:py-2 data-[state=active]:text-foreground">
            <BookOpen className="size-4 sm:size-3.5 flex-shrink-0" />
            <span className="hidden sm:inline">Acronyms</span>
          </TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general">
          <Card>
            <CardHeader className="px-3 py-3 sm:px-6 sm:py-4">
              <CardTitle className="text-base sm:text-lg">General Settings</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Configure basic EPB generation parameters
              </CardDescription>
            </CardHeader>
            <CardContent className="px-3 pb-4 sm:px-6 sm:pb-6 space-y-4 sm:space-y-6">
              <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="max-chars" className="text-xs sm:text-sm">Max Chars/Statement</Label>
                  <Input
                    id="max-chars"
                    type="number"
                    value={maxChars}
                    onChange={(e) => setMaxChars(parseInt(e.target.value) || 350)}
                    aria-describedby="max-chars-hint"
                    className="h-9"
                  />
                  <p id="max-chars-hint" className="text-[10px] sm:text-xs text-muted-foreground">AFI 36-2406: 350 chars</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="scod" className="text-xs sm:text-sm">SCOD Date</Label>
                  <Input
                    id="scod"
                    value={scodDate}
                    onChange={(e) => setScodDate(e.target.value)}
                    placeholder="31 March"
                    aria-describedby="scod-hint"
                    className="h-9"
                  />
                  <p id="scod-hint" className="text-[10px] sm:text-xs text-muted-foreground">Static Close Out Date</p>
                </div>
                <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                  <Label htmlFor="cycle-year" className="text-xs sm:text-sm">Cycle Year</Label>
                  <Input
                    id="cycle-year"
                    type="number"
                    value={cycleYear}
                    onChange={(e) => setCycleYear(parseInt(e.target.value) || new Date().getFullYear())}
                    className="h-9"
                  />
                </div>
              </div>

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

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs sm:text-sm">Major Performance Areas</Label>
                  <Badge variant="secondary" className="text-[10px]">AFI 36-2406</Badge>
                </div>
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  Standard EPB categories used for statement generation. These are defined by Air Force regulations.
                </p>
                <div className="grid gap-1.5">
                  {STANDARD_MGAS.map((mpa) => (
                    <div 
                      key={mpa.key} 
                      className="flex items-center gap-2 p-2 border rounded bg-muted/30 text-xs sm:text-sm"
                    >
                      <span className="font-medium">{mpa.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* System Prompt */}
        <TabsContent value="prompt">
          <Card>
            <CardHeader className="px-3 py-3 sm:px-6 sm:py-4">
              <CardTitle className="text-base sm:text-lg">System Prompt</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Customize the AI system prompt with placeholders.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-3 pb-4 sm:px-6 sm:pb-6 space-y-3 sm:space-y-4">
              <PlaceholderStatus systemPrompt={systemPrompt} />
              <Textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={12}
                className="font-mono text-xs sm:text-sm min-h-[200px] sm:min-h-[400px]"
                placeholder="Enter your custom system prompt..."
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rank Verbs */}
        <TabsContent value="verbs">
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
                {RANKS.map(({ value: rank }) => {
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
                    {RANKS.map(({ value: rank }) => {
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
        <TabsContent value="abbreviations">
          <AbbreviationEditor abbreviations={abbreviations} onChange={setAbbreviations} />
        </TabsContent>

        {/* Acronyms */}
        <TabsContent value="acronyms">
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
