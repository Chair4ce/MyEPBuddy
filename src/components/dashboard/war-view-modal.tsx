"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import { handleUsageLimitResponse } from "@/stores/usage-limit-store";
import type { FeedAccomplishment } from "@/stores/team-feed-store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  RefreshCw,
  Copy,
  Check,
  AlertCircle,
  FileText,
  Calendar,
  Users,
  Sparkles,
  Save,
  Pencil,
  X,
  Plus,
  Trash2,
  GripVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ENTRY_MGAS } from "@/lib/constants";

interface WARCategory {
  key: string;
  label: string;
  description: string;
  order: number;
}

interface WARSettings {
  categories: WARCategory[];
  unit_office_symbol: string | null;
  synthesis_instructions: string | null;
}

interface WARReportCategory {
  key: string;
  label: string;
  items: string[];
}

interface WARReport {
  header: {
    date_range: string;
    unit_office_symbol: string | null;
    prepared_by: string;
  };
  categories: WARReportCategory[];
}

interface SavedWARReport {
  id: string;
  user_id: string;
  week_start: string;
  week_end: string;
  title: string | null;
  unit_office_symbol: string | null;
  prepared_by: string;
  content: { categories: WARReportCategory[] };
  entry_count: number;
  model_used: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface WARViewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weekStart: Date | null;
  weekEnd: Date | null;
  entries: FeedAccomplishment[];
  existingReportId?: string | null; // If provided, load existing report
  onReportSaved?: () => void; // Callback when report is saved
}

// Default categories if user hasn't customized
const DEFAULT_CATEGORIES: WARCategory[] = [
  {
    key: "key_accomplishments",
    label: "Key Accomplishments/Highlights",
    description: "Impact-driven achievements - the What. Focus on quantifiable results.",
    order: 1,
  },
  {
    key: "issues_roadblocks",
    label: "Issues/Roadblocks",
    description: "High-level challenges requiring attention - the So What.",
    order: 2,
  },
  {
    key: "upcoming_priorities",
    label: "Upcoming Priorities/Key Events",
    description: "Immediate actions or milestones planned for the following 1-2 weeks.",
    order: 3,
  },
];

