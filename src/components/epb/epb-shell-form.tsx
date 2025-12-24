"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { STANDARD_MGAS, MAX_STATEMENT_CHARACTERS, MAX_HLR_CHARACTERS } from "@/lib/constants";
import {
  FileText,
  Plus,
  Loader2,
  ChevronDown,
  ChevronUp,
  Users,
  User,
  Share2,
  CheckCircle2,
  Circle,
  Crown,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import { useEPBShellStore, type SelectedRatee } from "@/stores/epb-shell-store";
import { MPASectionCard } from "./mpa-section-card";
import { EPBShellShareDialog } from "./epb-shell-share-dialog";
import { RealtimeCursors } from "./realtime-cursors";
import { useEPBCollaboration } from "@/hooks/use-epb-collaboration";
import { useSectionLocks } from "@/hooks/use-section-locks";
import type { EPBShell, EPBShellSection, EPBShellSnapshot, Accomplishment, Profile, ManagedMember, UserLLMSettings } from "@/types/database";

interface EPBShellFormProps {
  cycleYear: number;
  model: string;
  onOpenAccomplishments: (mpa: string) => void;
}

export function EPBShellForm({
  cycleYear,
  model,
  onOpenAccomplishments,
}: EPBShellFormProps) {
  const supabase = createClient();
  const { profile, subordinates, managedMembers } = useUserStore();
  const {
    selectedRatee,
    setSelectedRatee,
    currentShell,
    setCurrentShell,
    sections,
    updateSection,
    snapshots,
    setSnapshots,
    addSnapshot,
    collapsedSections,
    toggleSectionCollapsed,
    expandAll,
    collapseAll,
    isLoadingShell,
    setIsLoadingShell,
    isCreatingShell,
    setIsCreatingShell,
    reset,
  } = useEPBShellStore();

  const [accomplishments, setAccomplishments] = useState<Accomplishment[]>([]);
  const [userSettings, setUserSettings] = useState<Partial<UserLLMSettings> | null>(null);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [isTogglingMode, setIsTogglingMode] = useState(false);
  
  // Ref for cursor tracking container
  const contentContainerRef = useRef<HTMLDivElement>(null);

  // Multi-user mode from the shell
  const isMultiUserMode = currentShell?.multi_user_enabled ?? false;

  // Section locks hook - only active when multi-user mode is OFF
  const sectionLocks = useSectionLocks({
    shellId: currentShell?.id || null,
    enabled: !isMultiUserMode,
  });

  // Page-level collaboration hook - only active when multi-user mode is ON
  const collaboration = useEPBCollaboration({
    shellId: isMultiUserMode ? (currentShell?.id || null) : null,
    onStateChange: useCallback((_state: import("@/hooks/use-epb-collaboration").EPBWorkspaceState) => {
      // Handle remote state changes (e.g., sync section content)
      // For now, we'll just use cursor tracking
    }, []),
    onParticipantJoin: useCallback((participant: import("@/hooks/use-epb-collaboration").EPBCollaborator) => {
      toast.success(`${participant.rank ? participant.rank + " " : ""}${participant.fullName} joined`, {
        description: "You can now collaborate in real-time",
      });
    }, []),
    onParticipantLeave: useCallback((_participantId: string) => {
      toast.info("A collaborator left the session");
    }, []),
  });

  // Toggle multi-user mode
  const handleToggleMultiUserMode = useCallback(async () => {
    if (!currentShell) return;
    
    setIsTogglingMode(true);
    try {
      const newValue = !currentShell.multi_user_enabled;
      
      const { error } = await supabase
        .from("epb_shells")
        .update({ multi_user_enabled: newValue } as never)
        .eq("id", currentShell.id);
      
      if (error) throw error;
      
      // Update local state
      setCurrentShell({ ...currentShell, multi_user_enabled: newValue });
      
      toast.success(newValue ? "Multi-user mode enabled" : "Multi-user mode disabled", {
        description: newValue 
          ? "Others can now join your session for real-time collaboration" 
          : "Record locking is now active per MPA section",
      });
    } catch (err) {
      console.error("Failed to toggle multi-user mode:", err);
      toast.error("Failed to change collaboration mode");
    } finally {
      setIsTogglingMode(false);
    }
  }, [currentShell, supabase, setCurrentShell]);

  // Calculate completion status
  const completedMPAs = Object.values(sections).filter(
    (s) => s.statement_text.trim().length > 0
  ).length;
  const totalMPAs = STANDARD_MGAS.length;

  // Build ratee selector options
  const rateeOptions: { value: string; label: string; ratee: SelectedRatee }[] = [
    {
      value: "self",
      label: `Myself (${profile?.rank} ${profile?.full_name})`,
      ratee: {
        id: profile?.id || "",
        fullName: profile?.full_name || null,
        rank: profile?.rank as SelectedRatee["rank"],
        afsc: profile?.afsc || null,
        isManagedMember: false,
      },
    },
    ...subordinates.map((sub) => ({
      value: sub.id,
      label: `${sub.rank} ${sub.full_name}`,
      ratee: {
        id: sub.id,
        fullName: sub.full_name,
        rank: sub.rank as SelectedRatee["rank"],
        afsc: sub.afsc,
        isManagedMember: false,
      },
    })),
    ...managedMembers.map((member) => ({
      value: `managed:${member.id}`,
      label: `${member.rank} ${member.full_name}${member.is_placeholder ? " (Managed)" : ""}`,
      ratee: {
        id: member.id,
        fullName: member.full_name,
        rank: member.rank as SelectedRatee["rank"],
        afsc: member.afsc,
        isManagedMember: true,
      },
    })),
  ];

  // Handle ratee selection change
  const handleRateeChange = (value: string) => {
    const option = rateeOptions.find((o) => o.value === value);
    if (option) {
      setSelectedRatee(option.ratee);
    }
  };

  // Load user settings
  useEffect(() => {
    async function loadSettings() {
      if (!profile) return;
      const { data } = await supabase
        .from("user_llm_settings")
        .select("*")
        .eq("user_id", profile.id)
        .single();
      if (data) {
        setUserSettings(data as unknown as UserLLMSettings);
      }
    }
    loadSettings();
  }, [profile, supabase]);

  // Initialize with self selected
  useEffect(() => {
    if (profile && !selectedRatee) {
      setSelectedRatee({
        id: profile.id,
        fullName: profile.full_name,
        rank: profile.rank as SelectedRatee["rank"],
        afsc: profile.afsc,
        isManagedMember: false,
      });
    }
  }, [profile, selectedRatee, setSelectedRatee]);

  // Load shell when ratee or cycle year changes
  useEffect(() => {
    async function loadShell() {
      if (!selectedRatee || !profile) return;

      setIsLoadingShell(true);
      try {
        // Build query based on ratee type
        let query = supabase
          .from("epb_shells")
          .select(`
            *,
            sections:epb_shell_sections(*)
          `)
          .eq("cycle_year", cycleYear);

        if (selectedRatee.isManagedMember) {
          query = query.eq("team_member_id", selectedRatee.id);
        } else {
          query = query.eq("user_id", selectedRatee.id).is("team_member_id", null);
        }

        const { data, error } = await query.single();

        if (error && error.code !== "PGRST116") {
          // PGRST116 = no rows returned (not an error for us)
          console.error("Error loading shell:", error);
        }

        if (data) {
          const shellData = data as EPBShell & { sections: EPBShellSection[] };
          setCurrentShell(shellData);
          // Load snapshots for each section
          const sectionIds = (shellData.sections || []).map((s) => s.id);
          if (sectionIds.length > 0) {
            const { data: snapshotData } = await supabase
              .from("epb_shell_snapshots")
              .select("*")
              .in("section_id", sectionIds)
              .order("created_at", { ascending: false });
            if (snapshotData) {
              // Group by section_id
              const snapshotsBySection: Record<string, EPBShellSnapshot[]> = {};
              (snapshotData as EPBShellSnapshot[]).forEach((snap) => {
                if (!snapshotsBySection[snap.section_id]) {
                  snapshotsBySection[snap.section_id] = [];
                }
                snapshotsBySection[snap.section_id].push(snap);
              });
              Object.entries(snapshotsBySection).forEach(([sectionId, snaps]) => {
                setSnapshots(sectionId, snaps);
              });
            }
          }
        } else {
          setCurrentShell(null);
        }
      } catch (error) {
        console.error("Failed to load shell:", error);
      } finally {
        setIsLoadingShell(false);
      }
    }

    loadShell();
  }, [selectedRatee, cycleYear, profile, supabase, setCurrentShell, setIsLoadingShell, setSnapshots]);

  // Load accomplishments for the selected ratee
  useEffect(() => {
    async function loadAccomplishments() {
      if (!selectedRatee || !profile) return;

      let query = supabase
        .from("accomplishments")
        .select("*")
        .eq("cycle_year", cycleYear)
        .order("date", { ascending: false });

      if (selectedRatee.isManagedMember) {
        query = query.eq("team_member_id", selectedRatee.id);
      } else {
        query = query.eq("user_id", selectedRatee.id).is("team_member_id", null);
      }

      const { data } = await query;
      setAccomplishments((data as Accomplishment[]) || []);
    }

    loadAccomplishments();
  }, [selectedRatee, cycleYear, profile, supabase]);

  // Create a new shell
  const handleCreateShell = async () => {
    if (!selectedRatee || !profile) return;

    setIsCreatingShell(true);
    try {
      const insertData: {
        user_id: string;
        team_member_id?: string;
        created_by: string;
        cycle_year: number;
      } = {
        user_id: selectedRatee.isManagedMember ? profile.id : selectedRatee.id,
        created_by: profile.id,
        cycle_year: cycleYear,
      };

      if (selectedRatee.isManagedMember) {
        insertData.team_member_id = selectedRatee.id;
      }

      // Insert the shell
      const { data: insertedShell, error: insertError } = await supabase
        .from("epb_shells")
        .insert(insertData as never)
        .select("id")
        .single();

      if (insertError) throw insertError;
      if (!insertedShell) throw new Error("No shell returned from insert");

      // Wait a small moment for the trigger to complete, then fetch with sections
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Reload the shell with sections (trigger creates sections after insert)
      const shellId = (insertedShell as { id: string }).id;
      const { data, error } = await supabase
        .from("epb_shells")
        .select(`
          *,
          sections:epb_shell_sections(*)
        `)
        .eq("id", shellId)
        .single();

      if (error) throw error;

      setCurrentShell(data as EPBShell);
      toast.success("EPB Shell created successfully!");
    } catch (error: unknown) {
      console.error("Failed to create shell:", error);
      const errMsg = error instanceof Error ? error.message : "Failed to create EPB Shell";
      toast.error(errMsg);
    } finally {
      setIsCreatingShell(false);
    }
  };

  // Save a section's statement
  const handleSaveSection = async (mpa: string, text: string) => {
    const section = sections[mpa];
    if (!section || !profile) return;

    const { error } = await supabase
      .from("epb_shell_sections")
      .update({
        statement_text: text,
        last_edited_by: profile.id,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", section.id);

    if (error) throw error;

    // Update local state
    updateSection(mpa, {
      statement_text: text,
      last_edited_by: profile.id,
      updated_at: new Date().toISOString(),
    });
  };

  // Create a snapshot
  const handleCreateSnapshot = async (mpa: string, text: string, note?: string) => {
    const section = sections[mpa];
    if (!section || !profile) return;

    const { data, error } = await supabase
      .from("epb_shell_snapshots")
      .insert({
        section_id: section.id,
        statement_text: text,
        created_by: profile.id,
        note,
      } as never)
      .select()
      .single();

    if (error) throw error;

    addSnapshot(section.id, data as EPBShellSnapshot);
  };

  // Generate a statement using AI
  const handleGenerateStatement = async (
    mpa: string,
    options: {
      useAccomplishments: boolean;
      accomplishmentIds?: string[];
      customContext?: string;
      usesTwoStatements: boolean;
      statement1Context?: string;
      statement2Context?: string;
    }
  ): Promise<string | null> => {
    if (!selectedRatee) return null;

    const maxChars = mpa === "hlr_assessment" ? MAX_HLR_CHARACTERS : MAX_STATEMENT_CHARACTERS;
    
    // If using accomplishments, filter to selected ones
    const selectedAccs = options.useAccomplishments && options.accomplishmentIds
      ? accomplishments.filter((a) => options.accomplishmentIds!.includes(a.id))
      : [];

    // Prepare context based on source
    let context = "";
    if (options.useAccomplishments && selectedAccs.length > 0) {
      context = selectedAccs
        .map((a) => `${a.action_verb}: ${a.details}. Impact: ${a.impact}${a.metrics ? `. Metrics: ${a.metrics}` : ""}`)
        .join("\n\n");
    } else if (options.usesTwoStatements) {
      context = `Statement 1 context: ${options.statement1Context || ""}\n\nStatement 2 context: ${options.statement2Context || ""}`;
    } else {
      context = options.customContext || options.statement1Context || "";
    }

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rateeId: selectedRatee.id,
          rateeRank: selectedRatee.rank,
          rateeAfsc: selectedRatee.afsc,
          cycleYear,
          model,
          writingStyle: "personal",
          selectedMPAs: [mpa],
          customContext: context,
          customContextOptions: {
            statementCount: options.usesTwoStatements ? 2 : 1,
          },
          accomplishments: selectedAccs.map((a) => ({
            action_verb: a.action_verb,
            details: a.details,
            impact: a.impact,
            metrics: a.metrics,
          })),
        }),
      });

      if (!response.ok) throw new Error("Generation failed");

      const result = await response.json();
      const statements = result.statements?.[0]?.statements || [];
      
      if (statements.length === 0) return null;

      // Combine statements if multiple
      const combined = statements.length > 1
        ? `${statements[0]}. ${statements[1]}`
        : statements[0];

      // Ensure it fits within limit
      return combined.slice(0, maxChars);
    } catch (error) {
      console.error("Generate error:", error);
      throw error;
    }
  };

  // Revise a statement using AI
  const handleReviseStatement = async (
    mpa: string,
    text: string,
    context?: string
  ): Promise<string | null> => {
    try {
      const response = await fetch("/api/revise-selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullStatement: text,
          selectedText: text,
          selectionStart: 0,
          selectionEnd: text.length,
          model,
          mode: "general",
          context: context || `Rewrite this ${STANDARD_MGAS.find((m) => m.key === mpa)?.label || mpa} statement with improved flow and action verbs.`,
        }),
      });

      if (!response.ok) throw new Error("Revision failed");

      const result = await response.json();
      return result.revisions?.[0] || null;
    } catch (error) {
      console.error("Revise error:", error);
      throw error;
    }
  };

  // Get accomplishments count for an MPA
  const getAccomplishmentsCountForMPA = (mpa: string) => {
    return accomplishments.filter((a) => a.mpa === mpa).length;
  };

  // Loading state
  if (isLoadingShell) {
    return (
      <Card>
        <CardContent className="py-12 flex flex-col items-center justify-center">
          <Loader2 className="size-8 animate-spin text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Loading EPB Shell...</p>
        </CardContent>
      </Card>
    );
  }

  // No shell exists - show creation prompt
  if (!currentShell) {
    return (
      <div className="space-y-6">
        {/* Ratee Selector */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">EPB Shell</CardTitle>
            <CardDescription>
              Create and manage performance narrative statements for yourself or your team
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex-1 max-w-xs">
                <Select
                  value={
                    selectedRatee
                      ? selectedRatee.isManagedMember
                        ? `managed:${selectedRatee.id}`
                        : selectedRatee.id === profile?.id
                        ? "self"
                        : selectedRatee.id
                      : "self"
                  }
                  onValueChange={handleRateeChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select member..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="self">
                      <span className="flex items-center gap-2">
                        <User className="size-4" />
                        Myself ({profile?.rank} {profile?.full_name})
                      </span>
                    </SelectItem>
                    {subordinates.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                          Team Members
                        </div>
                        {subordinates.map((sub) => (
                          <SelectItem key={sub.id} value={sub.id}>
                            <span className="flex items-center gap-2">
                              <Users className="size-4" />
                              {sub.rank} {sub.full_name}
                            </span>
                          </SelectItem>
                        ))}
                      </>
                    )}
                    {managedMembers.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                          Managed Members
                        </div>
                        {managedMembers.map((member) => (
                          <SelectItem key={member.id} value={`managed:${member.id}`}>
                            <span className="flex items-center gap-2">
                              <User className="size-4 opacity-60" />
                              {member.rank} {member.full_name}
                              {member.is_placeholder && (
                                <Badge variant="secondary" className="text-[10px]">
                                  Managed
                                </Badge>
                              )}
                            </span>
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <Badge variant="outline" className="text-sm">
                {cycleYear} Cycle
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Create Shell Prompt */}
        <Card className="border-dashed border-2">
          <CardContent className="py-12 flex flex-col items-center justify-center text-center">
            <div className="size-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
              <FileText className="size-8 text-muted-foreground" />
            </div>
            <h3 className="font-medium text-lg mb-2">No EPB Shell Found</h3>
            <p className="text-muted-foreground text-sm max-w-md mb-6">
              {selectedRatee?.id === profile?.id
                ? "Create an EPB Shell to start building your performance narrative statements for this cycle."
                : `Create an EPB Shell for ${selectedRatee?.rank} ${selectedRatee?.fullName} to manage their performance narrative statements.`}
            </p>
            <Button onClick={handleCreateShell} disabled={isCreatingShell} size="lg">
              {isCreatingShell ? (
                <Loader2 className="size-4 animate-spin mr-2" />
              ) : (
                <Plus className="size-4 mr-2" />
              )}
              Create EPB Shell
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Shell exists - show full form
  return (
    <div className="space-y-6">
      {/* Member Selector - Always visible */}
      {(subordinates.length > 0 || managedMembers.length > 0) && (
        <Card className="bg-muted/30">
          <CardContent className="py-3">
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground shrink-0">Viewing EPB for:</span>
              <div className="flex-1 max-w-sm">
                <Select
                  value={
                    selectedRatee
                      ? selectedRatee.isManagedMember
                        ? `managed:${selectedRatee.id}`
                        : selectedRatee.id === profile?.id
                        ? "self"
                        : selectedRatee.id
                      : "self"
                  }
                  onValueChange={handleRateeChange}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select member..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="self">
                      <span className="flex items-center gap-2">
                        <User className="size-4" />
                        Myself ({profile?.rank} {profile?.full_name})
                      </span>
                    </SelectItem>
                    {subordinates.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                          Team Members
                        </div>
                        {subordinates.map((sub) => (
                          <SelectItem key={sub.id} value={sub.id}>
                            <span className="flex items-center gap-2">
                              <Users className="size-4" />
                              {sub.rank} {sub.full_name}
                            </span>
                          </SelectItem>
                        ))}
                      </>
                    )}
                    {managedMembers.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                          Managed Members
                        </div>
                        {managedMembers.map((member) => (
                          <SelectItem key={member.id} value={`managed:${member.id}`}>
                            <span className="flex items-center gap-2">
                              <User className="size-4 opacity-60" />
                              {member.rank} {member.full_name}
                              {member.is_placeholder && (
                                <Badge variant="secondary" className="text-[10px]">
                                  Managed
                                </Badge>
                              )}
                            </span>
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <Badge variant="outline" className="shrink-0">
                {cycleYear} Cycle
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Header with ratee info and progress */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                {selectedRatee?.rank} {selectedRatee?.fullName}
                {selectedRatee?.isManagedMember && (
                  <Badge variant="secondary" className="text-xs">Managed</Badge>
                )}
              </CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1">
                <Badge variant="outline">{cycleYear} Performance Cycle</Badge>
                {selectedRatee?.afsc && (
                  <Badge variant="secondary">{selectedRatee.afsc}</Badge>
                )}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {/* Collaborate Toggle */}
              <button
                onClick={handleToggleMultiUserMode}
                disabled={isTogglingMode}
                className={cn(
                  "relative inline-flex h-8 items-center gap-2 rounded-full px-4 text-sm font-medium transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  "disabled:pointer-events-none disabled:opacity-50",
                  isMultiUserMode
                    ? "bg-violet-600 text-white hover:bg-violet-700 shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {isTogglingMode ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : isMultiUserMode ? (
                  <Users className="size-4" />
                ) : (
                  <User className="size-4" />
                )}
                <span>Collaborate</span>
                {isMultiUserMode && collaboration.collaborators.length > 0 && (
                  <span className="flex items-center justify-center size-5 rounded-full bg-white/20 text-xs font-bold">
                    {collaboration.collaborators.length}
                  </span>
                )}
              </button>

              {/* Session controls - only shown when multi-user is enabled */}
              {isMultiUserMode && (
                <div className="flex items-center gap-1.5">
                  {!collaboration.isInSession ? (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => collaboration.createSession()}
                        disabled={collaboration.isLoading}
                        className="h-7 px-2 text-xs"
                      >
                        {collaboration.isLoading ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          "Start"
                        )}
                      </Button>
                      <span className="text-muted-foreground text-xs">or</span>
                      <input
                        type="text"
                        placeholder="Code"
                        className="h-7 w-16 rounded border bg-background px-2 text-xs uppercase placeholder:normal-case"
                        maxLength={6}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const code = (e.target as HTMLInputElement).value.trim();
                            if (code) collaboration.joinSession(code);
                          }
                        }}
                      />
                    </>
                  ) : (
                    <>
                      <Badge variant="secondary" className="h-7 px-2 font-mono text-xs">
                        {collaboration.sessionCode}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={collaboration.isHost ? collaboration.endSession : collaboration.leaveSession}
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                      >
                        {collaboration.isHost ? "End" : "Leave"}
                      </Button>
                    </>
                  )}
                </div>
              )}
              
              <Button variant="outline" size="sm" onClick={() => setShowShareDialog(true)}>
                <Share2 className="size-4 mr-1.5" />
                Share
              </Button>
            </div>
            
            {/* Share Dialog */}
            {currentShell && (
              <EPBShellShareDialog
                shellId={currentShell.id}
                isOpen={showShareDialog}
                onClose={() => setShowShareDialog(false)}
                ratee={selectedRatee}
                currentUserId={profile?.id}
              />
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {/* Progress indicator */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Statement Progress</span>
              <span className="text-sm text-muted-foreground">
                {completedMPAs}/{totalMPAs} MPAs
              </span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {STANDARD_MGAS.map((mpa) => {
                const section = sections[mpa.key];
                const hasContent = section?.statement_text?.trim().length > 0;
                const isHLR = mpa.key === "hlr_assessment";
                return (
                  <button
                    key={mpa.key}
                    onClick={() => {
                      // Expand this section and scroll to it
                      if (collapsedSections[mpa.key]) {
                        toggleSectionCollapsed(mpa.key);
                      }
                    }}
                    className={cn(
                      "p-2 rounded-lg border text-center transition-all hover:shadow-sm",
                      hasContent
                        ? "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700"
                        : "bg-muted/30 hover:bg-muted/50",
                      isHLR && !hasContent && "border-amber-300/50"
                    )}
                  >
                    <div className="flex items-center justify-center gap-1 mb-0.5">
                      {hasContent ? (
                        <CheckCircle2 className="size-3 text-green-600" />
                      ) : (
                        <Circle className="size-3 text-muted-foreground" />
                      )}
                      {isHLR && <Crown className="size-3 text-amber-600" />}
                    </div>
                    <span className="text-[10px] font-medium truncate block">
                      {mpa.key === "executing_mission" && "Mission"}
                      {mpa.key === "leading_people" && "Leading"}
                      {mpa.key === "managing_resources" && "Resources"}
                      {mpa.key === "improving_unit" && "Improving"}
                      {mpa.key === "hlr_assessment" && "HLR"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <Separator className="my-4" />

          {/* Quick actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={expandAll}>
              <ChevronDown className="size-3.5 mr-1.5" />
              Expand All
            </Button>
            <Button variant="outline" size="sm" onClick={collapseAll}>
              <ChevronUp className="size-3.5 mr-1.5" />
              Collapse All
            </Button>
            <div className="flex-1" />
            <Badge variant="secondary" className="text-xs">
              {accomplishments.length} Performance Actions
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* MPA Sections with cursor tracking */}
      <div 
        ref={contentContainerRef}
        className="space-y-4 relative"
      >
        {/* Realtime cursors overlay - only visible in collaboration session */}
        {collaboration.isInSession && currentShell && (
          <RealtimeCursors
            roomName={`epb-${currentShell.id}`}
            username={profile?.full_name || "Anonymous"}
            userRank={profile?.rank}
            enabled={collaboration.isInSession}
            containerRef={contentContainerRef}
          />
        )}

        {STANDARD_MGAS.map((mpa) => {
          const section = sections[mpa.key];
          if (!section) return null;

          // Get lock info for this section (only relevant in single-user mode)
          const lockInfo = !isMultiUserMode ? sectionLocks.getLockedByInfo(mpa.key) : null;
          const isLockedByOther = !isMultiUserMode && sectionLocks.isLockedByOther(mpa.key);

          return (
            <div key={mpa.key} data-mpa-key={mpa.key}>
              <MPASectionCard
                section={section}
                isCollapsed={collapsedSections[mpa.key] ?? false}
                onToggleCollapse={() => toggleSectionCollapsed(mpa.key)}
                onSave={(text) => handleSaveSection(mpa.key, text)}
                onCreateSnapshot={(text, note) => handleCreateSnapshot(mpa.key, text, note)}
                onGenerateStatement={(opts) => handleGenerateStatement(mpa.key, opts)}
                onReviseStatement={(text, ctx) => handleReviseStatement(mpa.key, text, ctx)}
                snapshots={snapshots[section.id] || []}
                // Lock props for single-user mode
                isLockedByOther={isLockedByOther}
                lockedByInfo={lockInfo}
                onAcquireLock={() => sectionLocks.acquireLock(section.id)}
                onReleaseLock={() => sectionLocks.releaseLock(section.id)}
                accomplishments={accomplishments}
                onOpenAccomplishments={() => onOpenAccomplishments(mpa.key)}
                cycleYear={cycleYear}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

