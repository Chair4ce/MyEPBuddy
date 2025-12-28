"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Award,
  ChevronDown,
  ChevronUp,
  User,
  Users,
  Crown,
  FileEdit,
  Eye,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AWARD_LEVELS, AWARD_CATEGORIES } from "@/lib/constants";
import type { AwardShell, Profile, ManagedMember, Rank, AwardLevel, AwardCategory, AwardPeriodType } from "@/types/database";

// ============================================================================
// Types
// ============================================================================

export interface AwardShellWithDetails {
  id: string;
  user_id: string;
  team_member_id: string | null;
  created_by: string;
  cycle_year: number;
  award_level: AwardLevel;
  award_category: AwardCategory;
  sentences_per_statement: 2 | 3;
  // Period fields
  award_period_type: AwardPeriodType;
  quarter: 1 | 2 | 3 | 4 | null;
  is_fiscal_year: boolean;
  period_start_date: string | null;
  period_end_date: string | null;
  created_at: string;
  updated_at: string;
  owner_profile?: Profile | null;
  owner_team_member?: ManagedMember | null;
  creator_profile?: Profile | null;
  sections_count?: number;
  filled_sections_count?: number;
}

interface AwardListTableProps {
  awards: AwardShellWithDetails[];
  currentUserId: string | undefined;
  isLoading?: boolean;
  onAwardClick: (award: AwardShellWithDetails) => void;
}

type SortField = "name" | "level" | "category" | "updated" | "progress";
type SortOrder = "asc" | "desc";

// ============================================================================
// Helper Functions
// ============================================================================

function getRecipientName(award: AwardShellWithDetails): string {
  if (award.owner_team_member) {
    return `${award.owner_team_member.rank || ""} ${award.owner_team_member.full_name}`.trim();
  }
  if (award.owner_profile) {
    return `${award.owner_profile.rank || ""} ${award.owner_profile.full_name}`.trim();
  }
  return "Unknown";
}

function getRecipientRank(award: AwardShellWithDetails): Rank | null {
  if (award.owner_team_member) {
    return award.owner_team_member.rank as Rank | null;
  }
  if (award.owner_profile) {
    return award.owner_profile.rank as Rank | null;
  }
  return null;
}

function getCreatorName(award: AwardShellWithDetails): string {
  if (award.creator_profile) {
    return `${award.creator_profile.rank || ""} ${award.creator_profile.full_name}`.trim();
  }
  return "Unknown";
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
}

function formatPeriodLabel(award: AwardShellWithDetails): string {
  const fiscalPrefix = award.is_fiscal_year ? "FY" : "";
  
  if (award.award_period_type === "annual") {
    return `${fiscalPrefix}${award.cycle_year} Annual`;
  }
  
  if (award.award_period_type === "quarterly" && award.quarter) {
    return `${fiscalPrefix}${award.cycle_year} Q${award.quarter}`;
  }
  
  if (award.award_period_type === "special") {
    // Format date range for special awards
    if (award.period_start_date && award.period_end_date) {
      const start = new Date(award.period_start_date);
      const end = new Date(award.period_end_date);
      const formatDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return `${formatDate(start)} - ${formatDate(end)}, ${award.cycle_year}`;
    }
    return `${award.cycle_year} Special`;
  }
  
  return `${award.cycle_year}`;
}

function getLevelLabel(level: string): string {
  return AWARD_LEVELS.find((l) => l.value === level)?.label || level;
}

function getCategoryLabel(category: string): string {
  return AWARD_CATEGORIES.find((c) => c.value === category)?.label || category;
}

function getProgress(award: AwardShellWithDetails): number {
  const total = award.sections_count || 3;
  const filled = award.filled_sections_count || 0;
  return Math.round((filled / total) * 100);
}

// ============================================================================
// Component
// ============================================================================

