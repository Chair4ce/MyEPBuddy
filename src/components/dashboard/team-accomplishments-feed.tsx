"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import {
  useTeamFeedStore,
  type FeedAccomplishment,
  type ChainMember,
} from "@/stores/team-feed-store";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Users,
  Calendar,
  Clock,
  ChevronRight,
  TrendingUp,
  UserCheck,
  Award,
  MessageSquare,
  Filter,
  X,
  LayoutList,
  CalendarDays,
} from "lucide-react";
import { ENTRY_MGAS, SUPERVISOR_RANKS, AWARD_QUARTERS, getQuarterDateRange, getFiscalQuarterDateRange } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { AwardQuarter } from "@/types/database";
import { AccomplishmentDetailDialog } from "./accomplishment-detail-dialog";
import { getAccomplishmentCommentCounts } from "@/app/actions/accomplishment-comments";
import type { Accomplishment, Profile, ManagedMember, Rank } from "@/types/database";

// Time period filter options
const TIME_PERIODS = [
  { value: "all", label: "All Time" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "quarter", label: "This Quarter" },
  { value: "year", label: "This Year" },
] as const;

type TimePeriod = typeof TIME_PERIODS[number]["value"];

interface TeamAccomplishmentsFeedProps {
  cycleYear: number;
}

