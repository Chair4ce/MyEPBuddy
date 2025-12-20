"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { cn, getCharacterCountColor } from "@/lib/utils";
import { MAX_STATEMENT_CHARACTERS } from "@/lib/constants";
import {
  Search,
  Copy,
  Check,
  Trash2,
  Star,
  StarOff,
  Pencil,
  Users,
  Clock,
  Loader2,
  ThumbsUp,
  ThumbsDown,
  Trophy,
} from "lucide-react";
import type { RefinedStatement, StatementHistory, CommunityStatement } from "@/types/database";

// Type for user votes
type UserVotes = Record<string, "up" | "down">;

export default function LibraryPage() {
  const { profile, epbConfig } = useUserStore();
  const [activeTab, setActiveTab] = useState<"refined" | "history" | "community">("refined");
  const [refinedStatements, setRefinedStatements] = useState<RefinedStatement[]>([]);
  const [historyStatements, setHistoryStatements] = useState<StatementHistory[]>([]);
  const [communityStatements, setCommunityStatements] = useState<CommunityStatement[]>([]);
  const [userVotes, setUserVotes] = useState<UserVotes>({});
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMpa, setFilterMpa] = useState<string>("all");
  const [filterAfsc, setFilterAfsc] = useState<string>("all");
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);
  const [votingId, setVotingId] = useState<string | null>(null);
  
  // Edit dialog
  const [editingStatement, setEditingStatement] = useState<RefinedStatement | null>(null);
  const [editedText, setEditedText] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const supabase = createClient();
  const mgas = epbConfig?.major_graded_areas || [];
  const maxChars = epbConfig?.max_characters_per_statement || MAX_STATEMENT_CHARACTERS;

  useEffect(() => {
    if (profile) {
      loadStatements();
    }
  }, [profile]);

  async function loadStatements() {
    if (!profile) return;
    setIsLoading(true);

    try {
      // Load refined statements
      const { data: refined } = await supabase
        .from("refined_statements")
        .select("*")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false });

      setRefinedStatements((refined as RefinedStatement[]) || []);

      // Load history
      const { data: history } = await supabase
        .from("statement_history")
        .select("*")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(100);

      setHistoryStatements((history as StatementHistory[]) || []);

      // Load community statements for user's AFSC
      if (profile.afsc) {
        const { data: community } = await supabase
          .from("community_statements")
          .select("*")
          .eq("afsc", profile.afsc)
          .eq("is_approved", true)
          .order("upvotes", { ascending: false })
          .limit(50);

        setCommunityStatements((community as CommunityStatement[]) || []);

        // Load user's votes
        const { data: votes } = await supabase
          .from("statement_votes")
          .select("statement_id, vote_type")
          .eq("user_id", profile.id);

        if (votes) {
          const votesMap: UserVotes = {};
          votes.forEach((v: { statement_id: string; vote_type: "up" | "down" }) => {
            votesMap[v.statement_id] = v.vote_type;
          });
          setUserVotes(votesMap);
        }
      }
    } catch (error) {
      console.error("Error loading statements:", error);
      toast.error("Failed to load statements");
    } finally {
      setIsLoading(false);
    }
  }

  async function toggleFavorite(statement: RefinedStatement) {
    const newValue = !statement.is_favorite;
    
    await supabase
      .from("refined_statements")
      .update({ is_favorite: newValue } as never)
      .eq("id", statement.id);

    setRefinedStatements((prev) =>
      prev.map((s) => (s.id === statement.id ? { ...s, is_favorite: newValue } : s))
    );

    toast.success(newValue ? "Added to favorites" : "Removed from favorites");
  }

  async function deleteStatement(id: string) {
    await supabase.from("refined_statements").delete().eq("id", id);
    setRefinedStatements((prev) => prev.filter((s) => s.id !== id));
    toast.success("Statement deleted");
  }

  async function saveEditedStatement() {
    if (!editingStatement) return;
    setIsSaving(true);

    try {
      await supabase
        .from("refined_statements")
        .update({ statement: editedText } as never)
        .eq("id", editingStatement.id);

      setRefinedStatements((prev) =>
        prev.map((s) => (s.id === editingStatement.id ? { ...s, statement: editedText } : s))
      );

      toast.success("Statement updated");
      setEditingStatement(null);
    } catch (error) {
      toast.error("Failed to update statement");
    } finally {
      setIsSaving(false);
    }
  }

  async function shareWithCommunity(statement: RefinedStatement) {
    if (!profile) return;

    try {
      await supabase.from("community_statements").insert({
        contributor_id: profile.id,
        refined_statement_id: statement.id,
        mpa: statement.mpa,
        afsc: statement.afsc,
        rank: statement.rank,
        statement: statement.statement,
      } as never);

      toast.success("Statement shared with community!");
    } catch (error) {
      toast.error("Failed to share statement");
    }
  }

  async function voteOnStatement(statementId: string, voteType: "up" | "down") {
    if (!profile) return;
    
    setVotingId(statementId);
    const currentVote = userVotes[statementId];

    try {
      if (currentVote === voteType) {
        // Remove vote
        await supabase
          .from("statement_votes")
          .delete()
          .eq("user_id", profile.id)
          .eq("statement_id", statementId);

        setUserVotes((prev) => {
          const updated = { ...prev };
          delete updated[statementId];
          return updated;
        });

        // Update local state
        setCommunityStatements((prev) =>
          prev.map((s) => {
            if (s.id === statementId) {
              return {
                ...s,
                upvotes: voteType === "up" ? Math.max(0, s.upvotes - 1) : s.upvotes,
                downvotes: voteType === "down" ? Math.max(0, s.downvotes - 1) : s.downvotes,
              };
            }
            return s;
          })
        );

        toast.success("Vote removed");
      } else if (currentVote) {
        // Change vote
        await supabase
          .from("statement_votes")
          .update({ vote_type: voteType } as never)
          .eq("user_id", profile.id)
          .eq("statement_id", statementId);

        setUserVotes((prev) => ({ ...prev, [statementId]: voteType }));

        // Update local state
        setCommunityStatements((prev) =>
          prev.map((s) => {
            if (s.id === statementId) {
              return {
                ...s,
                upvotes: voteType === "up" ? s.upvotes + 1 : Math.max(0, s.upvotes - 1),
                downvotes: voteType === "down" ? s.downvotes + 1 : Math.max(0, s.downvotes - 1),
              };
            }
            return s;
          })
        );

        toast.success("Vote changed");
      } else {
        // New vote
        await supabase.from("statement_votes").insert({
          user_id: profile.id,
          statement_id: statementId,
          vote_type: voteType,
        } as never);

        setUserVotes((prev) => ({ ...prev, [statementId]: voteType }));

        // Update local state
        setCommunityStatements((prev) =>
          prev.map((s) => {
            if (s.id === statementId) {
              return {
                ...s,
                upvotes: voteType === "up" ? s.upvotes + 1 : s.upvotes,
                downvotes: voteType === "down" ? s.downvotes + 1 : s.downvotes,
              };
            }
            return s;
          })
        );

        toast.success(voteType === "up" ? "Upvoted!" : "Downvoted");
      }
    } catch (error) {
      console.error("Vote error:", error);
      toast.error("Failed to vote");
    } finally {
      setVotingId(null);
    }
  }

  function getNetVotes(statement: CommunityStatement): number {
    return statement.upvotes - (statement.downvotes || 0);
  }

  async function copyToClipboard(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(id);
      setTimeout(() => setCopiedIndex(null), 2000);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  }

  function getMpaLabel(key: string): string {
    return mgas.find((m) => m.key === key)?.label || key;
  }

  function filterStatements<T extends { mpa: string; afsc?: string; statement?: string; original_statement?: string }>(
    statements: T[]
  ): T[] {
    return statements.filter((s) => {
      const matchesMpa = filterMpa === "all" || s.mpa === filterMpa;
      const matchesAfsc = filterAfsc === "all" || s.afsc === filterAfsc;
      const text = s.statement || s.original_statement || "";
      const matchesSearch = !searchQuery || text.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesMpa && matchesAfsc && matchesSearch;
    });
  }

  // Get unique AFSCs from all statements for the filter
  const uniqueAfscs = Array.from(
    new Set([
      ...refinedStatements.map((s) => s.afsc).filter(Boolean),
      ...historyStatements.map((s) => s.afsc).filter(Boolean),
      ...communityStatements.map((s) => s.afsc).filter(Boolean),
    ])
  ).sort();

  const filteredRefined = filterStatements(refinedStatements);
  const filteredHistory = filterStatements(historyStatements);
  const filteredCommunity = filterStatements(communityStatements);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Statement Library</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Your saved statements and generation history
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 sm:pt-6">
          <div className="flex flex-col gap-3 sm:gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search statements..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                aria-label="Search statements"
              />
            </div>
            <div className="grid grid-cols-2 sm:flex sm:flex-row gap-2 sm:gap-4">
              <Select value={filterMpa} onValueChange={setFilterMpa}>
                <SelectTrigger className="w-full sm:w-[180px]" aria-label="Filter by MPA">
                  <SelectValue placeholder="Filter by MPA" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All MPAs</SelectItem>
                  {mgas.map((mpa) => (
                    <SelectItem key={mpa.key} value={mpa.key}>
                      {mpa.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterAfsc} onValueChange={setFilterAfsc}>
                <SelectTrigger className="w-full sm:w-[140px]" aria-label="Filter by AFSC">
                  <SelectValue placeholder="Filter by AFSC" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All AFSCs</SelectItem>
                  {uniqueAfscs.map((afsc) => (
                    <SelectItem key={afsc} value={afsc as string}>
                      {afsc}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <ScrollArea className="w-full">
          <TabsList className="w-full sm:w-auto inline-flex">
            <TabsTrigger value="refined" className="gap-1.5 sm:gap-2 text-xs sm:text-sm px-2.5 sm:px-3">
              <Star className="size-3.5 sm:size-4 shrink-0" />
              <span className="hidden xs:inline">My </span>Refined
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {refinedStatements.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5 sm:gap-2 text-xs sm:text-sm px-2.5 sm:px-3">
              <Clock className="size-3.5 sm:size-4 shrink-0" />
              History
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {historyStatements.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="community" className="gap-1.5 sm:gap-2 text-xs sm:text-sm px-2.5 sm:px-3">
              <Users className="size-3.5 sm:size-4 shrink-0" />
              Community
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {communityStatements.length}
              </Badge>
            </TabsTrigger>
          </TabsList>
          <ScrollBar orientation="horizontal" className="invisible" />
        </ScrollArea>

        {/* Refined Statements */}
        <TabsContent value="refined" className="space-y-3 sm:space-y-4 mt-3 sm:mt-4">
          {filteredRefined.length === 0 ? (
            <Card>
              <CardContent className="py-8 sm:py-12 text-center text-muted-foreground text-sm sm:text-base">
                No refined statements yet. Generate statements and save your refined versions.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredRefined.map((statement) => (
                <Card key={statement.id} className="group">
                  <CardContent className="p-3 sm:pt-4 sm:px-6">
                    <div className="flex flex-col gap-3">
                      {/* Header with badges and favorite */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
                          <Badge variant="outline" className="text-xs shrink-0">{getMpaLabel(statement.mpa)}</Badge>
                          <Badge variant="secondary" className="text-xs shrink-0">{statement.rank}</Badge>
                          <Badge variant="secondary" className="text-xs shrink-0">{statement.afsc}</Badge>
                          {statement.is_favorite && (
                            <Star className="size-3.5 sm:size-4 text-yellow-500 fill-yellow-500 shrink-0" />
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
                            onClick={() => toggleFavorite(statement)}
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
                            onClick={() => {
                              setEditingStatement(statement);
                              setEditedText(statement.statement);
                            }}
                            aria-label="Edit statement"
                          >
                            <Pencil className="size-3.5 sm:size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 sm:size-9"
                            onClick={() => shareWithCommunity(statement)}
                            aria-label="Share with community"
                          >
                            <Users className="size-3.5 sm:size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 sm:size-9"
                            onClick={() => copyToClipboard(statement.statement, statement.id)}
                            aria-label="Copy statement"
                          >
                            {copiedIndex === statement.id ? (
                              <Check className="size-3.5 sm:size-4 text-green-500" />
                            ) : (
                              <Copy className="size-3.5 sm:size-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 sm:size-9 text-destructive hover:text-destructive"
                            onClick={() => deleteStatement(statement.id)}
                            aria-label="Delete statement"
                          >
                            <Trash2 className="size-3.5 sm:size-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* History */}
        <TabsContent value="history" className="space-y-3 sm:space-y-4 mt-3 sm:mt-4">
          {filteredHistory.length === 0 ? (
            <Card>
              <CardContent className="py-8 sm:py-12 text-center text-muted-foreground text-sm sm:text-base">
                No generation history yet. Generate some statements first.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredHistory.map((statement) => (
                <Card key={statement.id} className="group">
                  <CardContent className="p-3 sm:pt-4 sm:px-6">
                    <div className="flex flex-col gap-3">
                      {/* Header with badges */}
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs shrink-0">{getMpaLabel(statement.mpa)}</Badge>
                        <Badge variant="secondary" className="text-xs shrink-0">{statement.rank}</Badge>
                        <Badge variant="secondary" className="text-xs shrink-0 max-w-[120px] truncate">{statement.model_used}</Badge>
                      </div>
                      
                      {/* Statement text */}
                      <p className="text-sm leading-relaxed break-words">{statement.original_statement}</p>
                      
                      {/* Footer with date and copy */}
                      <div className="flex items-center justify-between gap-2 pt-1">
                        <p className="text-xs text-muted-foreground">
                          Generated {new Date(statement.created_at).toLocaleDateString()}
                        </p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 sm:size-9 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                          onClick={() => copyToClipboard(statement.original_statement, statement.id)}
                          aria-label="Copy statement"
                        >
                          {copiedIndex === statement.id ? (
                            <Check className="size-3.5 sm:size-4 text-green-500" />
                          ) : (
                            <Copy className="size-3.5 sm:size-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Community */}
        <TabsContent value="community" className="space-y-3 sm:space-y-4 mt-3 sm:mt-4">
          {!profile?.afsc ? (
            <Card>
              <CardContent className="py-8 sm:py-12 text-center text-muted-foreground text-sm sm:text-base px-4">
                Set your AFSC in settings to see community statements for your career field.
              </CardContent>
            </Card>
          ) : filteredCommunity.length === 0 ? (
            <Card>
              <CardContent className="py-8 sm:py-12 text-center text-muted-foreground text-sm sm:text-base px-4">
                No community statements for {profile.afsc} yet. Be the first to contribute!
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3 sm:space-y-4">
              {/* Info banner */}
              <div className="flex items-start sm:items-center gap-2 p-2.5 sm:p-3 rounded-lg bg-muted/50 text-xs sm:text-sm text-muted-foreground">
                <Trophy className="size-4 text-yellow-500 shrink-0 mt-0.5 sm:mt-0" />
                <span>Top 20 voted statements are used as examples when generating with Community style</span>
              </div>

              <div className="space-y-3">
                {filteredCommunity.map((statement, index) => {
                  const isTopRated = index < 20;
                  const netVotes = getNetVotes(statement);
                  const userVote = userVotes[statement.id];
                  const isVoting = votingId === statement.id;

                  return (
                    <Card 
                      key={statement.id} 
                      className={cn(
                        "group transition-colors",
                        isTopRated && "border-yellow-500/30 bg-yellow-500/5"
                      )}
                    >
                      <CardContent className="p-3 sm:pt-4 sm:px-6">
                        <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
                          {/* Mobile: Voting row / Desktop: Voting column */}
                          <div className="flex sm:flex-col items-center gap-2 sm:gap-1 shrink-0 order-last sm:order-first">
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn(
                                "size-8",
                                userVote === "up" && "text-green-500 bg-green-500/10"
                              )}
                              onClick={() => voteOnStatement(statement.id, "up")}
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
                              className={cn(
                                "size-8",
                                userVote === "down" && "text-red-500 bg-red-500/10"
                              )}
                              onClick={() => voteOnStatement(statement.id, "down")}
                              disabled={isVoting}
                              aria-label="Downvote"
                            >
                              <ThumbsDown className={cn("size-4", userVote === "down" && "fill-current")} />
                            </Button>
                            
                            {/* Copy button - mobile inline with votes */}
                            <div className="flex-1 sm:hidden" />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 sm:hidden"
                              onClick={() => copyToClipboard(statement.statement, statement.id)}
                              aria-label="Copy statement"
                            >
                              {copiedIndex === statement.id ? (
                                <Check className="size-4 text-green-500" />
                              ) : (
                                <Copy className="size-4" />
                              )}
                            </Button>
                          </div>

                          {/* Content */}
                          <div className="flex-1 space-y-2 min-w-0">
                            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                              {isTopRated && (
                                <Badge className="gap-1 bg-yellow-500/80 hover:bg-yellow-500 text-yellow-950 text-xs">
                                  <Trophy className="size-3" />
                                  Top {index + 1}
                                </Badge>
                              )}
                              <Badge variant="outline" className="text-xs">{getMpaLabel(statement.mpa)}</Badge>
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
                              {copiedIndex === statement.id ? (
                                <Check className="size-4 text-green-500" />
                              ) : (
                                <Copy className="size-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={!!editingStatement} onOpenChange={() => setEditingStatement(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg mx-auto">
          <DialogHeader>
            <DialogTitle className="text-lg">Edit Statement</DialogTitle>
            <DialogDescription className="text-sm">
              Update your refined statement
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-text" className="text-sm">Statement</Label>
                <span className={cn("text-xs", getCharacterCountColor(editedText.length, maxChars))}>
                  {editedText.length}/{maxChars}
                </span>
              </div>
              <Textarea
                id="edit-text"
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                rows={6}
                className="resize-none text-sm"
                aria-label="Edit statement text"
              />
            </div>
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditingStatement(null)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={saveEditedStatement} disabled={isSaving} className="w-full sm:w-auto">
              {isSaving ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

