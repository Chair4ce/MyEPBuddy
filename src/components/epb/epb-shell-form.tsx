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
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import { useEPBShellStore, type SelectedRatee } from "@/stores/epb-shell-store";
import { MPASectionCard } from "./mpa-section-card";
import { EPBShellShareDialog } from "./epb-shell-share-dialog";
import { RealtimeCursors } from "./realtime-cursors";
import { useEPBCollaboration } from "@/hooks/use-epb-collaboration";
import { useSectionLocks } from "@/hooks/use-section-locks";
import { useIdleDetection } from "@/hooks/use-idle-detection";
import type { EPBShell, EPBShellSection, EPBShellSnapshot, EPBSavedExample, Accomplishment, Profile, ManagedMember, UserLLMSettings, Rank } from "@/types/database";

// Shared EPB info - represents an EPB shell that has been shared with the current user
interface SharedEPBInfo {
  shell: EPBShell;
  // For real user EPBs (team_member_id is null)
  ownerProfile: Profile | null;
  // For managed member EPBs (team_member_id is not null)
  teamMember: { id: string; full_name: string; rank: Rank | null; afsc: string | null } | null;
}

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
  const { profile, subordinates, managedMembers, epbConfig } = useUserStore();
  
  // Feature flag for collaboration
  const isCollaborationEnabled = epbConfig?.enable_collaboration ?? false;
  const {
    selectedRatee,
    setSelectedRatee,
    currentShell,
    setCurrentShell,
    sections,
    updateSection,
    sectionStates,
    snapshots,
    setSnapshots,
    addSnapshot,
    savedExamples,
    setSavedExamples,
    addSavedExample,
    removeSavedExample,
    collapsedSections,
    toggleSectionCollapsed,
    setSectionCollapsed,
    expandAll,
    collapseAll,
    syncRemoteState,
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
  const [highlightedMpa, setHighlightedMpa] = useState<string | null>(null);
  const [sharedEPBs, setSharedEPBs] = useState<SharedEPBInfo[]>([]);
  const [isPageVisible, setIsPageVisible] = useState(true);
  
  // Ref for cursor tracking container
  const contentContainerRef = useRef<HTMLDivElement>(null);
  
  // Track page visibility to pause/resume realtime when user leaves/returns
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsPageVisible(!document.hidden);
    };
    
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  // Multi-user mode from the shell
  const isMultiUserMode = currentShell?.multi_user_enabled ?? false;

  // Section locks hook - only active when multi-user mode is OFF
  const sectionLocks = useSectionLocks({
    shellId: currentShell?.id || null,
    enabled: !isMultiUserMode,
  });

  // Ref to track if we're receiving remote changes (defined early for use in callback)
  const isReceivingRemoteRef = useRef(false);

  // Handle incoming state changes from collaboration
  const handleRemoteStateChange = useCallback((state: import("@/hooks/use-epb-collaboration").EPBWorkspaceState) => {
    // Mark that we're receiving remote data (to avoid broadcasting it back)
    isReceivingRemoteRef.current = true;
    // Sync section text and modes
    syncRemoteState(state.sections, state.collapsedSections);
  }, [syncRemoteState]);

  // Page-level collaboration hook - only active when multi-user mode is ON
  const collaboration = useEPBCollaboration({
    shellId: isMultiUserMode ? (currentShell?.id || null) : null,
    onStateChange: handleRemoteStateChange,
    onParticipantJoin: useCallback((participant: import("@/hooks/use-epb-collaboration").EPBCollaborator) => {
      toast.success(`${participant.rank ? participant.rank + " " : ""}${participant.fullName} joined`, {
        description: "You can now collaborate in real-time",
      });
    }, []),
    onParticipantLeave: useCallback((_participantId: string) => {
      toast.info("A collaborator left the session");
    }, []),
  });

  // Ref to track the last broadcast (to avoid duplicate broadcasts)
  const lastBroadcastRef = useRef<string>("");

  // Broadcast local state changes when in a collaboration session
  // Debounced to avoid excessive broadcasts
  useEffect(() => {
    if (!collaboration.isInSession) return;
    if (isReceivingRemoteRef.current) {
      isReceivingRemoteRef.current = false;
      return;
    }
    
    // Build sections state from current section states
    const sectionsData: Record<string, { draftText: string; mode: string }> = {};
    Object.entries(sectionStates).forEach(([mpa, state]) => {
      sectionsData[mpa] = {
        draftText: state.draftText,
        mode: state.mode,
      };
    });
    
    // Create a hash to check if state actually changed
    const stateHash = JSON.stringify({ sections: sectionsData, collapsedSections });
    if (stateHash === lastBroadcastRef.current) return;
    lastBroadcastRef.current = stateHash;
    
    // Debounce the broadcast
    const timer = setTimeout(() => {
      collaboration.broadcastState({
        sections: sectionsData,
        collapsedSections,
      });
    }, 100);
    
    return () => clearTimeout(timer);
  }, [collaboration, sectionStates, collapsedSections]);

  // Idle detection - 15 minutes timeout
  const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
  
  const handleIdleTimeout = useCallback(() => {
    // If in a collaboration session, leave/end it
    if (collaboration.isInSession) {
      if (collaboration.isHost) {
        toast.warning("Session ended due to inactivity", {
          description: "The multi-user session was closed after 15 minutes of inactivity",
        });
        collaboration.endSession();
      } else {
        toast.info("Left session due to inactivity", {
          description: "You were disconnected after 15 minutes of inactivity",
        });
        collaboration.leaveSession();
      }
    }
    
    // Release any locks we hold
    if (sectionLocks.hasAnyLock()) {
      // The locks will auto-expire after 5 mins without heartbeat
      // but we can't easily release them here without section IDs
      toast.info("Your edit locks will expire shortly", {
        description: "Due to inactivity, your locks will be released",
      });
    }
  }, [collaboration, sectionLocks]);

  useIdleDetection({
    timeout: IDLE_TIMEOUT_MS,
    onIdle: handleIdleTimeout,
    enabled: collaboration.isInSession || !isMultiUserMode, // Only track when session active or in single-user mode
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

  // Calculate completion status - now based on is_complete toggle, not text content
  const completedMPAs = Object.values(sections).filter(
    (s) => s.is_complete
  ).length;
  const totalMPAs = STANDARD_MGAS.length;

  // Toggle completion status for a section
  const handleToggleComplete = async (mpa: string) => {
    const section = sections[mpa];
    if (!section || !profile) return;

    const newValue = !section.is_complete;
    
    // Optimistically update local state
    updateSection(mpa, { is_complete: newValue });

    const { error } = await supabase
      .from("epb_shell_sections")
      .update({
        is_complete: newValue,
        last_edited_by: profile.id,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", section.id);

    if (error) {
      // Revert on error
      updateSection(mpa, { is_complete: !newValue });
      toast.error("Failed to update completion status");
      console.error("Toggle complete error:", error);
    }
  };

  // Scroll to and highlight an MPA section
  const scrollToMpaSection = (mpaKey: string) => {
    // Expand the section if collapsed
    if (collapsedSections[mpaKey]) {
      setSectionCollapsed(mpaKey, false);
    }
    
    // Find the section element using data attribute
    const sectionElement = document.querySelector(`[data-mpa-key="${mpaKey}"]`);
    if (sectionElement) {
      // Scroll to section - position at top of viewport for consistent experience
      // Small delay to allow collapse animation to complete if section was collapsed
      setTimeout(() => {
        sectionElement.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
      
      // Set highlight state to trigger pulse animation
      setHighlightedMpa(mpaKey);
      
      // Clear highlight after animation completes (0.6s for single pulse)
      setTimeout(() => {
        setHighlightedMpa(null);
      }, 600);
    }
  };

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

  // Build shared EPB options - these are EPBs shared with the current user
  const sharedEPBOptions: { value: string; label: string; ratee: SelectedRatee }[] = sharedEPBs
    .filter((shared) => {
      // Only include shared EPBs for the current cycle year
      if (shared.shell.cycle_year !== cycleYear) return false;
      
      // Exclude EPBs we already have access to (self, subordinates, managed members)
      if (shared.ownerProfile) {
        // Real user EPB - check if already in our lists
        if (shared.ownerProfile.id === profile?.id) return false;
        if (subordinates.some((sub) => sub.id === shared.ownerProfile?.id)) return false;
      }
      if (shared.teamMember) {
        // Managed member EPB - check if already in our list
        if (managedMembers.some((m) => m.id === shared.teamMember?.id)) return false;
      }
      return true;
    })
    .map((shared) => {
      if (shared.teamMember) {
        // Managed member EPB
        return {
          value: `shared-managed:${shared.teamMember.id}`,
          label: `${shared.teamMember.rank || ""} ${shared.teamMember.full_name}`.trim(),
          ratee: {
            id: shared.teamMember.id,
            fullName: shared.teamMember.full_name,
            rank: shared.teamMember.rank as SelectedRatee["rank"],
            afsc: shared.teamMember.afsc,
            isManagedMember: true,
          },
        };
      } else if (shared.ownerProfile) {
        // Real user EPB
        return {
          value: `shared:${shared.ownerProfile.id}`,
          label: `${shared.ownerProfile.rank || ""} ${shared.ownerProfile.full_name}`.trim(),
          ratee: {
            id: shared.ownerProfile.id,
            fullName: shared.ownerProfile.full_name,
            rank: shared.ownerProfile.rank as SelectedRatee["rank"],
            afsc: shared.ownerProfile.afsc,
            isManagedMember: false,
          },
        };
      }
      return null;
    })
    .filter((opt): opt is NonNullable<typeof opt> => opt !== null);

  // LocalStorage key for persisting selected EPB (includes profile ID to prevent cross-user issues)
  const SELECTED_RATEE_KEY = profile ? `epb-selected-ratee-${profile.id}-${cycleYear}` : null;

  // Handle ratee selection change
  const handleRateeChange = (value: string) => {
    // Check regular options first
    const option = rateeOptions.find((o) => o.value === value);
    if (option) {
      setSelectedRatee(option.ratee);
      // Persist to localStorage
      if (SELECTED_RATEE_KEY) {
        localStorage.setItem(SELECTED_RATEE_KEY, JSON.stringify({ value, ratee: option.ratee }));
      }
      return;
    }
    // Check shared EPB options
    const sharedOption = sharedEPBOptions.find((o) => o.value === value);
    if (sharedOption) {
      setSelectedRatee(sharedOption.ratee);
      // Persist to localStorage
      if (SELECTED_RATEE_KEY) {
        localStorage.setItem(SELECTED_RATEE_KEY, JSON.stringify({ value, ratee: sharedOption.ratee }));
      }
    }
  };

  // Compute the current select value - handles self, subordinates, managed members, and shared EPBs
  const getSelectedRateeValue = (): string => {
    if (!selectedRatee) return "self";
    
    // Check if it's self
    if (selectedRatee.id === profile?.id && !selectedRatee.isManagedMember) {
      return "self";
    }
    
    // Check if it's a subordinate
    if (!selectedRatee.isManagedMember && subordinates.some((s) => s.id === selectedRatee.id)) {
      return selectedRatee.id;
    }
    
    // Check if it's a managed member
    if (selectedRatee.isManagedMember && managedMembers.some((m) => m.id === selectedRatee.id)) {
      return `managed:${selectedRatee.id}`;
    }
    
    // Check if it's a shared EPB
    const sharedMatch = sharedEPBOptions.find((o) => o.ratee.id === selectedRatee.id);
    if (sharedMatch) {
      return sharedMatch.value;
    }
    
    // Fallback - use the ID pattern based on isManagedMember
    return selectedRatee.isManagedMember ? `managed:${selectedRatee.id}` : selectedRatee.id;
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

  // Load EPBs shared with current user
  useEffect(() => {
    async function loadSharedEPBs() {
      if (!profile) return;

      // Get all shares where current user is the recipient
      const { data: sharesData, error } = await supabase
        .from("epb_shell_shares")
        .select(`
          shell_id,
          shell:epb_shells!inner(
            id,
            user_id,
            team_member_id,
            created_by,
            cycle_year,
            multi_user_enabled,
            created_at,
            updated_at
          )
        `)
        .eq("shared_with_id", profile.id);

      if (error) {
        console.error("Failed to load shared EPBs:", error);
        return;
      }

      if (!sharesData || sharesData.length === 0) {
        setSharedEPBs([]);
        return;
      }

      // Process each shared shell to get owner info
      const sharedInfos: SharedEPBInfo[] = [];

      // Type the shares data to help TypeScript understand the nested join
      type ShareWithShell = { shell_id: string; shell: EPBShell };
      const typedShares = sharesData as unknown as ShareWithShell[];

      for (const share of typedShares) {
        const shell = share.shell;
        if (!shell) continue;

        // Check if this is a managed member EPB or a real user EPB
        if (shell.team_member_id) {
          // Managed member - get team member info
          const { data: teamMemberData } = await supabase
            .from("team_members")
            .select("id, full_name, rank, afsc")
            .eq("id", shell.team_member_id)
            .single();

          if (teamMemberData) {
            sharedInfos.push({
              shell,
              ownerProfile: null,
              teamMember: teamMemberData as { id: string; full_name: string; rank: Rank | null; afsc: string | null },
            });
          }
        } else {
          // Real user - get profile info
          const { data: profileData } = await supabase
            .from("profiles")
            .select("id, full_name, rank, afsc, email")
            .eq("id", shell.user_id)
            .single();

          if (profileData) {
            sharedInfos.push({
              shell,
              ownerProfile: profileData as Profile,
              teamMember: null,
            });
          }
        }
      }

      setSharedEPBs(sharedInfos);
    }

    loadSharedEPBs();
  }, [profile, supabase]);

  // Track which profile+cycle we've initialized for
  const [initializedFor, setInitializedFor] = useState<string | null>(null);
  
  // Initialize ratee selection when profile or cycle changes
  useEffect(() => {
    if (!profile) {
      console.log("[EPB Init] No profile yet");
      return;
    }
    
    const initKey = `${profile.id}-${cycleYear}`;
    console.log("[EPB Init] Check:", { initKey, initializedFor, match: initializedFor === initKey });
    
    // Only initialize if this is a new profile/cycle combination
    if (initializedFor === initKey) return;
    
    // Try to restore from localStorage (key includes profile ID to prevent cross-user issues)
    let rateeToUse: SelectedRatee | null = null;
    try {
      const savedKey = `epb-selected-ratee-${profile.id}-${cycleYear}`;
      const saved = localStorage.getItem(savedKey);
      if (saved) {
        const parsed = JSON.parse(saved) as { value: string; ratee: SelectedRatee };
        if (parsed.ratee && parsed.ratee.id) {
          rateeToUse = parsed.ratee;
        }
      }
    } catch {
      // Ignore localStorage errors
    }
    
    // Default to self if nothing in localStorage
    if (!rateeToUse) {
      rateeToUse = {
        id: profile.id,
        fullName: profile.full_name,
        rank: profile.rank as SelectedRatee["rank"],
        afsc: profile.afsc,
        isManagedMember: false,
      };
    }
    
    setSelectedRatee(rateeToUse);
    setInitializedFor(initKey);
  }, [profile, cycleYear, initializedFor, setSelectedRatee]);

  // Load shell when ratee changes - only after initialization is complete
  useEffect(() => {
    console.log("[EPB Load] Check:", { 
      hasRatee: !!selectedRatee, 
      rateeId: selectedRatee?.id,
      hasProfile: !!profile,
      initializedFor,
      initKey: profile ? `${profile.id}-${cycleYear}` : null
    });
    
    if (!selectedRatee || !profile) return;
    
    // Only load if we've completed initialization for this profile/cycle
    const initKey = `${profile.id}-${cycleYear}`;
    if (initializedFor !== initKey) {
      console.log("[EPB Load] Skipping - not initialized yet");
      return;
    }
    
    console.log("[EPB Load] Loading shell for:", selectedRatee.id);
    
    async function loadShell() {
      if (!selectedRatee) return;
      
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
            
            // Load saved examples for each section
            const { data: examplesData } = await supabase
              .from("epb_saved_examples")
              .select("*")
              .in("section_id", sectionIds)
              .order("created_at", { ascending: false });
            if (examplesData) {
              // Group by section_id
              const examplesBySection: Record<string, EPBSavedExample[]> = {};
              (examplesData as EPBSavedExample[]).forEach((example) => {
                if (!examplesBySection[example.section_id]) {
                  examplesBySection[example.section_id] = [];
                }
                examplesBySection[example.section_id].push(example);
              });
              Object.entries(examplesBySection).forEach(([sectionId, examples]) => {
                setSavedExamples(sectionId, examples);
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
  }, [initializedFor, selectedRatee, cycleYear, profile, supabase, setCurrentShell, setIsLoadingShell, setSnapshots, setSavedExamples]);

  // Track previous visibility state to detect transitions
  const prevPageVisibleRef = useRef(isPageVisible);

  // Realtime subscription for section text updates
  // This ensures all users viewing the same EPB see text changes immediately
  // Only active when page is visible to save resources
  useEffect(() => {
    if (!currentShell?.id || !profile || !isPageVisible) return;

    // When page becomes visible again, fetch fresh section data to catch any missed updates
    const refreshSections = async () => {
      const { data } = await supabase
        .from("epb_shell_sections")
        .select("*")
        .eq("shell_id", currentShell.id);
      
      if (data) {
        (data as EPBShellSection[]).forEach((section) => {
          // Only update sections we're not actively editing
          const currentState = useEPBShellStore.getState().sectionStates[section.mpa];
          if (!currentState?.isDirty) {
            updateSection(section.mpa, {
              statement_text: section.statement_text,
              is_complete: section.is_complete,
              last_edited_by: section.last_edited_by,
              updated_at: section.updated_at,
            });
            useEPBShellStore.getState().updateSectionState(section.mpa, {
              draftText: section.statement_text,
            });
          }
        });
      }
    };
    
    // Only refresh when page visibility transitions from hidden to visible
    // This prevents race conditions with optimistic updates
    const wasHidden = !prevPageVisibleRef.current;
    prevPageVisibleRef.current = isPageVisible;
    
    if (wasHidden) {
      refreshSections();
    }

    // Subscribe to section updates for this shell
    const channel = supabase
      .channel(`section-updates:${currentShell.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "epb_shell_sections",
          filter: `shell_id=eq.${currentShell.id}`,
        },
        (payload) => {
          const updatedSection = payload.new as EPBShellSection;
          
          // Only update if the change was made by someone else
          // (we already have the local state updated for our own changes)
          if (updatedSection.last_edited_by !== profile.id) {
            // Update the section in our local state
            updateSection(updatedSection.mpa, {
              statement_text: updatedSection.statement_text,
              is_complete: updatedSection.is_complete,
              last_edited_by: updatedSection.last_edited_by,
              updated_at: updatedSection.updated_at,
            });

            // Also update the section state's draftText so the textarea reflects changes
            // But only if the user is not currently editing that section
            const currentSectionState = sectionStates[updatedSection.mpa];
            if (!currentSectionState?.isDirty) {
              useEPBShellStore.getState().updateSectionState(updatedSection.mpa, {
                draftText: updatedSection.statement_text,
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentShell?.id, profile, supabase, updateSection, isPageVisible]);

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

  // Create a snapshot (max 10 per section, oldest gets deleted when 11th is added)
  const handleCreateSnapshot = async (mpa: string, text: string) => {
    const section = sections[mpa];
    if (!section || !profile) return;

    const existingSnapshots = snapshots[section.id] || [];
    
    // If we already have 10 snapshots, delete the oldest one
    if (existingSnapshots.length >= 10) {
      // Sort by created_at ascending to find oldest
      const sortedSnapshots = [...existingSnapshots].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      const oldestSnapshot = sortedSnapshots[0];
      
      // Delete oldest from database
      await supabase
        .from("epb_shell_snapshots")
        .delete()
        .eq("id", oldestSnapshot.id);
      
      // Remove from local state
      setSnapshots(section.id, existingSnapshots.filter(s => s.id !== oldestSnapshot.id));
    }

    // Create new snapshot
    const { data, error } = await supabase
      .from("epb_shell_snapshots")
      .insert({
        section_id: section.id,
        statement_text: text,
        created_by: profile.id,
      } as never)
      .select()
      .single();

    if (error) throw error;

    addSnapshot(section.id, data as EPBShellSnapshot);
  };

  // Save an example statement to the scratchpad
  const handleSaveExample = async (mpa: string, text: string, note?: string) => {
    const section = sections[mpa];
    if (!section || !profile || !currentShell) return;

    const { data, error } = await supabase
      .from("epb_saved_examples")
      .insert({
        shell_id: currentShell.id,
        section_id: section.id,
        mpa: mpa,
        statement_text: text,
        created_by: profile.id,
        created_by_name: profile.full_name,
        created_by_rank: profile.rank,
        note: note || null,
      } as never)
      .select()
      .single();

    if (error) {
      console.error("Failed to save example:", error);
      throw error;
    }

    addSavedExample(section.id, data as EPBSavedExample);
  };

  // Delete a saved example
  const handleDeleteExample = async (mpa: string, exampleId: string) => {
    const section = sections[mpa];
    if (!section) return;

    const { error } = await supabase
      .from("epb_saved_examples")
      .delete()
      .eq("id", exampleId);

    if (error) {
      console.error("Failed to delete example:", error);
      throw error;
    }

    removeSavedExample(section.id, exampleId);
  };

  // Generate statement(s) using AI (returns multiple versions)
  const handleGenerateStatement = async (
    mpa: string,
    options: {
      useAccomplishments: boolean;
      accomplishmentIds?: string[];
      customContext?: string;
      usesTwoStatements: boolean;
      statement1Context?: string;
      statement2Context?: string;
      versionCount?: number;
    }
  ): Promise<string[]> => {
    if (!selectedRatee) return [];

    const maxChars = mpa === "hlr_assessment" ? MAX_HLR_CHARACTERS : MAX_STATEMENT_CHARACTERS;
    const versionCount = options.versionCount || 1;
    
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
      // Generate multiple versions in parallel
      const generateOne = async (): Promise<string | null> => {
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
      };

      // Generate requested number of versions in parallel
      const results = await Promise.all(
        Array.from({ length: versionCount }, () => generateOne())
      );
      
      // Filter out nulls and return
      return results.filter((r): r is string => r !== null);
    } catch (error) {
      console.error("Generate error:", error);
      throw error;
    }
  };

  // Revise a statement using AI (returns multiple versions)
  const handleReviseStatement = async (
    mpa: string,
    text: string,
    context?: string,
    versionCount: number = 3
  ): Promise<string[]> => {
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
          versionCount,
        }),
      });

      if (!response.ok) throw new Error("Revision failed");

      const result = await response.json();
      // Return all revisions (or slice to requested count)
      const revisions = result.revisions || [];
      return revisions.slice(0, versionCount);
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
                  value={getSelectedRateeValue()}
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
                    {sharedEPBOptions.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                          Shared with Me
                        </div>
                        {sharedEPBOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            <span className="flex items-center gap-2">
                              <Share2 className="size-4 text-purple-500" />
                              {opt.label}
                              <Badge variant="secondary" className="text-[10px] bg-purple-500/10 text-purple-600 border-purple-500/30">
                                Shared
                              </Badge>
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
      {/* Member Selector - Visible when user has team members or shared EPBs */}
      {(subordinates.length > 0 || managedMembers.length > 0 || sharedEPBOptions.length > 0) && (
        <Card className="bg-muted/30 overflow-hidden">
          <CardContent className="py-2 sm:py-3 px-3 sm:px-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <span className="text-xs sm:text-sm text-muted-foreground shrink-0">Viewing EPB for:</span>
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Select
                  value={getSelectedRateeValue()}
                  onValueChange={handleRateeChange}
                >
                  <SelectTrigger className="bg-background h-8 sm:h-9 text-xs sm:text-sm max-w-[240px] sm:max-w-sm">
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
                    {sharedEPBOptions.length > 0 && (
                      <>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                          Shared with Me
                        </div>
                        {sharedEPBOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            <span className="flex items-center gap-2">
                              <Share2 className="size-4 text-purple-500" />
                              {opt.label}
                              <Badge variant="secondary" className="text-[10px] bg-purple-500/10 text-purple-600 border-purple-500/30">
                                Shared
                              </Badge>
                            </span>
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
                <Badge variant="outline" className="shrink-0 text-[10px] sm:text-xs">
                  {cycleYear}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Header with ratee info and progress */}
      <Card className="overflow-hidden">
        <CardHeader className="pb-4 px-3 sm:px-6">
          <div className="flex flex-col gap-3">
            {/* Name and badges row */}
            <div className="min-w-0">
              <CardTitle className="text-base sm:text-xl flex items-center gap-2 flex-wrap">
                <span className="truncate max-w-[200px] sm:max-w-none">{selectedRatee?.rank} {selectedRatee?.fullName}</span>
                {selectedRatee?.isManagedMember && (
                  <Badge variant="secondary" className="text-[10px] sm:text-xs shrink-0">Managed</Badge>
                )}
              </CardTitle>
              <CardDescription className="flex items-center gap-1.5 sm:gap-2 mt-1 flex-wrap">
                <Badge variant="outline" className="text-[10px] sm:text-xs">{cycleYear}</Badge>
                {selectedRatee?.afsc && (
                  <Badge variant="secondary" className="text-[10px] sm:text-xs">{selectedRatee.afsc}</Badge>
                )}
              </CardDescription>
            </div>
            {/* Action buttons row */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              {/* Collaborate Toggle - Only shown when collaboration feature is enabled */}
              {isCollaborationEnabled && (
                <>
                  <Button
                    variant={isMultiUserMode ? "default" : "secondary"}
                    size="sm"
                    onClick={handleToggleMultiUserMode}
                    disabled={isTogglingMode}
                    className={cn(
                      "h-7 sm:h-8 gap-1.5 sm:gap-2 rounded-full px-2 sm:px-4 text-xs sm:text-sm",
                      isMultiUserMode && "bg-violet-600 hover:bg-violet-700"
                    )}
                    title={isMultiUserMode ? "Collaboration enabled" : "Enable collaboration"}
                  >
                    {isTogglingMode ? (
                      <Loader2 className="size-3.5 sm:size-4 animate-spin" />
                    ) : isMultiUserMode ? (
                      <Users className="size-3.5 sm:size-4" />
                    ) : (
                      <User className="size-3.5 sm:size-4" />
                    )}
                    <span className="hidden sm:inline">Collaborate</span>
                    {isMultiUserMode && collaboration.collaborators.length > 0 && (
                      <span className="flex items-center justify-center size-4 sm:size-5 rounded-full bg-white/20 text-[10px] sm:text-xs font-bold">
                        {collaboration.collaborators.length}
                      </span>
                    )}
                  </Button>

                  {/* Session controls - only shown when multi-user is enabled */}
                  {isMultiUserMode && (
                    <div className="flex items-center gap-1 sm:gap-1.5">
                      {!collaboration.isInSession ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => collaboration.createSession()}
                            disabled={collaboration.isLoading}
                            className="h-6 sm:h-7 px-1.5 sm:px-2 text-[10px] sm:text-xs"
                          >
                            {collaboration.isLoading ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              "Start"
                            )}
                          </Button>
                          <input
                            type="text"
                            placeholder="Code"
                            className="h-6 sm:h-7 w-12 sm:w-16 rounded border bg-background px-1.5 sm:px-2 text-[10px] sm:text-xs uppercase placeholder:normal-case"
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
                          <Badge variant="secondary" className="h-6 sm:h-7 px-1.5 sm:px-2 font-mono text-[10px] sm:text-xs">
                            {collaboration.sessionCode}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={collaboration.isHost ? collaboration.endSession : collaboration.leaveSession}
                            className="h-6 sm:h-7 px-1.5 sm:px-2 text-[10px] sm:text-xs text-muted-foreground hover:text-destructive"
                          >
                            {collaboration.isHost ? "End" : "Leave"}
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
              
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setShowShareDialog(true)} 
                className="h-7 sm:h-8 px-2 sm:px-3"
                title="Share EPB"
              >
                <Share2 className="size-3.5 sm:size-4" />
                <span className="hidden sm:inline ml-1.5">Share</span>
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
        <CardContent className="pt-0 px-3 sm:px-6">
          {/* Progress indicator */}
          <div className="space-y-2 sm:space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-medium">Progress</span>
              <span className="text-xs sm:text-sm text-muted-foreground">
                {completedMPAs}/{totalMPAs}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1 sm:gap-2">
              {STANDARD_MGAS.map((mpa) => {
                const section = sections[mpa.key];
                const isComplete = section?.is_complete ?? false;
                const hasContent = section?.statement_text?.trim().length > 0;
                const isHLR = mpa.key === "hlr_assessment";
                return (
                  <Button
                    key={mpa.key}
                    variant="outline"
                    size="sm"
                    onClick={() => scrollToMpaSection(mpa.key)}
                    className={cn(
                      "h-auto p-1.5 sm:p-2 flex-col gap-0.5 text-center transition-all hover:shadow-sm",
                      isComplete
                        ? "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 hover:bg-green-100 dark:hover:bg-green-900/30"
                        : hasContent
                        ? "bg-amber-50 dark:bg-amber-900/20 border-amber-300/50 dark:border-amber-700/50 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                        : "bg-muted/30 hover:bg-muted/50",
                      isHLR && !isComplete && !hasContent && "border-amber-300/50"
                    )}
                  >
                    <div className="flex items-center justify-center gap-0.5 sm:gap-1">
                      {isComplete ? (
                        <CheckCircle2 className="size-3 text-green-600" />
                      ) : hasContent ? (
                        <Circle className="size-3 text-amber-500" />
                      ) : (
                        <Circle className="size-3 text-muted-foreground" />
                      )}
                      {isHLR && <Crown className="size-3 text-amber-600" />}
                    </div>
                    {/* Mobile: show acronyms, Desktop: show full labels */}
                    <span className="text-[9px] sm:text-[10px] font-medium truncate">
                      {mpa.key === "executing_mission" && <><span className="sm:hidden">EM</span><span className="hidden sm:inline">Mission</span></>}
                      {mpa.key === "leading_people" && <><span className="sm:hidden">LP</span><span className="hidden sm:inline">Leading</span></>}
                      {mpa.key === "managing_resources" && <><span className="sm:hidden">MR</span><span className="hidden sm:inline">Resources</span></>}
                      {mpa.key === "improving_unit" && <><span className="sm:hidden">IU</span><span className="hidden sm:inline">Improving</span></>}
                      {mpa.key === "hlr_assessment" && "HLR"}
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>

          <Separator className="my-3 sm:my-4" />

          {/* Quick actions */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={expandAll} className="h-7 sm:h-8 px-2 sm:px-3 text-xs sm:text-sm">
              <ChevronDown className="size-3 sm:size-3.5" />
              <span className="hidden sm:inline ml-1.5">Expand All</span>
              <span className="sm:hidden ml-1">All</span>
            </Button>
            <Button variant="outline" size="sm" onClick={collapseAll} className="h-7 sm:h-8 px-2 sm:px-3 text-xs sm:text-sm">
              <ChevronUp className="size-3 sm:size-3.5" />
              <span className="hidden sm:inline ml-1.5">Collapse All</span>
              <span className="sm:hidden ml-1">None</span>
            </Button>
            <div className="flex-1" />
            <Badge variant="secondary" className="text-[10px] sm:text-xs">
              {accomplishments.length} <span className="hidden sm:inline">Performance </span>Actions
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* MPA Sections with cursor tracking */}
      {/* pb-[60vh] allows scrolling the last card (HLR) to the top of the viewport */}
      <div 
        ref={contentContainerRef}
        className="space-y-4 relative pb-[60vh]"
      >
        {/* Realtime cursors overlay - only visible in collaboration session when feature is enabled */}
        {isCollaborationEnabled && collaboration.isInSession && currentShell && (
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
                onCreateSnapshot={(text) => handleCreateSnapshot(mpa.key, text)}
                onGenerateStatement={(opts) => handleGenerateStatement(mpa.key, opts)}
                onReviseStatement={(text, ctx, count) => handleReviseStatement(mpa.key, text, ctx, count)}
                snapshots={snapshots[section.id] || []}
                // Lock props for single-user mode
                isLockedByOther={isLockedByOther}
                lockedByInfo={lockInfo}
                onAcquireLock={() => sectionLocks.acquireLock(section.id)}
                onReleaseLock={() => sectionLocks.releaseLock(section.id)}
                accomplishments={accomplishments}
                onOpenAccomplishments={() => onOpenAccomplishments(mpa.key)}
                cycleYear={cycleYear}
                // Enable real-time text sync when collaborating
                isCollaborating={collaboration.isInSession}
                // Completion toggle
                onToggleComplete={() => handleToggleComplete(mpa.key)}
                // Highlight pulse when scrolled to from progress card
                isHighlighted={highlightedMpa === mpa.key}
                // Saved examples (scratchpad)
                savedExamples={savedExamples[section.id] || []}
                onSaveExample={(text, note) => handleSaveExample(mpa.key, text, note)}
                onDeleteExample={(id) => handleDeleteExample(mpa.key, id)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

