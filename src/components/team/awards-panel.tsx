"use client";

import { useState, useMemo } from "react";
import { useAwardsStore } from "@/stores/awards-store";
import { useUserStore } from "@/stores/user-store";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { AWARD_TYPES, AWARD_LEVELS, AWARD_CATEGORIES } from "@/lib/constants";
import { AwardBadge, AwardSummary } from "./award-badges";
import type { Award, AwardType, Profile, ManagedMember } from "@/types/database";
import {
  Trophy,
  Medal,
  Award as AwardIcon,
  Star,
  ChevronDown,
  ChevronRight,
  Users,
  User,
  Filter,
  Calendar,
  Loader2,
} from "lucide-react";

interface AwardsPanelProps {
  awards: Award[];
  isLoading?: boolean;
  onAddAward?: () => void;
  canAddAwards?: boolean;
  className?: string;
}

export function AwardsPanel({
  awards,
  isLoading = false,
  onAddAward,
  canAddAwards = false,
  className,
}: AwardsPanelProps) {
  const { profile, subordinates, managedMembers } = useUserStore();
  const [selectedType, setSelectedType] = useState<AwardType | "all">("all");
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [expandedMembers, setExpandedMembers] = useState<Set<string>>(new Set());

  // Get unique years from awards
  const years = useMemo(() => {
    const yearSet = new Set<number>();
    awards.forEach((a) => {
      if (a.award_year) yearSet.add(a.award_year);
      else if (a.coin_date) {
        yearSet.add(new Date(a.coin_date).getFullYear());
      }
    });
    return Array.from(yearSet).sort((a, b) => b - a);
  }, [awards]);

  // Filter awards
  const filteredAwards = useMemo(() => {
    return awards.filter((a) => {
      if (selectedType !== "all" && a.award_type !== selectedType) return false;
      if (selectedYear !== "all") {
        const year = parseInt(selectedYear);
        if (a.award_year && a.award_year !== year) return false;
        if (a.coin_date && new Date(a.coin_date).getFullYear() !== year) return false;
      }
      return true;
    });
  }, [awards, selectedType, selectedYear]);

  // Group awards by member
  const awardsByMember = useMemo(() => {
    const groups: Record<string, { name: string; rank: string | null; awards: Award[] }> = {};

    filteredAwards.forEach((award) => {
      let memberId: string;
      let memberName: string;
      let memberRank: string | null = null;

      if (award.recipient_profile_id) {
        memberId = `profile:${award.recipient_profile_id}`;
        const sub = subordinates.find((s) => s.id === award.recipient_profile_id);
        memberName = sub?.full_name || "Unknown";
        memberRank = sub?.rank || null;
      } else if (award.recipient_team_member_id) {
        memberId = `managed:${award.recipient_team_member_id}`;
        const member = managedMembers.find((m) => m.id === award.recipient_team_member_id);
        memberName = member?.full_name || "Unknown";
        memberRank = member?.rank || null;
      } else {
        return;
      }

      if (!groups[memberId]) {
        groups[memberId] = { name: memberName, rank: memberRank, awards: [] };
      }
      groups[memberId].awards.push(award);
    });

    // Sort by total awards count
    return Object.entries(groups)
      .sort(([, a], [, b]) => b.awards.length - a.awards.length)
      .map(([id, data]) => ({ id, ...data }));
  }, [filteredAwards, subordinates, managedMembers]);

  // Stats
  const stats = useMemo(() => {
    const counts: Record<AwardType, number> = {
      coin: 0,
      quarterly: 0,
      annual: 0,
      special: 0,
    };
    filteredAwards.forEach((a) => counts[a.award_type]++);
    return counts;
  }, [filteredAwards]);

  function toggleMemberExpand(memberId: string) {
    setExpandedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) {
        next.delete(memberId);
      } else {
        next.add(memberId);
      }
      return next;
    });
  }

  function expandAll() {
    setExpandedMembers(new Set(awardsByMember.map((m) => m.id)));
  }

  function collapseAll() {
    setExpandedMembers(new Set());
  }

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="size-5 text-amber-500" />
              Team Awards & Recognition
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              {filteredAwards.length} award{filteredAwards.length !== 1 ? "s" : ""} across{" "}
              {awardsByMember.length} member{awardsByMember.length !== 1 ? "s" : ""}
            </CardDescription>
          </div>
          {canAddAwards && onAddAward && (
            <Button size="sm" onClick={onAddAward}>
              <Trophy className="size-4 mr-1" />
              Add Award
            </Button>
          )}
        </div>

        {/* Quick stats */}
        {filteredAwards.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {Object.entries(stats).map(([type, count]) => {
              if (count === 0) return null;
              const typeInfo = AWARD_TYPES.find((t) => t.value === type);
              return (
                <Badge key={type} variant="secondary" className="text-[10px] gap-1">
                  {type === "coin" && <Medal className="size-3" />}
                  {type === "quarterly" && <AwardIcon className="size-3" />}
                  {type === "annual" && <Trophy className="size-3" />}
                  {type === "special" && <Star className="size-3" />}
                  {count} {typeInfo?.label || type}
                </Badge>
              );
            })}
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          <Select
            value={selectedType}
            onValueChange={(v) => setSelectedType(v as AwardType | "all")}
          >
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <Filter className="size-3 mr-1" />
              <SelectValue placeholder="Award Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {AWARD_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-[100px] h-8 text-xs">
              <Calendar className="size-3 mr-1" />
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {awardsByMember.length > 0 && (
            <div className="flex gap-1 ml-auto">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={expandAll}
              >
                Expand All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={collapseAll}
              >
                Collapse
              </Button>
            </div>
          )}
        </div>

        {/* Awards by member */}
        {awardsByMember.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Trophy className="size-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No awards recorded yet</p>
            {canAddAwards && (
              <p className="text-xs mt-1">
                Add awards to recognize your team's accomplishments
              </p>
            )}
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4 -mr-4">
            <div className="space-y-2">
              {awardsByMember.map((member) => {
                const isExpanded = expandedMembers.has(member.id);
                const isManaged = member.id.startsWith("managed:");

                return (
                  <Collapsible
                    key={member.id}
                    open={isExpanded}
                    onOpenChange={() => toggleMemberExpand(member.id)}
                  >
                    <CollapsibleTrigger asChild>
                      <div
                        className={cn(
                          "flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors",
                          isExpanded
                            ? "bg-muted/50 border-primary/30"
                            : "bg-card hover:bg-muted/30"
                        )}
                      >
                        <div className="shrink-0">
                          {isExpanded ? (
                            <ChevronDown className="size-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="size-4 text-muted-foreground" />
                          )}
                        </div>

                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className="size-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                            {isManaged ? (
                              <Users className="size-4 text-muted-foreground" />
                            ) : (
                              <User className="size-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">
                              {member.rank} {member.name}
                            </p>
                            <AwardSummary awards={member.awards} className="mt-0.5" />
                          </div>
                        </div>

                        <Badge variant="secondary" className="shrink-0 text-xs">
                          {member.awards.length}
                        </Badge>
                      </div>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <div className="ml-9 mt-2 space-y-2 pb-2">
                        {member.awards
                          .sort(
                            (a, b) =>
                              new Date(b.created_at).getTime() -
                              new Date(a.created_at).getTime()
                          )
                          .map((award) => (
                            <div
                              key={award.id}
                              className="flex items-start gap-3 p-2 rounded-md bg-muted/30 border border-transparent hover:border-border"
                            >
                              <AwardBadge award={award} size="md" showDetails />
                              {award.award_type === "coin" && award.coin_description && (
                                <p className="text-xs text-muted-foreground line-clamp-2 flex-1">
                                  {award.coin_description}
                                </p>
                              )}
                              {award.is_team_award && (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] shrink-0 bg-blue-50 dark:bg-blue-900/20"
                                >
                                  Team
                                </Badge>
                              )}
                            </div>
                          ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