export function AwardListTable({
  awards,
  currentUserId,
  isLoading = false,
  onAwardClick,
}: AwardListTableProps) {
  const [sortField, setSortField] = useState<SortField>("updated");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Sort awards
  const sortedAwards = useMemo(() => {
    return [...awards].sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case "name":
          comparison = getRecipientName(a).localeCompare(getRecipientName(b));
          break;
        case "level":
          comparison = (a.award_level || "").localeCompare(b.award_level || "");
          break;
        case "category":
          comparison = (a.award_category || "").localeCompare(b.award_category || "");
          break;
        case "updated":
          comparison = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
          break;
        case "progress":
          comparison = getProgress(a) - getProgress(b);
          break;
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });
  }, [awards, sortField, sortOrder]);

  // Separate user's awards from team awards
  const { myAwards, teamAwards } = useMemo(() => {
    const my: AwardShellWithDetails[] = [];
    const team: AwardShellWithDetails[] = [];

    sortedAwards.forEach((award) => {
      const isMyAward = award.created_by === currentUserId;
      if (isMyAward) {
        my.push(award);
      } else {
        team.push(award);
      }
    });

    return { myAwards: my, teamAwards: team };
  }, [sortedAwards, currentUserId]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortOrder === "asc" ? (
      <ChevronUp className="size-3 ml-1" />
    ) : (
      <ChevronDown className="size-3 ml-1" />
    );
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[250px]">Nominee</TableHead>
              <TableHead>Level</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Created By</TableHead>
              <TableHead>Last Updated</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(5)].map((_, i) => (
              <TableRow key={i}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-8 rounded-full" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                </TableCell>
                <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                <TableCell><Skeleton className="h-2 w-20" /></TableCell>
                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell><Skeleton className="h-8 w-16" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  // Empty state
  if (awards.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <div className="mx-auto size-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <Award className="size-6 text-muted-foreground" />
        </div>
        <h3 className="font-medium text-lg mb-2">No Award Packages</h3>
        <p className="text-muted-foreground text-sm max-w-sm mx-auto">
          Create your first award package to get started building 1206 statements.
        </p>
      </div>
    );
  }

  const renderAwardRow = (award: AwardShellWithDetails, isOwn: boolean) => {
    const recipientName = getRecipientName(award);
    const recipientRank = getRecipientRank(award);
    const creatorName = getCreatorName(award);
    const progress = getProgress(award);
    const isManagedMember = !!award.team_member_id;

    return (
      <TableRow
        key={award.id}
        className={cn(
          "cursor-pointer transition-colors group",
          isOwn && "bg-primary/[0.02]"
        )}
        onClick={() => onAwardClick(award)}
      >
        <TableCell>
          <div className="flex items-center gap-3">
            <Avatar className="size-8">
              <AvatarFallback className={cn(
                "text-xs",
                isOwn && "bg-primary/10 text-primary"
              )}>
                {getInitials(recipientName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium truncate">{recipientName}</span>
                {isOwn && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Crown className="size-3.5 text-amber-500 shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent>You created this award</TooltipContent>
                  </Tooltip>
                )}
                {isManagedMember && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="text-[10px] h-4 px-1">
                        <User className="size-2.5 mr-0.5" />
                        Managed
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>Managed team member</TooltipContent>
                  </Tooltip>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {formatPeriodLabel(award)}
              </span>
            </div>
          </div>
        </TableCell>
        <TableCell>
          <Badge variant="outline" className="text-xs">
            {getLevelLabel(award.award_level)}
          </Badge>
        </TableCell>
        <TableCell>
          <Badge variant="secondary" className="text-xs">
            {getCategoryLabel(award.award_category)}
          </Badge>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
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
            <span className="text-xs text-muted-foreground w-8">
              {progress}%
            </span>
          </div>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {isOwn ? (
              <span className="text-primary font-medium">You</span>
            ) : (
              <span>{creatorName}</span>
            )}
          </div>
        </TableCell>
        <TableCell>
          <span className="text-xs text-muted-foreground">
            {new Date(award.updated_at).toLocaleDateString()}
          </span>
        </TableCell>
        <TableCell>
          <Button
            variant="ghost"
            size="sm"
            className="opacity-0 group-hover:opacity-100 transition-opacity"
          >
            {isOwn ? (
              <>
                <FileEdit className="size-3.5 mr-1" />
                Edit
              </>
            ) : (
              <>
                <Eye className="size-3.5 mr-1" />
                View
              </>
            )}
          </Button>
        </TableCell>
      </TableRow>
    );
  };

  return (
    <div className="space-y-6">
      {/* My Awards Section */}
      {myAwards.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Crown className="size-4 text-amber-500" />
            <h3 className="font-semibold text-sm">My Awards</h3>
            <Badge variant="secondary" className="text-xs">
              {myAwards.length}
            </Badge>
          </div>
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="w-[250px] cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("name")}
                  >
                    <div className="flex items-center">
                      Nominee <SortIcon field="name" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("level")}
                  >
                    <div className="flex items-center">
                      Level <SortIcon field="level" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("category")}
                  >
                    <div className="flex items-center">
                      Category <SortIcon field="category" />
                    </div>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("progress")}
                  >
                    <div className="flex items-center">
                      Progress <SortIcon field="progress" />
                    </div>
                  </TableHead>
                  <TableHead>Created By</TableHead>
                  <TableHead
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSort("updated")}
                  >
                    <div className="flex items-center">
                      Updated <SortIcon field="updated" />
                    </div>
                  </TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {myAwards.map((award) => renderAwardRow(award, true))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Team Awards Section */}
      {teamAwards.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">Team Awards</h3>
            <Badge variant="outline" className="text-xs">
              {teamAwards.length}
            </Badge>
          </div>
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[250px]">Nominee</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Created By</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamAwards.map((award) => renderAwardRow(award, false))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

