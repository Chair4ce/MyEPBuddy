"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import { useAwardShellStore } from "@/stores/award-shell-store";
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
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AWARD_CATEGORIES } from "@/lib/constants";
import {
  Award,
  Loader2,
  Plus,
  UserPlus,
  RefreshCw,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AwardListTable, type AwardShellWithDetails } from "@/components/award/award-list-table";
import { AwardWorkspaceDialog } from "@/components/award/award-workspace-dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type {
  AwardCategory,
  AwardPeriodType,
  AwardShell,
  Profile,
  ManagedMember,
  Rank,
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
  const { profile, subordinates, managedMembers, epbConfig } = useUserStore();
  const cycleYear = epbConfig?.current_cycle_year || new Date().getFullYear();

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

  // Workspace dialog state
  const [selectedAward, setSelectedAward] = useState<AwardShellWithDetails | null>(null);
  const [showWorkspaceDialog, setShowWorkspaceDialog] = useState(false);

  // ============================================================================
  // Build nominee options
  // ============================================================================

  const nomineeOptions: NomineeOption[] = [
    {
      id: "self",
      label: `${profile?.rank || ""} ${profile?.full_name || "Myself"} (Self)`.trim(),
      fullName: profile?.full_name || null,
      rank: profile?.rank as Rank | null,
      afsc: profile?.afsc || null,
      isManagedMember: false,
    },
    ...subordinates.map((sub) => ({
      id: sub.id,
      label: `${sub.rank || ""} ${sub.full_name}`.trim(),
      fullName: sub.full_name,
      rank: sub.rank as Rank | null,
      afsc: sub.afsc,
      isManagedMember: false,
    })),
    ...managedMembers.map((member) => ({
      id: `managed:${member.id}`,
      label: `${member.rank || ""} ${member.full_name}`.trim(),
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
      // Fetch all award shells visible to this user
      // The RLS policies handle visibility based on:
      // - User's own shells
      // - Shells they created
      // - Subordinate shells via team_history
      // - Managed member shells
      // - Shared shells
      const { data: shellsData, error } = await supabase
        .from("award_shells")
        .select(`
          *,
          award_shell_sections(id, statement_text)
        `)
        .eq("cycle_year", cycleYear)
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("Error loading award shells:", error);
        return;
      }

      // Enrich with owner profile/member info
      const enrichedAwards: AwardShellWithDetails[] = await Promise.all(
        (shellsData || []).map(async (shellData) => {
          // Type the shell data properly
          const shell = shellData as unknown as AwardShell & { 
            award_shell_sections?: { id: string; statement_text: string }[] 
          };
          
          const sections = shell.award_shell_sections || [];
          const sectionsCount = sections.length;
          const filledSectionsCount = sections.filter(
            (s) => s.statement_text?.trim()
          ).length;

          let ownerProfile: Profile | null = null;
          let ownerTeamMember: ManagedMember | null = null;
          let creatorProfile: Profile | null = null;

          // Get owner info
          if (shell.team_member_id) {
            // It's a managed member
            const member = managedMembers.find((m) => m.id === shell.team_member_id);
            if (member) {
              ownerTeamMember = member;
            } else {
              // Fetch from DB if not in local store
              const { data: memberData } = await supabase
                .from("team_members")
                .select("*")
                .eq("id", shell.team_member_id)
                .single();
              if (memberData) {
                ownerTeamMember = memberData as unknown as ManagedMember;
              }
            }
          } else {
            // It's a real user
            if (shell.user_id === profile.id) {
              ownerProfile = profile;
            } else {
              const sub = subordinates.find((s) => s.id === shell.user_id);
              if (sub) {
                ownerProfile = sub;
              } else {
                // Fetch from DB
                const { data: profileData } = await supabase
                  .from("profiles")
                  .select("*")
                  .eq("id", shell.user_id)
                  .single();
                if (profileData) {
                  ownerProfile = profileData as unknown as Profile;
                }
              }
            }
          }

          // Get creator info
          if (shell.created_by === profile.id) {
            creatorProfile = profile;
          } else {
            const creator = subordinates.find((s) => s.id === shell.created_by);
            if (creator) {
              creatorProfile = creator;
            } else {
              const { data: creatorData } = await supabase
                .from("profiles")
                .select("*")
                .eq("id", shell.created_by)
                .single();
              if (creatorData) {
                creatorProfile = creatorData as unknown as Profile;
              }
            }
          }

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
            created_at: shell.created_at,
            updated_at: shell.updated_at,
            owner_profile: ownerProfile,
            owner_team_member: ownerTeamMember,
            creator_profile: creatorProfile,
            sections_count: sectionsCount || 3,
            filled_sections_count: filledSectionsCount,
          } as AwardShellWithDetails;
        })
      );

      setAwards(enrichedAwards);
    } catch (error) {
      console.error("Error loading awards:", error);
      toast.error("Failed to load award packages");
    }
  }, [profile, cycleYear, supabase, subordinates, managedMembers]);

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

    const nominee = nomineeOptions.find((n) => n.id === selectedNomineeId);
    if (!nominee) return;

    // Validate special award dates
    if (createPeriodType === "special" && (!createCustomStartDate || !createCustomEndDate)) {
      toast.error("Please select start and end dates for the special award");
      return;
    }

    setIsCreating(true);

    try {
      const isManagedMember = nominee.isManagedMember;
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
          user_id: isManagedMember ? profile.id : actualNomineeId,
          team_member_id: isManagedMember ? actualNomineeId : null,
          created_by: profile.id,
          cycle_year: createYear,
          award_level: "squadron", // Default level, can be changed in settings
          award_category: createAwardCategory,
          sentences_per_statement: 2,
          award_period_type: createPeriodType,
          quarter: createPeriodType === "quarterly" ? createQuarter : null,
          is_fiscal_year: createIsFiscalYear,
          period_start_date: periodDates.start,
          period_end_date: periodDates.end,
        } as never)
        .select("*")
        .single();

      if (createError) throw createError;

      toast.success("Award package created successfully");
      setShowCreateDialog(false);
      
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
          award_period_type: shell.award_period_type,
          quarter: shell.quarter,
          is_fiscal_year: shell.is_fiscal_year,
          period_start_date: shell.period_start_date,
          period_end_date: shell.period_end_date,
          created_at: shell.created_at,
          updated_at: shell.updated_at,
          owner_profile: !isManagedMember
            ? (actualNomineeId === profile.id ? profile : subordinates.find((s) => s.id === actualNomineeId) || null)
            : null,
          owner_team_member: isManagedMember
            ? managedMembers.find((m) => m.id === actualNomineeId) || null
            : null,
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
    return (
      <div className="container max-w-5xl mx-auto py-6 px-4">
        <Skeleton className="h-10 w-64 mb-4" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
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
            <Badge variant="outline" className="text-[10px] h-5 bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-700">
              BETA
            </Badge>
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

        {/* Cycle Year Badge */}
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {cycleYear} Cycle
          </Badge>
      
        </div>

        {/* Awards List */}
        <AwardListTable
          awards={awards}
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
              {/* Nominee Selection */}
              <div className="space-y-2">
                <Label>Nominee</Label>
                <Select value={selectedNomineeId} onValueChange={handleNomineeChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select nominee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="self">
                      {profile?.rank} {profile?.full_name} (Self)
                    </SelectItem>
                    {(subordinates.length > 0 || managedMembers.length > 0) && (
                      <Separator className="my-1" />
                    )}
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

              {/* Award Category */}
              <div className="space-y-2">
                <Label>Award Category</Label>
                <Select
                  value={createAwardCategory}
                  onValueChange={(v) => setCreateAwardCategory(v as AwardCategory)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AWARD_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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
