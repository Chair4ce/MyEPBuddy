"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { AWARD_CATEGORIES, AWARD_WIN_LEVELS } from "@/lib/constants";
import { TeamMemberSelector } from "@/components/award/team-member-selector";
import type {
  AwardShell,
  AwardShellTeamMember,
  AwardShellWin,
  AwardWinLevel,
  Profile,
  ManagedMember,
} from "@/types/database";
import {
  Trophy,
  Award,
  Loader2,
  ChevronDown,
  ChevronRight,
  Users,
  User,
  Pencil,
  Search,
  RefreshCw,
} from "lucide-react";

// ============================================================================
// Types
// ============================================================================

interface AwardPackageWithDetails extends Omit<AwardShell, 'owner_profile' | 'owner_team_member' | 'creator_profile'> {
  owner_profile?: Profile | null;
  owner_team_member?: ManagedMember | null;
  creator_profile?: Profile | null;
  team_members_list?: AwardShellTeamMember[];
  wins_list?: AwardShellWin[];
  sections_count?: number;
  filled_sections_count?: number;
}

interface AwardPackagesManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAwardsApplied?: () => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatPeriodLabel(shell: AwardPackageWithDetails): string {
  const fiscalPrefix = shell.is_fiscal_year ? "FY" : "";
  
  if (shell.award_period_type === "annual") {
    return `${fiscalPrefix}${shell.cycle_year} Annual`;
  }
  
  if (shell.award_period_type === "quarterly" && shell.quarter) {
    return `${fiscalPrefix}${shell.cycle_year} Q${shell.quarter}`;
  }
  
  if (shell.award_period_type === "special") {
    if (shell.period_start_date && shell.period_end_date) {
      const start = new Date(shell.period_start_date);
      const end = new Date(shell.period_end_date);
      const formatDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return `${formatDate(start)} - ${formatDate(end)}, ${shell.cycle_year}`;
    }
    return `${shell.cycle_year} Special`;
  }
  
  return `${shell.cycle_year}`;
}

function getCategoryLabel(category: string): string {
  return AWARD_CATEGORIES.find((c) => c.value === category)?.label || category;
}

function getWinLevelLabel(level: AwardWinLevel): string {
  return AWARD_WIN_LEVELS.find((l) => l.value === level)?.label || level;
}

function getWinLevelShortLabel(level: AwardWinLevel): string {
  return AWARD_WIN_LEVELS.find((l) => l.value === level)?.shortLabel || level;
}

function getRecipientName(shell: AwardPackageWithDetails): string {
  if (shell.is_team_award) {
    return shell.title || "Team Award";
  }
  if (shell.owner_team_member) {
    return `${shell.owner_team_member.rank || ""} ${shell.owner_team_member.full_name}`.trim();
  }
  if (shell.owner_profile) {
    return `${shell.owner_profile.rank || ""} ${shell.owner_profile.full_name}`.trim();
  }
  return "Unknown";
}

// Get win level order (higher = better)
function getWinLevelOrder(level: AwardWinLevel): number {
  const order: Record<AwardWinLevel, number> = {
    flight: 1,
    squadron: 2,
    tenant_unit: 3,
    group: 4,
    wing: 5,
    haf: 6,
    "12_oay": 7,
  };
  return order[level] || 0;
}

// ============================================================================
// Component
// ============================================================================

