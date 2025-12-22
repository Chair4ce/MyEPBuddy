"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Copy,
  Check,
  Trash2,
  Star,
  StarOff,
  Pencil,
  Share2,
  Loader2,
  ThumbsUp,
  ThumbsDown,
  Trophy,
  Globe,
  Users as UsersIcon,
  User,
  Download,
  UserCheck,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "@/components/ui/sonner";
import type { RefinedStatement, SharedStatementView, CommunityStatement, StatementShare } from "@/types/database";

interface BaseStatementCardProps {
  mpaLabel: string;
  maxChars?: number;
}

interface MyStatementCardProps extends BaseStatementCardProps {
  type: "my";
  statement: RefinedStatement;
  shares?: StatementShare[];
  creatorInfo?: { full_name: string | null; rank: string | null } | null;
  onToggleFavorite: (statement: RefinedStatement) => void;
  onEdit: (statement: RefinedStatement) => void;
  onShare: (statement: RefinedStatement) => void;
  onDelete: (id: string) => void;
}

interface SharedStatementCardProps extends BaseStatementCardProps {
  type: "shared";
  statement: SharedStatementView;
  onCopyToLibrary: (statement: SharedStatementView) => void;
  isCopying?: boolean;
}

interface CommunityStatementCardProps extends BaseStatementCardProps {
  type: "community";
  statement: CommunityStatement;
  userVote?: "up" | "down" | null;
  isVoting?: boolean;
  isTopRated?: boolean;
  rank?: number;
  onVote: (statementId: string, voteType: "up" | "down") => void;
  onCopyToLibrary: (statement: CommunityStatement) => void;
  isCopying?: boolean;
}

type StatementCardProps = MyStatementCardProps | SharedStatementCardProps | CommunityStatementCardProps;

