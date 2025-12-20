"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { MAX_STATEMENT_CHARACTERS, STANDARD_MGAS } from "@/lib/constants";
import {
  Search,
  Loader2,
  Trophy,
  BookMarked,
  Share2,
  Globe,
} from "lucide-react";
import { StatementCard } from "@/components/library/statement-card";
import { ShareStatementDialog } from "@/components/library/share-statement-dialog";
import type { RefinedStatement, StatementHistory, CommunityStatement, SharedStatementView, StatementShare } from "@/types/database";

type UserVotes = Record<string, "up" | "down">;

export default function LibraryPage() {
  const { profile, epbConfig } = useUserStore();
  const [activeTab, setActiveTab] = useState<"my" | "shared" | "community">("my");
  const [myStatements, setMyStatements] = useState<RefinedStatement[]>([]);
  const [myStatementShares, setMyStatementShares] = useState<Record<string, StatementShare[]>>({});
  const [sharedStatements, setSharedStatements] = useState<SharedStatementView[]>([]);
  const [communityStatements, setCommunityStatements] = useState<CommunityStatement[]>([]);
  const [userVotes, setUserVotes] = useState<UserVotes>({});
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMpa, setFilterMpa] = useState<string>("all");
  const [filterAfsc, setFilterAfsc] = useState<string>("all");
  const [filterCycleYear, setFilterCycleYear] = useState<string>("all");
  const [votingId, setVotingId] = useState<string | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  
  // Edit dialog
  const [editingStatement, setEditingStatement] = useState<RefinedStatement | null>(null);
  const [editedText, setEditedText] = useState("");
  const [editedMpa, setEditedMpa] = useState("");
  const [editedCycleYear, setEditedCycleYear] = useState<number>(new Date().getFullYear());
  const [isSaving, setIsSaving] = useState(false);

  // Copy dialog (for shared/community statements)
  const [copyingStatement, setCopyingStatement] = useState<SharedStatementView | CommunityStatement | null>(null);
  const [copyMpa, setCopyMpa] = useState("");
  const [copyCycleYear, setCopyCycleYear] = useState<number>(new Date().getFullYear());
  const [isCopyingSaving, setIsCopyingSaving] = useState(false);

  // Share dialog
  const [sharingStatement, setSharingStatement] = useState<RefinedStatement | null>(null);

  const supabase = createClient();
  const mgas = STANDARD_MGAS;
  const maxChars = epbConfig?.max_characters_per_statement || MAX_STATEMENT_CHARACTERS;

  const loadStatements = useCallback(async () => {
    if (!profile) return;
    setIsLoading(true);

    try {
      // Load my refined statements
      const { data: myData } = await supabase
        .from("refined_statements")
        .select("*")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false });

      setMyStatements((myData as RefinedStatement[]) || []);

      // Load shares for my statements
      if (myData && myData.length > 0) {
        const { data: sharesData } = await supabase
          .from("statement_shares")
          .select("*")
          .in("statement_id", myData.map((s: RefinedStatement) => s.id));

        const sharesMap: Record<string, StatementShare[]> = {};
        ((sharesData || []) as StatementShare[]).forEach((share) => {
          if (!sharesMap[share.statement_id]) {
            sharesMap[share.statement_id] = [];
          }
          sharesMap[share.statement_id].push(share);
        });
        setMyStatementShares(sharesMap);
      }

      // Load statements shared with me (direct or team shares, excluding community)
      const { data: sharedData } = await supabase
        .from("shared_statements_view")
        .select("*")
        .neq("owner_id", profile.id)
        .neq("share_type", "community")
        .order("created_at", { ascending: false });

      setSharedStatements((sharedData as SharedStatementView[]) || []);

      // Load community statements from two sources:
      // 1. The community_statements table (legacy/curated)
      // 2. Statements shared to community via statement_shares
      
      // Source 1: Legacy community_statements table
      let legacyCommunity: CommunityStatement[] = [];
      if (profile.afsc) {
        const { data: communityData } = await supabase
          .from("community_statements")
          .select("*")
          .eq("afsc", profile.afsc)
          .eq("is_approved", true)
          .order("upvotes", { ascending: false })
          .limit(50);

        legacyCommunity = (communityData as CommunityStatement[]) || [];
      }

      // Source 2: Statements shared to community via sharing system
      const { data: sharedCommunityData } = await supabase
        .from("shared_statements_view")
        .select("*")
        .eq("share_type", "community")
        .order("created_at", { ascending: false });

      // Convert shared community statements to CommunityStatement format
      const sharedCommunity: CommunityStatement[] = ((sharedCommunityData as SharedStatementView[]) || []).map((s) => ({
        id: s.id,
        contributor_id: s.owner_id,
        refined_statement_id: s.id,
        mpa: s.mpa,
        afsc: s.afsc,
        rank: s.rank,
        statement: s.statement,
        upvotes: 0,
        downvotes: 0,
        is_approved: true,
        created_at: s.created_at,
        // Extra fields for display
        owner_name: s.owner_name,
        owner_rank: s.owner_rank,
      })) as CommunityStatement[];

      // Combine and deduplicate (legacy community statements take precedence for voting)
      const sharedCommunityIds = new Set(sharedCommunity.map(s => s.refined_statement_id));
      const combinedCommunity = [
        ...legacyCommunity,
        ...sharedCommunity.filter(s => !legacyCommunity.some(lc => lc.refined_statement_id === s.refined_statement_id)),
      ];

      setCommunityStatements(combinedCommunity);

      // Load user's votes for community statements
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
    } catch (error) {
      console.error("Error loading statements:", error);
      toast.error("Failed to load statements");
    } finally {
      setIsLoading(false);
    }
  }, [profile, supabase]);

  useEffect(() => {
    if (profile) {
      loadStatements();
    }
  }, [profile, loadStatements]);

  async function toggleFavorite(statement: RefinedStatement) {
    const newValue = !statement.is_favorite;
    
    await supabase
      .from("refined_statements")
      .update({ is_favorite: newValue } as never)
      .eq("id", statement.id);

    setMyStatements((prev) =>
      prev.map((s) => (s.id === statement.id ? { ...s, is_favorite: newValue } : s))
    );

    toast.success(newValue ? "Added to favorites" : "Removed from favorites");
  }

  async function deleteStatement(id: string) {
    await supabase.from("refined_statements").delete().eq("id", id);
    setMyStatements((prev) => prev.filter((s) => s.id !== id));
    toast.success("Statement deleted");
  }

  async function saveEditedStatement() {
    if (!editingStatement) return;
    setIsSaving(true);

    try {
      await supabase
        .from("refined_statements")
        .update({ 
          statement: editedText,
          mpa: editedMpa,
          cycle_year: editedCycleYear,
        } as never)
        .eq("id", editingStatement.id);

      setMyStatements((prev) =>
        prev.map((s) => (s.id === editingStatement.id ? { 
          ...s, 
          statement: editedText,
          mpa: editedMpa,
          cycle_year: editedCycleYear,
        } : s))
      );

      toast.success("Statement updated");
      setEditingStatement(null);
    } catch (error) {
      toast.error("Failed to update statement");
    } finally {
      setIsSaving(false);
    }
  }

  function openCopyDialog(statement: SharedStatementView | CommunityStatement) {
    setCopyingStatement(statement);
    setCopyMpa(statement.mpa);
    setCopyCycleYear(new Date().getFullYear());
  }

  async function saveCopiedStatement() {
    if (!copyingStatement || !profile) return;
    setIsCopyingSaving(true);

    try {
      const { error } = await supabase.from("refined_statements").insert({
        user_id: profile.id,
        mpa: copyMpa,
        afsc: copyingStatement.afsc,
        rank: copyingStatement.rank,
        statement: copyingStatement.statement,
        cycle_year: copyCycleYear,
        is_favorite: false,
      } as never);

      if (error) throw error;

      toast.success("Statement saved to your library!");
      setCopyingStatement(null);
      loadStatements();
    } catch (error) {
      console.error("Copy error:", error);
      toast.error("Failed to save statement");
    } finally {
      setIsCopyingSaving(false);
    }
  }

  // Opens the copy dialog instead of immediately copying
  function copyToLibrary(statement: SharedStatementView | CommunityStatement) {
    openCopyDialog(statement);
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

  function getMpaLabel(key: string): string {
    return mgas.find((m) => m.key === key)?.label || key;
  }

  function filterStatements<T extends { mpa: string; afsc?: string; statement?: string; cycle_year?: number }>(
    statements: T[]
  ): T[] {
    return statements.filter((s) => {
      const matchesMpa = filterMpa === "all" || s.mpa === filterMpa;
      const matchesAfsc = filterAfsc === "all" || s.afsc === filterAfsc;
      const matchesCycle = filterCycleYear === "all" || s.cycle_year?.toString() === filterCycleYear;
      const text = s.statement || "";
      const matchesSearch = !searchQuery || text.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesMpa && matchesAfsc && matchesCycle && matchesSearch;
    });
  }

  // Get unique AFSCs from all statements
  const uniqueAfscs = Array.from(
    new Set([
      ...myStatements.map((s) => s.afsc).filter(Boolean),
      ...sharedStatements.map((s) => s.afsc).filter(Boolean),
      ...communityStatements.map((s) => s.afsc).filter(Boolean),
    ])
  ).sort();

  // Get unique cycle years from statements (only from my and shared - community doesn't have cycle_year)
  const uniqueCycleYears = Array.from(
    new Set([
      ...myStatements.map((s) => s.cycle_year).filter(Boolean),
      ...sharedStatements.map((s) => s.cycle_year).filter(Boolean),
    ])
  ).sort((a, b) => (b as number) - (a as number)); // Sort descending (newest first)

  const filteredMy = filterStatements(myStatements);
  const filteredShared = filterStatements(sharedStatements);
  // Community statements don't have cycle_year, so filter without it
  const filteredCommunity = communityStatements.filter((s) => {
    const matchesMpa = filterMpa === "all" || s.mpa === filterMpa;
    const matchesAfsc = filterAfsc === "all" || s.afsc === filterAfsc;
    const matchesSearch = !searchQuery || s.statement.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesMpa && matchesAfsc && matchesSearch;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Statement Library</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Your saved statements, shared statements, and community contributions
        </p>
      </div>

      {/* Filters */}
      <div className="w-full p-4 rounded-lg border bg-card">
        <div className="flex flex-col gap-3 sm:gap-4">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search statements..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-full"
              aria-label="Search statements"
            />
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-4 w-full sm:w-auto sm:flex">
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
              <SelectTrigger className="w-full sm:w-[120px]" aria-label="Filter by AFSC">
                <SelectValue placeholder="AFSC" />
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
            <Select value={filterCycleYear} onValueChange={setFilterCycleYear}>
              <SelectTrigger className="w-full sm:w-[100px]" aria-label="Filter by cycle year">
                <SelectValue placeholder="Cycle" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cycles</SelectItem>
                {uniqueCycleYears.map((year) => (
                  <SelectItem key={year} value={year!.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Tabs - Full width container */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-full">
        <TabsList className="w-full grid grid-cols-3 h-auto p-1">
          <TabsTrigger value="my" className="gap-1.5 sm:gap-2 text-xs sm:text-sm py-2">
            <BookMarked className="size-3.5 sm:size-4 shrink-0" />
            <span className="hidden sm:inline">My </span>Statements
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
              {myStatements.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="shared" className="gap-1.5 sm:gap-2 text-xs sm:text-sm py-2">
            <Share2 className="size-3.5 sm:size-4 shrink-0" />
            Shared
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
              {sharedStatements.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="community" className="gap-1.5 sm:gap-2 text-xs sm:text-sm py-2">
            <Globe className="size-3.5 sm:size-4 shrink-0" />
            Community
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
              {communityStatements.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* My Statements */}
        <TabsContent value="my" className="w-full mt-4 focus-visible:outline-none focus-visible:ring-0">
          <div className="w-full space-y-3">
            {filteredMy.length === 0 ? (
              <div className="w-full py-12 text-center text-muted-foreground text-sm sm:text-base rounded-lg border bg-card">
                No saved statements yet. Generate statements and save them to your library.
              </div>
            ) : (
              filteredMy.map((statement) => (
                <StatementCard
                  key={statement.id}
                  type="my"
                  statement={statement}
                  shares={myStatementShares[statement.id]}
                  mpaLabel={getMpaLabel(statement.mpa)}
                  onToggleFavorite={toggleFavorite}
                  onEdit={(s) => {
                    setEditingStatement(s);
                    setEditedText(s.statement);
                    setEditedMpa(s.mpa);
                    setEditedCycleYear(s.cycle_year);
                  }}
                  onShare={setSharingStatement}
                  onDelete={deleteStatement}
                />
              ))
            )}
          </div>
        </TabsContent>

        {/* Shared With Me */}
        <TabsContent value="shared" className="w-full mt-4 focus-visible:outline-none focus-visible:ring-0">
          <div className="w-full space-y-3">
            {filteredShared.length === 0 ? (
              <div className="w-full py-12 text-center text-muted-foreground text-sm sm:text-base rounded-lg border bg-card px-4">
                No statements have been shared with you yet.
                <br />
                <span className="text-xs">Ask team members to share their statements with you.</span>
              </div>
            ) : (
              filteredShared.map((statement) => (
                <StatementCard
                  key={`${statement.id}-${statement.share_id}`}
                  type="shared"
                  statement={statement}
                  mpaLabel={getMpaLabel(statement.mpa)}
                  onCopyToLibrary={copyToLibrary}
                  isCopying={copyingId === statement.id}
                />
              ))
            )}
          </div>
        </TabsContent>

        {/* Community */}
        <TabsContent value="community" className="w-full mt-4 focus-visible:outline-none focus-visible:ring-0">
          <div className="w-full space-y-3 sm:space-y-4">
            {!profile?.afsc ? (
              <div className="w-full py-12 text-center text-muted-foreground text-sm sm:text-base rounded-lg border bg-card px-4">
                Set your AFSC in settings to see community statements for your career field.
              </div>
            ) : filteredCommunity.length === 0 ? (
              <div className="w-full py-12 text-center text-muted-foreground text-sm sm:text-base rounded-lg border bg-card px-4">
                No community statements for {profile.afsc} yet. Be the first to contribute!
              </div>
            ) : (
              <>
                {/* Info banner */}
                <div className="w-full flex items-start sm:items-center gap-2 p-2.5 sm:p-3 rounded-lg bg-muted/50 text-xs sm:text-sm text-muted-foreground">
                  <Trophy className="size-4 text-yellow-500 shrink-0 mt-0.5 sm:mt-0" />
                  <span>Top 20 voted statements are used as examples when generating with Community style</span>
                </div>

                {filteredCommunity.map((statement, index) => (
                  <StatementCard
                    key={statement.id}
                    type="community"
                    statement={statement}
                    mpaLabel={getMpaLabel(statement.mpa)}
                    userVote={userVotes[statement.id]}
                    isVoting={votingId === statement.id}
                    isTopRated={index < 20}
                    rank={index}
                    onVote={voteOnStatement}
                    onCopyToLibrary={copyToLibrary}
                    isCopying={copyingId === statement.id}
                  />
                ))}
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={!!editingStatement} onOpenChange={() => setEditingStatement(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg mx-auto">
          <DialogHeader>
            <DialogTitle className="text-lg">Edit Statement</DialogTitle>
            <DialogDescription className="text-sm">
              Update your saved statement, MPA, and performance cycle
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* MPA and Cycle Year selectors */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="edit-mpa" className="text-sm">MPA</Label>
                <Select value={editedMpa} onValueChange={setEditedMpa}>
                  <SelectTrigger id="edit-mpa" className="w-full">
                    <SelectValue placeholder="Select MPA" />
                  </SelectTrigger>
                  <SelectContent>
                    {mgas.map((mpa) => (
                      <SelectItem key={mpa.key} value={mpa.key}>
                        {mpa.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-cycle" className="text-sm">Performance Cycle</Label>
                <Select 
                  value={editedCycleYear.toString()} 
                  onValueChange={(v) => setEditedCycleYear(parseInt(v))}
                >
                  <SelectTrigger id="edit-cycle" className="w-full">
                    <SelectValue placeholder="Select year" />
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
            </div>

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

      {/* Copy to Library Dialog */}
      <Dialog open={!!copyingStatement} onOpenChange={() => setCopyingStatement(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg mx-auto">
          <DialogHeader>
            <DialogTitle className="text-lg">Save to Your Library</DialogTitle>
            <DialogDescription className="text-sm">
              Choose the MPA and performance cycle for this statement
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Statement preview */}
            <div className="p-3 rounded-lg bg-muted/50 text-sm">
              {copyingStatement?.statement}
            </div>

            {/* MPA and Cycle Year selectors */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="copy-mpa" className="text-sm">MPA</Label>
                <Select value={copyMpa} onValueChange={setCopyMpa}>
                  <SelectTrigger id="copy-mpa" className="w-full">
                    <SelectValue placeholder="Select MPA" />
                  </SelectTrigger>
                  <SelectContent>
                    {mgas.map((mpa) => (
                      <SelectItem key={mpa.key} value={mpa.key}>
                        {mpa.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="copy-cycle" className="text-sm">Performance Cycle</Label>
                <Select 
                  value={copyCycleYear.toString()} 
                  onValueChange={(v) => setCopyCycleYear(parseInt(v))}
                >
                  <SelectTrigger id="copy-cycle" className="w-full">
                    <SelectValue placeholder="Select year" />
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
            </div>
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCopyingStatement(null)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={saveCopiedStatement} disabled={isCopyingSaving} className="w-full sm:w-auto">
              {isCopyingSaving ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Save to Library
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      <ShareStatementDialog
        statement={sharingStatement}
        open={!!sharingStatement}
        onOpenChange={() => setSharingStatement(null)}
        onSharesUpdated={loadStatements}
      />
    </div>
  );
}
