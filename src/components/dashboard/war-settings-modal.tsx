"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { usePromptRulesMode } from "@/lib/feature-flags";
import { PromptRulesManager } from "@/components/settings/prompt-rules-manager";
import { PROMPT_RULE_CONTEXT_DESCRIPTIONS } from "@/lib/prompt-rules/constants";
import {
  GripVertical,
  Plus,
  Trash2,
  Save,
  RotateCcw,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Default categories matching the database defaults
const DEFAULT_CATEGORIES = [
  {
    key: "key_accomplishments",
    label: "Key Accomplishments/Highlights",
    description: "Impact-driven achievements - the What. Focus on quantifiable results (e.g., $X saved, Y personnel trained).",
    order: 1,
  },
  {
    key: "issues_roadblocks",
    label: "Issues/Roadblocks",
    description: "High-level challenges requiring attention - the So What. Personnel shortages, equipment failures, or logistical bottlenecks.",
    order: 2,
  },
  {
    key: "upcoming_priorities",
    label: "Upcoming Priorities/Key Events",
    description: "Immediate actions or milestones planned for the following 1-2 weeks - the Now What.",
    order: 3,
  },
];

interface WARCategory {
  key: string;
  label: string;
  description: string;
  order: number;
}

interface WARSettings {
  id?: string;
  user_id?: string;
  categories: WARCategory[];
  unit_office_symbol: string | null;
  synthesis_instructions: string | null;
}

interface WARSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WARSettingsModal({ open, onOpenChange }: WARSettingsModalProps) {
  const supabase = createClient();
  const { profile } = useUserStore();
  const usePromptRulesModeEnabled = usePromptRulesMode();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState<WARSettings>({
    categories: DEFAULT_CATEGORIES,
    unit_office_symbol: null,
    synthesis_instructions: null,
  });
  const [hasChanges, setHasChanges] = useState(false);

  // Load settings on open
  useEffect(() => {
    async function loadSettings() {
      if (!open || !profile) return;
      
      setIsLoading(true);
      try {
        // Cast to any to handle table not yet in generated types
        const { data, error } = await (supabase
          .from("war_settings") as any)
          .select("*")
          .eq("user_id", profile.id)
          .single();

        if (error && error.code !== "PGRST116") {
          console.error("Error loading WAR settings:", error);
          toast.error("Failed to load WAR settings");
        }

        if (data) {
          setSettings({
            id: data.id,
            user_id: data.user_id,
            categories: data.categories || DEFAULT_CATEGORIES,
            unit_office_symbol: data.unit_office_symbol,
            synthesis_instructions: data.synthesis_instructions,
          });
        } else {
          // Use defaults
          setSettings({
            categories: DEFAULT_CATEGORIES,
            unit_office_symbol: null,
            synthesis_instructions: null,
          });
        }
      } catch (error) {
        console.error("Error loading WAR settings:", error);
      } finally {
        setIsLoading(false);
        setHasChanges(false);
      }
    }

    loadSettings();
  }, [open, profile, supabase]);

  // Handle save
  const handleSave = async () => {
    if (!profile) return;
    
    setIsSaving(true);
    try {
      const payload = {
        user_id: profile.id,
        categories: settings.categories,
        unit_office_symbol: settings.unit_office_symbol,
        synthesis_instructions: settings.synthesis_instructions,
      };

      if (settings.id) {
        // Update existing - cast to any for new table
        const { error } = await (supabase
          .from("war_settings") as any)
          .update(payload)
          .eq("id", settings.id);

        if (error) throw error;
      } else {
        // Insert new - cast to any for new table
        const { error } = await (supabase
          .from("war_settings") as any)
          .insert(payload);

        if (error) throw error;
      }

      toast.success("WAR settings saved");
      setHasChanges(false);
    } catch (error) {
      console.error("Error saving WAR settings:", error);
      toast.error("Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  // Handle reset to defaults
  const handleResetToDefaults = () => {
    setSettings((prev) => ({
      ...prev,
      categories: DEFAULT_CATEGORIES,
    }));
    setHasChanges(true);
  };

  // Category management
  const updateCategory = (index: number, field: keyof WARCategory, value: string | number) => {
    setSettings((prev) => ({
      ...prev,
      categories: prev.categories.map((cat, i) =>
        i === index ? { ...cat, [field]: value } : cat
      ),
    }));
    setHasChanges(true);
  };

  const addCategory = () => {
    const newKey = `custom_${Date.now()}`;
    const newOrder = Math.max(...settings.categories.map((c) => c.order)) + 1;
    setSettings((prev) => ({
      ...prev,
      categories: [
        ...prev.categories,
        {
          key: newKey,
          label: "New Category",
          description: "",
          order: newOrder,
        },
      ],
    }));
    setHasChanges(true);
  };

  const removeCategory = (index: number) => {
    if (settings.categories.length <= 1) {
      toast.error("You must have at least one category");
      return;
    }
    setSettings((prev) => ({
      ...prev,
      categories: prev.categories.filter((_, i) => i !== index),
    }));
    setHasChanges(true);
  };

  const moveCategory = (fromIndex: number, direction: "up" | "down") => {
    const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= settings.categories.length) return;

    setSettings((prev) => {
      const newCategories = [...prev.categories];
      const [moved] = newCategories.splice(fromIndex, 1);
      newCategories.splice(toIndex, 0, moved);
      // Update order values
      return {
        ...prev,
        categories: newCategories.map((cat, i) => ({ ...cat, order: i + 1 })),
      };
    });
    setHasChanges(true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl !max-h-[85vh] !flex !flex-col overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
          <DialogTitle>WAR Settings</DialogTitle>
          <DialogDescription>
            Customize how your Weekly Activity Reports are organized. Categories help the AI group and synthesize your team&apos;s accomplishments.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 px-6">
            <Spinner size="lg" />
          </div>
        ) : (
          <>
          <div className="flex-1 overflow-y-auto px-6">
            <div className="space-y-6 py-4 pb-4">
              {/* Unit/Office Symbol */}
              <div className="space-y-2">
                <Label htmlFor="unit_office_symbol">Unit/Office Symbol (Optional)</Label>
                <Input
                  id="unit_office_symbol"
                  placeholder="e.g., 123 FS/DO"
                  value={settings.unit_office_symbol || ""}
                  onChange={(e) => {
                    setSettings((prev) => ({ ...prev, unit_office_symbol: e.target.value || null }));
                    setHasChanges(true);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Included in the WAR header for identification
                </p>
              </div>

              {/* Categories */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Report Categories</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      onClick={handleResetToDefaults}
                    >
                      <RotateCcw className="size-3.5" />
                      Reset to Defaults
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      onClick={addCategory}
                    >
                      <Plus className="size-3.5" />
                      Add Category
                    </Button>
                  </div>
                </div>
                
                <div className="space-y-2">
                  {settings.categories
                    .sort((a, b) => a.order - b.order)
                    .map((category, index) => (
                      <Card key={category.key} className="relative">
                        <CardContent className="p-3">
                          <div className="flex items-start gap-3">
                            {/* Drag Handle / Order Controls */}
                            <div className="flex flex-col gap-0.5 pt-1">
                              <button
                                type="button"
                                className={cn(
                                  "p-0.5 rounded hover:bg-muted transition-colors",
                                  index === 0 && "opacity-30 cursor-not-allowed"
                                )}
                                onClick={() => moveCategory(index, "up")}
                                disabled={index === 0}
                                aria-label="Move category up"
                              >
                                <GripVertical className="size-4 text-muted-foreground rotate-180" />
                              </button>
                              <button
                                type="button"
                                className={cn(
                                  "p-0.5 rounded hover:bg-muted transition-colors",
                                  index === settings.categories.length - 1 && "opacity-30 cursor-not-allowed"
                                )}
                                onClick={() => moveCategory(index, "down")}
                                disabled={index === settings.categories.length - 1}
                                aria-label="Move category down"
                              >
                                <GripVertical className="size-4 text-muted-foreground" />
                              </button>
                            </div>

                            {/* Category Content */}
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs shrink-0">
                                  {index + 1}
                                </Badge>
                                <Input
                                  value={category.label}
                                  onChange={(e) => updateCategory(index, "label", e.target.value)}
                                  placeholder="Category name"
                                  className="h-8 text-sm font-medium"
                                  aria-label={`Category ${index + 1} name`}
                                />
                              </div>
                              <Textarea
                                value={category.description}
                                onChange={(e) => updateCategory(index, "description", e.target.value)}
                                placeholder="Description / guidance for this category (used by AI)"
                                className="min-h-[60px] text-xs resize-none"
                                aria-label={`Category ${index + 1} description`}
                              />
                            </div>

                            {/* Delete Button */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground hover:text-destructive shrink-0"
                              onClick={() => removeCategory(index)}
                              disabled={settings.categories.length <= 1}
                              aria-label="Delete category"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                </div>

                <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  <p>
                    The AI will analyze each team entry and assign it to the most relevant category based on your descriptions. Clear, specific descriptions help improve categorization accuracy.
                  </p>
                </div>
              </div>

              {/* Synthesis Instructions / WAR Rules */}
              {usePromptRulesModeEnabled ? (
                <PromptRulesManager
                  context="war"
                  compact
                  title="WAR Synthesis Rules"
                  description={PROMPT_RULE_CONTEXT_DESCRIPTIONS.war}
                />
              ) : (
              <div className="space-y-2">
                <Label htmlFor="synthesis_instructions">Custom Synthesis Instructions (Optional)</Label>
                <Textarea
                  id="synthesis_instructions"
                  placeholder="Additional instructions for how the AI should synthesize entries..."
                  value={settings.synthesis_instructions || ""}
                  onChange={(e) => {
                    setSettings((prev) => ({ ...prev, synthesis_instructions: e.target.value || null }));
                    setHasChanges(true);
                  }}
                  className="min-h-[80px] resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  Customize how entries are combined and formatted. Leave blank to use defaults.
                </p>
              </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-4 px-6 pb-6 border-t shrink-0 bg-background">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
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
                  Save Settings
                </>
              )}
            </Button>
          </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
