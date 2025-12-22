"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { BulletCanvasPreview, type LineMetric } from "@/components/award/bullet-canvas-preview";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "@/components/ui/sonner";
import {
  AI_MODELS,
  AWARD_1206_CATEGORIES,
  AWARD_QUARTERS,
  AWARD_LEVELS,
  AWARD_CATEGORIES,
  getQuarterDateRange,
  getFiscalQuarterDateRange,
  DEFAULT_ACTION_VERBS,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  Copy,
  Check,
  Loader2,
  Pencil,
  Award,
  ChevronDown,
  ChevronUp,
  FileText,
  ExternalLink,
  Heart,
  Save,
  Share2,
  Trash2,
  ArrowDown,
  ArrowUp,
  Wand2,
  Type,
  Ruler,
  RotateCcw,
  Eye,
  Calendar,
  X,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { compressText, normalizeSpaces, getTextWidthPx, AF1206_LINE_WIDTH_PX } from "@/lib/bullet-fitting";
import type {
  Accomplishment,
  UserLLMSettings,
  AwardQuarter,
  AwardLevel,
  AwardCategory,
} from "@/types/database";

// ============================================================================
// Types
// ============================================================================

interface StatementVersion {
  id: string;
  text: string;
}

interface GeneratedStatementGroup {
  id: string;
  versions: StatementVersion[];
  selectedVersionId: string | null;
  category: string;
  sourceAccomplishmentIds: string[];
}

interface WorkspaceStatement {
  id: string;
  text: string;
  originalText: string;
  category: string;
  quarter: AwardQuarter;
  sourceAccomplishmentIds: string[];
}

interface NomineeInfo {
  id: string;
  full_name: string | null;
  rank: string | null;
  afsc: string | null;
  isManagedMember?: boolean;
}

interface QuarterGroup {
  quarter: AwardQuarter;
  label: string;
  dateRange: { start: string; end: string };
  entries: Accomplishment[];
}

const AWARD_DRAFT_KEY = "myepbuddy_award_draft_v2";

interface AwardDraftSession {
  workspaceStatements: WorkspaceStatement[];
  generatedGroups: GeneratedStatementGroup[];
  usedEntryIds: string[];
  nomineeId: string;
  nomineeName: string | null;
  nomineeRank: string | null;
  nomineeAfsc: string | null;
  isManagedMember: boolean;
  awardLevel: AwardLevel;
  awardCategory: AwardCategory;
  selectedQuarters: AwardQuarter[];
  savedAt: string;
}

// ============================================================================
// Component
// ============================================================================

export default function AwardPage() {
  const { profile, subordinates, managedMembers, epbConfig } = useUserStore();
  const supabase = createClient();
  const cycleYear = epbConfig?.current_cycle_year || new Date().getFullYear();

  // ---- Selection State ----
  const [selectedNominee, setSelectedNominee] = useState<string>("self");
  const [nomineeInfo, setNomineeInfo] = useState<NomineeInfo | null>(null);
  const [accomplishments, setAccomplishments] = useState<Accomplishment[]>([]);
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set());

  // ---- Config State ----
  const [selectedModel, setSelectedModel] = useState<string>("gemini-2.0-flash");
  const [useFiscalYear, setUseFiscalYear] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedQuarters, setSelectedQuarters] = useState<AwardQuarter[]>(["Q1", "Q2", "Q3", "Q4"]);
  const [awardLevel, setAwardLevel] = useState<AwardLevel>("squadron");
  const [awardCategory, setAwardCategory] = useState<AwardCategory>("amn");
  const [showConfig, setShowConfig] = useState(true);
  
  // ---- Generation Config ----
  const [statementsPerEntry, setStatementsPerEntry] = useState(1);
  const [versionsPerStatement, setVersionsPerStatement] = useState(3);
  const [selectedCategoriesToGenerate, setSelectedCategoriesToGenerate] = useState<string[]>(AWARD_1206_CATEGORIES.map(c => c.key));
  const [combineEntries, setCombineEntries] = useState(false); // true = combine all into one, false = separate per entry
  const [sentencesPerStatement, setSentencesPerStatement] = useState<2 | 3>(2); // 2 or 3 sentences per statement

  // ---- Generation State ----
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedGroups, setGeneratedGroups] = useState<GeneratedStatementGroup[]>([]);
  const [activeGenerationTab, setActiveGenerationTab] = useState<string>("");
  const [versionsExpanded, setVersionsExpanded] = useState(true);

  // ---- Workspace State ----
  const [workspaceStatements, setWorkspaceStatements] = useState<WorkspaceStatement[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [workspaceText, setWorkspaceText] = useState<string>("");
  const workspaceTextareaRef = useRef<HTMLTextAreaElement>(null);

  // ---- Workspace Tools State ----
  const [isRevising, setIsRevising] = useState(false);
  const [revisionOptions, setRevisionOptions] = useState<string[]>([]);
  const [selectedTextRange, setSelectedTextRange] = useState<{ start: number; end: number } | null>(null);
  const [showRevisionPopover, setShowRevisionPopover] = useState(false);
  const [showSynonymPopover, setShowSynonymPopover] = useState(false);
  const [synonyms, setSynonyms] = useState<string[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [convertOptions, setConvertOptions] = useState<string[]>([]);
  const [targetSentences, setTargetSentences] = useState<2 | 3>(2);

  // ---- Save Dialog State ----
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [shareWithNominee, setShareWithNominee] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // ---- Misc State ----
  const [hasUserKey, setHasUserKey] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [viewingEntry, setViewingEntry] = useState<Accomplishment | null>(null);
  const [viewingQuarterEntries, setViewingQuarterEntries] = useState<Accomplishment[]>([]);
  const [viewingQuarterLabel, setViewingQuarterLabel] = useState<string>("");
  
  // Track which entries have been used for saved statements
  const [usedEntryIds, setUsedEntryIds] = useState<Set<string>>(new Set());
  
  // Track which generated categories are expanded
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Derived
  const isManagedMember = selectedNominee.startsWith("managed:");
  const managedMemberId = isManagedMember ? selectedNominee.replace("managed:", "") : null;
  const activeWorkspaceStatement = workspaceStatements.find((s) => s.id === activeWorkspaceId);

  // ============================================================================
  // Effects
  // ============================================================================

  // Load draft from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(AWARD_DRAFT_KEY);
      if (saved) {
        const draft: AwardDraftSession = JSON.parse(saved);
        // Restore session if there's any work in progress
        if (draft.workspaceStatements.length > 0 || draft.generatedGroups?.length > 0) {
          setWorkspaceStatements(draft.workspaceStatements || []);
          setGeneratedGroups(draft.generatedGroups || []);
          setUsedEntryIds(new Set(draft.usedEntryIds || []));
          setAwardLevel(draft.awardLevel);
          setAwardCategory(draft.awardCategory);
          setSelectedQuarters(draft.selectedQuarters);
          if (draft.workspaceStatements.length > 0) {
            setActiveWorkspaceId(draft.workspaceStatements[0]?.id || null);
          }
          toast.info("Restored your previous session");
        }
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  // Save draft to localStorage (includes generated statements and used entries)
  useEffect(() => {
    if ((workspaceStatements.length > 0 || generatedGroups.length > 0) && nomineeInfo) {
      const draft: AwardDraftSession = {
        workspaceStatements,
        generatedGroups,
        usedEntryIds: Array.from(usedEntryIds),
        nomineeId: nomineeInfo.id,
        nomineeName: nomineeInfo.full_name,
        nomineeRank: nomineeInfo.rank,
        nomineeAfsc: nomineeInfo.afsc,
        isManagedMember: nomineeInfo.isManagedMember || false,
        awardLevel,
        awardCategory,
        selectedQuarters,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(AWARD_DRAFT_KEY, JSON.stringify(draft));
    }
  }, [workspaceStatements, generatedGroups, usedEntryIds, nomineeInfo, awardLevel, awardCategory, selectedQuarters]);

  // Update workspace text when active statement changes
  useEffect(() => {
    if (activeWorkspaceStatement) {
      setWorkspaceText(activeWorkspaceStatement.text);
    }
  }, [activeWorkspaceId, activeWorkspaceStatement]);

  // Check for API keys
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
        const hasKey =
          (selectedProvider === "openai" && data.openai_key) ||
          (selectedProvider === "anthropic" && data.anthropic_key) ||
          (selectedProvider === "google" && data.google_key) ||
          (selectedProvider === "xai" && data.grok_key);
        setHasUserKey(!!hasKey);
      } else {
        setHasUserKey(false);
      }
    }
    checkUserKeys();
  }, [profile, selectedModel, supabase]);

  // Load nominee info and accomplishments
  useEffect(() => {
    async function loadNomineeData() {
      if (!profile) return;

      let info: NomineeInfo | null = null;

      if (selectedNominee === "self") {
        info = {
          id: profile.id,
          full_name: profile.full_name,
          rank: profile.rank,
          afsc: profile.afsc,
        };
      } else if (isManagedMember && managedMemberId) {
        const member = managedMembers.find((m) => m.id === managedMemberId);
        if (member) {
          info = {
            id: member.id,
            full_name: member.full_name,
            rank: member.rank,
            afsc: member.afsc,
            isManagedMember: true,
          };
        }
      } else {
        const sub = subordinates.find((s) => s.id === selectedNominee);
        if (sub) {
          info = {
            id: sub.id,
            full_name: sub.full_name,
            rank: sub.rank,
            afsc: sub.afsc,
          };
        }
      }

      setNomineeInfo(info);

      // Load accomplishments
      if (info) {
        let query = supabase
          .from("accomplishments")
          .select("*")
          .eq("cycle_year", cycleYear)
          .order("date", { ascending: false });

        if (info.isManagedMember) {
          query = query.eq("team_member_id", info.id);
        } else {
          query = query.eq("user_id", info.id).is("team_member_id", null);
        }

        const { data } = await query;
        setAccomplishments((data as Accomplishment[]) || []);
      }
    }

    loadNomineeData();
    setSelectedEntryIds(new Set());
  }, [selectedNominee, profile, subordinates, managedMembers, cycleYear, supabase, isManagedMember, managedMemberId]);

  // ============================================================================
  // Helpers
  // ============================================================================

  const quarterGroups = useMemo<QuarterGroup[]>(() => {
    return AWARD_QUARTERS.map((q) => {
      const range = useFiscalYear
        ? getFiscalQuarterDateRange(q.value, selectedYear)
        : getQuarterDateRange(q.value, selectedYear);

      const entries = accomplishments.filter((entry) => {
        const entryDate = new Date(entry.date);
        return entryDate >= new Date(range.start) && entryDate <= new Date(range.end);
      });

      return {
        quarter: q.value,
        label: q.label,
        dateRange: range,
        entries,
      };
    });
  }, [accomplishments, selectedYear, useFiscalYear]);

  const selectedEntries = useMemo(() => {
    return accomplishments.filter((a) => selectedEntryIds.has(a.id));
  }, [accomplishments, selectedEntryIds]);

  const getQuarterForDate = useCallback(
    (date: string): AwardQuarter => {
      const entryDate = new Date(date);
      for (const group of quarterGroups) {
        if (entryDate >= new Date(group.dateRange.start) && entryDate <= new Date(group.dateRange.end)) {
          return group.quarter;
        }
      }
      return "Q1";
    },
    [quarterGroups]
  );

  // ============================================================================
  // Actions
  // ============================================================================

  function toggleEntrySelection(id: string) {
    setSelectedEntryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllInQuarter(quarter: AwardQuarter) {
    const group = quarterGroups.find((g) => g.quarter === quarter);
    if (!group) return;
    setSelectedEntryIds((prev) => {
      const next = new Set(prev);
      group.entries.forEach((e) => next.add(e.id));
      return next;
    });
  }

  function deselectAllInQuarter(quarter: AwardQuarter) {
    const group = quarterGroups.find((g) => g.quarter === quarter);
    if (!group) return;
    setSelectedEntryIds((prev) => {
      const next = new Set(prev);
      group.entries.forEach((e) => next.delete(e.id));
      return next;
    });
  }

  async function handleGenerate() {
    if (!nomineeInfo || selectedEntries.length === 0) return;
    setIsGenerating(true);
    setGeneratedGroups([]);

    try {
      const periodStart = Math.min(
        ...selectedQuarters.map((q) => {
          const range = useFiscalYear ? getFiscalQuarterDateRange(q, selectedYear) : getQuarterDateRange(q, selectedYear);
          return new Date(range.start).getTime();
        })
      );
      const periodEnd = Math.max(
        ...selectedQuarters.map((q) => {
          const range = useFiscalYear ? getFiscalQuarterDateRange(q, selectedYear) : getQuarterDateRange(q, selectedYear);
          return new Date(range.end).getTime();
        })
      );
      const periodText = `${new Date(periodStart).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} - ${new Date(periodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`;

      const response = await fetch("/api/generate-award", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nomineeId: nomineeInfo.id,
          nomineeRank: nomineeInfo.rank,
          nomineeAfsc: nomineeInfo.afsc,
          nomineeName: nomineeInfo.full_name,
          isManagedMember: nomineeInfo.isManagedMember,
          model: selectedModel,
          awardLevel,
          awardCategory,
          awardPeriod: periodText,
          // Generation config
          statementsPerEntry,
          versionsPerStatement,
          sentencesPerStatement,
          categoriesToGenerate: selectedCategoriesToGenerate,
          combineEntries,
          accomplishments: selectedEntries.map((a) => ({
            id: a.id, // Include ID for tracking
            mpa: a.mpa,
            action_verb: a.action_verb,
            details: a.details,
            impact: a.impact,
            metrics: a.metrics,
            date: a.date,
          })),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Generation failed");
      }

      const data = await response.json();

      const groups: GeneratedStatementGroup[] = [];
      for (const cat of data.statements) {
        for (let i = 0; i < cat.statementGroups.length; i++) {
          const group = cat.statementGroups[i];
          const groupId = `${cat.category}-${i}-${Date.now()}`;
          // Handle both array of strings (versions) and object with versions + sourceIds
          const versions = Array.isArray(group) ? group : group.versions;
          const sourceIds = Array.isArray(group) 
            ? Array.from(selectedEntryIds) 
            : (group.sourceAccomplishmentIds || Array.from(selectedEntryIds));
          
          groups.push({
            id: groupId,
            category: cat.category,
            versions: versions.map((text: string, idx: number) => ({
              id: `${groupId}-v${idx}`,
              text,
            })),
            selectedVersionId: null,
            sourceAccomplishmentIds: sourceIds,
          });
        }
      }

      setGeneratedGroups(groups);
      if (groups.length > 0) {
        setActiveGenerationTab(groups[0].category);
        // Always expand the versions section when generating
        setVersionsExpanded(true);
        // Auto-expand ALL categories so user can see all generated statements
        const allCategories = new Set(groups.map(g => g.category));
        setExpandedCategories(allCategories);
      }
      toast.success("Statements generated! Choose versions to add to workspace.");
    } catch (error) {
      console.error("Generation error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to generate statements");
    } finally {
      setIsGenerating(false);
    }
  }

  // Ensure statement has the required "- " prefix and remove forbidden punctuation
  function formatAwardStatement(text: string): string {
    let formatted = text.trim();
    
    // Remove em-dashes and replace with commas
    formatted = formatted.replace(/--/g, ",");
    formatted = formatted.replace(/—/g, ","); // Also handle unicode em-dash
    formatted = formatted.replace(/–/g, ","); // Also handle unicode en-dash
    
    // Remove semicolons and replace with commas
    formatted = formatted.replace(/;/g, ",");
    
    // Clean up any double commas that might result
    formatted = formatted.replace(/,\s*,/g, ",");
    formatted = formatted.replace(/\s+,/g, ",");
    
    // Ensure "- " prefix
    if (formatted.startsWith("- ")) return formatted;
    if (formatted.startsWith("-")) return "- " + formatted.substring(1).trimStart();
    return "- " + formatted;
  }

  // Alias for backward compatibility
  const ensureDashPrefix = formatAwardStatement;

  function addToWorkspace(group: GeneratedStatementGroup, versionId: string) {
    const version = group.versions.find((v) => v.id === versionId);
    if (!version) return;

    const sourceAccomp = accomplishments.find((a) => group.sourceAccomplishmentIds.includes(a.id));
    const quarter = sourceAccomp ? getQuarterForDate(sourceAccomp.date) : "Q1";

    // Ensure the statement has the required "- " prefix
    const formattedText = ensureDashPrefix(version.text);

    const workspaceStatement: WorkspaceStatement = {
      id: `ws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text: formattedText,
      originalText: formattedText,
      category: group.category,
      quarter,
      sourceAccomplishmentIds: group.sourceAccomplishmentIds,
    };

    setWorkspaceStatements((prev) => [...prev, workspaceStatement]);
    setActiveWorkspaceId(workspaceStatement.id);
    setVersionsExpanded(false); // Collapse versions when adding to workspace
    toast.success("Added to workspace");
  }

  function removeFromWorkspace(id: string) {
    setWorkspaceStatements((prev) => prev.filter((s) => s.id !== id));
    if (activeWorkspaceId === id) {
      const remaining = workspaceStatements.filter((s) => s.id !== id);
      setActiveWorkspaceId(remaining[0]?.id || null);
    }
  }

  function updateWorkspaceText(newText?: string) {
    if (!activeWorkspaceId) return;
    const textToSave = newText ?? workspaceText;
    setWorkspaceStatements((prev) =>
      prev.map((s) => (s.id === activeWorkspaceId ? { ...s, text: textToSave } : s))
    );
  }

  function revertToOriginal() {
    if (!activeWorkspaceStatement) return;
    setWorkspaceText(activeWorkspaceStatement.originalText);
    setWorkspaceStatements((prev) =>
      prev.map((s) => (s.id === activeWorkspaceId ? { ...s, text: s.originalText } : s))
    );
    toast.success("Reverted to original");
  }

  function handleCompress() {
    if (!workspaceText) return;
    
    const { text: compressedText, savedPx } = compressText(workspaceText);
    
    if (savedPx > 0) {
      setWorkspaceText(compressedText);
      updateWorkspaceText(compressedText);
      toast.success(`Compressed! Saved ${Math.round(savedPx)}px`);
    } else {
      toast.info("Already compressed - no regular spaces to optimize");
    }
  }

  function handleResetSpacing() {
    if (!workspaceText) return;
    
    const normalizedText = normalizeSpaces(workspaceText);
    if (normalizedText !== workspaceText) {
      setWorkspaceText(normalizedText);
      updateWorkspaceText(normalizedText);
      toast.success("Reset to normal spacing");
    } else {
      toast.info("Already using normal spacing");
    }
  }

  // Per-line compression - uses line metrics from canvas preview
  const [currentLineMetrics, setCurrentLineMetrics] = useState<LineMetric[]>([]);

  function handleCompressLine(lineIndex: number) {
    if (!workspaceText || lineIndex >= currentLineMetrics.length) return;
    
    const lineMetric = currentLineMetrics[lineIndex];
    if (!lineMetric || lineMetric.isCompressed) return;
    
    // Get the line text and compress just that portion
    const before = workspaceText.substring(0, lineMetric.startIndex);
    const lineText = workspaceText.substring(lineMetric.startIndex, lineMetric.endIndex);
    const after = workspaceText.substring(lineMetric.endIndex);
    
    // Replace normal spaces with thin spaces in this line only
    const compressedLine = lineText.replace(/ /g, '\u2006');
    
    const newText = before + compressedLine + after;
    setWorkspaceText(newText);
    updateWorkspaceText(newText);
    toast.success(`Compressed line ${lineIndex + 1}`);
  }

  function handleNormalizeLine(lineIndex: number) {
    if (!workspaceText || lineIndex >= currentLineMetrics.length) return;
    
    const lineMetric = currentLineMetrics[lineIndex];
    if (!lineMetric || !lineMetric.isCompressed) return;
    
    // Get the line text and normalize just that portion
    const before = workspaceText.substring(0, lineMetric.startIndex);
    const lineText = workspaceText.substring(lineMetric.startIndex, lineMetric.endIndex);
    const after = workspaceText.substring(lineMetric.endIndex);
    
    // Replace thin/medium spaces with normal spaces in this line only
    const normalizedLine = lineText.replace(/[\u2006\u2004]/g, ' ');
    
    const newText = before + normalizedLine + after;
    setWorkspaceText(newText);
    updateWorkspaceText(newText);
    toast.success(`Normalized line ${lineIndex + 1}`);
  }

  async function handleReviseSelection(mode: "expand" | "compress" | "general" = "general") {
    const textarea = workspaceTextareaRef.current;
    if (!textarea || textarea.selectionStart === textarea.selectionEnd) {
      toast.error("Please highlight text to revise");
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = workspaceText.substring(start, end);

    if (selectedText.length < 3) {
      toast.error("Please select more text");
      return;
    }

    setSelectedTextRange({ start, end });
    setIsRevising(true);

    try {
      const response = await fetch("/api/revise-selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullStatement: workspaceText,
          selectedText,
          selectionStart: start,
          selectionEnd: end,
          model: selectedModel,
          mode, // "expand" = use longer words, "compress" = use shorter words, "general" = improve quality
        }),
      });

      if (!response.ok) throw new Error("Revision failed");

      const data = await response.json();
      setRevisionOptions(data.revisions);
      setShowRevisionPopover(true);
    } catch (error) {
      console.error("Revision error:", error);
      toast.error("Failed to generate revisions");
    } finally {
      setIsRevising(false);
    }
  }

  function applyRevision(revision: string) {
    if (!selectedTextRange) return;
    const newText =
      workspaceText.substring(0, selectedTextRange.start) +
      revision +
      workspaceText.substring(selectedTextRange.end);
    setWorkspaceText(newText);
    setShowRevisionPopover(false);
    setSelectedTextRange(null);
    setRevisionOptions([]);
  }

  function handleShowSynonyms() {
    const textarea = workspaceTextareaRef.current;
    if (!textarea || textarea.selectionStart === textarea.selectionEnd) {
      toast.error("Please highlight a word");
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedWord = workspaceText.substring(start, end).trim();

    if (selectedWord.includes(" ") || selectedWord.length < 2) {
      toast.error("Please select a single word");
      return;
    }

    setSelectedTextRange({ start, end });

    const matchingCategory = Object.values(DEFAULT_ACTION_VERBS).find((verbs) =>
      verbs.some((v) => v.toLowerCase() === selectedWord.toLowerCase())
    );

    if (matchingCategory) {
      setSynonyms(matchingCategory.filter((v) => v.toLowerCase() !== selectedWord.toLowerCase()).slice(0, 8));
    } else {
      setSynonyms(["Led", "Directed", "Managed", "Coordinated", "Executed", "Spearheaded", "Orchestrated", "Championed"]);
    }

    setShowSynonymPopover(true);
  }

  function applySynonym(synonym: string) {
    if (!selectedTextRange) return;
    const newText =
      workspaceText.substring(0, selectedTextRange.start) +
      synonym +
      workspaceText.substring(selectedTextRange.end);
    setWorkspaceText(newText);
    setShowSynonymPopover(false);
    setSelectedTextRange(null);
    setSynonyms([]);
  }

  async function handleConvertSentences(target: 2 | 3) {
    if (!workspaceText || !nomineeInfo) return;
    
    setTargetSentences(target);
    setIsConverting(true);
    setConvertOptions([]);

    try {
      const response = await fetch("/api/convert-sentences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          statement: workspaceText,
          targetSentences: target,
          nomineeRank: nomineeInfo.rank,
          nomineeName: nomineeInfo.full_name,
          model: selectedModel,
        }),
      });

      if (!response.ok) throw new Error("Conversion failed");

      const data = await response.json();
      setConvertOptions(data.versions);
      setShowConvertDialog(true);
    } catch (error) {
      console.error("Conversion error:", error);
      toast.error("Failed to convert statement");
    } finally {
      setIsConverting(false);
    }
  }

  function applyConversion(converted: string) {
    const formatted = ensureDashPrefix(converted);
    setWorkspaceText(formatted);
    setWorkspaceStatements((prev) =>
      prev.map((s) => (s.id === activeWorkspaceId ? { ...s, text: formatted } : s))
    );
    setShowConvertDialog(false);
    setConvertOptions([]);
    toast.success(`Converted to ${targetSentences} sentence${targetSentences > 1 ? "s" : ""}`);
  }

  async function handleSave() {
    if (!activeWorkspaceStatement || !profile || !nomineeInfo) return;
    setIsSaving(true);

    try {
      const categoryInfo = AWARD_1206_CATEGORIES.find((c) => c.key === activeWorkspaceStatement.category);
      const mpa = categoryInfo?.key || activeWorkspaceStatement.category;
      const isForSelf = nomineeInfo.id === profile.id && !nomineeInfo.isManagedMember;

      const { data: savedStatement, error: insertError } = await supabase
        .from("refined_statements")
        .insert({
          user_id: profile.id,
          created_by: profile.id,
          team_member_id: nomineeInfo.isManagedMember ? nomineeInfo.id : null,
          mpa,
          afsc: nomineeInfo.afsc || profile.afsc || "",
          rank: nomineeInfo.rank || profile.rank || "AB",
          statement: activeWorkspaceStatement.text,
          cycle_year: cycleYear,
          statement_type: "award",
          is_favorite: false,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      if (shareWithNominee && !isForSelf && savedStatement && !nomineeInfo.isManagedMember) {
        await supabase.from("statement_shares").insert({
          statement_id: savedStatement.id,
          owner_id: profile.id,
          share_type: "user",
          shared_with_id: nomineeInfo.id,
        });
      }

      // Track which entries were used for this statement
      setUsedEntryIds((prev) => {
        const next = new Set(prev);
        activeWorkspaceStatement.sourceAccomplishmentIds.forEach((id) => next.add(id));
        return next;
      });

      // Only remove the saved statement from workspace (keep generated statements)
      removeFromWorkspace(activeWorkspaceStatement.id);

      toast.success(
        shareWithNominee && !isForSelf
          ? `Saved and shared with ${nomineeInfo.full_name}`
          : "Saved to your library"
      );
      setShowSaveDialog(false);
    } catch (error) {
      console.error("Save error:", error);
      toast.error("Failed to save statement");
    } finally {
      setIsSaving(false);
    }
  }

  function clearWorkspace() {
    localStorage.removeItem(AWARD_DRAFT_KEY);
    setWorkspaceStatements([]);
    setGeneratedGroups([]);
    setUsedEntryIds(new Set());
    setExpandedCategories(new Set());
    setActiveWorkspaceId(null);
    setWorkspaceText("");
    toast.success("Session cleared");
  }

  async function copyToClipboard(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
      toast.success("Copied!");
    } catch {
      toast.error("Failed to copy");
    }
  }

  const canManageTeam = subordinates.length > 0 || managedMembers.length > 0;
  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  // Width and sentence analysis
  const textWidth = workspaceText ? getTextWidthPx(workspaceText) : 0;
  const estimatedLines = Math.ceil(textWidth / AF1206_LINE_WIDTH_PX);
  const isOverflow = estimatedLines > 3;
  // Count sentences (periods followed by space or end of string, excluding "- " prefix)
  const sentenceCount = workspaceText 
    ? (workspaceText.replace(/^-\s*/, "").match(/[.!?]+(?:\s|$)/g) || []).length 
    : 0;

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="flex flex-col gap-4 w-full transition-all duration-200">
      {/* ============================================================================ */}
      {/* TOP: Selection & Config (Collapsible) */}
      {/* ============================================================================ */}
      <Collapsible open={showConfig} onOpenChange={setShowConfig}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Award className="size-5" />
                  <div>
                    <CardTitle className="text-base">Generate Award Statement</CardTitle>
                    <CardDescription className="text-xs">
                      {nomineeInfo ? `${nomineeInfo.rank} ${nomineeInfo.full_name}` : "Select nominee"} • {selectedEntries.length} entries selected
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{awardLevel}</Badge>
                  <Badge variant="outline">{awardCategory}</Badge>
                  {showConfig ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <CardContent className="pt-0 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Nominee */}
                <div className="space-y-2">
                  <Label className="text-xs">Nominee</Label>
                  <Select value={selectedNominee} onValueChange={setSelectedNominee}>
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

              {/* Generation Options */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                {/* Sentences per Statement (Line Length) */}
                <div className="space-y-2">
                  <Label className="text-xs">Lines/Statement</Label>
                  <Select value={sentencesPerStatement.toString()} onValueChange={(v) => setSentencesPerStatement(parseInt(v) as 2 | 3)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">2 Lines (shorter)</SelectItem>
                      <SelectItem value="3">3 Lines (longer)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Statements per Entry */}
                <div className="space-y-2">
                  <Label className="text-xs">Statements/Entry</Label>
                  <Select value={statementsPerEntry.toString()} onValueChange={(v) => setStatementsPerEntry(parseInt(v))}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Versions per Statement */}
                <div className="space-y-2">
                  <Label className="text-xs">Versions/Statement</Label>
                  <Select value={versionsPerStatement.toString()} onValueChange={(v) => setVersionsPerStatement(parseInt(v))}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <SelectItem key={n} value={n.toString()}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* 1206 Categories to Generate */}
                <div className="space-y-2 col-span-2">
                  <Label className="text-xs">1206 Sections to Generate</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="h-9 w-full justify-between text-left font-normal">
                        <span className="truncate">
                          {selectedCategoriesToGenerate.length === AWARD_1206_CATEGORIES.length
                            ? "All Sections"
                            : selectedCategoriesToGenerate.length === 0
                            ? "Select sections..."
                            : `${selectedCategoriesToGenerate.length} selected`}
                        </span>
                        <ChevronDown className="size-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 p-2" align="start">
                      <div className="space-y-2">
                        <div className="flex gap-2 pb-2 border-b">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 flex-1 text-xs"
                            onClick={() => setSelectedCategoriesToGenerate(AWARD_1206_CATEGORIES.map(c => c.key))}
                          >
                            All
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 flex-1 text-xs"
                            onClick={() => setSelectedCategoriesToGenerate([])}
                          >
                            None
                          </Button>
                        </div>
                        {AWARD_1206_CATEGORIES.map((cat) => (
                          <Tooltip key={cat.key}>
                            <TooltipTrigger asChild>
                              <label className="flex items-start gap-2 cursor-pointer hover:bg-muted/50 p-2 rounded">
                                <Checkbox
                                  checked={selectedCategoriesToGenerate.includes(cat.key)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setSelectedCategoriesToGenerate(prev => [...prev, cat.key]);
                                    } else {
                                      setSelectedCategoriesToGenerate(prev => prev.filter(k => k !== cat.key));
                                    }
                                  }}
                                  className="mt-0.5"
                                />
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-sm font-medium">{cat.label}</span>
                                  {cat.description && (
                                    <span className="text-xs text-muted-foreground line-clamp-2">{cat.description}</span>
                                  )}
                                </div>
                              </label>
                            </TooltipTrigger>
                            {cat.description && (
                              <TooltipContent side="right" className="max-w-[250px]">
                                <p className="text-xs">{cat.description}</p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <Separator />

              {/* Quarter Selection */}
              <div className="space-y-3 min-h-[300px]">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Select Entries by Quarter</Label>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Fiscal Year</Label>
                    <Switch checked={useFiscalYear} onCheckedChange={setUseFiscalYear} />
                    <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                      <SelectTrigger className="h-7 w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {years.map((y) => (
                          <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  {quarterGroups.map((group) => {
                    const selectedCount = group.entries.filter((e) => selectedEntryIds.has(e.id)).length;
                    const usedCount = group.entries.filter((e) => usedEntryIds.has(e.id)).length;

                    return (
                      <div key={group.quarter} className="border rounded-lg p-4 space-y-3 min-h-[200px]">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={selectedQuarters.includes(group.quarter)}
                              onCheckedChange={(checked) => {
                                setSelectedQuarters((prev) =>
                                  checked ? [...prev, group.quarter] : prev.filter((q) => q !== group.quarter)
                                );
                              }}
                            />
                            <span className="font-medium">{group.label}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {usedCount > 0 && (
                              <Badge variant="outline" className="text-[10px] h-5 gap-1 text-green-600 border-green-200 bg-green-50 dark:bg-green-900/20">
                                <Check className="size-2.5" />
                                {usedCount} used
                              </Badge>
                            )}
                            <Badge variant={selectedCount > 0 ? "default" : "secondary"} className="text-xs">
                              {selectedCount}/{group.entries.length}
                            </Badge>
                          </div>
                        </div>

                        {group.entries.length > 0 && (
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={() => selectAllInQuarter(group.quarter)}>
                              Select All
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs flex-1" onClick={() => deselectAllInQuarter(group.quarter)}>
                              Clear
                            </Button>
                            <Button 
                              size="sm" 
                              variant="secondary" 
                              className="h-7 text-xs"
                              onClick={() => {
                                setViewingQuarterEntries(group.entries);
                                setViewingQuarterLabel(group.label);
                              }}
                            >
                              <Eye className="size-3" />
                            </Button>
                          </div>
                        )}

                        <ScrollArea className="h-[180px]">
                          {group.entries.length === 0 ? (
                            <div className="flex items-center justify-center h-full text-muted-foreground">
                              <p className="text-sm">No entries for this quarter</p>
                            </div>
                          ) : (
                            <TooltipProvider delayDuration={300}>
                              <div className="space-y-2 pr-2">
                                {group.entries.map((entry) => {
                                  const isUsed = usedEntryIds.has(entry.id);
                                  const isSelected = selectedEntryIds.has(entry.id);
                                  return (
                                    <div
                                      key={entry.id}
                                      onClick={() => toggleEntrySelection(entry.id)}
                                      className={cn(
                                        "flex items-start gap-2 p-2.5 rounded-lg border transition-all cursor-pointer relative group/entry",
                                        isUsed && "opacity-60",
                                        isSelected
                                          ? "bg-primary/10 border-primary/40 shadow-sm"
                                          : "hover:bg-muted/50 hover:border-muted-foreground/20 border-transparent"
                                      )}
                                    >
                                      {/* Used badge */}
                                      {isUsed && (
                                        <div className="absolute -top-1.5 -right-1.5 z-10">
                                          <Badge variant="default" className="text-[9px] h-4 px-1 bg-green-600">
                                            <Check className="size-2.5 mr-0.5" />
                                            Used
                                          </Badge>
                                        </div>
                                      )}
                                      
                                      {/* Checkbox */}
                                      <div 
                                        className="pt-0.5"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <Checkbox
                                          checked={isSelected}
                                          onCheckedChange={() => toggleEntrySelection(entry.id)}
                                        />
                                      </div>
                                      
                                      {/* Content */}
                                      <div className="flex-1 min-w-0">
                                        <p className={cn(
                                          "text-sm font-medium leading-tight",
                                          isUsed && "line-through decoration-green-600"
                                        )}>
                                          {entry.action_verb}
                                        </p>
                                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{entry.details}</p>
                                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                          <Badge variant="outline" className="text-[10px] h-5 shrink-0">
                                            {entry.mpa.replace(/_/g, " ")}
                                          </Badge>
                                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                            <Calendar className="size-2.5" />
                                            {new Date(entry.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                          </span>
                                        </div>
                                      </div>
                                      
                                      {/* Details button - appears on hover */}
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 w-7 p-0 shrink-0 opacity-0 group-hover/entry:opacity-100 transition-opacity"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setViewingEntry(entry);
                                            }}
                                          >
                                            <Eye className="size-3.5" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="left">
                                          View details
                                        </TooltipContent>
                                      </Tooltip>
                                    </div>
                                  );
                                })}
                              </div>
                            </TooltipProvider>
                          )}
                        </ScrollArea>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Combine Entries Option - only show when multiple entries selected */}
              {selectedEntries.length > 1 && (
                <div className="p-3 rounded-lg border bg-muted/30">
                  <div className="flex items-center gap-4">
                    <Label className="text-sm font-medium shrink-0">{selectedEntries.length} entries selected:</Label>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={!combineEntries ? "default" : "outline"}
                        onClick={() => setCombineEntries(false)}
                        className="h-8"
                      >
                        Separate
                      </Button>
                      <Button
                        size="sm"
                        variant={combineEntries ? "default" : "outline"}
                        onClick={() => setCombineEntries(true)}
                        className="h-8"
                      >
                        Combine All
                      </Button>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {combineEntries 
                        ? "Merge entries & sum metrics into one statement" 
                        : `Generate ${statementsPerEntry} statement(s) per entry`}
                    </span>
                  </div>
                </div>
              )}

              {/* Generate Button */}
              <Button 
                onClick={handleGenerate} 
                disabled={isGenerating || selectedEntries.length === 0 || selectedCategoriesToGenerate.length === 0} 
                className="w-full" 
                size="lg"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="size-4 animate-spin mr-2" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4 mr-2" />
                    Generate Statements
                    <span className="text-xs opacity-80 ml-2">
                      ({selectedEntries.length} {selectedEntries.length === 1 ? "entry" : "entries"} 
                      {combineEntries && selectedEntries.length > 1 ? " combined" : ""} 
                      → {selectedCategoriesToGenerate.length} {selectedCategoriesToGenerate.length === 1 ? "section" : "sections"})
                    </span>
                  </>
                )}
              </Button>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* ============================================================================ */}
      {/* CENTER: Choose Versions (Collapsible) */}
      {/* ============================================================================ */}
      {generatedGroups.length > 0 && (
        <Collapsible open={versionsExpanded} onOpenChange={setVersionsExpanded}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="size-5" />
                    <div>
                      <CardTitle className="text-base">Choose Statement Versions</CardTitle>
                      <CardDescription className="text-xs">
                        {generatedGroups.length} statement groups generated • Click a version to add to workspace
                      </CardDescription>
                    </div>
                  </div>
                  {versionsExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                </div>
              </CardHeader>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <CardContent className="pt-0 space-y-3">
                {/* Category accordion */}
                {Array.from(new Set(generatedGroups.map((g) => g.category))).map((cat) => {
                  const catInfo = AWARD_1206_CATEGORIES.find((c) => c.key === cat);
                  const categoryGroups = generatedGroups.filter((g) => g.category === cat);
                  const isExpanded = expandedCategories.has(cat);

                  return (
                    <div key={cat} className="border rounded-lg overflow-hidden">
                      {/* Category Header */}
                      <button
                        onClick={() => {
                          setExpandedCategories((prev) => {
                            const next = new Set(prev);
                            if (next.has(cat)) {
                              next.delete(cat);
                            } else {
                              next.add(cat);
                            }
                            return next;
                          });
                        }}
                        className="w-full flex items-center justify-between p-4 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "size-8 rounded-full flex items-center justify-center text-xs font-bold",
                            isExpanded ? "bg-primary text-primary-foreground" : "bg-muted"
                          )}>
                            {categoryGroups.length}
                          </div>
                          <div>
                            <p className="font-medium">{catInfo?.heading || cat}</p>
                            <p className="text-xs text-muted-foreground">
                              {categoryGroups.length} statement{categoryGroups.length !== 1 ? "s" : ""} generated
                            </p>
                          </div>
                        </div>
                        {isExpanded ? <ChevronUp className="size-5" /> : <ChevronDown className="size-5" />}
                      </button>

                      {/* Category Content */}
                      {isExpanded && (
                        <div className="p-4 space-y-6 border-t">
                          {categoryGroups.map((group, groupIdx) => {
                            // Get the source entries for this statement group
                            const sourceEntries = accomplishments.filter(a => 
                              group.sourceAccomplishmentIds.includes(a.id)
                            );
                            
                            return (
                              <div key={group.id} className="space-y-3">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium text-muted-foreground">
                                      Statement Option {groupIdx + 1}
                                    </p>
                                    <Badge variant="outline" className="text-xs">
                                      {group.versions.length} versions
                                    </Badge>
                                  </div>
                                  {sourceEntries.length > 0 && (
                                    <div className="flex items-center gap-1 flex-wrap">
                                      <span className="text-[10px] text-muted-foreground">From:</span>
                                      {sourceEntries.length <= 3 ? (
                                        sourceEntries.map((entry) => (
                                          <Tooltip key={entry.id}>
                                            <TooltipTrigger asChild>
                                              <Badge variant="secondary" className="text-[10px] h-5 cursor-help max-w-[150px] truncate">
                                                {entry.action_verb}
                                              </Badge>
                                            </TooltipTrigger>
                                            <TooltipContent side="top" className="max-w-xs">
                                              <p className="font-medium">{entry.action_verb}</p>
                                              <p className="text-xs text-muted-foreground">{entry.details}</p>
                                            </TooltipContent>
                                          </Tooltip>
                                        ))
                                      ) : (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Badge variant="secondary" className="text-[10px] h-5 cursor-help">
                                              {sourceEntries.length} entries combined
                                            </Badge>
                                          </TooltipTrigger>
                                          <TooltipContent side="top" className="max-w-xs">
                                            <ul className="text-xs space-y-1">
                                              {sourceEntries.map((entry) => (
                                                <li key={entry.id}>• {entry.action_verb}</li>
                                              ))}
                                            </ul>
                                          </TooltipContent>
                                        </Tooltip>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                                  {group.versions.map((version, vIdx) => (
                                    <div
                                      key={version.id}
                                      className="p-4 rounded-lg border bg-card hover:bg-muted/30 hover:border-primary/50 transition-colors cursor-pointer group flex flex-col"
                                      onClick={() => addToWorkspace(group, version.id)}
                                    >
                                      <div className="flex items-center justify-between mb-2">
                                        <Badge variant="secondary" className="text-xs">
                                          Version {String.fromCharCode(65 + vIdx)}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground">
                                          ~{Math.ceil(getTextWidthPx(version.text) / AF1206_LINE_WIDTH_PX)} lines
                                        </span>
                                      </div>
                                      <p className="text-sm whitespace-pre-wrap flex-1">{version.text}</p>
                                      <div className="flex items-center justify-between mt-3 pt-3 border-t">
                                        <span className="text-xs text-muted-foreground">
                                          {version.text.length} chars
                                        </span>
                                        <Button
                                          size="sm"
                                          className="h-7 text-xs"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            addToWorkspace(group, version.id);
                                          }}
                                        >
                                          <ArrowDown className="size-3 mr-1" />
                                          Use This
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Expand/Collapse All */}
                <div className="flex justify-center gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const allCats = new Set(generatedGroups.map((g) => g.category));
                      setExpandedCategories(allCats);
                    }}
                  >
                    Expand All
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setExpandedCategories(new Set())}
                  >
                    Collapse All
                  </Button>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* ============================================================================ */}
      {/* BOTTOM: Workspace */}
      {/* ============================================================================ */}
      <Card className="border-2">
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Pencil className="size-5" />
              <div>
                <CardTitle className="text-base">Statement Workspace</CardTitle>
                <CardDescription className="text-xs">
                  {workspaceStatements.length} statement{workspaceStatements.length !== 1 ? "s" : ""} in workspace
                </CardDescription>
              </div>
            </div>
            {workspaceStatements.length > 0 && (
              <Button size="sm" variant="outline" onClick={clearWorkspace}>
                <Trash2 className="size-3 mr-1" />
                Clear All
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {/* Fixed minimum height to prevent layout shifts */}
          <div style={{ minHeight: "400px" }} className="transition-all duration-300">
          {workspaceStatements.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
              <Pencil className="size-12 mx-auto mb-4 opacity-30" />
              <p className="text-sm">Generate statements above and add them here to edit</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Statement Tabs - stable height */}
              <div className="flex gap-2 overflow-x-auto pb-2 min-h-[40px]">
                {workspaceStatements.map((stmt, idx) => {
                  const catInfo = AWARD_1206_CATEGORIES.find((c) => c.key === stmt.category);
                  const isActive = activeWorkspaceId === stmt.id;
                  return (
                    <Button
                      key={stmt.id}
                      size="sm"
                      variant={isActive ? "default" : "outline"}
                      className="shrink-0 text-xs"
                      onClick={() => {
                        updateWorkspaceText();
                        setActiveWorkspaceId(stmt.id);
                      }}
                    >
                      {catInfo?.label || stmt.category} #{idx + 1}
                      {!isActive && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFromWorkspace(stmt.id);
                          }}
                          className="ml-2 hover:text-destructive"
                        >
                          <X className="size-3" />
                        </button>
                      )}
                    </Button>
                  );
                })}
              </div>

              {activeWorkspaceStatement && (
                <>
                  {/* Metadata Bar - fixed height to prevent shifts */}
                  <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/30 rounded-lg min-h-[48px]">
                    <Badge variant="secondary" className="text-xs">
                      {activeWorkspaceStatement.quarter} {selectedYear}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {AWARD_1206_CATEGORIES.find((c) => c.key === activeWorkspaceStatement.category)?.label}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {nomineeInfo?.full_name}
                    </Badge>
                    <Separator orientation="vertical" className="h-4" />
                    <span className={cn("text-xs font-medium transition-colors", isOverflow ? "text-destructive" : "text-muted-foreground")}>
                      {sentenceCount} sentence{sentenceCount !== 1 ? "s" : ""} • ~{estimatedLines} line{estimatedLines !== 1 ? "s" : ""} • {workspaceText.length} chars
                    </span>
                    {/* Reserve space for badges to prevent layout shift */}
                    <div className="flex gap-1 min-w-[100px]">
                      {isOverflow && (
                        <Badge variant="destructive" className="text-xs animate-in fade-in duration-200">
                          Exceeds 3 lines
                        </Badge>
                      )}
                      {sentenceCount > 3 && (
                        <Badge variant="outline" className="text-xs text-amber-600 border-amber-300 animate-in fade-in duration-200">
                          {sentenceCount} sentences
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Toolbar - stable height */}
                  <div className="flex flex-wrap gap-2 p-2 bg-muted/20 rounded-lg min-h-[48px] items-center">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button 
                          size="sm" 
                          variant={workspaceText.includes('\u2006') ? "default" : "outline"} 
                          className="h-8"
                        >
                          <Ruler className="size-3 mr-1.5" />
                          Spacing
                          <ChevronDown className="size-3 ml-1" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-2" align="start">
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground mb-2">
                            Adjust character spacing for PDF:
                          </p>
                          <Button
                            size="sm"
                            variant={workspaceText.includes('\u2006') ? "secondary" : "ghost"}
                            className="w-full justify-start h-8 text-left"
                            onClick={handleCompress}
                          >
                            <ArrowDown className="size-3 mr-2 shrink-0 text-green-500" />
                            <div className="flex flex-col items-start">
                              <span>Compress Spacing</span>
                              <span className="text-xs text-muted-foreground">Tighter spaces for PDF</span>
                            </div>
                          </Button>
                          <Button
                            size="sm"
                            variant={!workspaceText.includes('\u2006') ? "secondary" : "ghost"}
                            className="w-full justify-start h-8 text-left"
                            onClick={handleResetSpacing}
                          >
                            <RotateCcw className="size-3 mr-2 shrink-0" />
                            <div className="flex flex-col items-start">
                              <span>Normalize Spacing</span>
                              <span className="text-xs text-muted-foreground">Reset to normal</span>
                            </div>
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button size="sm" variant="outline" disabled={isRevising} className="h-8">
                          {isRevising ? <Loader2 className="size-3 mr-1.5 animate-spin" /> : <Wand2 className="size-3 mr-1.5" />}
                          Revise
                          <ChevronDown className="size-3 ml-1" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-2" align="start">
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground mb-2">
                            Highlight text first, then:
                          </p>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="w-full justify-start h-8 text-left"
                            onClick={() => handleReviseSelection("expand")}
                            disabled={isRevising}
                          >
                            <ArrowUp className="size-3 mr-2 shrink-0 text-blue-500" />
                            <span>Expand (use longer words)</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="w-full justify-start h-8 text-left"
                            onClick={() => handleReviseSelection("compress")}
                            disabled={isRevising}
                          >
                            <ArrowDown className="size-3 mr-2 shrink-0 text-green-500" />
                            <span>Compress (use shorter words)</span>
                          </Button>
                          <Separator className="my-1" />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="w-full justify-start h-8 text-left"
                            onClick={() => handleReviseSelection("general")}
                            disabled={isRevising}
                          >
                            <Wand2 className="size-3 mr-2 shrink-0" />
                            <span>Improve (general quality)</span>
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Button size="sm" variant="outline" onClick={handleShowSynonyms} className="h-8">
                      <Type className="size-3 mr-1.5" />
                      Synonyms
                    </Button>
                    <Separator orientation="vertical" className="h-6" />
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button size="sm" variant="outline" disabled={isConverting} className="h-8">
                          {isConverting ? <Loader2 className="size-3 mr-1.5 animate-spin" /> : <ArrowDown className="size-3 mr-1.5" />}
                          Convert
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56 p-2" align="start">
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground mb-2">Convert entire statement to:</p>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="w-full justify-start h-8 text-left"
                            onClick={() => handleConvertSentences(2)}
                            disabled={isConverting}
                          >
                            2 Sentences (2 lines on 1206)
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="w-full justify-start h-8 text-left"
                            onClick={() => handleConvertSentences(3)}
                            disabled={isConverting}
                          >
                            3 Sentences (3 lines on 1206)
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Separator orientation="vertical" className="h-6" />
                    <Button size="sm" variant="ghost" onClick={revertToOriginal} className="h-8">
                      <RotateCcw className="size-3 mr-1.5" />
                      Revert
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyToClipboard(workspaceText, activeWorkspaceId || "")}
                      className="h-8"
                    >
                      {copiedId === activeWorkspaceId ? <Check className="size-3 mr-1.5" /> : <Copy className="size-3 mr-1.5" />}
                      Copy
                    </Button>
                  </div>

                  {/* Statement Editor - Fixed 1206 Width */}
                  <div className="overflow-x-auto">
                    <div style={{ width: "760px", minWidth: "760px" }}>
                      <Textarea
                        ref={workspaceTextareaRef}
                        value={workspaceText}
                        onChange={(e) => setWorkspaceText(e.target.value)}
                        onBlur={() => updateWorkspaceText()}
                        rows={5}
                        className="font-serif text-sm leading-normal resize-none w-full border-2"
                        style={{ 
                          fontFamily: "'Times New Roman', Times, serif",
                          fontSize: "12pt",
                        }}
                        placeholder="Statement text..."
                      />
                    </div>
                  </div>

                  {/* Line Fill Indicator with per-line controls */}
                  <BulletCanvasPreview 
                    text={workspaceText} 
                    width={760}
                    onMetricsChange={(metrics) => setCurrentLineMetrics(metrics)}
                    onCompressLine={handleCompressLine}
                    onNormalizeLine={handleNormalizeLine}
                  />


                  {/* Actions */}
                  <div className="flex items-center justify-between pt-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => removeFromWorkspace(activeWorkspaceStatement.id)}
                    >
                      <Trash2 className="size-3 mr-1.5" />
                      Remove
                    </Button>
                    <Button size="default" onClick={() => setShowSaveDialog(true)}>
                      <Save className="size-4 mr-2" />
                      Save to Library
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
          </div>
        </CardContent>
      </Card>

      {/* Attribution */}
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="py-3">
          <div className="flex items-start gap-3">
            <Heart className="size-4 text-rose-500 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Reshape feature based on{" "}
              <a href="https://github.com/AF-VCD/pdf-bullets" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                pdf-bullets <ExternalLink className="size-3 inline" />
              </a>{" "}
              by ckhordiasma. Not our original code.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Revision Dialog */}
      <Dialog open={showRevisionPopover} onOpenChange={setShowRevisionPopover}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Choose Revision</DialogTitle>
            <DialogDescription>Select a revised version of your highlighted text</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[400px] overflow-auto">
            {revisionOptions.map((revision, idx) => (
              <div
                key={idx}
                className="p-4 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => applyRevision(revision)}
              >
                <p className="text-sm whitespace-pre-wrap">{revision}</p>
                <p className="text-xs text-muted-foreground mt-2">{revision.length} characters</p>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRevisionPopover(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Synonym Dialog */}
      <Dialog open={showSynonymPopover} onOpenChange={setShowSynonymPopover}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Replace with Synonym</DialogTitle>
            <DialogDescription>Choose a replacement word</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            {synonyms.map((syn) => (
              <Button key={syn} size="sm" variant="outline" onClick={() => applySynonym(syn)}>
                {syn}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSynonymPopover(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Save className="size-5" />
              Save to Library
            </DialogTitle>
            <DialogDescription>
              This statement will be saved with full metadata
            </DialogDescription>
          </DialogHeader>

          {activeWorkspaceStatement && (
            <div className="space-y-4">
              {/* Full Preview */}
              <div className="p-4 rounded-lg border bg-muted/30">
                <p className="text-sm whitespace-pre-wrap font-serif" style={{ fontFamily: "'Times New Roman', Times, serif" }}>
                  {activeWorkspaceStatement.text}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="secondary" className="text-xs">{activeWorkspaceStatement.quarter} {selectedYear}</Badge>
                  <Badge variant="outline" className="text-xs">
                    {AWARD_1206_CATEGORIES.find((c) => c.key === activeWorkspaceStatement.category)?.label}
                  </Badge>
                  <Badge variant="outline" className="text-xs">{activeWorkspaceStatement.text.length} chars</Badge>
                </div>
              </div>

              {/* Sharing Option */}
              {nomineeInfo && nomineeInfo.id !== profile?.id && !nomineeInfo.isManagedMember && (
                <div className="space-y-3">
                  <Label>Sharing Options</Label>
                  <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50">
                    <Checkbox checked={shareWithNominee} onCheckedChange={(c) => setShareWithNominee(!!c)} className="mt-0.5" />
                    <div>
                      <p className="text-sm font-medium flex items-center gap-2">
                        <Share2 className="size-4" />
                        Also share with {nomineeInfo.full_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        They&apos;ll see it in their Shared statements
                      </p>
                    </div>
                  </label>
                </div>
              )}

              {/* Metadata Summary */}
              <div className="p-3 rounded-lg bg-muted/30 border">
                <p className="text-xs font-medium mb-2">Statement will be tagged with:</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Team member: <strong>{nomineeInfo?.full_name}</strong></li>
                  <li>• Quarter: <strong>{activeWorkspaceStatement.quarter} {selectedYear}</strong></li>
                  <li>• Category: <strong>{AWARD_1206_CATEGORIES.find((c) => c.key === activeWorkspaceStatement.category)?.label}</strong></li>
                  <li>• Type: <strong>Award (AF Form 1206)</strong></li>
                  <li>• Source entries: <strong>{activeWorkspaceStatement.sourceAccomplishmentIds.length}</strong></li>
                </ul>
                {activeWorkspaceStatement.sourceAccomplishmentIds.length > 0 && (
                  <div className="mt-2 pt-2 border-t">
                    <p className="text-[10px] font-medium mb-1">Derived from:</p>
                    <div className="flex flex-wrap gap-1">
                      {accomplishments
                        .filter(a => activeWorkspaceStatement.sourceAccomplishmentIds.includes(a.id))
                        .map(entry => (
                          <Badge key={entry.id} variant="secondary" className="text-[10px] h-5">
                            {entry.action_verb.length > 30 
                              ? entry.action_verb.substring(0, 30) + "..." 
                              : entry.action_verb}
                          </Badge>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="size-4 mr-2" />
                  Save Statement
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Entry Details Dialog (Mobile-friendly) */}
      <Dialog open={!!viewingEntry} onOpenChange={(open) => !open && setViewingEntry(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="size-5" />
              Performance Entry Details
            </DialogTitle>
          </DialogHeader>

          {viewingEntry && (
            <div className="space-y-4">
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Action</Label>
                  <p className="text-sm font-medium mt-1">{viewingEntry.action_verb}</p>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Details</Label>
                  <p className="text-sm mt-1">{viewingEntry.details}</p>
                </div>

                {viewingEntry.impact && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Impact</Label>
                    <p className="text-sm mt-1">{viewingEntry.impact}</p>
                  </div>
                )}

                {viewingEntry.metrics && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Metrics</Label>
                    <p className="text-sm mt-1">{viewingEntry.metrics}</p>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-2">
                  <Badge variant="secondary">{viewingEntry.mpa.replace(/_/g, " ")}</Badge>
                  <Badge variant="outline">
                    {new Date(viewingEntry.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                  </Badge>
                  {usedEntryIds.has(viewingEntry.id) && (
                    <Badge variant="default" className="gap-1 bg-green-600">
                      <Check className="size-3" />
                      Statement Saved
                    </Badge>
                  )}
                </div>
              </div>

              <Separator />

              <div className="flex items-center gap-2">
                <Checkbox
                  id="entry-select"
                  checked={selectedEntryIds.has(viewingEntry.id)}
                  onCheckedChange={() => toggleEntrySelection(viewingEntry.id)}
                />
                <Label htmlFor="entry-select" className="text-sm cursor-pointer">
                  {selectedEntryIds.has(viewingEntry.id) ? "Selected for generation" : "Select for generation"}
                </Label>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingEntry(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quarter Entries Dialog (View All) */}
      <Dialog open={viewingQuarterEntries.length > 0} onOpenChange={(open) => !open && setViewingQuarterEntries([])}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="size-5" />
              {viewingQuarterLabel} Entries ({viewingQuarterEntries.length})
            </DialogTitle>
            <DialogDescription>
              View all performance entries for this quarter. Click to select/deselect.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2 pb-2">
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => {
                viewingQuarterEntries.forEach(e => {
                  if (!selectedEntryIds.has(e.id)) {
                    toggleEntrySelection(e.id);
                  }
                });
              }}
            >
              Select All
            </Button>
            <Button 
              size="sm" 
              variant="ghost"
              onClick={() => {
                viewingQuarterEntries.forEach(e => {
                  if (selectedEntryIds.has(e.id)) {
                    toggleEntrySelection(e.id);
                  }
                });
              }}
            >
              Clear All
            </Button>
          </div>

          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-3 pr-4">
              {viewingQuarterEntries.map((entry) => {
                const isSelected = selectedEntryIds.has(entry.id);
                const isUsed = usedEntryIds.has(entry.id);
                return (
                  <div
                    key={entry.id}
                    onClick={() => toggleEntrySelection(entry.id)}
                    className={cn(
                      "p-4 rounded-lg border cursor-pointer transition-all relative",
                      isUsed && "opacity-70",
                      isSelected
                        ? "bg-primary/10 border-primary/40"
                        : "hover:bg-muted/50 hover:border-muted-foreground/20"
                    )}
                  >
                    {isUsed && (
                      <Badge variant="default" className="absolute -top-2 -right-2 text-[10px] h-5 bg-green-600">
                        <Check className="size-3 mr-0.5" />
                        Used
                      </Badge>
                    )}
                    
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleEntrySelection(entry.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0 space-y-2">
                        <p className={cn(
                          "font-medium",
                          isUsed && "line-through decoration-green-600"
                        )}>
                          {entry.action_verb}
                        </p>
                        <p className="text-sm text-muted-foreground">{entry.details}</p>
                        {entry.impact && (
                          <p className="text-sm">
                            <span className="font-medium">Impact:</span> {entry.impact}
                          </p>
                        )}
                        {entry.metrics && (
                          <p className="text-sm">
                            <span className="font-medium">Metrics:</span> {entry.metrics}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Badge variant="secondary" className="text-xs">
                            {entry.mpa.replace(/_/g, " ")}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {new Date(entry.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={() => setViewingQuarterEntries([])}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sentence Conversion Dialog */}
      <Dialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowDown className="size-5" />
              Convert to {targetSentences} Sentence{targetSentences > 1 ? "s" : ""}
            </DialogTitle>
            <DialogDescription>
              Choose a converted version below. Click to apply it to your workspace.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 mb-4">
            <p className="text-xs font-medium text-muted-foreground">Original:</p>
            <div className="p-3 rounded-lg bg-muted/30 border">
              <p className="text-sm font-serif" style={{ fontFamily: "'Times New Roman', Times, serif" }}>
                {workspaceText}
              </p>
              <Badge variant="outline" className="mt-2 text-xs">
                {workspaceText.split(/[.!?]+/).filter(s => s.trim()).length} sentence(s)
              </Badge>
            </div>
          </div>

          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-3 pr-4">
              {convertOptions.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="size-5 animate-spin mr-2" />
                  Generating options...
                </div>
              ) : (
                convertOptions.map((option, idx) => (
                  <div
                    key={idx}
                    onClick={() => applyConversion(option)}
                    className="p-4 rounded-lg border bg-card hover:bg-muted/30 hover:border-primary/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="secondary" className="text-xs">
                        Version {String.fromCharCode(65 + idx)}
                      </Badge>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {option.length} chars • ~{Math.ceil(getTextWidthPx(option) / AF1206_LINE_WIDTH_PX)} lines
                        </span>
                      </div>
                    </div>
                    <p className="text-sm font-serif" style={{ fontFamily: "'Times New Roman', Times, serif" }}>
                      {option}
                    </p>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={() => setShowConvertDialog(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