export function StatementCard(props: StatementCardProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copyToClipboard(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  }

  if (props.type === "my") {
    const { statement, shares, creatorInfo, onToggleFavorite, onEdit, onShare, onDelete, mpaLabel } = props;
    const hasShares = shares && shares.length > 0;

    return (
      <Card className="group">
        <CardContent className="p-3 sm:pt-4 sm:px-6">
          <div className="flex flex-col gap-3">
            {/* Header with badges and favorite */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
                {statement.statement_type === "award" ? (
                  <Badge variant="default" className="text-xs shrink-0 bg-amber-500 hover:bg-amber-600">
                    <Trophy className="size-3 mr-1" />
                    Award
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs shrink-0">EPB</Badge>
                )}
                <Badge variant="outline" className="text-xs shrink-0">{mpaLabel}</Badge>
                <Badge variant="secondary" className="text-xs shrink-0">{statement.rank}</Badge>
                <Badge variant="secondary" className="text-xs shrink-0">{statement.afsc}</Badge>
                {statement.is_favorite && (
                  <Star className="size-3.5 sm:size-4 text-yellow-500 fill-yellow-500 shrink-0" />
                )}
                {hasShares && (
                  <div className="flex items-center gap-1">
                    {shares.some(s => s.share_type === "community") && (
                      <Globe className="size-3.5 text-blue-500" />
                    )}
                    {shares.some(s => s.share_type === "team") && (
                      <UsersIcon className="size-3.5 text-green-500" />
                    )}
                    {shares.some(s => s.share_type === "user") && (
                      <User className="size-3.5 text-purple-500" />
                    )}
                  </div>
                )}
                {/* Show creator badge if statement was created by supervisor */}
                {creatorInfo && (
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="secondary" className="text-xs gap-1 shrink-0">
                          <UserCheck className="size-3" />
                          {creatorInfo.rank} {creatorInfo.full_name?.split(" ")[0]}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        Created by {creatorInfo.rank} {creatorInfo.full_name}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>
            
            {/* Statement text */}
            <p className="text-sm leading-relaxed break-words">{statement.statement}</p>
            
            {/* Footer with date and actions */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <p className="text-xs text-muted-foreground shrink-0">
                Saved {new Date(statement.created_at).toLocaleDateString()}
              </p>
              <div className="flex gap-0.5 sm:gap-1 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 sm:size-9"
                  onClick={() => onToggleFavorite(statement)}
                  aria-label={statement.is_favorite ? "Remove from favorites" : "Add to favorites"}
                >
                  {statement.is_favorite ? (
                    <StarOff className="size-3.5 sm:size-4" />
                  ) : (
                    <Star className="size-3.5 sm:size-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 sm:size-9"
                  onClick={() => onEdit(statement)}
                  aria-label="Edit statement"
                >
                  <Pencil className="size-3.5 sm:size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("size-8 sm:size-9", hasShares && "text-primary")}
                  onClick={() => onShare(statement)}
                  aria-label="Share statement"
                >
                  <Share2 className="size-3.5 sm:size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 sm:size-9"
                  onClick={() => copyToClipboard(statement.statement, statement.id)}
                  aria-label="Copy statement"
                >
                  {copiedId === statement.id ? (
                    <Check className="size-3.5 sm:size-4 text-green-500" />
                  ) : (
                    <Copy className="size-3.5 sm:size-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 sm:size-9 text-destructive hover:text-destructive"
                  onClick={() => onDelete(statement.id)}
                  aria-label="Delete statement"
                >
                  <Trash2 className="size-3.5 sm:size-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (props.type === "shared") {
    const { statement, onCopyToLibrary, isCopying, mpaLabel } = props;

    return (
      <Card className="group">
        <CardContent className="p-3 sm:pt-4 sm:px-6">
          <div className="flex flex-col gap-3">
            {/* Header with badges */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
                {statement.statement_type === "award" ? (
                  <Badge variant="default" className="text-xs shrink-0 bg-amber-500 hover:bg-amber-600">
                    <Trophy className="size-3 mr-1" />
                    Award
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs shrink-0">EPB</Badge>
                )}
                <Badge variant="outline" className="text-xs shrink-0">{mpaLabel}</Badge>
                <Badge variant="secondary" className="text-xs shrink-0">{statement.rank}</Badge>
                <Badge variant="secondary" className="text-xs shrink-0">{statement.afsc}</Badge>
                {statement.share_type === "community" && (
                  <Badge variant="outline" className="text-xs shrink-0 gap-1 text-blue-600 border-blue-200 bg-blue-50 dark:bg-blue-900/20">
                    <Globe className="size-3" />
                    Community
                  </Badge>
                )}
                {statement.share_type === "team" && (
                  <Badge variant="outline" className="text-xs shrink-0 gap-1 text-green-600 border-green-200 bg-green-50 dark:bg-green-900/20">
                    <UsersIcon className="size-3" />
                    Team
                  </Badge>
                )}
                {statement.share_type === "user" && (
                  <Badge variant="outline" className="text-xs shrink-0 gap-1 text-purple-600 border-purple-200 bg-purple-50 dark:bg-purple-900/20">
                    <User className="size-3" />
                    Direct
                  </Badge>
                )}
              </div>
            </div>
            
            {/* Statement text */}
            <p className="text-sm leading-relaxed break-words">{statement.statement}</p>
            
            {/* Footer with owner info and actions */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <p className="text-xs text-muted-foreground shrink-0">
                Shared by {statement.owner_rank} {statement.owner_name || "Unknown"}
              </p>
              <div className="flex gap-0.5 sm:gap-1 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 sm:size-9"
                  onClick={() => copyToClipboard(statement.statement, statement.id)}
                  aria-label="Copy statement"
                >
                  {copiedId === statement.id ? (
                    <Check className="size-3.5 sm:size-4 text-green-500" />
                  ) : (
                    <Copy className="size-3.5 sm:size-4" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 sm:h-9 text-xs sm:text-sm"
                  onClick={() => onCopyToLibrary(statement)}
                  disabled={isCopying}
                  aria-label="Save to my library"
                >
                  {isCopying ? (
                    <Loader2 className="size-3.5 sm:size-4 animate-spin mr-1.5" />
                  ) : (
                    <Download className="size-3.5 sm:size-4 mr-1.5" />
                  )}
                  Save to Library
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (props.type === "community") {
    const { statement, userVote, isVoting, isTopRated, rank, onVote, onCopyToLibrary, isCopying, mpaLabel } = props;
    const netVotes = statement.upvotes - (statement.downvotes || 0);

    return (
      <Card className={cn("group transition-colors", isTopRated && "border-yellow-500/30 bg-yellow-500/5")}>
        <CardContent className="p-3 sm:pt-4 sm:px-6">
          <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
            {/* Voting */}
            <div className="flex sm:flex-col items-center gap-2 sm:gap-1 shrink-0 order-last sm:order-first">
              <Button
                variant="ghost"
                size="icon"
                className={cn("size-8", userVote === "up" && "text-green-500 bg-green-500/10")}
                onClick={() => onVote(statement.id, "up")}
                disabled={isVoting}
                aria-label="Upvote"
              >
                {isVoting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ThumbsUp className={cn("size-4", userVote === "up" && "fill-current")} />
                )}
              </Button>
              <span className={cn(
                "text-sm font-semibold tabular-nums min-w-[2ch] text-center",
                netVotes > 0 && "text-green-600 dark:text-green-400",
                netVotes < 0 && "text-red-600 dark:text-red-400",
                netVotes === 0 && "text-muted-foreground"
              )}>
                {netVotes}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className={cn("size-8", userVote === "down" && "text-red-500 bg-red-500/10")}
                onClick={() => onVote(statement.id, "down")}
                disabled={isVoting}
                aria-label="Downvote"
              >
                <ThumbsDown className={cn("size-4", userVote === "down" && "fill-current")} />
              </Button>
              
              {/* Mobile: Copy and save buttons inline with votes */}
              <div className="flex-1 sm:hidden" />
              <Button
                variant="ghost"
                size="icon"
                className="size-8 sm:hidden"
                onClick={() => copyToClipboard(statement.statement, statement.id)}
                aria-label="Copy statement"
              >
                {copiedId === statement.id ? (
                  <Check className="size-4 text-green-500" />
                ) : (
                  <Copy className="size-4" />
                )}
              </Button>
            </div>

            {/* Content */}
            <div className="flex-1 space-y-2 min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                {isTopRated && rank !== undefined && (
                  <Badge className="gap-1 bg-yellow-500/80 hover:bg-yellow-500 text-yellow-950 text-xs">
                    <Trophy className="size-3" />
                    #{rank + 1} {mpaLabel} - {statement.afsc}
                  </Badge>
                )}
                {!isTopRated && <Badge variant="outline" className="text-xs">{mpaLabel}</Badge>}
                <Badge variant="secondary" className="text-xs">{statement.rank}</Badge>
                <Badge variant="secondary" className="text-xs">{statement.afsc}</Badge>
              </div>
              <p className="text-sm leading-relaxed break-words">{statement.statement}</p>
              <p className="text-xs text-muted-foreground">
                {statement.upvotes} upvotes · {statement.downvotes || 0} downvotes
              </p>
            </div>

            {/* Desktop Actions */}
            <div className="hidden sm:flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                variant="ghost"
                size="icon"
                className="size-9"
                onClick={() => copyToClipboard(statement.statement, statement.id)}
                aria-label="Copy statement"
              >
                {copiedId === statement.id ? (
                  <Check className="size-4 text-green-500" />
                ) : (
                  <Copy className="size-4" />
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => onCopyToLibrary(statement)}
                disabled={isCopying}
                aria-label="Save to my library"
              >
                {isCopying ? (
                  <Loader2 className="size-4 animate-spin mr-1.5" />
                ) : (
                  <Download className="size-4 mr-1.5" />
                )}
                Save
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}

