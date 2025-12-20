"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
import type { UserLLMSettings, Acronym, Abbreviation, MajorGradedArea, RankVerbProgression } from "@/types/database";
import { RANKS } from "@/lib/constants";

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

const DEFAULT_MGAS: MajorGradedArea[] = [
  { key: "executing_mission", label: "Executing the Mission" },
  { key: "leading_people", label: "Leading People" },
  { key: "managing_resources", label: "Managing Resources" },
  { key: "improving_unit", label: "Improving the Unit" },
  { key: "hlr_assessment", label: "Higher Level Reviewer Assessment" },
];

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

// Separate component for MPA editing to prevent re-renders
function MPAEditor({ 
  mgas, 
  onChange 
}: { 
  mgas: MajorGradedArea[]; 
  onChange: (mgas: MajorGradedArea[]) => void;
}) {
  const [localMgas, setLocalMgas] = useState(mgas);

  useEffect(() => {
    setLocalMgas(mgas);
  }, [mgas]);

  const handleChange = useCallback((idx: number, field: 'key' | 'label', value: string) => {
    const newMgas = [...localMgas];
    newMgas[idx] = { ...newMgas[idx], [field]: value };
    setLocalMgas(newMgas);
  }, [localMgas]);

  const handleBlur = useCallback(() => {
    onChange(localMgas);
  }, [localMgas, onChange]);

  const handleAdd = useCallback(() => {
    const newMgas = [...localMgas, { key: "", label: "" }];
    setLocalMgas(newMgas);
    onChange(newMgas);
  }, [localMgas, onChange]);

  const handleRemove = useCallback((idx: number) => {
    const newMgas = localMgas.filter((_, i) => i !== idx);
    setLocalMgas(newMgas);
    onChange(newMgas);
  }, [localMgas, onChange]);

  return (
    <div className="grid gap-2">
      {localMgas.map((mpa, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <Input
            value={mpa.key}
            onChange={(e) => handleChange(idx, 'key', e.target.value)}
            onBlur={handleBlur}
            placeholder="Key"
            className="w-48"
          />
          <Input
            value={mpa.label}
            onChange={(e) => handleChange(idx, 'label', e.target.value)}
            onBlur={handleBlur}
            placeholder="Label"
            className="flex-1"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleRemove(idx)}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      ))}
      <Button variant="outline" onClick={handleAdd}>
        <Plus className="size-4 mr-2" />
        Add MPA
      </Button>
    </div>
  );
}

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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">
          Placeholders (auto-replaced at generation time)
        </Label>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{usedCount} used</span>
          {missingCount > 0 && (
            <span>· {missingCount} not included</span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {placeholderStatus.map((p) => (
          <Tooltip key={p.key}>
            <TooltipTrigger asChild>
              <Badge
                variant={p.isUsed ? "secondary" : "outline"}
                className={cn(
                  "cursor-help font-mono text-xs",
                  !p.isUsed && "opacity-50"
                )}
              >
                {p.key}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-medium">{p.description}</p>
              <p className="text-xs text-muted-foreground">
                {p.isUsed ? "Included in your prompt" : "Not included — add to use this feature"}
              </p>
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
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Word Abbreviations</CardTitle>
            <CardDescription>
              Define word-to-abbreviation mappings. The AI will automatically use these shorter forms in generated statements ({abbreviations.length} defined)
            </CardDescription>
          </div>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4 mr-2" />
                Add Abbreviation
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Abbreviation</DialogTitle>
                <DialogDescription>
                  Enter the full word and its abbreviated form
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Full Word</Label>
                  <Input
                    value={newAbbrev.word}
                    onChange={(e) => setNewAbbrev({ ...newAbbrev, word: e.target.value })}
                    placeholder="e.g., maintenance"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Abbreviation</Label>
                  <Input
                    value={newAbbrev.abbreviation}
                    onChange={(e) => setNewAbbrev({ ...newAbbrev, abbreviation: e.target.value })}
                    placeholder="e.g., maint"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleAdd}>Add</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Abbreviation</DialogTitle>
            <DialogDescription>
              Modify the word or its abbreviated form
            </DialogDescription>
          </DialogHeader>
          {editingAbbrev && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Full Word</Label>
                <Input
                  value={editingAbbrev.word}
                  onChange={(e) => setEditingAbbrev({ ...editingAbbrev, word: e.target.value })}
                  placeholder="e.g., maintenance"
                />
              </div>
              <div className="space-y-2">
                <Label>Abbreviation</Label>
                <Input
                  value={editingAbbrev.abbreviation}
                  onChange={(e) => setEditingAbbrev({ ...editingAbbrev, abbreviation: e.target.value })}
                  placeholder="e.g., maint"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search abbreviations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <ScrollArea className="h-[400px] border rounded-md">
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
                      >
                        <Pencil className="size-4 text-muted-foreground" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemove(abbrev.word)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
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
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Approved Acronyms</CardTitle>
            <CardDescription>
              Manage the list of approved acronyms ({acronyms.length} total)
            </CardDescription>
          </div>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4 mr-2" />
                Add Acronym
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Acronym</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Acronym</Label>
                  <Input
                    value={newAcronym.acronym}
                    onChange={(e) => setNewAcronym({ ...newAcronym, acronym: e.target.value })}
                    placeholder="e.g., AFSC"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Definition</Label>
                  <Input
                    value={newAcronym.definition}
                    onChange={(e) => setNewAcronym({ ...newAcronym, definition: e.target.value })}
                    placeholder="e.g., AIR FORCE SPECIALTY CODE"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleAdd}>Add</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search acronyms..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <ScrollArea className="h-[400px] border rounded-md">
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
                <TableRow key={acr.acronym}>
                  <TableCell className="font-mono font-medium">{acr.acronym}</TableCell>
                  <TableCell className="text-sm">{acr.definition}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemove(acr.acronym)}
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

export default function LLMSettingsPage() {
  const { profile } = useUserStore();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasExistingSettings, setHasExistingSettings] = useState(false);

  // Separate state for each section to prevent unnecessary re-renders
  const [maxChars, setMaxChars] = useState(350);
  const [scodDate, setScodDate] = useState("31 March");
  const [cycleYear, setCycleYear] = useState(new Date().getFullYear());
  const [styleGuidelines, setStyleGuidelines] = useState(DEFAULT_STYLE_GUIDELINES);
  const [mgas, setMgas] = useState<MajorGradedArea[]>(DEFAULT_MGAS);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [rankVerbs, setRankVerbs] = useState<RankVerbProgression>(DEFAULT_RANK_VERBS);
  const [acronyms, setAcronyms] = useState<Acronym[]>(DEFAULT_ACRONYMS);
  const [abbreviations, setAbbreviations] = useState<Abbreviation[]>(DEFAULT_ABBREVIATIONS);

  // Dialog state for rank verb editing
  const [editingRank, setEditingRank] = useState<string | null>(null);
  const [editingVerbs, setEditingVerbs] = useState({ primary: "", secondary: "" });

  const supabase = createClient();

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
        setMaxChars(settings.max_characters_per_statement);
        setScodDate(settings.scod_date);
        setCycleYear(settings.current_cycle_year);
        setStyleGuidelines(settings.style_guidelines);
        setMgas(settings.major_graded_areas);
        setSystemPrompt(settings.base_system_prompt);
        setRankVerbs(settings.rank_verb_progression);
        setAcronyms(settings.acronyms);
        setAbbreviations(settings.abbreviations || DEFAULT_ABBREVIATIONS);
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
        major_graded_areas: mgas,
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

      toast.success("Settings saved successfully");
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  }

  function resetToDefaults() {
    setMaxChars(350);
    setScodDate("31 March");
    setCycleYear(new Date().getFullYear());
    setStyleGuidelines(DEFAULT_STYLE_GUIDELINES);
    setMgas(DEFAULT_MGAS);
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
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">LLM Settings</h1>
          <p className="text-muted-foreground">
            Customize your AI generation settings and system prompt
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={resetToDefaults}>
            <RotateCcw className="size-4 mr-2" />
            Reset Defaults
          </Button>
          <Button onClick={saveSettings} disabled={isSaving}>
            {isSaving ? <Loader2 className="size-4 animate-spin mr-2" /> : <Save className="size-4 mr-2" />}
            Save Settings
          </Button>
        </div>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="general" className="gap-2">
            <Settings className="size-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="prompt" className="gap-2">
            <Wand2 className="size-4" />
            System Prompt
          </TabsTrigger>
          <TabsTrigger value="verbs" className="gap-2">
            <FileText className="size-4" />
            Rank Verbs
          </TabsTrigger>
          <TabsTrigger value="abbreviations" className="gap-2">
            <ArrowRight className="size-4" />
            Abbreviations ({abbreviations.length})
          </TabsTrigger>
          <TabsTrigger value="acronyms" className="gap-2">
            <BookOpen className="size-4" />
            Acronyms ({acronyms.length})
          </TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
              <CardDescription>
                Configure basic EPB generation parameters
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="max-chars">Max Characters per Statement</Label>
                  <Input
                    id="max-chars"
                    type="number"
                    value={maxChars}
                    onChange={(e) => setMaxChars(parseInt(e.target.value) || 350)}
                  />
                  <p className="text-xs text-muted-foreground">AFI 36-2406 recommends 350 characters</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="scod">SCOD Date</Label>
                  <Input
                    id="scod"
                    value={scodDate}
                    onChange={(e) => setScodDate(e.target.value)}
                    placeholder="31 March"
                  />
                  <p className="text-xs text-muted-foreground">Static Close Out Date</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cycle-year">Current Cycle Year</Label>
                  <Input
                    id="cycle-year"
                    type="number"
                    value={cycleYear}
                    onChange={(e) => setCycleYear(parseInt(e.target.value) || new Date().getFullYear())}
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="style">Style Guidelines</Label>
                <Textarea
                  id="style"
                  value={styleGuidelines}
                  onChange={(e) => setStyleGuidelines(e.target.value)}
                  rows={4}
                  placeholder="Enter your writing style guidelines..."
                />
                <p className="text-xs text-muted-foreground">
                  These guidelines are injected into the system prompt via {"{{style_guidelines}}"}
                </p>
              </div>

              <Separator />

              <div className="space-y-4">
                <Label>Major Performance Areas</Label>
                <MPAEditor mgas={mgas} onChange={setMgas} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* System Prompt */}
        <TabsContent value="prompt">
          <Card>
            <CardHeader>
              <CardTitle>System Prompt</CardTitle>
              <CardDescription>
                Customize the AI system prompt. Use placeholders for dynamic values.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <PlaceholderStatus systemPrompt={systemPrompt} />
              <Textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={20}
                className="font-mono text-sm"
                placeholder="Enter your custom system prompt..."
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rank Verbs */}
        <TabsContent value="verbs">
          <Card>
            <CardHeader>
              <CardTitle>Rank Verb Progression</CardTitle>
              <CardDescription>
                Define action verbs appropriate for each rank level
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Rank</TableHead>
                    <TableHead>Primary Verbs</TableHead>
                    <TableHead>Secondary Verbs</TableHead>
                    <TableHead className="w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {RANKS.map(({ value: rank }) => {
                    const verbs = rankVerbs[rank] || { primary: [], secondary: [] };
                    return (
                      <TableRow key={rank}>
                        <TableCell className="font-medium">{rank}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {verbs.primary.map((v) => (
                              <Badge key={v} variant="secondary">{v}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {verbs.secondary.map((v) => (
                              <Badge key={v} variant="outline">{v}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
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
                              <Button variant="ghost" size="sm">Edit</Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Edit Verbs for {rank}</DialogTitle>
                                <DialogDescription>
                                  Enter comma-separated verbs for this rank
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div className="space-y-2">
                                  <Label>Primary Verbs</Label>
                                  <Input
                                    value={editingVerbs.primary}
                                    onChange={(e) => setEditingVerbs({ ...editingVerbs, primary: e.target.value })}
                                    placeholder="Led, Managed, Directed"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>Secondary Verbs</Label>
                                  <Input
                                    value={editingVerbs.secondary}
                                    onChange={(e) => setEditingVerbs({ ...editingVerbs, secondary: e.target.value })}
                                    placeholder="Supervised, Coordinated, Developed"
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
    </div>
  );
}