export function AwardPackagesManager({
  open,
  onOpenChange,
  onAwardsApplied,
}: AwardPackagesManagerProps) {
  const { profile, subordinates, managedMembers } = useUserStore();
  const supabase = createClient();

  // State
  const [packages, setPackages] = useState<AwardPackageWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedPackageId, setExpandedPackageId] = useState<string | null>(null);
  
  // Edit state
  const [editingPackage, setEditingPackage] = useState<AwardPackageWithDetails | null>(null);
  const [editWinLevels, setEditWinLevels] = useState<Set<AwardWinLevel>>(new Set());
  const [editTeamMemberIds, setEditTeamMemberIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // ============================================================================
  // Load Award Packages
  // ============================================================================

  const loadPackages = useCallback(async () => {
    if (!profile) return;

    try {
      // Fetch all award shells created by this user
      const { data: shellsData, error } = await supabase
        .from("award_shells")
        .select(`
          *,
          award_shell_sections(id, statement_text),
          award_shell_team_members(
            id,
            profile_id,
            team_member_id,
            added_by
          ),
          award_shell_wins(
            id,
            win_level,
            won_at,
            added_by,
            generated_award_id,
            created_at
          )
        `)
        .eq("created_by", profile.id)
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("Error loading award packages:", error);
        toast.error("Failed to load award packages");
        return;
      }

      // Enrich with owner profile/member info
      const enrichedPackages: AwardPackageWithDetails[] = await Promise.all(
        (shellsData || []).map(async (shellData) => {
          const shell = shellData as unknown as AwardShell & {
            award_shell_sections?: { id: string; statement_text: string }[];
            award_shell_team_members?: AwardShellTeamMember[];
            award_shell_wins?: AwardShellWin[];
          };

          const sections = shell.award_shell_sections || [];
          const sectionsCount = sections.length;
          const filledSectionsCount = sections.filter(
            (s) => s.statement_text?.trim()
          ).length;

          let ownerProfile: Profile | null = null;
          let ownerTeamMember: ManagedMember | null = null;

          // Get owner info
          if (shell.team_member_id) {
            const member = managedMembers.find((m) => m.id === shell.team_member_id);
            if (member) {
              ownerTeamMember = member;
            } else {
              const { data: memberData } = await supabase
                .from("team_members")
                .select("*")
                .eq("id", shell.team_member_id)
                .single();
              if (memberData) {
                ownerTeamMember = memberData as unknown as ManagedMember;
              }
            }
          } else if (!shell.is_team_award) {
            if (shell.user_id === profile.id) {
              ownerProfile = profile;
            } else {
              const sub = subordinates.find((s) => s.id === shell.user_id);
              if (sub) {
                ownerProfile = sub;
              } else {
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

          return {
            ...shell,
            owner_profile: ownerProfile,
            owner_team_member: ownerTeamMember,
            creator_profile: profile,
            team_members_list: shell.award_shell_team_members || [],
            wins_list: shell.award_shell_wins || [],
            sections_count: sectionsCount || 3,
            filled_sections_count: filledSectionsCount,
          } as AwardPackageWithDetails;
        })
      );

      setPackages(enrichedPackages);
    } catch (error) {
      console.error("Error loading packages:", error);
      toast.error("Failed to load award packages");
    }
  }, [profile, supabase, subordinates, managedMembers]);

  // Initial load
  useEffect(() => {
    async function init() {
      if (!open) return;
      setIsLoading(true);
      await loadPackages();
      setIsLoading(false);
    }
    init();
  }, [open, loadPackages]);

  // Handle refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadPackages();
    setIsRefreshing(false);
    toast.success("Award packages refreshed");
  };

  // ============================================================================
  // Filter packages by search
  // ============================================================================

  const filteredPackages = useMemo(() => {
    if (!searchQuery.trim()) return packages;

    const query = searchQuery.toLowerCase();
    return packages.filter((pkg) => {
      const recipientName = getRecipientName(pkg).toLowerCase();
      const categoryLabel = getCategoryLabel(pkg.award_category).toLowerCase();
      const periodLabel = formatPeriodLabel(pkg).toLowerCase();
      
      return (
        recipientName.includes(query) ||
        categoryLabel.includes(query) ||
        periodLabel.includes(query)
      );
    });
  }, [packages, searchQuery]);

  // Separate into winning and non-winning packages
  const { winningPackages, pendingPackages } = useMemo(() => {
    const winning: AwardPackageWithDetails[] = [];
    const pending: AwardPackageWithDetails[] = [];

    filteredPackages.forEach((pkg) => {
      if (pkg.wins_list && pkg.wins_list.length > 0) {
        winning.push(pkg);
      } else {
        pending.push(pkg);
      }
    });

    return { winningPackages: winning, pendingPackages: pending };
  }, [filteredPackages]);

  // ============================================================================
  // Edit Package
  // ============================================================================

  const handleEditPackage = (pkg: AwardPackageWithDetails) => {
    setEditingPackage(pkg);
    
    // Set existing win levels
    const existingLevels = new Set<AwardWinLevel>(
      (pkg.wins_list || []).map((w) => w.win_level)
    );
    setEditWinLevels(existingLevels);
    
    // Convert team members to ID format
    const memberIds = (pkg.team_members_list || []).map((tm) => {
      if (tm.profile_id) return tm.profile_id;
      if (tm.team_member_id) return `managed:${tm.team_member_id}`;
      return "";
    }).filter(Boolean);
    setEditTeamMemberIds(memberIds);
  };

  const handleCancelEdit = () => {
    setEditingPackage(null);
    setEditWinLevels(new Set());
    setEditTeamMemberIds([]);
  };

  const toggleWinLevel = (level: AwardWinLevel) => {
    setEditWinLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  };

  const handleSavePackage = async () => {
    if (!editingPackage || !profile) return;

    if (editingPackage.is_team_award && editTeamMemberIds.length === 0) {
      toast.error("Team awards must have at least one team member");
      return;
    }

    setIsSaving(true);

    try {
      // Update team members if this is a team award
      if (editingPackage.is_team_award) {
        // Delete existing team members
        await supabase
          .from("award_shell_team_members")
          .delete()
          .eq("shell_id", editingPackage.id);

        // Insert new team members
        if (editTeamMemberIds.length > 0) {
          const teamMemberInserts = editTeamMemberIds.map((memberId) => {
            const isManaged = memberId.startsWith("managed:");
            const actualId = isManaged ? memberId.replace("managed:", "") : memberId;
            return {
              shell_id: editingPackage.id,
              profile_id: isManaged ? null : actualId,
              team_member_id: isManaged ? actualId : null,
              added_by: profile.id,
            };
          });

          const { error: teamError } = await supabase
            .from("award_shell_team_members")
            // @ts-ignore - Table types not yet regenerated in supabase types
            .insert(teamMemberInserts);

          if (teamError) {
            console.error("Error updating team members:", teamError);
            toast.error("Failed to update team members");
            setIsSaving(false);
            return;
          }
        }
      }

      // Get existing win levels
      const existingLevels = new Set<AwardWinLevel>(
        (editingPackage.wins_list || []).map((w) => w.win_level)
      );

      // Find levels to add and remove
      const levelsToAdd = [...editWinLevels].filter((l) => !existingLevels.has(l));
      const levelsToRemove = [...existingLevels].filter((l) => !editWinLevels.has(l));

      // Remove levels
      for (const level of levelsToRemove) {
        const { error } = await supabase.rpc("remove_award_shell_win_level", 
          // @ts-ignore - RPC function types not yet regenerated in supabase types
          { p_shell_id: editingPackage.id, p_win_level: level }
        );
        if (error) {
          console.error("Error removing win level:", error);
          toast.error(`Failed to remove ${getWinLevelLabel(level)} level`);
          setIsSaving(false);
          return;
        }
      }

      // Add levels
      for (const level of levelsToAdd) {
        const { error } = await supabase.rpc("add_award_shell_win_level", 
          // @ts-ignore - RPC function types not yet regenerated in supabase types
          { p_shell_id: editingPackage.id, p_win_level: level }
        );
        if (error) {
          console.error("Error adding win level:", error);
          toast.error(`Failed to add ${getWinLevelLabel(level)} level`);
          setIsSaving(false);
          return;
        }
      }

      // Show success message
      if (levelsToAdd.length > 0 && levelsToRemove.length > 0) {
        toast.success("Win levels updated", {
          description: "Award badges have been updated for team members",
        });
      } else if (levelsToAdd.length > 0) {
        const highestNew = levelsToAdd.sort((a, b) => getWinLevelOrder(b) - getWinLevelOrder(a))[0];
        toast.success(`Won at ${getWinLevelLabel(highestNew)} level!`, {
          description: "Award badges have been applied to team members",
        });
      } else if (levelsToRemove.length > 0) {
        toast.success("Win levels removed", {
          description: "Award badges have been updated",
        });
      } else {
        toast.success("Award package updated");
      }

      // Refresh packages
      await loadPackages();
      handleCancelEdit();
      
      // Notify parent to refresh awards
      onAwardsApplied?.();
    } catch (error) {
      console.error("Error saving package:", error);
      toast.error("Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  };

  // Get highest win level for display
  const getHighestWinLevel = (wins: AwardShellWin[] | undefined): AwardWinLevel | null => {
    if (!wins || wins.length === 0) return null;
    return wins.reduce((highest, win) => {
      if (!highest || getWinLevelOrder(win.win_level) > getWinLevelOrder(highest)) {
        return win.win_level;
      }
      return highest;
    }, null as AwardWinLevel | null);
  };

  // ============================================================================
  // Render
  // ============================================================================

  const renderPackageCard = (pkg: AwardPackageWithDetails) => {
    const isExpanded = expandedPackageId === pkg.id;
    const recipientName = getRecipientName(pkg);
    const progress = pkg.sections_count
      ? Math.round(((pkg.filled_sections_count || 0) / pkg.sections_count) * 100)
      : 0;
    const wins = pkg.wins_list || [];
    const highestLevel = getHighestWinLevel(wins);

    return (
      <div
        key={pkg.id}
        className={cn(
          "border rounded-lg transition-all",
          wins.length > 0 && "border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/10"
        )}
      >
        <Collapsible
          open={isExpanded}
          onOpenChange={() => setExpandedPackageId(isExpanded ? null : pkg.id)}
        >
          <CollapsibleTrigger asChild>
            <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors">
              <div className="shrink-0">
                {isExpanded ? (
                  <ChevronDown className="size-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-4 text-muted-foreground" />
                )}
              </div>

              <div className="flex-1 min-w-0 flex items-center gap-3">
                <div className="size-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  {pkg.is_team_award ? (
                    <Users className="size-4 text-muted-foreground" />
                  ) : pkg.owner_team_member ? (
                    <User className="size-4 text-muted-foreground" />
                  ) : (
                    <Award className="size-4 text-muted-foreground" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm truncate">
                      {recipientName}
                    </span>
                    {wins.length > 0 && (
                      <div className="flex items-center gap-1">
                        {wins
                          .sort((a, b) => getWinLevelOrder(b.win_level) - getWinLevelOrder(a.win_level))
                          .map((win) => (
                            <Badge
                              key={win.id}
                              className={cn(
                                "text-[10px] h-5 gap-1",
                                win.win_level === highestLevel
                                  ? "bg-amber-500 hover:bg-amber-600"
                                  : "bg-amber-400/70 hover:bg-amber-500/70"
                              )}
                            >
                              <Trophy className="size-3" />
                              {getWinLevelShortLabel(win.win_level)}
                            </Badge>
                          ))}
                      </div>
                    )}
                    {pkg.is_team_award && (
                      <Badge variant="outline" className="text-[10px] h-5 gap-1">
                        <Users className="size-3" />
                        Team
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{getCategoryLabel(pkg.award_category)}</span>
                    <span>•</span>
                    <span>{formatPeriodLabel(pkg)}</span>
                    <span>•</span>
                    <span>{progress}% complete</span>
                  </div>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  handleEditPackage(pkg);
                }}
              >
                <Pencil className="size-3.5 mr-1" />
                Edit
              </Button>
            </div>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <Separator />
            <div className="p-4 space-y-4">
              {/* Package details */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-muted-foreground text-xs">Period</Label>
                  <p className="font-medium">{formatPeriodLabel(pkg)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Category</Label>
                  <p className="font-medium">{getCategoryLabel(pkg.award_category)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Progress</Label>
                  <div className="flex items-center gap-2">
                    <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          progress === 100 ? "bg-green-500" :
                          progress >= 50 ? "bg-amber-500" :
                          "bg-muted-foreground/30"
                        )}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="text-xs">{pkg.filled_sections_count || 0}/{pkg.sections_count || 3}</span>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs">Created</Label>
                  <p className="font-medium">{new Date(pkg.created_at).toLocaleDateString()}</p>
                </div>
              </div>

              {/* Team members (for team awards) */}
              {pkg.is_team_award && pkg.team_members_list && pkg.team_members_list.length > 0 && (
                <div>
                  <Label className="text-muted-foreground text-xs mb-2 block">Team Members</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {pkg.team_members_list.map((tm) => {
                      const memberName = tm.profile_id
                        ? subordinates.find((s) => s.id === tm.profile_id)?.full_name ||
                          "Unknown"
                        : managedMembers.find((m) => m.id === tm.team_member_id)?.full_name ||
                          "Unknown";
                      const memberRank = tm.profile_id
                        ? subordinates.find((s) => s.id === tm.profile_id)?.rank
                        : managedMembers.find((m) => m.id === tm.team_member_id)?.rank;

                      return (
                        <Badge key={tm.id} variant="secondary" className="text-xs">
                          {memberRank && `${memberRank} `}
                          {memberName}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Win levels display */}
              {wins.length > 0 && (
                <div className="p-3 rounded-lg bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800">
                  <div className="flex items-center gap-2 mb-2">
                    <Trophy className="size-5 text-amber-600 dark:text-amber-400" />
                    <p className="font-medium text-sm text-amber-800 dark:text-amber-200">
                      Won at {wins.length} level{wins.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {wins
                      .sort((a, b) => getWinLevelOrder(b.win_level) - getWinLevelOrder(a.win_level))
                      .map((win) => (
                        <div
                          key={win.id}
                          className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300"
                        >
                          <Badge className="bg-amber-500/80 hover:bg-amber-500">
                            {getWinLevelLabel(win.win_level)}
                          </Badge>
                          <span className="text-amber-600/70 dark:text-amber-400/70">
                            {new Date(win.won_at).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    );
  };

  return (
    <TooltipProvider>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="size-5 text-amber-500" />
              Manage Award Packages
            </DialogTitle>
            <DialogDescription>
              View your award packages, add win levels as they progress, and manage team members
            </DialogDescription>
          </DialogHeader>

          {/* Search and refresh */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search award packages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                aria-label="Search award packages"
              />
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                >
                  <RefreshCw className={cn("size-4", isRefreshing && "animate-spin")} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh packages</TooltipContent>
            </Tooltip>
          </div>

          {/* Package list */}
          <ScrollArea className="flex-1 -mx-6 px-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
              </div>
            ) : packages.length === 0 ? (
              <div className="text-center py-12">
                <Award className="size-12 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-muted-foreground">No award packages found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Create award packages from the Award page
                </p>
              </div>
            ) : (
              <div className="space-y-6 pb-4">
                {/* Winning packages */}
                {winningPackages.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Trophy className="size-4 text-amber-500" />
                      <h3 className="font-semibold text-sm">Winning Packages</h3>
                      <Badge className="text-xs bg-amber-500">{winningPackages.length}</Badge>
                    </div>
                    <div className="space-y-2">
                      {winningPackages.map(renderPackageCard)}
                    </div>
                  </div>
                )}

                {/* Pending packages */}
                {pendingPackages.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Award className="size-4 text-muted-foreground" />
                      <h3 className="font-semibold text-sm">Pending Results</h3>
                      <Badge variant="outline" className="text-xs">{pendingPackages.length}</Badge>
                    </div>
                    <div className="space-y-2">
                      {pendingPackages.map(renderPackageCard)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Package Dialog */}
      <Dialog open={!!editingPackage} onOpenChange={(open) => !open && handleCancelEdit()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="size-5" />
              Edit Award Package
            </DialogTitle>
            <DialogDescription>
              {editingPackage && (
                <>
                  {getRecipientName(editingPackage)} • {formatPeriodLabel(editingPackage)}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {editingPackage && (
            <div className="space-y-6 py-4">
              {/* Win Levels Selection */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Trophy className="size-4 text-amber-500" />
                  <Label>Win Levels</Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Select all levels this award has won at. Awards can progress through multiple levels over time.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {AWARD_WIN_LEVELS.map((level) => {
                    const isSelected = editWinLevels.has(level.value);
                    return (
                      <label
                        key={level.value}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                          isSelected
                            ? "bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700"
                            : "hover:bg-muted/50"
                        )}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleWinLevel(level.value)}
                          aria-label={`Select ${level.label}`}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{level.label}</p>
                          <p className="text-[10px] text-muted-foreground">{level.shortLabel}</p>
                        </div>
                        {isSelected && (
                          <Trophy className="size-4 text-amber-500 shrink-0" />
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Team Member Selection (for team awards) */}
              {editingPackage.is_team_award && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Users className="size-4" />
                      <Label>Team Members</Label>
                    </div>
                    <TeamMemberSelector
                      subordinates={subordinates}
                      managedMembers={managedMembers}
                      selectedMemberIds={editTeamMemberIds}
                      onSelectionChange={setEditTeamMemberIds}
                    />
                  </div>
                </>
              )}

              {/* Info about what will happen */}
              {editWinLevels.size > 0 && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm">
                  <Trophy className="size-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-blue-800 dark:text-blue-200">
                      Award badges at highest level
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      {editingPackage.is_team_award
                        ? `${editTeamMemberIds.length} team member(s) will receive award badges at the ${
                            getWinLevelLabel(
                              [...editWinLevels].sort((a, b) => getWinLevelOrder(b) - getWinLevelOrder(a))[0]
                            )
                          } level`
                        : `The nominee will receive an award badge at the ${
                            getWinLevelLabel(
                              [...editWinLevels].sort((a, b) => getWinLevelOrder(b) - getWinLevelOrder(a))[0]
                            )
                          } level`}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={handleCancelEdit} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSavePackage} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