export function TeamAccomplishmentsFeed({ cycleYear }: TeamAccomplishmentsFeedProps) {
  const supabase = createClient();
  const { profile, subordinates, managedMembers } = useUserStore();
  const {
    feedAccomplishments,
    isLoading,
    hasSubordinates,
    setFeedAccomplishments,
    updateAccomplishmentCommentCounts,
    updateAccomplishment,
    setIsLoading,
    setHasSubordinates,
  } = useTeamFeedStore();

  const [selectedAccomplishment, setSelectedAccomplishment] =
    useState<FeedAccomplishment | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Filter states
  const [memberFilter, setMemberFilter] = useState<string>("all");
  const [mpaFilter, setMpaFilter] = useState<string>("all");
  const [timePeriodFilter, setTimePeriodFilter] = useState<TimePeriod>("all");
  
  // View mode: list or quarterly
  const [viewMode, setViewMode] = useState<"list" | "quarterly">("list");
  const [useFiscalYear, setUseFiscalYear] = useState(false);

  // Check if user can have subordinates based on rank
  const canHaveSubordinates =
    profile?.rank && SUPERVISOR_RANKS.includes(profile.rank as Rank);

  useEffect(() => {
    async function loadTeamFeed() {
      if (!profile) return;

      setIsLoading(true);

      try {
        // Get the subordinate chain (recursive)
        const { data: chainData, error: chainError } = await (supabase.rpc as Function)(
          "get_subordinate_chain",
          { supervisor_uuid: profile.id }
        ) as { data: { subordinate_id: string; depth: number }[] | null; error: Error | null };

        if (chainError) {
          console.error("Error fetching subordinate chain:", chainError);
          setHasSubordinates(false);
          setIsLoading(false);
          return;
        }

        // Include managed members in the list
        const subordinateIds = (chainData || []).map((c) => c.subordinate_id);
        const hasChainSubordinates = subordinateIds.length > 0;
        const hasManagedMembers = managedMembers.length > 0;

        setHasSubordinates(hasChainSubordinates || hasManagedMembers);

        if (!hasChainSubordinates && !hasManagedMembers) {
          setFeedAccomplishments([]);
          setIsLoading(false);
          return;
        }

        // Fetch profiles for subordinates in chain
        let profilesMap: Record<string, Profile> = {};
        if (subordinateIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("*")
            .in("id", subordinateIds);

          if (profiles) {
            (profiles as unknown as Profile[]).forEach((p) => {
              profilesMap[p.id] = p;
            });
          }
        }

        // Fetch accomplishments from subordinates' user_ids
        let allAccomplishments: Accomplishment[] = [];

        if (subordinateIds.length > 0) {
          const { data: subordinateAccomplishments } = await supabase
            .from("accomplishments")
            .select("*")
            .in("user_id", subordinateIds)
            .eq("cycle_year", cycleYear)
            .is("team_member_id", null)
            .order("created_at", { ascending: false });

          if (subordinateAccomplishments) {
            allAccomplishments = subordinateAccomplishments as unknown as Accomplishment[];
          }
        }

        // Also fetch accomplishments for managed members (they use supervisor's user_id + team_member_id)
        if (hasManagedMembers) {
          const managedMemberIds = managedMembers
            .filter((m) => m.member_status === "active")
            .map((m) => m.id);

          if (managedMemberIds.length > 0) {
            const { data: managedAccomplishments } = await supabase
              .from("accomplishments")
              .select("*")
              .in("team_member_id", managedMemberIds)
              .eq("cycle_year", cycleYear)
              .order("created_at", { ascending: false });

            if (managedAccomplishments) {
              allAccomplishments = [
                ...allAccomplishments,
                ...(managedAccomplishments as unknown as Accomplishment[]),
              ];
            }
          }
        }

        // Build managed members map for lookup
        const managedMembersMap: Record<string, ManagedMember> = {};
        managedMembers.forEach((m) => {
          managedMembersMap[m.id] = m;
        });

        // Build depth map for chain members
        const depthMap: Record<string, number> = {};
        (chainData || []).forEach((c) => {
          depthMap[c.subordinate_id] = c.depth;
        });

        // Transform accomplishments to feed format with author info and chain
        const feedItems: FeedAccomplishment[] = await Promise.all(
          allAccomplishments.map(async (acc) => {
            // Determine if this is from a managed member or real profile
            const isManagedMember = !!acc.team_member_id;
            let authorName = "Unknown";
            let authorRank: Rank | null = null;
            let authorAfsc: string | null = null;
            let authorUnit: string | null = null;
            let chainDepth = 0;
            let supervisorChain: ChainMember[] = [];

            if (isManagedMember && acc.team_member_id) {
              // Get managed member info
              const member = managedMembersMap[acc.team_member_id];
              if (member) {
                authorName = member.full_name;
                authorRank = member.rank as Rank | null;
                authorAfsc = member.afsc;
                authorUnit = member.unit;
              }
              // Build chain for managed member
              supervisorChain = await buildManagedMemberChain(
                acc.team_member_id,
                managedMembersMap,
                profilesMap,
                profile
              );
              chainDepth = supervisorChain.length;
            } else {
              // Get profile info
              const authorProfile = profilesMap[acc.user_id];
              if (authorProfile) {
                authorName = authorProfile.full_name || "Unknown";
                authorRank = authorProfile.rank as Rank | null;
                authorAfsc = authorProfile.afsc;
                authorUnit = authorProfile.unit;
              }
              chainDepth = depthMap[acc.user_id] || 0;

              // Build supervisor chain for this user
              supervisorChain = await buildProfileChain(
                acc.user_id,
                profilesMap,
                profile,
                supabase
              );
            }

            return {
              ...acc,
              author_name: authorName,
              author_rank: authorRank,
              author_afsc: authorAfsc,
              author_unit: authorUnit,
              is_managed_member: isManagedMember,
              managed_member_id: acc.team_member_id,
              chain_depth: chainDepth,
              supervisor_chain: supervisorChain,
            };
          })
        );

        // Sort by created_at descending
        feedItems.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        setFeedAccomplishments(feedItems);

        // Load comment counts for all accomplishments
        if (feedItems.length > 0) {
          const accIds = feedItems.map((a) => a.id);
          const countsResult = await getAccomplishmentCommentCounts(accIds);
          if (countsResult.data) {
            updateAccomplishmentCommentCounts(countsResult.data);
          }
        }
      } catch (error) {
        console.error("Error loading team feed:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadTeamFeed();
  }, [
    profile,
    cycleYear,
    subordinates,
    managedMembers,
    supabase,
    setFeedAccomplishments,
    updateAccomplishmentCommentCounts,
    setIsLoading,
    setHasSubordinates,
  ]);

  // Helper function to build chain for managed members
  async function buildManagedMemberChain(
    memberId: string,
    managedMembersMap: Record<string, ManagedMember>,
    profilesMap: Record<string, Profile>,
    currentUser: Profile | null
  ): Promise<ChainMember[]> {
    const chain: ChainMember[] = [];
    let currentMember = managedMembersMap[memberId];
    let depth = 1;

    // Walk up the parent chain
    while (currentMember) {
      if (currentMember.parent_profile_id) {
        // Parent is a real profile
        const parentProfile = profilesMap[currentMember.parent_profile_id];
        if (parentProfile) {
          chain.push({
            id: parentProfile.id,
            name: parentProfile.full_name || "Unknown",
            rank: parentProfile.rank as Rank | null,
            depth: depth,
            is_managed_member: false,
          });
        }
        break; // Real profiles don't have further parents in managed chain
      } else if (currentMember.parent_team_member_id) {
        // Parent is another managed member
        const parentMember = managedMembersMap[currentMember.parent_team_member_id];
        if (parentMember) {
          chain.push({
            id: parentMember.id,
            name: parentMember.full_name,
            rank: parentMember.rank as Rank | null,
            depth: depth,
            is_managed_member: true,
          });
          currentMember = parentMember;
          depth++;
        } else {
          break;
        }
      } else {
        // No parent, add supervisor
        if (currentMember.supervisor_id && currentMember.supervisor_id !== currentUser?.id) {
          const supervisor = profilesMap[currentMember.supervisor_id];
          if (supervisor) {
            chain.push({
              id: supervisor.id,
              name: supervisor.full_name || "Unknown",
              rank: supervisor.rank as Rank | null,
              depth: depth,
              is_managed_member: false,
            });
          }
        }
        break;
      }
    }

    // Add current user at the top if they're the supervisor
    if (currentUser && !chain.find((c) => c.id === currentUser.id)) {
      chain.push({
        id: currentUser.id,
        name: currentUser.full_name || "You",
        rank: currentUser.rank as Rank | null,
        depth: chain.length + 1,
        is_managed_member: false,
      });
    }

    return chain;
  }

  // Helper function to build chain for real profiles
  async function buildProfileChain(
    userId: string,
    profilesMap: Record<string, Profile>,
    currentUser: Profile | null,
    supabaseClient: ReturnType<typeof createClient>
  ): Promise<ChainMember[]> {
    const chain: ChainMember[] = [];

    // Get the supervisor chain for this user
    const { data: supervisorChain } = await (supabaseClient.rpc as Function)(
      "get_supervisor_chain",
      { subordinate_uuid: userId }
    ) as { data: { supervisor_id: string; depth: number }[] | null };

    if (supervisorChain) {
      // Fetch any missing profiles
      const missingIds = supervisorChain
        .map((s) => s.supervisor_id)
        .filter((id) => !profilesMap[id]);

      if (missingIds.length > 0) {
        const { data: missingProfiles } = await supabaseClient
          .from("profiles")
          .select("*")
          .in("id", missingIds);

        if (missingProfiles) {
          (missingProfiles as unknown as Profile[]).forEach((p) => {
            profilesMap[p.id] = p;
          });
        }
      }

      // Build the chain
      supervisorChain.forEach((s) => {
        const supervisor = profilesMap[s.supervisor_id];
        if (supervisor) {
          chain.push({
            id: supervisor.id,
            name: supervisor.full_name || "Unknown",
            rank: supervisor.rank as Rank | null,
            depth: s.depth,
            is_managed_member: false,
          });
        }
      });
    }

    return chain;
  }

  const handleAccomplishmentClick = (acc: FeedAccomplishment) => {
    setSelectedAccomplishment(acc);
    setDialogOpen(true);
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  // Get unique team members for filter dropdown
  const uniqueMembers = useMemo(() => {
    const membersMap = new Map<string, { id: string; name: string; rank: Rank | null }>();
    feedAccomplishments.forEach((acc) => {
      const memberId = acc.is_managed_member ? acc.managed_member_id : acc.user_id;
      if (memberId && !membersMap.has(memberId)) {
        membersMap.set(memberId, {
          id: memberId,
          name: acc.author_name,
          rank: acc.author_rank,
        });
      }
    });
    return Array.from(membersMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [feedAccomplishments]);

  // Get unique MPAs that exist in accomplishments
  const availableMpas = useMemo(() => {
    const mpaSet = new Set(feedAccomplishments.map((acc) => acc.mpa));
    return ENTRY_MGAS.filter((mpa) => mpaSet.has(mpa.key));
  }, [feedAccomplishments]);

  // Filter accomplishments
  const filteredAccomplishments = useMemo(() => {
    let filtered = feedAccomplishments;

    // Member filter
    if (memberFilter !== "all") {
      filtered = filtered.filter((acc) => {
        const memberId = acc.is_managed_member ? acc.managed_member_id : acc.user_id;
        return memberId === memberFilter;
      });
    }

    // MPA filter
    if (mpaFilter !== "all") {
      filtered = filtered.filter((acc) => acc.mpa === mpaFilter);
    }

    // Time period filter
    if (timePeriodFilter !== "all") {
      const now = new Date();
      let startDate: Date;

      switch (timePeriodFilter) {
        case "week":
          // Start of current week (Sunday)
          startDate = new Date(now);
          startDate.setDate(now.getDate() - now.getDay());
          startDate.setHours(0, 0, 0, 0);
          break;
        case "month":
          // Start of current month
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case "quarter":
          // Start of current quarter
          const currentQuarter = Math.floor(now.getMonth() / 3);
          startDate = new Date(now.getFullYear(), currentQuarter * 3, 1);
          break;
        case "year":
          // Start of current year
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          startDate = new Date(0);
      }

      filtered = filtered.filter((acc) => new Date(acc.date) >= startDate);
    }

    return filtered;
  }, [feedAccomplishments, memberFilter, mpaFilter, timePeriodFilter]);

  // Check if any filters are active
  const hasActiveFilters = memberFilter !== "all" || mpaFilter !== "all" || timePeriodFilter !== "all";

  // Clear all filters
  const clearFilters = () => {
    setMemberFilter("all");
    setMpaFilter("all");
    setTimePeriodFilter("all");
  };

  // Helper to get month key from date string
  const getMonthKey = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  };

  // Group entries by month for list view with dividers
  interface MonthGroup {
    key: string;
    label: string;
    shortLabel: string;
    entries: FeedAccomplishment[];
  }

  const monthGroups = useMemo((): MonthGroup[] => {
    const groups: Map<string, MonthGroup> = new Map();
    
    filteredAccomplishments.forEach((entry) => {
      const monthKey = getMonthKey(entry.date);
      const date = new Date(entry.date);
      
      if (!groups.has(monthKey)) {
        groups.set(monthKey, {
          key: monthKey,
          label: date.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
          shortLabel: date.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
          entries: [],
        });
      }
      groups.get(monthKey)!.entries.push(entry);
    });

    // Sort groups by date (most recent first)
    return Array.from(groups.values()).sort((a, b) => b.key.localeCompare(a.key));
  }, [filteredAccomplishments]);

  // Group entries by quarter for quarterly view
  interface QuarterGroup {
    quarter: AwardQuarter;
    label: string;
    dateRange: { start: string; end: string };
    entries: FeedAccomplishment[];
    monthGroups: MonthGroup[];
  }

  const quarterGroups = useMemo((): QuarterGroup[] => {
    const groups: QuarterGroup[] = AWARD_QUARTERS.map((q) => {
      const dateRange = useFiscalYear
        ? getFiscalQuarterDateRange(q.value, cycleYear)
        : getQuarterDateRange(q.value, cycleYear);

      return {
        quarter: q.value,
        label: useFiscalYear ? `FY${cycleYear.toString().slice(-2)} ${q.value}` : `${q.value} ${cycleYear}`,
        dateRange,
        entries: [],
        monthGroups: [],
      };
    });

    // Assign filtered entries to quarters based on date
    filteredAccomplishments.forEach((entry) => {
      const entryDate = entry.date;
      for (const group of groups) {
        if (entryDate >= group.dateRange.start && entryDate <= group.dateRange.end) {
          group.entries.push(entry);
          break;
        }
      }
    });

    // Group entries within each quarter by month
    groups.forEach((group) => {
      const monthMap: Map<string, MonthGroup> = new Map();
      
      group.entries.forEach((entry) => {
        const monthKey = getMonthKey(entry.date);
        const date = new Date(entry.date);
        
        if (!monthMap.has(monthKey)) {
          monthMap.set(monthKey, {
            key: monthKey,
            label: date.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
            shortLabel: date.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
            entries: [],
          });
        }
        monthMap.get(monthKey)!.entries.push(entry);
      });

      // Sort months within quarter (most recent first)
      group.monthGroups = Array.from(monthMap.values()).sort((a, b) => b.key.localeCompare(a.key));
    });

    return groups;
  }, [filteredAccomplishments, useFiscalYear, cycleYear]);

  if (isLoading) {
    return <TeamFeedSkeleton />;
  }

  // No subordinates and rank doesn't allow supervision
  if (!canHaveSubordinates) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-10 text-center">
          <UserCheck className="size-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="font-semibold text-lg mb-2">Your Personal Feed</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            As an E-1 through E-4, you&apos;ll see your own accomplishments here. Once you reach
            SSgt or above, you&apos;ll be able to view accomplishments from your subordinates.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Has supervisor rank but no subordinates yet
  if (!hasSubordinates) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-10 text-center">
          <Users className="size-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="font-semibold text-lg mb-2">No Team Members Yet</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
            Add subordinates to your team to see their accomplishments in this feed.
            You can add real users or create managed member placeholders.
          </p>
          <Button variant="outline" asChild>
            <a href="/team">
              <Users className="size-4 mr-2" />
              Go to Team Page
            </a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Has subordinates but no accomplishments
  if (feedAccomplishments.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-10 text-center">
          <TrendingUp className="size-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="font-semibold text-lg mb-2">No Team Activity Yet</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Your team members haven&apos;t logged any accomplishments for the {cycleYear} cycle
            yet. Encourage them to start tracking their achievements!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* Filters & View Controls */}
        <div className="space-y-3">
          {/* Primary Filters Row */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Member Filter */}
            <Select value={memberFilter} onValueChange={setMemberFilter}>
              <SelectTrigger className="w-full sm:w-[180px] h-8 text-xs">
                <Users className="size-3.5 mr-1.5 shrink-0 text-muted-foreground" />
                <SelectValue placeholder="All Members" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Members</SelectItem>
                {uniqueMembers.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.rank ? `${member.rank} ` : ""}{member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* MPA Filter */}
            <Select value={mpaFilter} onValueChange={setMpaFilter}>
              <SelectTrigger className="w-full sm:w-[180px] h-8 text-xs">
                <Filter className="size-3.5 mr-1.5 shrink-0 text-muted-foreground" />
                <SelectValue placeholder="All MPAs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All MPAs</SelectItem>
                {availableMpas.map((mpa) => (
                  <SelectItem key={mpa.key} value={mpa.key}>
                    {mpa.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Time Period Filter - only show in list view */}
            {viewMode === "list" && (
              <Select value={timePeriodFilter} onValueChange={(v) => setTimePeriodFilter(v as TimePeriod)}>
                <SelectTrigger className="w-full sm:w-[140px] h-8 text-xs">
                  <Calendar className="size-3.5 mr-1.5 shrink-0 text-muted-foreground" />
                  <SelectValue placeholder="All Time" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_PERIODS.map((period) => (
                    <SelectItem key={period.value} value={period.value}>
                      {period.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Clear Filters */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5 mr-1" />
                Clear
              </Button>
            )}

            <div className="flex-1" />

            {/* View Mode Tabs */}
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "list" | "quarterly")}>
              <TabsList className="h-8">
                <TabsTrigger value="list" className="gap-1.5 px-2.5 text-xs h-7">
                  <LayoutList className="size-3.5" />
                  <span className="hidden sm:inline">List</span>
                </TabsTrigger>
                <TabsTrigger value="quarterly" className="gap-1.5 px-2.5 text-xs h-7">
                  <CalendarDays className="size-3.5" />
                  <span className="hidden sm:inline">Quarterly</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Fiscal Year Toggle - only show in quarterly view */}
            {viewMode === "quarterly" && (
              <div className="flex items-center gap-2 h-8 px-2.5 rounded-md border bg-background text-xs">
                <span className={cn(!useFiscalYear && "font-medium")}>Cal</span>
                <Switch
                  checked={useFiscalYear}
                  onCheckedChange={setUseFiscalYear}
                  aria-label="Toggle fiscal year"
                  className="scale-75"
                />
                <span className={cn(useFiscalYear && "font-medium")}>FY</span>
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-1.5 text-xs">
              <Award className="size-3" />
              {filteredAccomplishments.length}
              {hasActiveFilters && ` of ${feedAccomplishments.length}`} Entries
            </Badge>
            <Badge variant="outline" className="gap-1.5 text-xs">
              <Users className="size-3" />
              {new Set(filteredAccomplishments.map((a) => a.is_managed_member ? a.managed_member_id : a.user_id)).size} Members
            </Badge>
          </div>
        </div>

        {/* Feed Items */}
        {filteredAccomplishments.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            <Filter className="size-8 mx-auto mb-2 opacity-50" />
            <p>No accomplishments match the current filters</p>
            <Button
              variant="link"
              size="sm"
              onClick={clearFilters}
              className="mt-2"
            >
              Clear filters
            </Button>
          </div>
        ) : viewMode === "quarterly" ? (
          /* Quarterly View */
          <div className="space-y-4">
            {quarterGroups.map((group) => (
              <Card key={group.quarter}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "flex items-center justify-center size-9 rounded-lg font-bold text-sm",
                        group.entries.length > 0 
                          ? "bg-primary text-primary-foreground" 
                          : "bg-muted text-muted-foreground"
                      )}>
                        {group.quarter}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{group.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(group.dateRange.start).toLocaleDateString("en-US", { month: "short", day: "numeric" })} - {new Date(group.dateRange.end).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </p>
                      </div>
                    </div>
                    <Badge variant={group.entries.length > 0 ? "default" : "secondary"} className="text-xs">
                      {group.entries.length} {group.entries.length === 1 ? "entry" : "entries"}
                    </Badge>
                  </div>
                  
                  {group.entries.length > 0 && (
                    <div className="border-t pt-3 space-y-1">
                      {group.monthGroups.map((monthGroup) => (
                        <div key={monthGroup.key}>
                          {/* Month Divider within Quarter */}
                          <div className="flex items-center gap-2 py-1.5">
                            <span className="text-xs font-medium text-muted-foreground">
                              <span className="hidden sm:inline">{monthGroup.label.split(" ")[0]}</span>
                              <span className="sm:hidden">{monthGroup.shortLabel.split(" ")[0]}</span>
                            </span>
                            <div className="h-px flex-1 bg-border/50" />
                          </div>
                          
                          {/* Entries for this month */}
                          <div className="space-y-2">
                            {monthGroup.entries.map((acc) => {
                              const mpaLabel = ENTRY_MGAS.find((m) => m.key === acc.mpa)?.label || acc.mpa;
                              return (
                                <div 
                                  key={acc.id} 
                                  className="group p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors cursor-pointer"
                                  onClick={() => handleAccomplishmentClick(acc)}
                                  role="button"
                                  tabIndex={0}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      handleAccomplishmentClick(acc);
                                    }
                                  }}
                                >
                                  <div className="flex items-start gap-3">
                                    {/* Avatar */}
                                    <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-medium text-primary">
                                      {acc.author_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                                    </div>
                                    
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        <span className="font-medium text-sm">
                                          {acc.author_rank && <span className="text-muted-foreground">{acc.author_rank} </span>}
                                          {acc.author_name}
                                        </span>
                                        <Badge variant="outline" className="text-xs">{mpaLabel}</Badge>
                                        {(acc.unresolved_comment_count ?? 0) > 0 && (
                                          <Badge variant="secondary" className="text-xs gap-1 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                            <MessageSquare className="size-3" />
                                            {acc.unresolved_comment_count}
                                          </Badge>
                                        )}
                                      </div>
                                      <p className="text-xs text-muted-foreground line-clamp-1">{acc.details}</p>
                                    </div>
                                    
                                    <div className="flex items-center gap-2 shrink-0">
                                      <span className="text-xs text-muted-foreground">
                                        {new Date(acc.date).toLocaleDateString("en-US", { day: "numeric" })}
                                      </span>
                                      <ChevronRight className="size-4 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors" />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          /* List View with Month Dividers */
          <div className="space-y-2">
            {monthGroups.map((monthGroup, monthIndex) => (
              <div key={monthGroup.key}>
                {/* Month Divider */}
                <div className="flex items-center gap-3 py-2">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs font-medium text-muted-foreground px-2">
                    <span className="hidden sm:inline">{monthGroup.label}</span>
                    <span className="sm:hidden">{monthGroup.shortLabel}</span>
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                
                {/* Entries for this month */}
                <div className="space-y-2">
                  {monthGroup.entries.map((acc) => {
                    const mpaLabel =
                      ENTRY_MGAS.find((m) => m.key === acc.mpa)?.label || acc.mpa;

                    return (
                      <Card
                        key={acc.id}
                        className="cursor-pointer hover:bg-muted/50 transition-all hover:shadow-md group"
                        onClick={() => handleAccomplishmentClick(acc)}
                        tabIndex={0}
                        role="button"
                        aria-label={`View accomplishment from ${acc.author_name}`}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleAccomplishmentClick(acc);
                          }
                        }}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            {/* Avatar */}
                            <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-sm font-medium text-primary">
                              {acc.author_name
                                .split(" ")
                                .map((n) => n[0])
                                .join("")
                                .slice(0, 2)
                                .toUpperCase()}
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              {/* Header */}
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <div className="min-w-0">
                                  <span className="font-medium text-sm">
                                    {acc.author_rank && (
                                      <span className="text-muted-foreground">
                                        {acc.author_rank}{" "}
                                      </span>
                                    )}
                                    {acc.author_name}
                                  </span>
                                  {acc.chain_depth > 0 && (
                                    <span className="text-xs text-muted-foreground ml-2">
                                      • Level {acc.chain_depth}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
                                  <Clock className="size-3" />
                                  {formatTimeAgo(acc.created_at)}
                                </div>
                              </div>

                              {/* MPA and Action */}
                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                <Badge variant="outline" className="text-xs">
                                  {mpaLabel}
                                </Badge>
                                <Badge variant="secondary" className="text-xs">
                                  {acc.action_verb}
                                </Badge>
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Calendar className="size-3" />
                                  {new Date(acc.date).toLocaleDateString("en-US", {
                                    day: "numeric",
                                  })}
                                </span>
                                {/* RFI Indicator */}
                                {(acc.unresolved_comment_count ?? 0) > 0 && (
                                  <Badge variant="secondary" className="text-xs gap-1 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800">
                                    <MessageSquare className="size-3" />
                                    {acc.unresolved_comment_count} RFI
                                  </Badge>
                                )}
                              </div>

                              {/* Preview */}
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {acc.details}
                              </p>
                            </div>

                            {/* Arrow indicator */}
                            <ChevronRight className="size-5 text-muted-foreground/30 group-hover:text-muted-foreground shrink-0 transition-colors mt-2" />
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail Dialog */}
      <AccomplishmentDetailDialog
        accomplishment={selectedAccomplishment}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onAccomplishmentUpdated={updateAccomplishment}
      />
    </>
  );
}

function TeamFeedSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-6 w-28" />
      </div>
      {[...Array(5)].map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="size-10 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-16" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

