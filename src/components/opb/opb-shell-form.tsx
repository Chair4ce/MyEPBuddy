"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  STANDARD_MGAS,
  MAX_STATEMENT_CHARACTERS,
  MAX_HLR_CHARACTERS,
  MAX_DUTY_DESCRIPTION_CHARACTERS,
  OPB_MPA_DESCRIPTIONS,
} from "@/lib/constants";
import type { UserLLMSettings } from "@/types/database";
import {
  FileText,
  Loader2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  User,
  Calendar,
  Info,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import { useOPBShellStore } from "@/stores/opb-shell-store";
import { OPBSectionCard } from "./opb-section-card";
import type { OPBShell, OPBShellSection, OPBShellSnapshot, Rank, Accomplishment } from "@/types/database";

interface OPBShellFormProps {
  cycleYear: number;
  model: string;
}

export function OPBShellForm({ cycleYear, model }: OPBShellFormProps) {
  const supabase = createClient();
  const { profile } = useUserStore();

  const {
    officerInfo,
    setOfficerInfo,
    currentShell,
    setCurrentShell,
    sections,
    updateSection,
    sectionStates,
    snapshots,
    setSnapshots,
    addSnapshot,
    collapsedSections,
    toggleSectionCollapsed,
    setSectionCollapsed,
    expandAll,
    collapseAll,
    isLoadingShell,
    setIsLoadingShell,
    isCreatingShell,
    setIsCreatingShell,
    dutyDescriptionDraft,
    setDutyDescriptionDraft,
    isDutyDescriptionDirty,
    isSavingDutyDescription,
    setIsSavingDutyDescription,
    loadVersion,
  } = useOPBShellStore();

  const [isDutyDescriptionCollapsed, setIsDutyDescriptionCollapsed] = useState(false);
  const [isGenerating, setIsGenerating] = useState<string | null>(null);
  const [userSettings, setUserSettings] = useState<Partial<UserLLMSettings> | null>(null);
  const [accomplishments, setAccomplishments] = useState<Accomplishment[]>([]);

  // Load user's LLM settings (including custom OPB prompt)
  useEffect(() => {
    if (!profile) return;

    async function loadSettings() {
      if (!profile) return;
      const { data, error } = await supabase
        .from("user_llm_settings")
        .select("opb_system_prompt, opb_style_guidelines, abbreviations, acronyms")
        .eq("user_id", profile.id)
        .maybeSingle();

      if (!error && data) {
        setUserSettings(data as Partial<UserLLMSettings>);
      }
    }

    loadSettings();
  }, [profile, supabase]);

  // Load user's accomplishments for context
  useEffect(() => {
    if (!profile) return;

    async function loadAccomplishments() {
      if (!profile) return;
      const { data, error } = await supabase
        .from("accomplishments")
        .select("*")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false });

      if (!error && data) {
        setAccomplishments(data as Accomplishment[]);
      }
    }

    loadAccomplishments();
  }, [profile, supabase]);

  // Initialize officer info from profile
  useEffect(() => {
    if (profile) {
      setOfficerInfo({
        id: profile.id,
        fullName: profile.full_name,
        rank: profile.rank,
        afsc: profile.afsc,
      });
    }
  }, [profile, setOfficerInfo]);

  // Load or create OPB shell for current cycle
  useEffect(() => {
    if (!profile) return;

    async function loadShell() {
      setIsLoadingShell(true);
      try {
        // Check for existing shell
        if (!profile) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: existing, error } = await (supabase as any)
          .from("opb_shells")
          .select(`
            *,
            sections:opb_shell_sections(*)
          `)
          .eq("user_id", profile.id)
          .eq("cycle_year", cycleYear)
          .eq("status", "active")
          .single();

        if (error && error.code !== "PGRST116") {
          console.error("Error loading OPB shell:", error);
          toast.error("Failed to load OPB shell");
          return;
        }

        if (existing) {
          setCurrentShell(existing as OPBShell);
        } else {
          // No shell exists, prompt to create
          setCurrentShell(null);
        }
      } finally {
        setIsLoadingShell(false);
      }
    }

    loadShell();
  }, [profile, cycleYear, supabase, setCurrentShell, setIsLoadingShell]);

  // Create new OPB shell
  const createShell = useCallback(async () => {
    if (!profile) return;

    setIsCreatingShell(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("opb_shells")
        .insert({
          user_id: profile.id,
          created_by: profile.id,
          cycle_year: cycleYear,
        })
        .select(`
          *,
          sections:opb_shell_sections(*)
        `)
        .single();

      if (error) {
        console.error("Error creating OPB shell:", error);
        toast.error("Failed to create OPB shell");
        return;
      }

      setCurrentShell(data as OPBShell);
      toast.success("OPB workspace created!");
    } finally {
      setIsCreatingShell(false);
    }
  }, [profile, cycleYear, supabase, setCurrentShell, setIsCreatingShell]);

  // Save section text
  const saveSection = useCallback(
    async (mpa: string, text: string) => {
      const section = sections[mpa];
      if (!section) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("opb_shell_sections")
        .update({
          statement_text: text,
          last_edited_by: profile?.id,
        })
        .eq("id", section.id);

      if (error) {
        console.error("Error saving section:", error);
        toast.error("Failed to save");
        return;
      }

      updateSection(mpa, { statement_text: text });
    },
    [sections, supabase, profile, updateSection]
  );

  // Create snapshot
  const createSnapshot = useCallback(
    async (mpa: string, text: string) => {
      const section = sections[mpa];
      if (!section || !profile) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("opb_shell_snapshots")
        .insert({
          section_id: section.id,
          statement_text: text,
          created_by: profile.id,
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating snapshot:", error);
        return;
      }

      addSnapshot(section.id, data as OPBShellSnapshot);
      toast.success("Snapshot saved");
    },
    [sections, profile, supabase, addSnapshot]
  );

  // Load snapshots for a section
  const loadSnapshots = useCallback(
    async (sectionId: string) => {
      const { data, error } = await supabase
        .from("opb_shell_snapshots")
        .select("*")
        .eq("section_id", sectionId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading snapshots:", error);
        return;
      }

      setSnapshots(sectionId, data as OPBShellSnapshot[]);
    },
    [supabase, setSnapshots]
  );

  // Generate OPB statement using the generate API with customContext mode
  const generateStatement = useCallback(
    async (mpa: string, customContext: string): Promise<string[]> => {
      if (!profile?.rank || !profile?.id) {
        toast.error("Profile information required to generate statements");
        return [];
      }

      setIsGenerating(mpa);
      try {
        const isHLR = mpa === "hlr_assessment";
        
        // Build the context for generation
        let contextForGeneration = customContext;
        
        if (isHLR) {
          // For HLR, gather all MPA statements as context
          const mpaStatements = STANDARD_MGAS
            .filter(mga => mga.key !== "hlr_assessment" && mga.key !== "miscellaneous")
            .map(mga => `### ${OPB_MPA_DESCRIPTIONS[mga.key]?.title || mga.label}\n${sections[mga.key]?.statement_text || "(No statements yet)"}`)
            .join("\n\n");
          contextForGeneration = mpaStatements;
        }
        
        // Add OPB-specific framing to the context
        const opbContext = `[OPB GENERATION - OFFICER PERFORMANCE BRIEF]
Officer Rank: ${profile.rank}
AFSC: ${profile.afsc || "N/A"}
${dutyDescriptionDraft ? `Duty Description: ${dutyDescriptionDraft}` : ""}

MPA: ${OPB_MPA_DESCRIPTIONS[mpa]?.title || mpa}
${OPB_MPA_DESCRIPTIONS[mpa]?.description || ""}

OFFICER GUIDANCE:
- Write strategic, leadership-focused narrative statements
- Emphasize organizational impact beyond immediate duties
- Connect to Air Force priorities and future potential
- Use officer-appropriate action verbs (Directed, Championed, Transformed, etc.)

ACCOMPLISHMENT/CONTEXT:
${contextForGeneration}`;

        // Use the existing generate API with customContext mode
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rateeId: profile.id,
            rateeRank: profile.rank,
            rateeAfsc: profile.afsc || "UNKNOWN",
            cycleYear: currentShell?.cycle_year || new Date().getFullYear(),
            model,
            writingStyle: "personal",
            customContext: opbContext,
            customContextOptions: {
              statementCount: isHLR ? 1 : 2,
            },
            selectedMPAs: [mpa],
            dutyDescription: dutyDescriptionDraft || undefined,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error("Generate API error:", errorData);
          throw new Error(errorData.error || "Generation failed");
        }

        const data = await response.json();
        
        // Extract statements from the API response
        const statements: string[] = [];
        if (data.statements && Array.isArray(data.statements)) {
          for (const mpaResult of data.statements) {
            if (mpaResult.statements && Array.isArray(mpaResult.statements)) {
              statements.push(...mpaResult.statements);
            }
          }
        }

        return statements;
      } catch (error) {
        console.error("Error generating statement:", error);
        toast.error("Failed to generate statement");
        return [];
      } finally {
        setIsGenerating(null);
      }
    },
    [profile, sections, model, dutyDescriptionDraft, currentShell]
  );

  // Save duty description
  const saveDutyDescription = useCallback(async () => {
    if (!currentShell) return;

    setIsSavingDutyDescription(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("opb_shells")
        .update({ duty_description: dutyDescriptionDraft })
        .eq("id", currentShell.id);

      if (error) {
        toast.error("Failed to save duty description");
        return;
      }

      toast.success("Duty description saved");
    } finally {
      setIsSavingDutyDescription(false);
    }
  }, [currentShell, dutyDescriptionDraft, supabase, setIsSavingDutyDescription]);

  // Calculate completion progress
  const completedSections = Object.values(sections).filter(
    (s) => s.is_complete
  ).length;
  const totalSections = STANDARD_MGAS.length;
  const progress = totalSections > 0 ? (completedSections / totalSections) * 100 : 0;

  // Loading state
  if (isLoadingShell) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // No shell - show creation prompt
  if (!currentShell) {
    return (
      <Card className="max-w-2xl mx-auto border-blue-200 dark:border-blue-800/50">
        <CardHeader className="text-center">
          <div className="size-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mx-auto mb-4">
            <FileText className="size-8 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex items-center justify-center gap-2">
            <CardTitle>Start Your {cycleYear} OPB</CardTitle>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 border-blue-400 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20">
              BETA
            </Badge>
          </div>
          <CardDescription>
            Create your Officer Performance Brief workspace to begin drafting
            performance statements for your upcoming evaluation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <User className="size-4 text-muted-foreground" />
              <span>
                {profile?.rank} {profile?.full_name}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="size-4 text-muted-foreground" />
              <span>Cycle Year: {cycleYear}</span>
            </div>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex gap-3">
              <Info className="size-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                  About OPB Statements
                </p>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  OPB statements are narrative assessments organized by four Major
                  Performance Areas (MPAs). Each MPA allows up to{" "}
                  {MAX_STATEMENT_CHARACTERS} characters. The HLR assessment has a{" "}
                  {MAX_HLR_CHARACTERS} character limit.
                </p>
              </div>
            </div>
          </div>

          <Button
            onClick={createShell}
            disabled={isCreatingShell}
            className="w-full"
            size="lg"
          >
            {isCreatingShell ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Sparkles className="size-4 mr-2" />
                Create OPB Workspace
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileText className="size-5" />
            {cycleYear} OPB Workspace
            <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 border-blue-400 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20">
              BETA
            </Badge>
          </h2>
          <p className="text-sm text-muted-foreground">
            {profile?.rank} {profile?.full_name}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            {completedSections}/{totalSections} Complete
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={expandAll}
            className="text-xs"
          >
            Expand All
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={collapseAll}
            className="text-xs"
          >
            Collapse All
          </Button>
        </div>
      </div>

      {/* Duty Description */}
      <Card>
        <CardHeader
          className="cursor-pointer"
          onClick={() => setIsDutyDescriptionCollapsed(!isDutyDescriptionCollapsed)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Duty Description</CardTitle>
              <Badge variant="secondary" className="text-xs">
                {dutyDescriptionDraft.length}/{MAX_DUTY_DESCRIPTION_CHARACTERS}
              </Badge>
            </div>
            {isDutyDescriptionCollapsed ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronUp className="size-4" />
            )}
          </div>
        </CardHeader>
        {!isDutyDescriptionCollapsed && (
          <CardContent className="space-y-3">
            <textarea
              value={dutyDescriptionDraft}
              onChange={(e) => setDutyDescriptionDraft(e.target.value)}
              placeholder="Describe your position, scope of responsibility, and key duties..."
              className="w-full min-h-[100px] p-3 text-sm border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              maxLength={MAX_DUTY_DESCRIPTION_CHARACTERS}
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Use plain English. Include position, leadership level, people
                supervised, and resources managed.
              </p>
              {isDutyDescriptionDirty && (
                <Button
                  size="sm"
                  onClick={saveDutyDescription}
                  disabled={isSavingDutyDescription}
                >
                  {isSavingDutyDescription ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "Save"
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      <Separator />

      {/* MPA Sections */}
      <div className="space-y-4">
        {STANDARD_MGAS.map((mga) => {
          const section = sections[mga.key];
          const isCollapsed = collapsedSections[mga.key] ?? false;
          const opbMpa = OPB_MPA_DESCRIPTIONS[mga.key];

          return (
            <OPBSectionCard
              key={mga.key}
              mpaKey={mga.key}
              mpaLabel={opbMpa?.title || mga.label}
              mpaDescription={opbMpa?.description || ""}
              section={section}
              isCollapsed={isCollapsed}
              onToggleCollapse={() => toggleSectionCollapsed(mga.key)}
              onSave={(text) => saveSection(mga.key, text)}
              onCreateSnapshot={(text) => createSnapshot(mga.key, text)}
              onGenerate={(context) => generateStatement(mga.key, context)}
              isGenerating={isGenerating === mga.key}
              snapshots={snapshots[section?.id] || []}
              onLoadSnapshots={() => section && loadSnapshots(section.id)}
              maxCharacters={
                mga.key === "hlr_assessment"
                  ? MAX_HLR_CHARACTERS
                  : MAX_STATEMENT_CHARACTERS
              }
              accomplishments={accomplishments}
            />
          );
        })}
      </div>
    </div>
  );
}
