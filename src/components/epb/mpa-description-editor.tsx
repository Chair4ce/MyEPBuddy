"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/sonner";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info, Save, Loader2, X, Pencil } from "lucide-react";
import type { MPADescriptions, MPADescription, UserLLMSettings } from "@/types/database";
import { DEFAULT_MPA_DESCRIPTIONS } from "@/lib/constants";

interface MpaDescriptionEditorProps {
  mpaKey: string;
}

export function MpaDescriptionEditor({ mpaKey }: MpaDescriptionEditorProps) {
  const { profile } = useUserStore();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [description, setDescription] = useState("");
  const [subCompetencies, setSubCompetencies] = useState<Record<string, string>>({});
  const [initialDescription, setInitialDescription] = useState("");
  const [initialSubCompetencies, setInitialSubCompetencies] = useState<Record<string, string>>({});

  const panelRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  const defaults = DEFAULT_MPA_DESCRIPTIONS[mpaKey];

  const hasChanges =
    description !== initialDescription ||
    JSON.stringify(subCompetencies) !== JSON.stringify(initialSubCompetencies);

  const loadDescription = useCallback(async () => {
    if (!profile) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_llm_settings")
        .select("mpa_descriptions")
        .eq("user_id", profile.id)
        .maybeSingle();

      if (error) throw error;

      const row = data as Record<string, unknown> | null;
      const descriptions = (row?.mpa_descriptions as MPADescriptions) || DEFAULT_MPA_DESCRIPTIONS;
      const mpa = descriptions[mpaKey] || defaults;

      setDescription(mpa?.description || "");
      setSubCompetencies({ ...(mpa?.sub_competencies || {}) });
      setInitialDescription(mpa?.description || "");
      setInitialSubCompetencies({ ...(mpa?.sub_competencies || {}) });
    } catch (error) {
      console.error("Failed to load MPA description:", error);
      if (defaults) {
        setDescription(defaults.description);
        setSubCompetencies({ ...defaults.sub_competencies });
        setInitialDescription(defaults.description);
        setInitialSubCompetencies({ ...defaults.sub_competencies });
      }
    } finally {
      setIsLoading(false);
    }
  }, [profile, supabase, mpaKey, defaults]);

  useEffect(() => {
    if (isOpen && profile) {
      loadDescription();
    }
  }, [isOpen, profile, loadDescription]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        if (!hasChanges) {
          setIsOpen(false);
          setIsEditing(false);
        }
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        setIsEditing(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, hasChanges]);

  const handleSave = async () => {
    if (!profile) return;
    setIsSaving(true);
    try {
      const { data: existing } = await supabase
        .from("user_llm_settings")
        .select("mpa_descriptions")
        .eq("user_id", profile.id)
        .maybeSingle();

      const existingRow = existing as Record<string, unknown> | null;
      const currentDescriptions = (existingRow?.mpa_descriptions as MPADescriptions) || { ...DEFAULT_MPA_DESCRIPTIONS };

      const updated: MPADescriptions = {
        ...currentDescriptions,
        [mpaKey]: {
          title: defaults?.title || mpaKey,
          description,
          sub_competencies: subCompetencies,
        },
      };

      if (existing) {
        const { error } = await supabase
          .from("user_llm_settings")
          .update({ mpa_descriptions: updated } as never)
          .eq("user_id", profile.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("user_llm_settings")
          .insert({ user_id: profile.id, mpa_descriptions: updated } as never);
        if (error) throw error;
      }

      setInitialDescription(description);
      setInitialSubCompetencies({ ...subCompetencies });
      setIsEditing(false);
      toast.success("MPA description saved");
    } catch (error) {
      console.error("Failed to save MPA description:", error);
      toast.error("Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setDescription(initialDescription);
    setSubCompetencies({ ...initialSubCompetencies });
    setIsEditing(false);
  };

  const triggerRef = useRef<HTMLButtonElement>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // Recalculate position when opening
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const panelWidth = window.innerWidth < 640 ? Math.min(320, window.innerWidth - 32) : 560;
      let left = rect.left;
      if (left + panelWidth > window.innerWidth - 16) {
        left = window.innerWidth - panelWidth - 16;
      }
      if (left < 16) left = 16;
      setPanelPos({ top: rect.bottom + 4, left });
    }
  }, [isOpen]);

  const formatSubCompLabel = (key: string) =>
    key.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  return (
    <div className="inline-flex">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            ref={triggerRef}
            className={cn(
              "inline-flex items-center justify-center rounded-md size-5 sm:size-6 transition-colors shrink-0",
              isOpen
                ? "text-primary bg-primary/10"
                : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted"
            )}
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(!isOpen);
              if (isOpen) setIsEditing(false);
            }}
            aria-label="MPA description"
          >
            <Info className="size-3 sm:size-3.5" />
          </button>
        </TooltipTrigger>
        {!isOpen && (
          <TooltipContent side="bottom">
            <p>MPA Description</p>
          </TooltipContent>
        )}
      </Tooltip>

      {isOpen && createPortal(
        <div
          ref={panelRef}
          className="fixed z-[100] w-[calc(100vw-2rem)] sm:w-[560px] rounded-lg border bg-popover text-popover-foreground shadow-xl animate-in fade-in-0 zoom-in-95 duration-150 max-h-[80vh] overflow-y-auto"
          style={{ top: panelPos.top, left: panelPos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 px-5 py-3 border-b sticky top-0 bg-popover z-10">
                <span className="text-sm font-semibold">
                  {defaults?.title || mpaKey}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {isEditing && hasChanges && (
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="inline-flex items-center justify-center rounded-md h-8 px-3 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {isSaving ? <Loader2 className="size-3.5 animate-spin mr-1" /> : <Save className="size-3.5 mr-1" />}
                      Save
                    </button>
                  )}
                  {isEditing && (
                    <button
                      onClick={handleCancel}
                      className="inline-flex items-center justify-center rounded-md h-8 px-3 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                  {!isEditing && (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="inline-flex items-center justify-center rounded-md h-8 px-3 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border border-input"
                    >
                      <Pencil className="size-3.5 mr-1" />
                      Edit
                    </button>
                  )}
                  <button
                    onClick={() => { setIsOpen(false); setIsEditing(false); }}
                    className="inline-flex items-center justify-center rounded-md size-8 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>

              <div className="px-5 py-4 space-y-5">
                {/* Description */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Description</Label>
                  {isEditing ? (
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] resize-vertical"
                      rows={4}
                    />
                  ) : (
                    <p className="text-sm text-foreground/80 leading-relaxed">
                      {description || "No description set."}
                    </p>
                  )}
                </div>

                {/* Sub-competencies */}
                {Object.keys(subCompetencies).length > 0 && (
                  <div className="space-y-4">
                    <Label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Sub-Competencies</Label>
                    {Object.entries(subCompetencies).map(([key, value]) => (
                      <div key={key} className="space-y-1.5">
                        <span className="text-xs font-semibold text-foreground">
                          {formatSubCompLabel(key)}
                        </span>
                        {isEditing ? (
                          <textarea
                            value={value}
                            onChange={(e) =>
                              setSubCompetencies({ ...subCompetencies, [key]: e.target.value })
                            }
                            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] resize-vertical"
                            rows={3}
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            {value}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
