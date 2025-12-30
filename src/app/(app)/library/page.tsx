"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
import { MAX_STATEMENT_CHARACTERS, STANDARD_MGAS, RANKS, AWARD_1206_CATEGORIES } from "@/lib/constants";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Rank, StatementType, WinLevel } from "@/types/database";

const WIN_LEVELS: { value: WinLevel; label: string }[] = [
  { value: "squadron", label: "Squadron" },
  { value: "group", label: "Group" },
  { value: "wing", label: "Wing" },
  { value: "tenant_unit", label: "Tenant Unit" },
  { value: "haf", label: "HAF" },
];
import {
  Search,
  Loader2,
  Trophy,
  BookMarked,
  Share2,
  Globe,
  Plus,
  Combine,
  FileText,
  Award,
  Sparkles,
} from "lucide-react";
import { StatementCard } from "@/components/library/statement-card";
import { ShareStatementDialog } from "@/components/library/share-statement-dialog";
import { AddStatementDialog } from "@/components/library/add-statement-dialog";
import { StatementWorkspaceDialog } from "@/components/library/statement-workspace-dialog";
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
  const [filterStatementType, setFilterStatementType] = useState<string>("all");
  const [votingId, setVotingId] = useState<string | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  
  // Edit dialog - comprehensive state for all fields
  const [editingStatement, setEditingStatement] = useState<RefinedStatement | null>(null);
  const [editedText, setEditedText] = useState("");
  const [editedMpa, setEditedMpa] = useState("");
  const [editedCycleYear, setEditedCycleYear] = useState<number>(new Date().getFullYear());
  const [editedStatementType, setEditedStatementType] = useState<"epb" | "award">("epb");
  const [editedAfsc, setEditedAfsc] = useState("");
  const [editedRank, setEditedRank] = useState<string>("");
  const [editedApplicableMpas, setEditedApplicableMpas] = useState<string[]>([]);
  const [editedAwardCategory, setEditedAwardCategory] = useState("");
  const [editedIsWinningPackage, setEditedIsWinningPackage] = useState(false);
  const [editedWinLevel, setEditedWinLevel] = useState<string>("");
  const [editedUseAsLlmExample, setEditedUseAsLlmExample] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Copy dialog (for shared/community statements)
  const [copyingStatement, setCopyingStatement] = useState<SharedStatementView | CommunityStatement | null>(null);
  const [copyMpa, setCopyMpa] = useState("");
  const [copyCycleYear, setCopyCycleYear] = useState<number>(new Date().getFullYear());
  const [isCopyingSaving, setIsCopyingSaving] = useState(false);

  // Creator profiles for supervisor-created statements
  const [creatorProfiles, setCreatorProfiles] = useState<Record<string, { full_name: string | null; rank: string | null }>>({});

  // Share dialog
  const [sharingStatement, setSharingStatement] = useState<RefinedStatement | null>(null);

  // Add statement dialog
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  // Combine statements dialog
  const [isCombineDialogOpen, setIsCombineDialogOpen] = useState(false);

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

      const typedMyData = (myData as RefinedStatement[]) || [];
      setMyStatements(typedMyData);

      // Fetch creator profiles for supervisor-created statements
      const creatorIds = [...new Set(
        typedMyData
          .filter((s) => s.created_by && s.created_by !== s.user_id)
          .map((s) => s.created_by)
          .filter((id): id is string => id !== null)
      )];
      
      if (creatorIds.length > 0) {
        const { data: creators } = await supabase
          .from("profiles")
          .select("id, full_name, rank")
          .in("id", creatorIds);
        
        if (creators) {
          type CreatorProfile = { id: string; full_name: string | null; rank: string | null };
          const profileMap: Record<string, { full_name: string | null; rank: string | null }> = {};
          (creators as CreatorProfile[]).forEach((c) => {
            profileMap[c.id] = { full_name: c.full_name, rank: c.rank };
          });
          setCreatorProfiles(profileMap);
        }
      }

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

      // Source 2: Statements shared to community via sharing system (filtered by AFSC)
      let sharedCommunityData: SharedStatementView[] | null = null;
      if (profile.afsc) {
        const { data } = await supabase
          .from("shared_statements_view")
          .select("*")
          .eq("share_type", "community")
          .eq("afsc", profile.afsc)
          .order("created_at", { ascending: false });
        sharedCommunityData = data as SharedStatementView[];
      }

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
    
    // Validation
    if (!editedText.trim()) {
      toast.error("Statement text is required");
      return;
    }
    if (!editedAfsc) {
      toast.error("AFSC is required");
      return;
    }
    if (!editedRank) {
      toast.error("Rank is required");
      return;
    }
    if (editedStatementType === "epb" && editedApplicableMpas.length === 0) {
      toast.error("Please select at least one MPA");
      return;
    }
    if (editedStatementType === "award" && !editedAwardCategory) {
      toast.error("Please select an award category");
      return;
    }
    if (editedStatementType === "award" && editedIsWinningPackage && !editedWinLevel) {
      toast.error("Please select the win level");
      return;
    }

    setIsSaving(true);

    try {
      // Determine primary MPA
      const primaryMpa = editedStatementType === "epb" 
        ? (editedApplicableMpas[0] || editedMpa)
        : editedAwardCategory;

      const updateData = { 
        statement: editedText.trim(),
        mpa: primaryMpa,
        cycle_year: editedCycleYear,
        statement_type: editedStatementType as StatementType,
        afsc: editedAfsc.toUpperCase(),
        rank: editedRank as Rank,
        applicable_mpas: editedStatementType === "epb" ? editedApplicableMpas : [],
        award_category: editedStatementType === "award" ? editedAwardCategory : null,
        is_winning_package: editedStatementType === "award" ? editedIsWinningPackage : false,
        win_level: (editedStatementType === "award" && editedIsWinningPackage ? editedWinLevel : null) as WinLevel | null,
        use_as_llm_example: editedUseAsLlmExample,
      };

      await supabase
        .from("refined_statements")
        .update(updateData as never)
        .eq("id", editingStatement.id);

      setMyStatements((prev) =>
        prev.map((s) => (s.id === editingStatement.id ? { 
          ...s, 
          ...updateData,
        } as RefinedStatement : s))
      );

      toast.success("Statement updated");
      setEditingStatement(null);
    } catch (error) {
      console.error("Save error:", error);
      toast.error("Failed to update statement");
    } finally {
      setIsSaving(false);
    }
  }

  // Toggle MPA selection for edit dialog multi-select
  function toggleEditMpa(mpaKey: string) {
    setEditedApplicableMpas(prev => 
      prev.includes(mpaKey) 
        ? prev.filter(m => m !== mpaKey)
        : [...prev, mpaKey]
    );
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

  function filterStatements<T extends { mpa: string; afsc?: string; statement?: string; cycle_year?: number; statement_type?: string }>(
    statements: T[]
  ): T[] {
    return statements.filter((s) => {
      const matchesMpa = filterMpa === "all" || s.mpa === filterMpa;
      const matchesAfsc = filterAfsc === "all" || s.afsc === filterAfsc;
      const matchesCycle = filterCycleYear === "all" || s.cycle_year?.toString() === filterCycleYear;
      const matchesType = filterStatementType === "all" || (s.statement_type || "epb") === filterStatementType;
      const text = s.statement || "";
      const matchesSearch = !searchQuery || text.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesMpa && matchesAfsc && matchesCycle && matchesType && matchesSearch;
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

  // Calculate MPA-specific ranks for community statements
  // Each MPA has its own top 20
  const mpaRankMap = useMemo(() => {
    const rankMap = new Map<string, number>();
    
    // Group by MPA and sort each group by net votes
    const byMpa: Record<string, CommunityStatement[]> = {};
    communityStatements.forEach((s) => {
      if (!byMpa[s.mpa]) byMpa[s.mpa] = [];
      byMpa[s.mpa].push(s);
    });
    
    // For each MPA, sort by net votes and assign ranks
    Object.values(byMpa).forEach((statements) => {
      statements
        .map((s) => ({ ...s, netVotes: s.upvotes - (s.downvotes || 0) }))
        .sort((a, b) => b.netVotes - a.netVotes)
        .forEach((s, idx) => {
          rankMap.set(s.id, idx);
        });
    });
    
    return rankMap;
  }, [communityStatements]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Statement Library</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            onClick={() => setIsCombineDialogOpen(true)}
            className="gap-1.5"
            aria-label="Open statement workspace"
          >
            <Combine className="size-4" />
            <span className="hidden sm:inline">Workspace</span>
          </Button>
          <Button
            onClick={() => setIsAddDialogOpen(true)}
            className="gap-1.5"
            aria-label="Add statement"
          >
            <Plus className="size-4" />
            <span className="hidden sm:inline">Add</span>
          </Button>
        </div>
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 w-full sm:w-auto sm:flex">
            <Select value={filterStatementType} onValueChange={setFilterStatementType}>
              <SelectTrigger className="w-full sm:w-[110px]" aria-label="Filter by type">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="epb">EPB</SelectItem>
                <SelectItem value="award">Award</SelectItem>
              </SelectContent>
            </Select>
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
            <span className="hidden sm:inline">My </span>Library
            <Badge variant="secondary" className="ml-.5 h-5 px-1.5 text-xs">
              {myStatements.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="shared" className="gap-1.5 sm:gap-2 text-xs sm:text-sm py-2">
            <Share2 className="size-3.5 sm:size-4 shrink-0" />
            Shared
            <Badge variant="secondary" className=" h-5 px-1.5 text-xs">
              {sharedStatements.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="community" className="gap-1.5 sm:gap-2 text-xs sm:text-sm py-2">
            <Globe className="size-3.5 sm:size-4 shrink-0" />
            Community
            <Badge variant="secondary" className=" h-5 px-1.5 text-xs">
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
                  creatorInfo={statement.created_by && statement.created_by !== statement.user_id ? creatorProfiles[statement.created_by] : null}
                  mpaLabel={getMpaLabel(statement.mpa)}
                  onToggleFavorite={toggleFavorite}
                  onEdit={(s) => {
                    setEditingStatement(s);
                    setEditedText(s.statement);
                    setEditedMpa(s.mpa);
                    setEditedCycleYear(s.cycle_year);
                    setEditedStatementType(s.statement_type || "epb");
                    setEditedAfsc(s.afsc || "");
                    setEditedRank(s.rank || "");
                    setEditedApplicableMpas(s.applicable_mpas || [s.mpa]);
                    setEditedAwardCategory(s.award_category || "");
                    setEditedIsWinningPackage(s.is_winning_package || false);
                    setEditedWinLevel(s.win_level || "");
                    setEditedUseAsLlmExample(s.use_as_llm_example || false);
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
                No crowdsourced statements for {profile.afsc} yet. Share your statements with the community to contribute!
              </div>
            ) : (
              <>
                {/* Info banner */}
                <div className="w-full flex items-start sm:items-center gap-2 p-2.5 sm:p-3 rounded-lg bg-muted/50 text-xs sm:text-sm text-muted-foreground">
                  <Trophy className="size-4 text-yellow-500 shrink-0 mt-0.5 sm:mt-0" />
                  <span>Crowdsourced for {profile.afsc} — Each MPA has its own Top 20 used as examples when generating</span>
                </div>

                {filteredCommunity.map((statement) => {
                  const mpaRank = mpaRankMap.get(statement.id) ?? 999;
                  return (
                    <StatementCard
                      key={statement.id}
                      type="community"
                      statement={statement}
                      mpaLabel={getMpaLabel(statement.mpa)}
                      userVote={userVotes[statement.id]}
                      isVoting={votingId === statement.id}
                      isTopRated={mpaRank < 20}
                      rank={mpaRank}
                      onVote={voteOnStatement}
                      onCopyToLibrary={copyToLibrary}
                      isCopying={copyingId === statement.id}
                    />
                  );
                })}
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog - Comprehensive */}
      <Dialog open={!!editingStatement} onOpenChange={() => setEditingStatement(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg mx-auto h-[85vh] max-h-[85vh] p-0 gap-0 flex flex-col">
          <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b">
            <DialogTitle className="text-lg">Edit Statement</DialogTitle>
            <DialogDescription className="text-sm">
              Update all details for this statement
            </DialogDescription>
          </DialogHeader>
          
          {/* Scrollable content */}
          <ScrollArea className="flex-1 px-6 py-4">
            <div className="space-y-4 pb-2">
              {/* Statement Type Selector */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Statement Type</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditedStatementType("epb")}
                    className={cn(
                      "flex items-center gap-2 p-3 rounded-lg border text-left transition-colors",
                      editedStatementType === "epb"
                        ? "bg-primary/5 border-primary/30 ring-1 ring-primary/20"
                        : "bg-card hover:bg-muted/50"
                    )}
                  >
                    <FileText className={cn("size-5", editedStatementType === "epb" ? "text-primary" : "text-muted-foreground")} />
                    <div>
                      <div className="text-sm font-medium">EPB</div>
                      <div className="text-xs text-muted-foreground">Performance</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditedStatementType("award")}
                    className={cn(
                      "flex items-center gap-2 p-3 rounded-lg border text-left transition-colors",
                      editedStatementType === "award"
                        ? "bg-primary/5 border-primary/30 ring-1 ring-primary/20"
                        : "bg-card hover:bg-muted/50"
                    )}
                  >
                    <Award className={cn("size-5", editedStatementType === "award" ? "text-primary" : "text-muted-foreground")} />
                    <div>
                      <div className="text-sm font-medium">Award</div>
                      <div className="text-xs text-muted-foreground">1206</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Statement Textarea */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="edit-text" className="text-sm font-medium">Statement</Label>
                  <span className={cn("text-xs", getCharacterCountColor(editedText.length, maxChars))}>
                    {editedText.length}/{maxChars}
                  </span>
                </div>
                <Textarea
                  id="edit-text"
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  rows={5}
                  className="resize-none text-sm"
                  aria-label="Edit statement text"
                />
              </div>

              {/* Type-specific options */}
              {editedStatementType === "epb" ? (
                <>
                  {/* MPA Multi-Select */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">
                      Applicable MPAs
                      <span className="text-xs text-muted-foreground ml-1">(select all that apply)</span>
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {mgas.filter(m => m.key !== "hlr_assessment").map((mpa) => (
                        <button
                          key={mpa.key}
                          type="button"
                          onClick={() => toggleEditMpa(mpa.key)}
                          className={cn(
                            "px-3 py-1.5 text-xs font-medium rounded-full border transition-colors",
                            editedApplicableMpas.includes(mpa.key)
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-muted/50 hover:bg-muted border-border"
                          )}
                        >
                          {mpa.label}
                        </button>
                      ))}
                    </div>
                    {editedApplicableMpas.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {editedApplicableMpas.length} MPA{editedApplicableMpas.length !== 1 ? "s" : ""} selected
                      </p>
                    )}
                  </div>

                  {/* EPB Details Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="edit-cycle" className="text-sm">Cycle Year</Label>
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
                    <div className="space-y-2">
                      <Label htmlFor="edit-rank" className="text-sm">Rank</Label>
                      <Select value={editedRank} onValueChange={setEditedRank}>
                        <SelectTrigger id="edit-rank" className="w-full">
                          <SelectValue placeholder="Select rank" />
                        </SelectTrigger>
                        <SelectContent>
                          {RANKS.map((rank) => (
                            <SelectItem key={rank.value} value={rank.value}>
                              {rank.value}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="edit-afsc" className="text-sm">AFSC</Label>
                      <Input
                        id="edit-afsc"
                        value={editedAfsc}
                        onChange={(e) => setEditedAfsc(e.target.value.toUpperCase())}
                        placeholder="e.g., 1A8X2"
                        className="uppercase"
                        aria-label="AFSC"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Award Category */}
                  <div className="space-y-2">
                    <Label htmlFor="edit-award-category" className="text-sm font-medium">1206 Category</Label>
                    <Select value={editedAwardCategory} onValueChange={setEditedAwardCategory}>
                      <SelectTrigger id="edit-award-category" className="w-full">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {AWARD_1206_CATEGORIES.map((cat) => (
                          <SelectItem key={cat.key} value={cat.key}>
                            {cat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Winning Package Toggle */}
                  <label
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                      editedIsWinningPackage
                        ? "bg-amber-50 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800"
                        : "bg-card hover:bg-muted/50"
                    )}
                  >
                    <Checkbox
                      checked={editedIsWinningPackage}
                      onCheckedChange={(checked) => {
                        setEditedIsWinningPackage(!!checked);
                        if (!checked) setEditedWinLevel("");
                      }}
                      aria-label="Part of winning package"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Trophy className={cn("size-4", editedIsWinningPackage ? "text-amber-600" : "text-muted-foreground")} />
                        <span className="text-sm font-medium">Part of Winning Package</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        This statement was used in an award package that won
                      </p>
                    </div>
                  </label>

                  {/* Win Level */}
                  {editedIsWinningPackage && (
                    <div className="space-y-2 ml-8">
                      <Label htmlFor="edit-win-level" className="text-sm">Win Level</Label>
                      <Select value={editedWinLevel} onValueChange={setEditedWinLevel}>
                        <SelectTrigger id="edit-win-level" className="w-full">
                          <SelectValue placeholder="Select level" />
                        </SelectTrigger>
                        <SelectContent>
                          {WIN_LEVELS.map((level) => (
                            <SelectItem key={level.value} value={level.value}>
                              {level.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Award Details Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="edit-rank-award" className="text-sm">Rank</Label>
                      <Select value={editedRank} onValueChange={setEditedRank}>
                        <SelectTrigger id="edit-rank-award" className="w-full">
                          <SelectValue placeholder="Select rank" />
                        </SelectTrigger>
                        <SelectContent>
                          {RANKS.map((rank) => (
                            <SelectItem key={rank.value} value={rank.value}>
                              {rank.value}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-afsc-award" className="text-sm">AFSC</Label>
                      <Input
                        id="edit-afsc-award"
                        value={editedAfsc}
                        onChange={(e) => setEditedAfsc(e.target.value.toUpperCase())}
                        placeholder="e.g., 1A8X2"
                        className="uppercase"
                        aria-label="AFSC"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Use as AI Example Toggle */}
              <label
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                  editedUseAsLlmExample
                    ? "bg-violet-50 dark:bg-violet-950/20 border-violet-300 dark:border-violet-800"
                    : "bg-card hover:bg-muted/50"
                )}
              >
                <Checkbox
                  checked={editedUseAsLlmExample}
                  onCheckedChange={(checked) => setEditedUseAsLlmExample(!!checked)}
                  aria-label="Use as AI example"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Sparkles className={cn("size-4", editedUseAsLlmExample ? "text-violet-600" : "text-muted-foreground")} />
                    <span className="text-sm font-medium">Include in AI Prompt as Example</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Use this statement as an example when generating new {editedStatementType === "epb" ? "EPB" : "award"} statements
                  </p>
                </div>
              </label>
            </div>
          </ScrollArea>

          {/* Fixed Footer */}
          <div className="shrink-0 px-6 py-4 border-t bg-background flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setEditingStatement(null)} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button onClick={saveEditedStatement} disabled={isSaving} className="w-full sm:w-auto">
              {isSaving ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </div>
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

      {/* Add Statement Dialog */}
      <AddStatementDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onStatementAdded={loadStatements}
      />

      {/* Statement Workspace Dialog */}
      <StatementWorkspaceDialog
        open={isCombineDialogOpen}
        onOpenChange={setIsCombineDialogOpen}
        onStatementSaved={loadStatements}
        myStatements={myStatements}
        sharedStatements={sharedStatements}
        communityStatements={communityStatements}
      />
    </div>
  );
}
