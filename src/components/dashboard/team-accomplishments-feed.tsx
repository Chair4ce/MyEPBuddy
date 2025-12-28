"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import {
  useTeamFeedStore,
  type FeedAccomplishment,
  type ChainMember,
} from "@/stores/team-feed-store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users,
  Calendar,
  Clock,
  ChevronRight,
  TrendingUp,
  UserCheck,
  Award,
  AlertCircle,
} from "lucide-react";
import { ENTRY_MGAS, SUPERVISOR_RANKS } from "@/lib/constants";
import { AccomplishmentDetailDialog } from "./accomplishment-detail-dialog";
import type { Accomplishment, Profile, ManagedMember, Rank } from "@/types/database";

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
    setIsLoading,
    setHasSubordinates,
  } = useTeamFeedStore();

  const [selectedAccomplishment, setSelectedAccomplishment] =
    useState<FeedAccomplishment | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

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
            profiles.forEach((p) => {
              profilesMap[p.id] = p as unknown as Profile;
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
          missingProfiles.forEach((p) => {
            profilesMap[p.id] = p as unknown as Profile;
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
        {/* Feed Stats Header */}
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <Badge variant="secondary" className="gap-1.5">
            <Award className="size-3.5" />
            {feedAccomplishments.length} Accomplishments
          </Badge>
          <Badge variant="outline" className="gap-1.5">
            <Users className="size-3.5" />
            {new Set(feedAccomplishments.map((a) => a.is_managed_member ? a.managed_member_id : a.user_id)).size} Team Members
          </Badge>
        </div>

        {/* Feed Items */}
        <div className="space-y-3">
          {feedAccomplishments.map((acc) => {
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
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
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

      {/* Detail Dialog */}
      <AccomplishmentDetailDialog
        accomplishment={selectedAccomplishment}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
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