export function WARViewModal({
  open,
  onOpenChange,
  weekStart,
  weekEnd,
  entries,
  existingReportId,
  onReportSaved,
}: WARViewModalProps) {
  const supabase = createClient();
  const { profile } = useUserStore();

  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [report, setReport] = useState<WARReport | null>(null);
  const [savedReportId, setSavedReportId] = useState<string | null>(null);
  const [settings, setSettings] = useState<WARSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // Copy states
  const [copiedFull, setCopiedFull] = useState(false);
  const [copiedItemIndex, setCopiedItemIndex] = useState<string | null>(null);
  
  // Edit states
  const [editingItem, setEditingItem] = useState<{ categoryKey: string; itemIndex: number } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [addingToCategory, setAddingToCategory] = useState<string | null>(null);
  const [newItemValue, setNewItemValue] = useState("");

  // Format date range for display
  const formatDateRange = useCallback((start: Date | null, end: Date | null) => {
    if (!start || !end) return "";
    const startStr = start.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const endStr = end.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return `${startStr} - ${endStr}`;
  }, []);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setReport(null);
      setSavedReportId(null);
      setError(null);
      setHasUnsavedChanges(false);
      setEditingItem(null);
      setAddingToCategory(null);
    }
  }, [open]);

  // Load existing report or generate new one
  useEffect(() => {
    async function loadOrGenerate() {
      if (!open || !profile) return;
      
      // If no week data and no existing report, show error
      if (!weekStart && !weekEnd && !existingReportId) {
        setError("No week data provided");
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Check if there's an existing saved report for this week
        if (existingReportId) {
          await loadExistingReport(existingReportId);
        } else if (weekStart && weekEnd) {
          // Check for existing report for this week
          const { data: existingReport } = await (supabase
            .from("war_reports") as any)
            .select("*")
            .eq("user_id", profile.id)
            .eq("week_start", weekStart.toISOString().split("T")[0])
            .eq("week_end", weekEnd.toISOString().split("T")[0])
            .single();

          if (existingReport) {
            // Load existing report
            setSavedReportId(existingReport.id);
            setReport({
              header: {
                date_range: formatDateRange(new Date(existingReport.week_start), new Date(existingReport.week_end)),
                unit_office_symbol: existingReport.unit_office_symbol,
                prepared_by: existingReport.prepared_by,
              },
              categories: existingReport.content.categories || [],
            });
          } else if (entries.length > 0) {
            // Load settings and generate new report
            const { data: settingsData } = await (supabase
              .from("war_settings") as any)
              .select("*")
              .eq("user_id", profile.id)
              .single();

            const userSettings: WARSettings = settingsData
              ? {
                  categories: settingsData.categories || DEFAULT_CATEGORIES,
                  unit_office_symbol: settingsData.unit_office_symbol,
                  synthesis_instructions: settingsData.synthesis_instructions,
                }
              : {
                  categories: DEFAULT_CATEGORIES,
                  unit_office_symbol: null,
                  synthesis_instructions: null,
                };

            setSettings(userSettings);
            await generateWAR(userSettings);
          } else {
            setError("No entries for this week to generate a report from.");
          }
        }
      } catch (err) {
        console.error("Error loading WAR:", err);
        setError("Failed to load report. Please try again.");
      } finally {
        setIsLoading(false);
      }
    }

    loadOrGenerate();
  }, [open, profile, weekStart, weekEnd, entries.length, existingReportId, supabase, formatDateRange]);

  // Load an existing report by ID
  const loadExistingReport = async (reportId: string) => {
    const { data, error } = await (supabase
      .from("war_reports") as any)
      .select("*")
      .eq("id", reportId)
      .single();

    if (error || !data) {
      throw new Error("Failed to load report");
    }

    setSavedReportId(data.id);
    setReport({
      header: {
        date_range: formatDateRange(new Date(data.week_start), new Date(data.week_end)),
        unit_office_symbol: data.unit_office_symbol,
        prepared_by: data.prepared_by,
      },
      categories: data.content.categories || [],
    });
  };

  // Auto-save report after generation
  const autoSaveReport = async (generatedReport: WARReport, warSettings: WARSettings) => {
    if (!profile || !weekStart || !weekEnd) return;

    try {
      const payload = {
        user_id: profile.id,
        week_start: weekStart.toISOString().split("T")[0],
        week_end: weekEnd.toISOString().split("T")[0],
        unit_office_symbol: warSettings.unit_office_symbol,
        prepared_by: generatedReport.header.prepared_by,
        content: { categories: generatedReport.categories },
        entry_count: entries.length,
        model_used: "gemini-2.0-flash",
        status: "draft",
      };

      // Insert new report
      const { data, error } = await (supabase
        .from("war_reports") as any)
        .insert(payload)
        .select("id")
        .single();

      if (error) {
        console.error("Auto-save error:", error);
        return;
      }

      setSavedReportId(data.id);
      setHasUnsavedChanges(false);
      onReportSaved?.();
    } catch (err) {
      console.error("Auto-save error:", err);
    }
  };

  // Generate WAR using LLM
  const generateWAR = async (warSettings: WARSettings) => {
    if (!profile || !weekStart || !weekEnd) return;

    setIsGenerating(true);
    setError(null);

    try {
      const entriesData = entries.map((entry) => ({
        id: entry.id,
        author_name: entry.author_name,
        author_rank: entry.author_rank,
        date: entry.date,
        action_verb: entry.action_verb,
        details: entry.details,
        impact: entry.impact,
        metrics: entry.metrics,
        mpa: entry.mpa,
        mpa_label: ENTRY_MGAS.find((m) => m.key === entry.mpa)?.label || entry.mpa,
      }));

      const response = await fetch("/api/generate-war", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: entriesData,
          categories: warSettings.categories,
          weekStart: weekStart.toISOString(),
          weekEnd: weekEnd.toISOString(),
          unitOfficeSymbol: warSettings.unit_office_symbol,
          synthesisInstructions: warSettings.synthesis_instructions,
          preparedBy: `${profile.rank || ""} ${profile.full_name}`.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (handleUsageLimitResponse(errorData)) return;
        throw new Error(errorData.error || "Failed to generate WAR");
      }

      const data = await response.json();
      setReport(data.report);
      
      // Auto-save the newly generated report
      await autoSaveReport(data.report, warSettings);
    } catch (err) {
      console.error("Error generating WAR:", err);
      setError(err instanceof Error ? err.message : "Failed to generate WAR");
    } finally {
      setIsGenerating(false);
    }
  };

  // Save report to database
  const handleSave = async () => {
    if (!report || !profile || !weekStart || !weekEnd) return;

    setIsSaving(true);
    try {
      const payload = {
        user_id: profile.id,
        week_start: weekStart.toISOString().split("T")[0],
        week_end: weekEnd.toISOString().split("T")[0],
        unit_office_symbol: report.header.unit_office_symbol,
        prepared_by: report.header.prepared_by,
        content: { categories: report.categories },
        entry_count: entries.length,
        model_used: "gemini-2.0-flash",
        status: "draft",
      };

      if (savedReportId) {
        // Update existing
        const { error } = await (supabase
          .from("war_reports") as any)
          .update(payload)
          .eq("id", savedReportId);

        if (error) throw error;
        toast.success("WAR updated");
      } else {
        // Insert new
        const { data, error } = await (supabase
          .from("war_reports") as any)
          .insert(payload)
          .select("id")
          .single();

        if (error) throw error;
        setSavedReportId(data.id);
        toast.success("WAR saved");
      }

      setHasUnsavedChanges(false);
      onReportSaved?.();
    } catch (err) {
      console.error("Error saving WAR:", err);
      toast.error("Failed to save WAR");
    } finally {
      setIsSaving(false);
    }
  };

  // Regenerate handler
  const handleRegenerate = () => {
    if (settings) {
      generateWAR(settings);
    } else {
      // Reload settings first
      const loadAndGenerate = async () => {
        if (!profile) return;
        
        const { data: settingsData } = await (supabase
          .from("war_settings") as any)
          .select("*")
          .eq("user_id", profile.id)
          .single();

        const userSettings: WARSettings = settingsData
          ? {
              categories: settingsData.categories || DEFAULT_CATEGORIES,
              unit_office_symbol: settingsData.unit_office_symbol,
              synthesis_instructions: settingsData.synthesis_instructions,
            }
          : {
              categories: DEFAULT_CATEGORIES,
              unit_office_symbol: null,
              synthesis_instructions: null,
            };

        setSettings(userSettings);
        await generateWAR(userSettings);
      };
      loadAndGenerate();
    }
  };

  // Copy full report to clipboard
  const handleCopyFull = async () => {
    if (!report) return;

    try {
      const lines: string[] = [];
      
      lines.push("WEEKLY ACTIVITY REPORT");
      lines.push(`Date: ${report.header.date_range}`);
      if (report.header.unit_office_symbol) {
        lines.push(`Unit: ${report.header.unit_office_symbol}`);
      }
      lines.push(`Prepared by: ${report.header.prepared_by}`);
      lines.push("");
      lines.push("=".repeat(50));
      lines.push("");

      report.categories.forEach((category) => {
        lines.push(category.label.toUpperCase());
        lines.push("-".repeat(category.label.length));
        if (category.items.length > 0) {
          category.items.forEach((item) => {
            lines.push(`• ${item}`);
          });
        } else {
          lines.push("• No items for this category");
        }
        lines.push("");
      });

      await navigator.clipboard.writeText(lines.join("\n"));
      setCopiedFull(true);
      toast.success("WAR copied to clipboard");
      setTimeout(() => setCopiedFull(false), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  // Copy individual bullet to clipboard
  const handleCopyItem = async (categoryKey: string, itemIndex: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedItemIndex(`${categoryKey}-${itemIndex}`);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopiedItemIndex(null), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  // Edit item handlers
  const startEditItem = (categoryKey: string, itemIndex: number, currentValue: string) => {
    setEditingItem({ categoryKey, itemIndex });
    setEditValue(currentValue);
  };

  const saveEditItem = () => {
    if (!editingItem || !report) return;

    const updatedCategories = report.categories.map((cat) => {
      if (cat.key === editingItem.categoryKey) {
        const newItems = [...cat.items];
        newItems[editingItem.itemIndex] = editValue.trim();
        return { ...cat, items: newItems };
      }
      return cat;
    });

    setReport({ ...report, categories: updatedCategories });
    setHasUnsavedChanges(true);
    setEditingItem(null);
    setEditValue("");
  };

  const cancelEdit = () => {
    setEditingItem(null);
    setEditValue("");
  };

  // Delete item
  const deleteItem = (categoryKey: string, itemIndex: number) => {
    if (!report) return;

    const updatedCategories = report.categories.map((cat) => {
      if (cat.key === categoryKey) {
        const newItems = cat.items.filter((_, i) => i !== itemIndex);
        return { ...cat, items: newItems };
      }
      return cat;
    });

    setReport({ ...report, categories: updatedCategories });
    setHasUnsavedChanges(true);
  };

  // Add new item
  const startAddItem = (categoryKey: string) => {
    setAddingToCategory(categoryKey);
    setNewItemValue("");
  };

  const saveNewItem = () => {
    if (!addingToCategory || !report || !newItemValue.trim()) return;

    const updatedCategories = report.categories.map((cat) => {
      if (cat.key === addingToCategory) {
        return { ...cat, items: [...cat.items, newItemValue.trim()] };
      }
      return cat;
    });

    setReport({ ...report, categories: updatedCategories });
    setHasUnsavedChanges(true);
    setAddingToCategory(null);
    setNewItemValue("");
  };

  const cancelAddItem = () => {
    setAddingToCategory(null);
    setNewItemValue("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl !max-h-[90vh] !flex !flex-col overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="size-5" />
                Weekly Activity Report
                {hasUnsavedChanges && (
                  <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                    Unsaved
                  </Badge>
                )}
              </DialogTitle>
              <DialogDescription className="flex items-center gap-4 mt-1">
                <span className="flex items-center gap-1.5">
                  <Calendar className="size-3.5" />
                  {formatDateRange(weekStart, weekEnd)}
                </span>
                <span className="flex items-center gap-1.5">
                  <Users className="size-3.5" />
                  {entries.length} {entries.length === 1 ? "entry" : "entries"}
                </span>
                {savedReportId && (
                  <Badge variant="secondary" className="text-xs">
                    Saved
                  </Badge>
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isLoading || isGenerating ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 px-6">
            <Spinner size="lg" />
            <div className="text-center">
              <p className="font-medium">
                {isGenerating ? "Generating WAR..." : "Loading..."}
              </p>
              {isGenerating && (
                <p className="text-sm text-muted-foreground mt-1">
                  AI is synthesizing {entries.length} entries into your report
                </p>
              )}
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4 px-6">
            <AlertCircle className="size-12 text-destructive" />
            <div className="text-center">
              <p className="font-medium text-destructive">{error}</p>
              {entries.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 gap-2"
                  onClick={handleRegenerate}
                >
                  <RefreshCw className="size-4" />
                  Try Again
                </Button>
              )}
            </div>
          </div>
        ) : report ? (
          <>
            <div className="flex-1 overflow-y-auto px-6">
              <div className="space-y-4 py-4 pb-4">
                {/* Report Header */}
                <Card className="bg-muted/30">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="text-sm font-medium">
                          {report.header.date_range}
                        </p>
                        {report.header.unit_office_symbol && (
                          <p className="text-xs text-muted-foreground">
                            {report.header.unit_office_symbol}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Prepared by: {report.header.prepared_by}
                        </p>
                      </div>
                      <Badge variant="secondary" className="gap-1.5">
                        <Sparkles className="size-3" />
                        AI Generated
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                {/* Categories with editable items */}
                {report.categories.map((category, catIndex) => (
                  <Card key={category.key} className="group">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {catIndex + 1}
                          </Badge>
                          {category.label}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1.5 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => startAddItem(category.key)}
                        >
                          <Plus className="size-3.5" />
                          Add
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      {category.items.length > 0 ? (
                        <ul className="space-y-2">
                          {category.items.map((item, itemIndex) => {
                            const isEditing = editingItem?.categoryKey === category.key && editingItem?.itemIndex === itemIndex;
                            const itemKey = `${category.key}-${itemIndex}`;
                            const isCopied = copiedItemIndex === itemKey;

                            if (isEditing) {
                              return (
                                <li key={itemIndex} className="space-y-2">
                                  <Textarea
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    className="min-h-[80px] text-sm"
                                    autoFocus
                                  />
                                  <div className="flex gap-2">
                                    <Button size="sm" onClick={saveEditItem} className="h-7 gap-1.5">
                                      <Check className="size-3.5" />
                                      Save
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={cancelEdit} className="h-7 gap-1.5">
                                      <X className="size-3.5" />
                                      Cancel
                                    </Button>
                                  </div>
                                </li>
                              );
                            }

                            return (
                              <li
                                key={itemIndex}
                                className="group/item flex items-start gap-2 text-sm p-2 -mx-2 rounded-md hover:bg-muted/50 transition-colors"
                              >
                                <span className="text-primary mt-0.5 shrink-0">•</span>
                                <span className="flex-1">{item}</span>
                                <div className="flex gap-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity shrink-0">
                                  <TooltipProvider delayDuration={200}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="size-7"
                                          onClick={() => handleCopyItem(category.key, itemIndex, item)}
                                        >
                                          {isCopied ? (
                                            <Check className="size-3.5 text-green-500" />
                                          ) : (
                                            <Copy className="size-3.5" />
                                          )}
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Copy</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                  <TooltipProvider delayDuration={200}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="size-7"
                                          onClick={() => startEditItem(category.key, itemIndex, item)}
                                        >
                                          <Pencil className="size-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Edit</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                  <TooltipProvider delayDuration={200}>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="size-7 text-destructive hover:text-destructive"
                                          onClick={() => deleteItem(category.key, itemIndex)}
                                        >
                                          <Trash2 className="size-3.5" />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Delete</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">
                          No items for this category this week
                        </p>
                      )}

                      {/* Add new item form */}
                      {addingToCategory === category.key && (
                        <div className="mt-3 space-y-2 pt-3 border-t">
                          <Textarea
                            value={newItemValue}
                            onChange={(e) => setNewItemValue(e.target.value)}
                            placeholder="Enter new bullet point..."
                            className="min-h-[80px] text-sm"
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={saveNewItem} disabled={!newItemValue.trim()} className="h-7 gap-1.5">
                              <Plus className="size-3.5" />
                              Add
                            </Button>
                            <Button size="sm" variant="outline" onClick={cancelAddItem} className="h-7 gap-1.5">
                              <X className="size-3.5" />
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}

              </div>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-between gap-2 pt-4 px-6 pb-6 border-t shrink-0 bg-background">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRegenerate}
                  disabled={isGenerating || entries.length === 0}
                  className="gap-2"
                >
                  <RefreshCw className={cn("size-4", isGenerating && "animate-spin")} />
                  Regenerate
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSave}
                  disabled={isSaving || !hasUnsavedChanges}
                  className="gap-2"
                >
                  {isSaving ? (
                    <>
                      <Spinner size="sm" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="size-4" />
                      Save
                    </>
                  )}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Close
                </Button>
                <Button
                  onClick={handleCopyFull}
                  className="gap-2"
                >
                  {copiedFull ? (
                    <>
                      <Check className="size-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="size-4" />
                      Copy Report
                    </>
                  )}
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
