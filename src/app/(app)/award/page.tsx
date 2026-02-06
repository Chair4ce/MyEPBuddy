"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getFullName } from "@/lib/utils";
import { useUserStore } from "@/stores/user-store";
import { useAwardShellStore } from "@/stores/award-shell-store";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { PageSpinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
// AWARD_CATEGORIES moved to user-customizable categories
import {
  Award,
  Loader2,
  Plus,
  UserPlus,
  RefreshCw,
  Users,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AwardListTable, type AwardShellWithDetails } from "@/components/award/award-list-table";
import { AwardWorkspaceDialog } from "@/components/award/award-workspace-dialog";
import { AwardCategoriesManager } from "@/components/award/award-categories-manager";
import { TeamMemberSelector } from "@/components/award/team-member-selector";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type {
  AwardCategory,
  AwardPeriodType,
  AwardShell,
  Profile,
  ManagedMember,
  Rank,
  UserAwardCategory,
} from "@/types/database";

// ============================================================================
// Types
// ============================================================================

interface NomineeOption {
  id: string;
  label: string;
  fullName: string | null;
  rank: Rank | null;
  afsc: string | null;
  isManagedMember: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

function calculatePeriodDates(
  periodType: AwardPeriodType,
  year: number,
  quarter: 1 | 2 | 3 | 4,
  isFiscal: boolean,
  customStart?: string,
  customEnd?: string
): { start: string; end: string } {
  if (periodType === "special" && customStart && customEnd) {
    return { start: customStart, end: customEnd };
  }

  if (periodType === "annual") {
    if (isFiscal) {
      // Fiscal year: Oct 1 of previous year to Sep 30 of given year
      return {
        start: `${year - 1}-10-01`,
        end: `${year}-09-30`,
      };
    } else {
      // Calendar year: Jan 1 to Dec 31
      return {
        start: `${year}-01-01`,
        end: `${year}-12-31`,
      };
    }
  }

  if (periodType === "quarterly") {
    if (isFiscal) {
      // Fiscal quarters: Q1=Oct-Dec, Q2=Jan-Mar, Q3=Apr-Jun, Q4=Jul-Sep
      switch (quarter) {
        case 1:
          return { start: `${year - 1}-10-01`, end: `${year - 1}-12-31` };
        case 2:
          return { start: `${year}-01-01`, end: `${year}-03-31` };
        case 3:
          return { start: `${year}-04-01`, end: `${year}-06-30` };
        case 4:
          return { start: `${year}-07-01`, end: `${year}-09-30` };
      }
    } else {
      // Calendar quarters: Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec
      switch (quarter) {
        case 1:
          return { start: `${year}-01-01`, end: `${year}-03-31` };
        case 2:
          return { start: `${year}-04-01`, end: `${year}-06-30` };
        case 3:
          return { start: `${year}-07-01`, end: `${year}-09-30` };
        case 4:
          return { start: `${year}-10-01`, end: `${year}-12-31` };
      }
    }
  }

  // Fallback
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

// ============================================================================
// Component
// ============================================================================

export default function AwardPage() {
  const router = useRouter();
  const supabase = createClient();
  const { profile, subordinates, managedMembers } = useUserStore();

  // Optional year filter — "all" by default so every award is visible
  const [filterYear, setFilterYear] = useState<number | "all">("all");

  // Award shell store (for reset functionality)
  const { reset: resetAwardStore } = useAwardShellStore();

  // ---- State ----
  const [awards, setAwards] = useState<AwardShellWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Create dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedNomineeId, setSelectedNomineeId] = useState<string>("self");
  const [createAwardCategory, setCreateAwardCategory] = useState<AwardCategory>("amn");
  const [createPeriodType, setCreatePeriodType] = useState<AwardPeriodType>("annual");
  const [createYear, setCreateYear] = useState<number>(new Date().getFullYear());
  const [createQuarter, setCreateQuarter] = useState<1 | 2 | 3 | 4>(1);
  const [createIsFiscalYear, setCreateIsFiscalYear] = useState(false);
  const [createCustomStartDate, setCreateCustomStartDate] = useState<string>("");
  const [createCustomEndDate, setCreateCustomEndDate] = useState<string>("");
  const [isCreating, setIsCreating] = useState(false);
  // Team award state
  const [isTeamAward, setIsTeamAward] = useState(false);
  const [selectedTeamMemberIds, setSelectedTeamMemberIds] = useState<string[]>([]);
  // Award title/label
  const [createAwardTitle, setCreateAwardTitle] = useState<string>("");

  // Workspace dialog state
  const [selectedAward, setSelectedAward] = useState<AwardShellWithDetails | null>(null);
  const [showWorkspaceDialog, setShowWorkspaceDialog] = useState(false);

  // User award categories state
  const [userCategories, setUserCategories] = useState<UserAwardCategory[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);

  // ============================================================================
  // Load User Award Categories
  // ============================================================================

  const loadUserCategories = useCallback(async () => {
    if (!profile) return;

    setIsLoadingCategories(true);
    try {
      // Try to fetch existing categories
      const { data: existingCategories, error: fetchError } = await supabase
        .from("user_award_categories")
        .select("*")
        .eq("user_id", profile.id)
        .order("display_order", { ascending: true });

      if (fetchError) throw fetchError;

      if (existingCategories && existingCategories.length > 0) {
        const categories = existingCategories as unknown as UserAwardCategory[];
        setUserCategories(categories);
        // Set default selection to first category if current selection is invalid
        const validKeys = new Set(categories.map((c) => c.category_key));
        if (!validKeys.has(createAwardCategory)) {
          setCreateAwardCategory(categories[0].category_key as AwardCategory);
        }
      } else {
        // Initialize default categories for this user
        const { data: initializedCategories, error: initError } = await supabase.rpc(
          "initialize_user_award_categories",
          // @ts-ignore - RPC function types not yet regenerated in supabase types
          { p_user_id: profile.id }
        );

        if (initError) throw initError;

        const categories = initializedCategories as unknown as UserAwardCategory[];
        if (categories && categories.length > 0) {
          setUserCategories(categories);
          setCreateAwardCategory(categories[0].category_key as AwardCategory);
        }
      }
    } catch (error) {
      console.error("Error loading user categories:", error);
      // Fallback: categories will be empty, user can reset to defaults
    } finally {
      setIsLoadingCategories(false);
    }
  }, [profile, supabase, createAwardCategory]);

  // Load categories when profile is available
  useEffect(() => {
    if (profile) {
      loadUserCategories();
    }
  }, [profile, loadUserCategories]);

  // ============================================================================
  // Build nominee options
  // ============================================================================

  const nomineeOptions: NomineeOption[] = [
    {
      id: "self",
      label: `${profile?.rank || ""} ${getFullName(profile) || "Myself"} (Self)`.trim(),
      fullName: getFullName(profile) || null,
      rank: profile?.rank as Rank | null,
      afsc: profile?.afsc || null,
      isManagedMember: false,
    },
    ...subordinates.map((sub) => ({
      id: sub.id,
      label: `${sub.rank || ""} ${getFullName(sub)}`.trim(),
      fullName: getFullName(sub),
      rank: sub.rank as Rank | null,
      afsc: sub.afsc,
      isManagedMember: false,
    })),
    ...managedMembers.map((member) => ({
      id: `managed:${member.id}`,
      label: `${member.rank || ""} ${member.full_name}`.trim(), // Managed members only have full_name
      fullName: member.full_name,
      rank: member.rank as Rank | null,
      afsc: member.afsc,
      isManagedMember: true,
    })),
  ];

  // ============================================================================
  // Load Awards
  // ============================================================================

  const loadAwards = useCallback(async () => {
    if (!profile) return;

    try {
      // Fetch all award shells visible to this user (all years).
      // RLS policies (067 + 071) grant visibility for:
      // - Own shells & shells the user created
      // - Full subordinate chain via get_subordinate_chain (any depth)
      // - Managed members of anyone in the chain
      // - Shared shells
      const { data: shellsData, error } = await supabase
        .from("award_shells")
        .select(`
          *,
          award_shell_sections(id, statement_text)
        `)
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("Error loading award shells:", error);
        return;
      }

      // Type the raw rows
      const shells = (shellsData || []).map((d) => d as unknown as AwardShell & {
        award_shell_sections?: { id: string; statement_text: string }[];
      });

      // ---- Batch-fetch all profiles & managed members we don't already have ----
      // Build a local lookup from store data
      const knownProfiles = new Map<string, Profile>();
      knownProfiles.set(profile.id, profile);
      for (const sub of subordinates) knownProfiles.set(sub.id, sub);

      const knownMembers = new Map<string, ManagedMember>();
      for (const m of managedMembers) knownMembers.set(m.id, m);

      // Collect IDs we still need
      const missingProfileIds = new Set<string>();
      const missingMemberIds = new Set<string>();

      for (const shell of shells) {
        if (shell.team_member_id && !knownMembers.has(shell.team_member_id)) {
          missingMemberIds.add(shell.team_member_id);
        }
        if (!shell.team_member_id && !knownProfiles.has(shell.user_id)) {
          missingProfileIds.add(shell.user_id);
        }
        if (!knownProfiles.has(shell.created_by)) {
          missingProfileIds.add(shell.created_by);
        }
      }

      // Fetch missing profiles in one call
      if (missingProfileIds.size > 0) {
        const { data: fetched } = await supabase
          .from("profiles")
          .select("*")
          .in("id", [...missingProfileIds]);
        for (const p of (fetched || []) as unknown as Profile[]) {
          knownProfiles.set(p.id, p);
        }
      }

      // Fetch missing managed members in one call
      if (missingMemberIds.size > 0) {
        const { data: fetched } = await supabase
          .from("team_members")
          .select("*")
          .in("id", [...missingMemberIds]);
        for (const m of (fetched || []) as unknown as ManagedMember[]) {
          knownMembers.set(m.id, m);
        }
      }

      // ---- Enrich each shell using the pre-fetched maps ----
      const enrichedAwards: AwardShellWithDetails[] = shells.map((shell) => {
        const sections = shell.award_shell_sections || [];
        const sectionsCount = sections.length;
        const filledSectionsCount = sections.filter(
          (s) => s.statement_text?.trim()
        ).length;

        const ownerTeamMember = shell.team_member_id
          ? knownMembers.get(shell.team_member_id) || null
          : null;

        const ownerProfile = !shell.team_member_id
          ? knownProfiles.get(shell.user_id) || null
          : null;

        const creatorProfile = knownProfiles.get(shell.created_by) || null;

        return {
          id: shell.id,
          user_id: shell.user_id,
          team_member_id: shell.team_member_id,
          created_by: shell.created_by,
          cycle_year: shell.cycle_year,
          award_level: shell.award_level,
          award_category: shell.award_category,
          sentences_per_statement: shell.sentences_per_statement,
          award_period_type: shell.award_period_type || "annual",
          quarter: shell.quarter,
          is_fiscal_year: shell.is_fiscal_year || false,
          period_start_date: shell.period_start_date,
          period_end_date: shell.period_end_date,
          is_team_award: shell.is_team_award,
          is_winner: shell.is_winner,
          win_level: shell.win_level,
          won_at: shell.won_at,
          generated_award_id: shell.generated_award_id,
          created_at: shell.created_at,
          updated_at: shell.updated_at,
          owner_profile: ownerProfile,
          owner_team_member: ownerTeamMember,
          creator_profile: creatorProfile,
          sections_count: sectionsCount || 3,
          filled_sections_count: filledSectionsCount,
        } as AwardShellWithDetails;
      });

      setAwards(enrichedAwards);
    } catch (error) {
      console.error("Error loading awards:", error);
      toast.error("Failed to load award packages");
    }
  }, [profile, supabase, subordinates, managedMembers]);

  // Initial load
  useEffect(() => {
    async function init() {
      setIsLoading(true);
      await loadAwards();
      setIsLoading(false);
    }
    init();
  }, [loadAwards]);

  // ============================================================================
  // Derived: filtered awards + available years
  // ============================================================================

  const availableYears = useMemo(() => {
    const years = [...new Set(awards.map((a) => a.cycle_year))].sort((a, b) => b - a);
    return years;
  }, [awards]);

  const filteredAwards = useMemo(() => {
    if (filterYear === "all") return awards;
    return awards.filter((a) => a.cycle_year === filterYear);
  }, [awards, filterYear]);

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadAwards();
    setIsRefreshing(false);
    toast.success("Awards refreshed");
  };

  const handleNomineeChange = (value: string) => {
    if (value === "add-member") {
      router.push("/team");
    } else {
      setSelectedNomineeId(value);
    }
  };

  const handleCreateAward = async () => {
    if (!profile) return;

    // For team awards, skip nominee validation (team members are selected separately)
    if (!isTeamAward) {
      const nominee = nomineeOptions.find((n) => n.id === selectedNomineeId);
      if (!nominee) return;
    }

    // Validate team award has title and at least one member selected
    if (isTeamAward) {
      if (!createAwardTitle.trim()) {
        toast.error("Please enter a team/office name for the team award");
        return;
      }
      if (selectedTeamMemberIds.length === 0) {
        toast.error("Please select at least one team member for the team award");
        return;
      }
    }

    // Validate special award dates
    if (createPeriodType === "special" && (!createCustomStartDate || !createCustomEndDate)) {
      toast.error("Please select start and end dates for the special award");
      return;
    }

    setIsCreating(true);

    try {
      const nominee = nomineeOptions.find((n) => n.id === selectedNomineeId);
      const isManagedMember = nominee?.isManagedMember || false;
      const actualNomineeId = isManagedMember
        ? selectedNomineeId.replace("managed:", "")
        : selectedNomineeId === "self"
        ? profile.id
        : selectedNomineeId;

      // Calculate period dates
      const periodDates = calculatePeriodDates(
        createPeriodType,
        createYear,
        createQuarter,
        createIsFiscalYear,
        createCustomStartDate,
        createCustomEndDate
      );

      // Create new shell (no duplicate check - multiple awards allowed)
      const { data: newShell, error: createError } = await supabase
        .from("award_shells")
        .insert({
          user_id: isTeamAward ? profile.id : (isManagedMember ? profile.id : actualNomineeId),
          team_member_id: isTeamAward ? null : (isManagedMember ? actualNomineeId : null),
          created_by: profile.id,
          cycle_year: createYear,
          award_level: "squadron",
          award_category: createAwardCategory,
          sentences_per_statement: 2,
          title: createAwardTitle.trim() || null,
          award_period_type: createPeriodType,
          quarter: createPeriodType === "quarterly" ? createQuarter : null,
          is_fiscal_year: createIsFiscalYear,
          period_start_date: periodDates.start,
          period_end_date: periodDates.end,
          is_team_award: isTeamAward,
        } as never)
        .select("*")
        .single();

      if (createError) throw createError;

      // If team award, save team members
      if (isTeamAward && newShell && selectedTeamMemberIds.length > 0) {
        const shell = newShell as unknown as AwardShell;
        
        // Deduplicate member IDs
        const uniqueMemberIds = [...new Set(selectedTeamMemberIds)];
        
        // Build insert records, ensuring no duplicates
        const seenProfiles = new Set<string>();
        const seenTeamMembers = new Set<string>();
        const teamMemberInserts: Array<{
          shell_id: string;
          profile_id: string | null;
          team_member_id: string | null;
          added_by: string;
        }> = [];

        for (const memberId of uniqueMemberIds) {
          const isManaged = memberId.startsWith("managed:");
          const actualId = isManaged ? memberId.replace("managed:", "") : memberId;
          
          // Skip if we've already seen this profile or team member
          if (isManaged) {
            if (seenTeamMembers.has(actualId)) continue;
            seenTeamMembers.add(actualId);
          } else {
            if (seenProfiles.has(actualId)) continue;
            seenProfiles.add(actualId);
          }

          teamMemberInserts.push({
            shell_id: shell.id,
            profile_id: isManaged ? null : actualId,
            team_member_id: isManaged ? actualId : null,
            added_by: profile.id,
          });
        }

        if (teamMemberInserts.length > 0) {
          const { error: teamError } = await supabase
            .from("award_shell_team_members")
            // @ts-ignore - Table types not yet regenerated in supabase types
            .insert(teamMemberInserts);

          if (teamError) {
            console.error("Error saving team members:", teamError);
            // Don't fail the whole operation, just warn
            toast.warning("Award created but some team members could not be saved");
          }
        }
      }

      toast.success(isTeamAward 
        ? `Team award package created with ${selectedTeamMemberIds.length} members` 
        : "Award package created successfully"
      );
      setShowCreateDialog(false);
      
      // Reset form state
      setIsTeamAward(false);
      setSelectedTeamMemberIds([]);
      setCreateAwardTitle("");
      
      // Refresh the list
      await loadAwards();

      // Open the new award in the workspace dialog
      if (newShell) {
        const shell = newShell as unknown as AwardShell;
        const enrichedAward: AwardShellWithDetails = {
          id: shell.id,
          user_id: shell.user_id,
          team_member_id: shell.team_member_id,
          created_by: shell.created_by,
          cycle_year: shell.cycle_year,
          award_level: shell.award_level,
          award_category: shell.award_category,
          sentences_per_statement: shell.sentences_per_statement,
          title: shell.title,
          award_period_type: shell.award_period_type,
          quarter: shell.quarter,
          is_fiscal_year: shell.is_fiscal_year,
          period_start_date: shell.period_start_date,
          period_end_date: shell.period_end_date,
          is_team_award: shell.is_team_award,
          created_at: shell.created_at,
          updated_at: shell.updated_at,
          owner_profile: isTeamAward 
            ? profile 
            : (!isManagedMember
              ? (actualNomineeId === profile.id ? profile : subordinates.find((s) => s.id === actualNomineeId) || null)
              : null),
          owner_team_member: isTeamAward 
            ? null 
            : (isManagedMember
              ? managedMembers.find((m) => m.id === actualNomineeId) || null
              : null),
          creator_profile: profile,
          sections_count: 3,
          filled_sections_count: 0,
        };
        setSelectedAward(enrichedAward);
        setShowWorkspaceDialog(true);
      }
    } catch (error) {
      console.error("Error creating award shell:", error);
      toast.error("Failed to create award package");
    } finally {
      setIsCreating(false);
    }
  };

  const handleAwardClick = (award: AwardShellWithDetails) => {
    setSelectedAward(award);
    setShowWorkspaceDialog(true);
  };

  const handleWorkspaceClose = (open: boolean) => {
    if (!open) {
      setShowWorkspaceDialog(false);
      setSelectedAward(null);
      resetAwardStore();
      // Refresh to get updated progress
      loadAwards();
    }
  };

  const handleAwardSaved = () => {
    loadAwards();
  };

  // ============================================================================
  // Render
  // ============================================================================

  if (!profile) {
    return <PageSpinner />;
  }

  return (
    <TooltipProvider>
      <div className="space-y-6 min-w-0 w-full max-w-7xl">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Award className="size-6" />
            <div>
              <h1 className="text-xl font-bold">Award Packages</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                >
                  <RefreshCw className={`size-4 ${isRefreshing ? "animate-spin" : ""}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh awards</TooltipContent>
            </Tooltip>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="size-4 mr-1.5" />
              New Award
            </Button>
          </div>
        </div>

        {/* Year Filter */}
        {availableYears.length > 1 && (
          <div className="flex items-center gap-2">
            <Select
              value={filterYear === "all" ? "all" : filterYear.toString()}
              onValueChange={(v) => setFilterYear(v === "all" ? "all" : parseInt(v))}
            >
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {availableYears.map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Awards List */}
        <AwardListTable
          awards={filteredAwards}
          currentUserId={profile.id}
          isLoading={isLoading}
          onAwardClick={handleAwardClick}
        />

        {/* Create Award Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Award className="size-5" />
                Create Award Package
              </DialogTitle>
              <DialogDescription>
                Create a new AF Form 1206 award package for a team member
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Award Title */}
              <div className="space-y-2">
                <Label htmlFor="award-title">
                  Award Name {isTeamAward && <span className="text-muted-foreground font-normal">(required for team awards)</span>}
                </Label>
                <Input
                  id="award-title"
                  value={createAwardTitle}
                  onChange={(e) => setCreateAwardTitle(e.target.value)}
                  placeholder={isTeamAward ? "e.g., Flight Operations, CSS, Resource Advisors" : "e.g., FY25 Annual, Q1 CGO, Special Act..."}
                  maxLength={100}
                  aria-describedby="award-title-description"
                />
                <p id="award-title-description" className="text-[10px] text-muted-foreground">
                  {isTeamAward 
                    ? "This will be displayed as the award recipient in the list"
                    : "Optional. Give this award package a memorable name"
                  }
                </p>
              </div>

              {/* Team Award Toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                <div className="flex items-center gap-2">
                  <Users className="size-4 text-muted-foreground" />
                  <div>
                    <Label htmlFor="team-award-toggle" className="cursor-pointer font-medium">
                      Team Award
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Award for multiple team members
                    </p>
                  </div>
                </div>
                <Switch
                  id="team-award-toggle"
                  checked={isTeamAward}
                  onCheckedChange={(checked) => {
                    setIsTeamAward(checked);
                    // Clear team members when switching off
                    if (!checked) {
                      setSelectedTeamMemberIds([]);
                    }
                  }}
                />
              </div>

              {/* Single Nominee Selection (when not team award) */}
              {!isTeamAward && (
                <div className="space-y-2">
                  <Label>Nominee</Label>
                  <Select value={selectedNomineeId} onValueChange={handleNomineeChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select nominee" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="self">
                        {profile?.rank} {getFullName(profile)} (Self)
                      </SelectItem>
                      {(subordinates.length > 0 || managedMembers.length > 0) && (
                        <Separator className="my-1" />
                      )}
                      {subordinates.map((sub) => (
                        <SelectItem key={sub.id} value={sub.id}>
                          {sub.rank} {getFullName(sub)}
                        </SelectItem>
                      ))}
                      {managedMembers.map((member) => (
                        <SelectItem key={member.id} value={`managed:${member.id}`}>
                          {member.rank} {member.full_name}
                        </SelectItem>
                      ))}
                      <Separator className="my-1" />
                      <SelectItem value="add-member" className="text-primary">
                        <span className="flex items-center gap-2">
                          <UserPlus className="size-4" />
                          Add Team Member
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Team Member Selection (when team award) */}
              {isTeamAward && (
                <div className="space-y-2">
                  <Label>Team Members</Label>
                  <TeamMemberSelector
                    subordinates={subordinates}
                    managedMembers={managedMembers}
                    selectedMemberIds={selectedTeamMemberIds}
                    onSelectionChange={setSelectedTeamMemberIds}
                  />
                </div>
              )}

              {/* Award Category with User Management */}
              {profile && (
                <AwardCategoriesManager
                  userId={profile.id}
                  categories={userCategories}
                  onCategoriesChange={setUserCategories}
                  selectedCategoryKey={createAwardCategory}
                  onSelectCategory={(key) => setCreateAwardCategory(key as AwardCategory)}
                  compact
                />
              )}

              <Separator />

              {/* Award Period Type */}
              <div className="space-y-2">
                <Label>Award Period</Label>
                <Select
                  value={createPeriodType}
                  onValueChange={(v) => setCreatePeriodType(v as AwardPeriodType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="annual">Annual</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="special">Special (Custom Dates)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Year Selection (for Annual and Quarterly) */}
              {createPeriodType !== "special" && (
                <div className="space-y-2">
                  <Label>Year</Label>
                  <Select
                    value={createYear.toString()}
                    onValueChange={(v) => setCreateYear(parseInt(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map((year) => (
                        <SelectItem key={year} value={year.toString()}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Quarter Selection (for Quarterly only) */}
              {createPeriodType === "quarterly" && (
                <div className="space-y-2">
                  <Label>Quarter</Label>
                  <Select
                    value={createQuarter.toString()}
                    onValueChange={(v) => setCreateQuarter(parseInt(v) as 1 | 2 | 3 | 4)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Q1 {createIsFiscalYear ? "(Oct-Dec)" : "(Jan-Mar)"}</SelectItem>
                      <SelectItem value="2">Q2 {createIsFiscalYear ? "(Jan-Mar)" : "(Apr-Jun)"}</SelectItem>
                      <SelectItem value="3">Q3 {createIsFiscalYear ? "(Apr-Jun)" : "(Jul-Sep)"}</SelectItem>
                      <SelectItem value="4">Q4 {createIsFiscalYear ? "(Jul-Sep)" : "(Oct-Dec)"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Fiscal Year Toggle (for Annual and Quarterly) */}
              {createPeriodType !== "special" && (
                <div className="flex items-center justify-between">
                  <Label htmlFor="fiscal-year" className="cursor-pointer">
                    Use Fiscal Year
                    <span className="block text-xs text-muted-foreground font-normal">
                      {createIsFiscalYear ? "Oct 1 - Sep 30" : "Jan 1 - Dec 31"}
                    </span>
                  </Label>
                  <Switch
                    id="fiscal-year"
                    checked={createIsFiscalYear}
                    onCheckedChange={setCreateIsFiscalYear}
                  />
                </div>
              )}

              {/* Custom Date Range (for Special only) */}
              {createPeriodType === "special" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Input
                      type="date"
                      value={createCustomStartDate}
                      onChange={(e) => setCreateCustomStartDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Input
                      type="date"
                      value={createCustomEndDate}
                      onChange={(e) => setCreateCustomEndDate(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateAward} disabled={isCreating}>
                {isCreating ? (
                  <Loader2 className="size-4 animate-spin mr-1.5" />
                ) : (
                  <Plus className="size-4 mr-1.5" />
                )}
                Create Package
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Workspace Dialog */}
        {selectedAward && (
          <AwardWorkspaceDialog
            open={showWorkspaceDialog}
            onOpenChange={handleWorkspaceClose}
            shell={selectedAward}
            onSaved={handleAwardSaved}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
