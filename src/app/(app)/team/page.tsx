"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import {
  Users,
  UserPlus,
  User,
  Check,
  X,
  Loader2,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Clock,
  Send,
  UserX,
  MoreHorizontal,
  Archive,
  Trash2,
  Info,
  Calendar,
  History,
  Trophy,
  Medal,
  Plus,
  Pencil,
  FileText,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Profile, TeamRequest, TeamRequestType, Rank, ManagedMember, Award, AwardRequest } from "@/types/database";
import { AddManagedMemberDialog } from "@/components/team/add-managed-member-dialog";
import { EditManagedMemberDialog } from "@/components/team/edit-managed-member-dialog";
import { AddAwardDialog } from "@/components/team/add-award-dialog";
import { AwardBadges } from "@/components/team/award-badges";
import { AwardsPanel } from "@/components/team/awards-panel";
import { AwardRequestsPanel } from "@/components/team/award-requests-panel";
import { MemberStatementsDialog } from "@/components/team/member-statements-dialog";
import { 
  MPA_ABBREVIATIONS, 
  STANDARD_MGAS, 
  getDaysUntilCloseout, 
  getStaticCloseoutDate,
  ENTRY_MGAS,
} from "@/lib/constants";

// Ranks that can supervise others
const SUPERVISOR_RANKS: Rank[] = ["SSgt", "TSgt", "MSgt", "SMSgt", "CMSgt"];
const RANK_ORDER = ["CMSgt", "SMSgt", "MSgt", "TSgt", "SSgt", "SrA", "A1C", "Amn", "AB"];
const STORAGE_KEY = "chain-rank-colors";

// Metrics for a member
interface MemberMetrics {
  entries: Record<string, number>; // MPA key -> count
  statements: Record<string, number>; // MPA key -> count
}

interface ChainMember extends Profile {
  depth: number;
  directSubordinates?: Profile[];
}

// Combined node type for tree that can be either a Profile or ManagedMember
interface TreeNodeData {
  id: string;
  full_name: string | null;
  rank: Rank | null;
  afsc: string | null;
  unit: string | null;
  isManagedMember: boolean;
  isPlaceholder?: boolean;
  email?: string | null;
  member_status?: "active" | "prior_subordinate" | "archived" | "pending_link";
  supervision_start_date?: string | null;
  supervision_end_date?: string | null;
  // For managed members: who created this record (may be different from parent)
  createdBy?: string | null;
  createdByName?: string | null;
}

interface TreeNode {
  data: TreeNodeData;
  children: TreeNode[];
  isExpanded: boolean;
}

type RankColors = Record<string, string>;

function canSupervise(rank: Rank | null | undefined): boolean {
  return rank !== null && rank !== undefined && SUPERVISOR_RANKS.includes(rank);
}

function calculateDaysSupervised(startDate: string | null | undefined, endDate: string | null | undefined): number {
  if (!startDate) return 0;
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : new Date();
  const diffTime = Math.abs(end.getTime() - start.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function formatDaysSupervised(days: number): string {
  if (days === 0) return "0 days";
  if (days === 1) return "1 day";
  if (days < 30) return `${days} days`;
  if (days < 365) {
    const months = Math.floor(days / 30);
    return months === 1 ? "1 month" : `${months} months`;
  }
  const years = Math.floor(days / 365);
  const remainingMonths = Math.floor((days % 365) / 30);
  if (remainingMonths === 0) return years === 1 ? "1 year" : `${years} years`;
  return `${years}y ${remainingMonths}m`;
}

export default function TeamPage() {
  const { profile, subordinates, setSubordinates, managedMembers, removeManagedMember, epbConfig } = useUserStore();
  const [isLoading, setIsLoading] = useState(true);
  const [supervisors, setSupervisors] = useState<Profile[]>([]);
  const [pendingRequests, setPendingRequests] = useState<TeamRequest[]>([]);
  const [memberMetrics, setMemberMetrics] = useState<Record<string, MemberMetrics>>({});
  const [sentRequests, setSentRequests] = useState<TeamRequest[]>([]);
  const [subordinateChain, setSubordinateChain] = useState<ChainMember[]>([]);
  
  // Tree visualization state (from chain page)
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [teamRelations, setTeamRelations] = useState<{ supervisor_id: string; subordinate_id: string }[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [rankColors, setRankColors] = useState<RankColors>({});
  
  // Invite dialog state
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showAddMemberDialog, setShowAddMemberDialog] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  // Default to "be_supervised" for junior enlisted who can't supervise
  const [inviteType, setInviteType] = useState<TeamRequestType>(
    canSupervise(profile?.rank) ? "supervise" : "be_supervised"
  );
  const [inviteMessage, setInviteMessage] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [respondingToRequest, setRespondingToRequest] = useState<string | null>(null);
  const [searchedProfile, setSearchedProfile] = useState<Profile | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  
  // Member removal confirmation state
  const [confirmDeleteMember, setConfirmDeleteMember] = useState<{ 
    id: string; 
    name: string; 
    type: "managed" | "real" | "prior_subordinate";
    isSupervisor?: boolean;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteWithData, setDeleteWithData] = useState(false);
  
  // Subordinate details dialog state
  const [selectedSubordinate, setSelectedSubordinate] = useState<{
    id: string;
    name: string;
    rank: Rank | null;
    afsc: string | null;
    unit: string | null;
    email: string | null;
    isManagedMember: boolean;
    supervision_start_date: string | null;
    supervision_end_date: string | null;
  } | null>(null);
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [isSavingDates, setIsSavingDates] = useState(false);
  const [subordinateStatements, setSubordinateStatements] = useState<{
    mpa: string;
    statement: string;
    created_by: string | null;
  }[]>([]);
  const [loadingStatements, setLoadingStatements] = useState(false);
  
  // Real subordinate supervision dates (from teams table)
  const [teamSupervisionDates, setTeamSupervisionDates] = useState<Record<string, {
    start: string | null;
    end: string | null;
  }>>({});
  
  // Supervision history state
  const [subordinateHistory, setSubordinateHistory] = useState<{
    id: string;
    relationship_type: string;
    member_id: string | null;
    team_member_id: string | null;
    member_name: string;
    member_rank: string | null;
    supervision_start_date: string | null;
    supervision_end_date: string | null;
    status: string;
  }[]>([]);
  const [mySupervisionHistory, setMySupervisionHistory] = useState<{
    id: string;
    supervisor_name: string;
    supervisor_rank: string | null;
    supervision_start_date: string | null;
    supervision_end_date: string | null;
    status: string;
  }[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Awards state
  const [awards, setAwards] = useState<Award[]>([]);
  const [pendingAwardRequests, setPendingAwardRequests] = useState<AwardRequest[]>([]);
  const [isLoadingAwards, setIsLoadingAwards] = useState(false);
  const [showAddAwardDialog, setShowAddAwardDialog] = useState(false);
  const [awardRecipient, setAwardRecipient] = useState<{
    profileId?: string;
    teamMemberId?: string;
    name: string;
  } | null>(null);
  
  // Edit managed member state
  const [editManagedMember, setEditManagedMember] = useState<ManagedMember | null>(null);

  const supabase = createClient();

  // Load rank colors from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setRankColors(JSON.parse(stored));
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  // Save rank colors to localStorage whenever they change
  const updateRankColor = useCallback((rank: string, color: string | null) => {
    setRankColors((prev) => {
      const next = { ...prev };
      if (color) {
        next[rank] = color;
      } else {
        delete next[rank];
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    if (profile) {
      loadTeamData();
    }
  }, [profile]);

  async function loadTeamData() {
    if (!profile) return;
    setIsLoading(true);

    try {
      // Load supervisors (people I report to)
      const { data: supervisorTeams } = await supabase
        .from("teams")
        .select("supervisor_id")
        .eq("subordinate_id", profile.id);

      if (supervisorTeams && supervisorTeams.length > 0) {
        const supervisorIds = (supervisorTeams as { supervisor_id: string }[]).map((t) => t.supervisor_id);
        const { data: supervisorProfiles } = await supabase
          .from("profiles")
          .select("*")
          .in("id", supervisorIds);
        setSupervisors((supervisorProfiles as Profile[]) || []);
      }

      // Load pending requests (where I'm the target)
      const { data: incoming } = await supabase
        .from("team_requests")
        .select(`
          *,
          requester:profiles!team_requests_requester_id_fkey(*)
        `)
        .eq("target_id", profile.id)
        .eq("status", "pending");

      setPendingRequests((incoming as TeamRequest[]) || []);

      // Load sent requests
      const { data: outgoing } = await supabase
        .from("team_requests")
        .select(`
          *,
          target:profiles!team_requests_target_id_fkey(*)
        `)
        .eq("requester_id", profile.id)
        .eq("status", "pending");

      setSentRequests((outgoing as TeamRequest[]) || []);

      // Load subordinate chain for tree visualization
      await loadSubordinateChain();
      
      // Load supervision dates for real subordinates
      await loadTeamSupervisionDates();

    } catch (error) {
      console.error("Error loading team data:", error);
      toast.error("Failed to load team data");
    } finally {
      setIsLoading(false);
    }
  }
  
  async function loadTeamSupervisionDates() {
    if (!profile) return;
    
    const { data, error } = await supabase
      .from("teams")
      .select("subordinate_id, supervision_start_date, supervision_end_date")
      .eq("supervisor_id", profile.id);
    
    if (!error && data) {
      const dates: Record<string, { start: string | null; end: string | null }> = {};
      const typedData = data as unknown as Array<{
        subordinate_id: string;
        supervision_start_date: string | null;
        supervision_end_date: string | null;
      }>;
      for (const team of typedData) {
        dates[team.subordinate_id] = {
          start: team.supervision_start_date,
          end: team.supervision_end_date,
        };
      }
      setTeamSupervisionDates(dates);
    }
  }

  async function loadSubordinateChain() {
    if (!profile) return;

    // Get chain using the database function
    const { data: chainData } = await (supabase.rpc as Function)("get_subordinate_chain", {
      supervisor_uuid: profile.id,
    }) as { data: { subordinate_id: string; depth: number }[] | null };

    if (chainData && chainData.length > 0) {
      const subordinateIds = chainData.map((c: { subordinate_id: string }) => c.subordinate_id);
      const allChainIds = [...subordinateIds, profile.id];
      
      // Get all profiles in the chain plus myself
      const { data: profiles } = await supabase
        .from("profiles")
        .select("*")
        .in("id", allChainIds);

      if (profiles) {
        setAllProfiles((profiles as Profile[]) || [profile]);
        
        const chainMembers: ChainMember[] = profiles.map((p: Profile) => ({
          ...p,
          depth: p.id === profile.id ? 0 : (chainData.find((c: { subordinate_id: string; depth: number }) => c.subordinate_id === p.id)?.depth || 1),
        }));
        setSubordinateChain(chainMembers.sort((a, b) => a.depth - b.depth));
      }
      
      // Get all team relationships where supervisor is in our chain
      const { data: teams } = await supabase
        .from("teams")
        .select("supervisor_id, subordinate_id")
        .in("supervisor_id", allChainIds);

      setTeamRelations(teams || []);
      
      // Expand the root node by default
      setExpandedNodes(new Set([profile.id]));
    } else {
      setAllProfiles([profile]);
      setTeamRelations([]);
      setSubordinateChain([]);
      setExpandedNodes(new Set([profile.id]));
    }
  }

  // Load metrics (entry and statement counts) for all members
  async function loadMemberMetrics() {
    if (!profile) return;

    const cycleYear = epbConfig?.current_cycle_year || new Date().getFullYear();
    const metrics: Record<string, MemberMetrics> = {};

    // Collect all member IDs (profiles + managed members)
    const allMemberIds = [
      profile.id,
      ...subordinates.map((s) => s.id),
      ...managedMembers.map((m) => m.id),
    ];

    // Initialize metrics for all members (including HLR)
    for (const id of allMemberIds) {
      metrics[id] = {
        entries: { executing_mission: 0, leading_people: 0, managing_resources: 0, improving_unit: 0, hlr_assessment: 0 },
        statements: { executing_mission: 0, leading_people: 0, managing_resources: 0, improving_unit: 0, hlr_assessment: 0 },
      };
    }

    try {
      // Fetch accomplishments for all members in current cycle
      const { data: accomplishments } = await supabase
        .from("accomplishments")
        .select("user_id, mpa")
        .in("user_id", allMemberIds)
        .eq("cycle_year", cycleYear) as { data: { user_id: string; mpa: string }[] | null };

      if (accomplishments) {
        for (const acc of accomplishments) {
          if (metrics[acc.user_id] && metrics[acc.user_id].entries[acc.mpa] !== undefined) {
            metrics[acc.user_id].entries[acc.mpa]++;
          }
        }
      }

      // Fetch refined statements for all members in current cycle
      const { data: statements } = await supabase
        .from("refined_statements")
        .select("user_id, mpa")
        .in("user_id", allMemberIds)
        .eq("cycle_year", cycleYear) as { data: { user_id: string; mpa: string }[] | null };

      if (statements) {
        for (const stmt of statements) {
          if (metrics[stmt.user_id] && metrics[stmt.user_id].statements[stmt.mpa] !== undefined) {
            metrics[stmt.user_id].statements[stmt.mpa]++;
          }
        }
      }

      setMemberMetrics(metrics);
    } catch (error) {
      console.error("Error loading member metrics:", error);
    }
  }

  // Load metrics when subordinates or managed members change
  useEffect(() => {
    if (profile && !isLoading) {
      loadMemberMetrics();
    }
  }, [profile, subordinates, managedMembers, epbConfig, isLoading]);

  // Collect unique creator IDs from managed members for profile lookup
  const creatorIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of managedMembers) {
      if (m.supervisor_id && m.supervisor_id !== profile?.id) {
        ids.add(m.supervisor_id);
      }
    }
    return Array.from(ids);
  }, [managedMembers, profile?.id]);

  // Fetch creator profiles that might not be in allProfiles
  const [creatorProfiles, setCreatorProfiles] = useState<Record<string, Profile>>({});
  
  useEffect(() => {
    async function fetchCreatorProfiles() {
      if (!profile || creatorIds.length === 0) return;
      
      // Filter out IDs we already have
      const existingIds = new Set([
        profile.id,
        ...allProfiles.map(p => p.id),
        ...subordinates.map(s => s.id),
      ]);
      
      const missingIds = creatorIds.filter(id => !existingIds.has(id));
      if (missingIds.length === 0) return;
      
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, rank")
        .in("id", missingIds);
      
      if (data) {
        const newCreators: Record<string, Profile> = {};
        for (const p of data as Profile[]) {
          newCreators[p.id] = p;
        }
        setCreatorProfiles(prev => ({ ...prev, ...newCreators }));
      }
    }
    
    fetchCreatorProfiles();
  }, [creatorIds, profile, allProfiles, subordinates, supabase]);

  // Build tree structure that includes both real profiles and managed members
  const tree = useMemo(() => {
    if (!profile || allProfiles.length === 0) return null;

    // Build a lookup map of profile IDs to names for showing "created by" info
    // Include: current user, all profiles in chain, direct subordinates, and fetched creators
    const profileNameMap: Record<string, string> = {};
    
    // Add current user
    profileNameMap[profile.id] = `${profile.rank || ""} ${profile.full_name || "You"}`.trim();
    
    // Add all profiles from subordinate chain
    for (const p of allProfiles) {
      profileNameMap[p.id] = `${p.rank || ""} ${p.full_name || "Unknown"}`.trim();
    }
    
    // Add direct subordinates (in case they're not in allProfiles yet)
    for (const s of subordinates) {
      if (!profileNameMap[s.id]) {
        profileNameMap[s.id] = `${s.rank || ""} ${s.full_name || "Unknown"}`.trim();
      }
    }
    
    // Add fetched creator profiles
    for (const [id, p] of Object.entries(creatorProfiles)) {
      if (!profileNameMap[id]) {
        profileNameMap[id] = `${p.rank || ""} ${p.full_name || "Unknown"}`.trim();
      }
    }

    const buildTree = (nodeId: string, isManaged = false): TreeNode | null => {
      // Find the node data (either profile or managed member)
      let nodeData: TreeNodeData | null = null;
      
      if (isManaged) {
        const member = managedMembers.find((m) => m.id === nodeId);
        if (!member) return null;
        
        // Determine creator name - only show if different from current user
        const createdByMe = member.supervisor_id === profile.id;
        const creatorName = createdByMe ? null : profileNameMap[member.supervisor_id] || "Unknown";
        
        nodeData = {
          id: member.id,
          full_name: member.full_name,
          rank: member.rank,
          afsc: member.afsc,
          unit: member.unit,
          isManagedMember: true,
          isPlaceholder: member.is_placeholder,
          email: member.email,
          member_status: member.member_status,
          supervision_start_date: member.supervision_start_date,
          supervision_end_date: member.supervision_end_date,
          createdBy: createdByMe ? null : member.supervisor_id,
          createdByName: creatorName,
        };
      } else {
        const nodeProfile = allProfiles.find((p) => p.id === nodeId);
        if (!nodeProfile) return null;
        const dates = teamSupervisionDates[nodeProfile.id];
        nodeData = {
          id: nodeProfile.id,
          full_name: nodeProfile.full_name,
          rank: nodeProfile.rank,
          afsc: nodeProfile.afsc,
          unit: nodeProfile.unit,
          isManagedMember: false,
          supervision_start_date: dates?.start || null,
          supervision_end_date: dates?.end || null,
        };
      }

      // Get children: real subordinates from teams table (only for profile nodes)
      let realChildren: TreeNode[] = [];
      if (!isManaged) {
        const realChildIds = teamRelations
          .filter((r) => r.supervisor_id === nodeId)
          .map((r) => r.subordinate_id);

        realChildren = realChildIds
          .map((id) => buildTree(id, false))
          .filter((n): n is TreeNode => n !== null);
      }

      // Get children: managed members that report to this node
      // Check both parent_profile_id (for profile parents) and parent_team_member_id (for managed parents)
      const managedChildIds = managedMembers
        .filter((m) => {
          if (isManaged) {
            // If current node is a managed member, check parent_team_member_id
            return m.parent_team_member_id === nodeId;
          } else {
            // If current node is a profile, check parent_profile_id
            return m.parent_profile_id === nodeId;
          }
        })
        .map((m) => m.id);

      const managedChildren = managedChildIds
        .map((id) => buildTree(id, true))
        .filter((n): n is TreeNode => n !== null);

      // Combine children: real subordinates first, then managed members
      const allChildren = [...realChildren, ...managedChildren];

      return {
        data: nodeData,
        children: allChildren,
        isExpanded: expandedNodes.has(nodeId),
      };
    };

    return buildTree(profile.id, false);
  }, [profile, allProfiles, teamRelations, managedMembers, expandedNodes, teamSupervisionDates, subordinates, creatorProfiles]);

  function toggleExpand(nodeId: string) {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }

  // Returns inline style object for custom colors
  function getRankStyle(rank: string | null): React.CSSProperties {
    const color = rankColors[rank || ""];
    if (!color) return {};
    return {
      backgroundColor: `${color}20`,
      borderColor: color,
    };
  }

  function hasCustomColor(rank: string | null): boolean {
    return Boolean(rankColors[rank || ""]);
  }

  // Stats for the chain
  const stats = useMemo(() => {
    const rankCounts: Record<string, number> = {};
    allProfiles.forEach((p) => {
      if (p.id !== profile?.id) {
        const rank = p.rank || "Unknown";
        rankCounts[rank] = (rankCounts[rank] || 0) + 1;
      }
    });
    return rankCounts;
  }, [allProfiles, profile]);

  async function searchProfile() {
    if (!inviteEmail.trim()) return;
    setIsSearching(true);
    setSearchedProfile(null);

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("email", inviteEmail.trim().toLowerCase())
        .single();

      if (error || !data) {
        toast.error("No user found with that email");
      } else {
        setSearchedProfile(data as Profile);
      }
    } catch {
      toast.error("Error searching for user");
    } finally {
      setIsSearching(false);
    }
  }

  async function sendRequest() {
    if (!profile || !searchedProfile) return;
    setIsInviting(true);

    try {
      const { error } = await supabase.from("team_requests").insert({
        requester_id: profile.id,
        target_id: searchedProfile.id,
        request_type: inviteType,
        message: inviteMessage || null,
      } as never);

      if (error) {
        if (error.code === "23505") {
          toast.error("A pending request already exists");
        } else {
          throw error;
        }
      } else {
        toast.success("Request sent successfully!");
        setShowInviteDialog(false);
        setInviteEmail("");
        setInviteMessage("");
        setSearchedProfile(null);
        loadTeamData();
      }
    } catch (error) {
      console.error("Error sending request:", error);
      toast.error("Failed to send request");
    } finally {
      setIsInviting(false);
    }
  }

  async function respondToRequest(requestId: string, accept: boolean) {
    if (respondingToRequest) return; // Prevent double-clicks
    
    try {
      setRespondingToRequest(requestId);
      
      const request = pendingRequests.find((r) => r.id === requestId);
      if (!request || !profile) return;

      // Update request status first
      const { error: updateError } = await supabase
        .from("team_requests")
        .update({
          status: accept ? "accepted" : "declined",
          responded_at: new Date().toISOString(),
        } as never)
        .eq("id", requestId);

      if (updateError) {
        console.error("Request update error:", updateError);
        toast.error("Failed to update request: " + updateError.message);
        return;
      }

      // If accepted, create the team relationship
      if (accept) {
        const supervisorId = request.request_type === "supervise" 
          ? request.requester_id  // Requester wants to supervise me
          : profile.id;          // Requester wants me to supervise them
        const subordinateId = request.request_type === "supervise"
          ? profile.id           // I become the subordinate
          : request.requester_id; // Requester becomes the subordinate

        // Use upsert with conflict handling to avoid duplicate key errors
        // If the relationship already exists, this will simply succeed without error
        const { error: teamError } = await supabase.from("teams").upsert(
          {
            supervisor_id: supervisorId,
            subordinate_id: subordinateId,
          } as never,
          { 
            onConflict: 'supervisor_id,subordinate_id',
            ignoreDuplicates: true 
          }
        );

        if (teamError) {
          console.error("Team upsert error:", teamError);
          toast.error("Failed to create team relationship: " + teamError.message);
          return;
        }

        toast.success("Request accepted! Team relationship created.");
      } else {
        toast.success("Request declined.");
      }

      // Reload team data to refresh the pending requests list
      await loadTeamData();
    } catch (error) {
      console.error("Error responding to request:", error);
      toast.error("Failed to respond to request");
    } finally {
      setRespondingToRequest(null);
    }
  }

  async function cancelRequest(requestId: string) {
    try {
      await supabase
        .from("team_requests")
        .delete()
        .eq("id", requestId);

      toast.success("Request cancelled");
      loadTeamData();
    } catch (error) {
      toast.error("Failed to cancel request");
    }
  }

  async function removeTeamMember(memberId: string, isSupervisor: boolean) {
    if (!profile) return;

    try {
      if (isSupervisor) {
        // Remove me from their team
        await supabase
          .from("teams")
          .delete()
          .eq("supervisor_id", memberId)
          .eq("subordinate_id", profile.id);
      } else {
        // Remove them from my team
        await supabase
          .from("teams")
          .delete()
          .eq("supervisor_id", profile.id)
          .eq("subordinate_id", memberId);
      }

      toast.success("Team member removed");
      loadTeamData();
      
      // Update local state immediately
      if (isSupervisor) {
        setSupervisors(supervisors.filter((s) => s.id !== memberId));
      } else {
        setSubordinates(subordinates.filter((s) => s.id !== memberId));
      }
    } catch (error) {
      toast.error("Failed to remove team member");
    }
  }

  async function removeManagedTeamMember(memberId: string) {
    try {
      await supabase
        .from("team_members")
        .delete()
        .eq("id", memberId);

      removeManagedMember(memberId);
      toast.success("Team member removed");
    } catch (error) {
      toast.error("Failed to remove team member");
    }
  }

  async function archivePriorSubordinate(memberId: string) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)("archive_prior_subordinate", {
        team_member_id: memberId,
      });

      if (error) throw error;

      // Update local state
      const updatedMembers = managedMembers.map((m) =>
        m.id === memberId ? { ...m, member_status: "archived" as const } : m
      );
      useUserStore.getState().setManagedMembers(updatedMembers);
      toast.success("Member archived");
    } catch (error) {
      console.error("Error archiving member:", error);
      toast.error("Failed to archive member");
    }
  }

  async function deletePriorSubordinate(memberId: string, deleteData: boolean) {
    setIsDeleting(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("delete_prior_subordinate", {
        p_team_member_id: memberId,
        p_delete_data: deleteData,
      });

      if (error) throw error;

      removeManagedMember(memberId);
      
      const result = data as { entries_deleted?: number; statements_deleted?: number };
      if (deleteData && (result.entries_deleted || result.statements_deleted)) {
        toast.success(`Deleted ${result.entries_deleted || 0} entries and ${result.statements_deleted || 0} statements`);
      } else {
        toast.success("Member removed");
      }
      
      setConfirmDeleteMember(null);
      setDeleteWithData(false);
    } catch (error) {
      console.error("Error deleting member:", error);
      toast.error("Failed to delete member");
    } finally {
      setIsDeleting(false);
    }
  }

  async function saveSupervisionDates() {
    if (!selectedSubordinate) return;
    
    setIsSavingDates(true);
    try {
      const startDate = editStartDate || null;
      const endDate = editEndDate || null;
      
      if (selectedSubordinate.isManagedMember) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.rpc as any)("update_managed_member_dates", {
          p_team_member_id: selectedSubordinate.id,
          p_start_date: startDate,
          p_end_date: endDate,
        });
        if (error) throw error;
        
        // Update local state
        const updatedMembers = managedMembers.map((m) =>
          m.id === selectedSubordinate.id 
            ? { ...m, supervision_start_date: startDate, supervision_end_date: endDate } 
            : m
        );
        useUserStore.getState().setManagedMembers(updatedMembers);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.rpc as any)("update_supervision_dates", {
          p_subordinate_id: selectedSubordinate.id,
          p_start_date: startDate,
          p_end_date: endDate,
        });
        if (error) throw error;
        
        // Update local state for real subordinates
        setTeamSupervisionDates(prev => ({
          ...prev,
          [selectedSubordinate.id]: { start: startDate, end: endDate }
        }));
      }
      
      toast.success("Supervision dates updated");
      setSelectedSubordinate(null);
    } catch (error) {
      console.error("Error saving dates:", error);
      toast.error("Failed to update supervision dates");
    } finally {
      setIsSavingDates(false);
    }
  }

  async function openSubordinateDetails(node: TreeNodeData) {
    const cycleYear = epbConfig?.current_cycle_year || new Date().getFullYear();
    
    // Set initial values from local data
    setSelectedSubordinate({
      id: node.id,
      name: node.full_name || "Unknown",
      rank: node.rank,
      afsc: node.afsc,
      unit: node.unit,
      email: node.email || null,
      isManagedMember: node.isManagedMember,
      supervision_start_date: node.supervision_start_date || null,
      supervision_end_date: node.supervision_end_date || null,
    });
    
    // Load statements for this subordinate
    setLoadingStatements(true);
    setSubordinateStatements([]);
    
    try {
      let stmtQuery = supabase
        .from("refined_statements")
        .select("mpa, statement, created_by")
        .eq("cycle_year", cycleYear)
        .eq("statement_type", "epb");
      
      if (node.isManagedMember) {
        stmtQuery = stmtQuery.eq("team_member_id", node.id);
      } else {
        stmtQuery = stmtQuery.eq("user_id", node.id);
      }
      
      const { data: stmtData } = await stmtQuery;
      if (stmtData) {
        setSubordinateStatements(stmtData);
      }
    } catch (error) {
      console.error("Error loading statements:", error);
    } finally {
      setLoadingStatements(false);
    }
    
    // For managed members, use local data
    if (node.isManagedMember) {
      setEditStartDate(node.supervision_start_date || "");
      setEditEndDate(node.supervision_end_date || "");
    } else {
      // For real subordinates, fetch dates from teams table
      const { data, error } = await supabase
        .from("teams")
        .select("supervision_start_date, supervision_end_date")
        .eq("supervisor_id", profile?.id || "")
        .eq("subordinate_id", node.id)
        .single();
      
      if (!error && data) {
        const typedData = data as unknown as {
          supervision_start_date: string | null;
          supervision_end_date: string | null;
        };
        setEditStartDate(typedData.supervision_start_date || "");
        setEditEndDate(typedData.supervision_end_date || "");
        // Update the selected subordinate with fetched dates
        setSelectedSubordinate(prev => prev ? {
          ...prev,
          supervision_start_date: typedData.supervision_start_date,
          supervision_end_date: typedData.supervision_end_date,
        } : null);
      } else {
        setEditStartDate("");
        setEditEndDate("");
      }
    }
  }

  async function loadSupervisionHistory() {
    if (!profile?.id) return;
    
    setIsLoadingHistory(true);
    try {
      // Load history of people I've supervised
      const { data: subHistory, error: subError } = await supabase
        .from("my_subordinate_history")
        .select("*")
        .order("supervision_start_date", { ascending: false });
      
      if (subError) {
        console.error("Error loading subordinate history:", subError);
      } else {
        setSubordinateHistory(subHistory || []);
      }

      // Load history of my supervisors
      const { data: supHistory, error: supError } = await supabase
        .from("my_supervision_history")
        .select("*")
        .order("supervision_start_date", { ascending: false });
      
      if (supError) {
        console.error("Error loading supervision history:", supError);
      } else {
        setMySupervisionHistory(supHistory || []);
      }
    } catch (error) {
      console.error("Error loading history:", error);
    } finally {
      setIsLoadingHistory(false);
    }
  }

  // Load awards for team members
  async function loadAwards() {
    if (!profile?.id) return;
    
    setIsLoadingAwards(true);
    try {
      // Get all member IDs we can view awards for - use full subordinate chain
      const chainProfileIds = subordinateChain.map((m) => m.id);
      // Also include direct subordinates and all profiles in the tree
      const allProfileProfileIds = allProfiles.map((p) => p.id);
      const allProfileIds = [...new Set([...chainProfileIds, ...subordinates.map((s) => s.id), ...allProfileProfileIds])];
      const teamMemberIds = managedMembers.map((m) => m.id);
      

      // Load awards for all profiles in chain and managed members
      let allAwards: Award[] = [];

      if (allProfileIds.length > 0) {
        const { data: profileAwards } = await supabase
          .from("awards")
          .select("*")
          .in("recipient_profile_id", allProfileIds)
          .order("created_at", { ascending: false });
        
        if (profileAwards) {
          allAwards = [...allAwards, ...(profileAwards as Award[])];
        }
      }

      if (teamMemberIds.length > 0) {
        const { data: memberAwards } = await supabase
          .from("awards")
          .select("*")
          .in("recipient_team_member_id", teamMemberIds)
          .order("created_at", { ascending: false });
        
        if (memberAwards) {
          allAwards = [...allAwards, ...(memberAwards as Award[])];
        }
      }

      setAwards(allAwards);

      // Load pending award requests (where I'm the approver)
      const { data: requests } = await supabase
        .from("award_requests")
        .select(`
          *,
          requester:profiles!award_requests_requester_id_fkey(*),
          recipient_profile:profiles!award_requests_recipient_profile_id_fkey(*),
          recipient_team_member:team_members!award_requests_recipient_team_member_id_fkey(*)
        `)
        .eq("approver_id", profile.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      setPendingAwardRequests((requests as AwardRequest[]) || []);
    } catch (error) {
      console.error("Error loading awards:", error);
    } finally {
      setIsLoadingAwards(false);
    }
  }

  // Load awards when team data changes
  useEffect(() => {
    if (profile && !isLoading && (subordinateChain.length > 0 || subordinates.length > 0 || managedMembers.length > 0)) {
      loadAwards();
    }
  }, [profile, subordinateChain, subordinates, managedMembers, isLoading]);

  // Get awards for a specific member
  function getMemberAwards(profileId?: string, teamMemberId?: string): Award[] {
    return awards.filter(
      (a) =>
        (profileId && a.recipient_profile_id === profileId) ||
        (teamMemberId && a.recipient_team_member_id === teamMemberId)
    );
  }

  function getRankOrder(rank: string): number {
    const order: Record<string, number> = {
      CMSgt: 9, SMSgt: 8, MSgt: 7, TSgt: 6, SSgt: 5,
      SrA: 4, A1C: 3, Amn: 2, AB: 1,
    };
    return order[rank] || 0;
  }

  function getRequestDescription(request: TeamRequest): string {
    const requester = request.requester;
    if (request.request_type === "supervise") {
      return `${requester?.rank || ""} ${requester?.full_name || "Someone"} wants to supervise you`;
    } else {
      return `${requester?.rank || ""} ${requester?.full_name || "Someone"} wants you to supervise them`;
    }
  }

  // Tree node renderer
  function renderTreeNode(node: TreeNode, depth: number = 0, isLast: boolean = true) {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedNodes.has(node.data.id);
    const isCurrentUser = node.data.id === profile?.id;
    const isManagedMember = node.data.isManagedMember;
    const isPlaceholder = node.data.isPlaceholder;

    return (
      <div key={node.data.id} className="relative min-w-0">
        {/* Connector lines - hidden on small mobile for cleaner look */}
        {depth > 0 && (
          <>
            {/* Horizontal line to node */}
            <div
              className="absolute border-t-2 border-border hidden sm:block"
              style={{
                left: -12,
                top: 22,
                width: 12,
              }}
            />
            {/* Vertical line from parent */}
            {!isLast && (
              <div
                className="absolute border-l-2 border-border hidden sm:block"
                style={{
                  left: -12,
                  top: 22,
                  height: "calc(100% + 6px)",
                }}
              />
            )}
          </>
        )}

        {/* Node card - mobile-first responsive design */}
        <div
          className={cn(
            "relative p-2.5 sm:p-3 rounded-lg border-2 transition-all bg-card md:max-w-lg my-1 mx-0.5 group",
            hasChildren && "cursor-pointer hover:shadow-md active:scale-[0.99]",
            !hasCustomColor(node.data.rank) && "border-border",
            isCurrentUser && "ring-2 ring-primary ring-offset-1"
          )}
          style={getRankStyle(node.data.rank)}
          onClick={() => hasChildren && toggleExpand(node.data.id)}
        >
          {/* Main content */}
          <div className="space-y-2">
            {/* Top row: Avatar, name, and expand chevron */}
            <div className="flex items-center gap-2 sm:gap-3">
              {hasChildren && (
                <div className="shrink-0">
                  {isExpanded ? (
                    <ChevronDown className="size-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-4 text-muted-foreground" />
                  )}
                </div>
              )}
              <Avatar className="size-8 sm:size-9 md:size-10 shrink-0">
                <AvatarFallback className="text-[10px] sm:text-xs md:text-sm font-medium">
                  {node.data.full_name?.split(" ").map((n) => n[0]).join("") || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                {/* Name row */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="font-semibold text-[11px] sm:text-xs md:text-sm truncate">
                    {node.data.rank} {node.data.full_name}
                  </p>
                  {isManagedMember && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge 
                            variant="outline" 
                            className={cn(
                              "text-[8px] px-1 py-0 h-4 shrink-0 cursor-default",
                              node.data.member_status === "prior_subordinate"
                                ? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300"
                                : node.data.member_status === "archived"
                                ? "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-300"
                                : node.data.member_status === "pending_link"
                                ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-300"
                                : isPlaceholder 
                                ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-300"
                                : "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-300"
                            )}
                          >
                            {node.data.member_status === "prior_subordinate" 
                              ? "Prior" 
                              : node.data.member_status === "archived"
                              ? "Archived"
                              : node.data.member_status === "pending_link"
                              ? "Pending"
                              : isPlaceholder ? "Managed" : "Linked"}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs max-w-xs">
                          {node.data.member_status === "pending_link" 
                            ? "Pending link - waiting for them to accept your supervisor request"
                            : node.data.createdByName 
                            ? `Created by ${node.data.createdByName}`
                            : "Created by you"}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {/* Show creator badge if created by someone else in chain */}
                  {isManagedMember && node.data.createdByName && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge 
                            variant="outline" 
                            className="text-[7px] px-1 py-0 h-3.5 shrink-0 cursor-default bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800"
                          >
                            Created by {node.data.createdByName.split(" ").pop() || ""}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          Created by {node.data.createdByName}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {/* Subordinate count inline with name on mobile */}
                  {hasChildren && (
                    <Badge variant="secondary" className="text-[10px] px-1.5">
                      {node.children.length}
                    </Badge>
                  )}
                </div>
                {/* AFSC/Unit */}
                <p className="text-[10px] sm:text-[11px] md:text-xs text-muted-foreground truncate">
                  {node.data.afsc || "No AFSC"} • {node.data.unit || "No Unit"}
                </p>
              </div>
              {/* Award badges - inline on desktop */}
              {!isCurrentUser && (() => {
                const memberAwards = isManagedMember 
                  ? getMemberAwards(undefined, node.data.id)
                  : getMemberAwards(node.data.id, undefined);
                return memberAwards.length > 0 ? (
                  <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                    <AwardBadges awards={memberAwards} maxDisplay={3} size="sm" />
                  </div>
                ) : null;
              })()}
            </div>
            
            {/* Bottom row: Badges and action buttons - visible for non-current user */}
            {!isCurrentUser && (
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50">
                {/* Left: Status badges */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {/* Award badges - shown on mobile only */}
                  {(() => {
                    const memberAwards = isManagedMember 
                      ? getMemberAwards(undefined, node.data.id)
                      : getMemberAwards(node.data.id, undefined);
                    return memberAwards.length > 0 ? (
                      <div className="flex sm:hidden items-center gap-1">
                        <AwardBadges awards={memberAwards} maxDisplay={2} size="sm" />
                      </div>
                    ) : null;
                  })()}
                  {/* Days supervised */}
                  {node.data.supervision_start_date && (
                    <Badge variant="outline" className="text-[9px] px-1.5 gap-0.5 whitespace-nowrap">
                      <Clock className="size-2.5" />
                      {formatDaysSupervised(calculateDaysSupervised(node.data.supervision_start_date, node.data.supervision_end_date))}
                    </Badge>
                  )}
                  {/* EPB deadline */}
                  {node.data.rank && getStaticCloseoutDate(node.data.rank as Rank) && (() => {
                    const rank = node.data.rank as Rank;
                    const daysUntil = getDaysUntilCloseout(rank);
                    const metrics = memberMetrics[node.data.id];
                    const coveredMPAs = metrics ? Object.values(metrics.entries).filter(v => v > 0).length : 0;
                    const totalMPAs = ENTRY_MGAS.length;
                    if (rank === "AB" || rank === "Amn" || rank === "Civilian") return null;
                    return (
                      <Badge variant="outline" className="text-[9px] px-1.5 gap-0.5 whitespace-nowrap">
                        <Calendar className="size-2.5" />
                        {daysUntil}d • {coveredMPAs}/{totalMPAs}
                      </Badge>
                    );
                  })()}
                  {/* MPA Metrics - Hidden on mobile */}
                  {memberMetrics[node.data.id] && (
                    <div className="hidden sm:flex flex-wrap gap-1">
                      {STANDARD_MGAS.map((mpa) => {
                        const entryCount = memberMetrics[node.data.id]?.entries[mpa.key] || 0;
                        const stmtCount = memberMetrics[node.data.id]?.statements[mpa.key] || 0;
                        const abbr = MPA_ABBREVIATIONS[mpa.key];
                        return (
                          <span 
                            key={mpa.key}
                            className={cn(
                              "inline-flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded bg-muted/50",
                              entryCount === 0 && stmtCount === 0 && "opacity-40"
                            )}
                          >
                            <span className="font-medium">{abbr}</span>
                            <span className="text-muted-foreground">{entryCount}/{stmtCount}</span>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
                
                {/* Right: Action buttons - large touch targets */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* Add Award button */}
                  {canSupervise(profile?.rank) && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2.5 text-xs gap-1.5 active:scale-95 transition-transform touch-manipulation"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAwardRecipient({
                          profileId: isManagedMember ? undefined : node.data.id,
                          teamMemberId: isManagedMember ? node.data.id : undefined,
                          name: `${node.data.rank || ""} ${node.data.full_name || "Unknown"}`.trim(),
                        });
                        setShowAddAwardDialog(true);
                      }}
                    >
                      <Trophy className="size-4" />
                      <span className="hidden sm:inline">Award</span>
                    </Button>
                  )}
                  {/* Details button */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-2.5 text-xs gap-1.5 active:scale-95 transition-transform touch-manipulation"
                    onClick={(e) => {
                      e.stopPropagation();
                      openSubordinateDetails(node.data);
                    }}
                  >
                    <Info className="size-4" />
                    <span className="hidden sm:inline">Details</span>
                  </Button>
                  {/* More options menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0 active:scale-95 transition-transform touch-manipulation"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openSubordinateDetails(node.data)}>
                        <Info className="size-4 mr-2" />
                        View Details
                      </DropdownMenuItem>
                      <MemberStatementsDialog
                        memberId={node.data.id}
                        memberName={node.data.full_name || "Unknown"}
                        memberRank={node.data.rank}
                        isManagedMember={isManagedMember}
                        cycleYear={epbConfig?.current_cycle_year || new Date().getFullYear()}
                        currentUserId={profile?.id || ""}
                        trigger={
                          <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                            <FileText className="size-4 mr-2" />
                            View Statements
                          </DropdownMenuItem>
                        }
                      />
                      {/* Edit option only available to the user who created the managed member */}
                      {isManagedMember && !node.data.createdBy && (
                        <DropdownMenuItem onClick={() => {
                          // Find the full managed member data
                          const member = managedMembers.find(m => m.id === node.data.id);
                          if (member) {
                            setEditManagedMember(member);
                          }
                        }}>
                          <Pencil className="size-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                      )}
                      {canSupervise(profile?.rank) && (
                        <DropdownMenuItem onClick={() => {
                          setAwardRecipient({
                            profileId: isManagedMember ? undefined : node.data.id,
                            teamMemberId: isManagedMember ? node.data.id : undefined,
                            name: `${node.data.rank || ""} ${node.data.full_name || "Unknown"}`.trim(),
                          });
                          setShowAddAwardDialog(true);
                        }}>
                          <Trophy className="size-4 mr-2" />
                          Add Award
                        </DropdownMenuItem>
                      )}
                      {node.data.member_status === "prior_subordinate" && (
                        <>
                          <DropdownMenuItem onClick={() => archivePriorSubordinate(node.data.id)}>
                            <Archive className="size-4 mr-2" />
                            Archive
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        className="text-destructive"
                        onClick={() => setConfirmDeleteMember({ 
                          id: node.data.id, 
                          name: node.data.full_name || "Unknown",
                          type: node.data.member_status === "prior_subordinate" || node.data.member_status === "archived"
                            ? "prior_subordinate" 
                            : isManagedMember ? "managed" : "real",
                          isSupervisor: !isManagedMember && supervisors.some(s => s.id === node.data.id)
                        })}
                      >
                        {node.data.member_status === "prior_subordinate" || node.data.member_status === "archived" ? (
                          <>
                            <Trash2 className="size-4 mr-2" />
                            Delete
                          </>
                        ) : (
                          <>
                            <UserX className="size-4 mr-2" />
                            Remove
                          </>
                        )}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Children - mobile-first responsive margin */}
        {hasChildren && isExpanded && (
          <div className="ml-3 sm:ml-5 md:ml-6 mt-1.5 sm:mt-2 space-y-1.5 sm:space-y-2 relative">
            {/* Vertical line connecting children - hidden on small mobile */}
            <div
              className="absolute border-l-2 border-border hidden sm:block"
              style={{
                left: -12,
                top: 0,
                height: "calc(100% - 20px)",
              }}
            />
            {node.children.map((child, idx) =>
              renderTreeNode(child, depth + 1, idx === node.children.length - 1)
            )}
          </div>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">My Team</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage your team members
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          {canSupervise(profile?.rank) && (
            <Button 
              variant="outline" 
              className="w-full sm:w-auto shrink-0"
              onClick={() => setShowAddMemberDialog(true)}
            >
              <UserPlus className="size-4 mr-2" />
              Add Member
            </Button>
          )}
          <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto shrink-0">
                <Send className="size-4 mr-2" />
                Send Request
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-base sm:text-lg">Send Team Request</DialogTitle>
              <DialogDescription className="text-xs sm:text-sm">
                Request to supervise someone or request someone to supervise you
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 sm:space-y-4">
              <div className="space-y-2">
                <Label className="text-xs sm:text-sm">Request Type</Label>
                <Select 
                  value={inviteType} 
                  onValueChange={(v) => {
                    setInviteType(v as TeamRequestType);
                    setSearchedProfile(null); // Reset search when type changes
                  }}
                >
                  <SelectTrigger className="text-xs sm:text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {canSupervise(profile?.rank) && (
                      <SelectItem value="supervise" className="text-xs sm:text-sm">
                        <div className="flex items-center gap-2">
                          <ChevronDown className="size-3 sm:size-4" />
                          I want to supervise them
                        </div>
                      </SelectItem>
                    )}
                    <SelectItem value="be_supervised" className="text-xs sm:text-sm">
                      <div className="flex items-center gap-2">
                        <ChevronUp className="size-3 sm:size-4" />
                        I want them to supervise me
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                {!canSupervise(profile?.rank) && (
                  <p className="text-[10px] sm:text-xs text-muted-foreground">
                    Only SSgt and above can supervise others
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label className="text-xs sm:text-sm">Search by Email</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="user@example.com"
                    type="email"
                    className="text-sm"
                  />
                  <Button onClick={searchProfile} disabled={isSearching} className="w-full sm:w-auto shrink-0">
                    {isSearching ? <Loader2 className="size-4 animate-spin" /> : "Search"}
                  </Button>
                </div>
              </div>

              {searchedProfile && (
                <Card className={`${
                  inviteType === "be_supervised" && !canSupervise(searchedProfile.rank)
                    ? "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800"
                    : "bg-muted/50"
                }`}>
                  <CardContent className="p-3">
                    <div className="flex items-start gap-2 sm:gap-3">
                      <Avatar className="size-8 sm:size-10 shrink-0">
                        <AvatarFallback className="text-xs sm:text-sm">
                          {searchedProfile.full_name?.charAt(0) || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm sm:text-base truncate">
                          {searchedProfile.rank} {searchedProfile.full_name}
                        </p>
                        <p className="text-xs sm:text-sm text-muted-foreground truncate">
                          {searchedProfile.afsc} • {searchedProfile.unit}
                        </p>
                        {inviteType === "be_supervised" && !canSupervise(searchedProfile.rank) && (
                          <p className="text-[10px] sm:text-xs text-red-600 dark:text-red-400 mt-1">
                            This person cannot be a supervisor (must be SSgt+)
                          </p>
                        )}
                      </div>
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {searchedProfile.rank}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="space-y-2">
                <Label className="text-xs sm:text-sm">Message (optional)</Label>
                <Textarea
                  value={inviteMessage}
                  onChange={(e) => setInviteMessage(e.target.value)}
                  placeholder="Add a note to your request..."
                  rows={2}
                  className="text-sm"
                />
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                onClick={sendRequest}
                disabled={
                  !searchedProfile || 
                  isInviting ||
                  (inviteType === "supervise" && !canSupervise(profile?.rank)) ||
                  (inviteType === "be_supervised" && !canSupervise(searchedProfile?.rank))
                }
                className="w-full sm:w-auto"
              >
                {isInviting ? (
                  <Loader2 className="size-4 animate-spin mr-2" />
                ) : (
                  <Send className="size-4 mr-2" />
                )}
                Send Request
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
        
        {/* Add Managed Member Dialog */}
        <AddManagedMemberDialog 
          open={showAddMemberDialog} 
          onOpenChange={setShowAddMemberDialog} 
        />
        
        {/* Edit Managed Member Dialog */}
        <EditManagedMemberDialog
          open={!!editManagedMember}
          onOpenChange={(open) => !open && setEditManagedMember(null)}
          member={editManagedMember}
          onSuccess={() => setEditManagedMember(null)}
        />
        
        {/* Remove/Delete Member Confirmation Dialog */}
        <AlertDialog open={!!confirmDeleteMember} onOpenChange={() => { setConfirmDeleteMember(null); setDeleteWithData(false); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirmDeleteMember?.type === "prior_subordinate" 
                  ? "Delete Prior Subordinate" 
                  : confirmDeleteMember?.type === "managed"
                  ? "Remove Managed Member"
                  : confirmDeleteMember?.isSupervisor
                  ? "Remove Supervisor"
                  : "Remove Team Member"}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <p>
                    Are you sure you want to {confirmDeleteMember?.type === "prior_subordinate" ? "delete" : "remove"}{" "}
                    <strong>{confirmDeleteMember?.name}</strong>
                    {confirmDeleteMember?.type === "real" && !confirmDeleteMember?.isSupervisor && (
                      <> from your team? They will be retained as a prior subordinate so you can still access their entries.</>
                    )}
                    {confirmDeleteMember?.type === "real" && confirmDeleteMember?.isSupervisor && (
                      <> as your supervisor?</>
                    )}
                    {confirmDeleteMember?.type === "managed" && (
                      <>? This will permanently remove this managed member.</>
                    )}
                    {confirmDeleteMember?.type === "prior_subordinate" && "?"}
                  </p>
                  
                  {confirmDeleteMember?.type === "prior_subordinate" && (
                    <>
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
                        <input
                          type="checkbox"
                          id="deleteWithData"
                          checked={deleteWithData}
                          onChange={(e) => setDeleteWithData(e.target.checked)}
                          className="rounded border-gray-300"
                        />
                        <label htmlFor="deleteWithData" className="text-sm cursor-pointer">
                          Also delete all entries and statements for this member
                        </label>
                      </div>
                      {!deleteWithData && (
                        <p className="text-xs text-muted-foreground">
                          If unchecked, the member will be removed but their entries and statements will be preserved.
                        </p>
                      )}
                    </>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  if (!confirmDeleteMember) return;
                  
                  setIsDeleting(true);
                  try {
                    if (confirmDeleteMember.type === "prior_subordinate") {
                      await deletePriorSubordinate(confirmDeleteMember.id, deleteWithData);
                    } else if (confirmDeleteMember.type === "managed") {
                      await removeManagedTeamMember(confirmDeleteMember.id);
                      setConfirmDeleteMember(null);
                    } else {
                      await removeTeamMember(confirmDeleteMember.id, confirmDeleteMember.isSupervisor || false);
                      setConfirmDeleteMember(null);
                    }
                  } finally {
                    setIsDeleting(false);
                    setDeleteWithData(false);
                  }
                }}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    {confirmDeleteMember?.type === "prior_subordinate" ? "Deleting..." : "Removing..."}
                  </>
                ) : (
                  confirmDeleteMember?.type === "prior_subordinate" ? "Delete" : "Remove"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        
        {/* Subordinate Details Dialog */}
        <Dialog open={!!selectedSubordinate} onOpenChange={() => setSelectedSubordinate(null)}>
          <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Subordinate Details</DialogTitle>
              <DialogDescription>
                View and edit supervision information for {selectedSubordinate?.rank} {selectedSubordinate?.name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* Member Info */}
              <div className="space-y-2">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Avatar className="size-12">
                    <AvatarFallback className="text-lg font-medium">
                      {selectedSubordinate?.name?.split(" ").map((n) => n[0]).join("") || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-semibold">
                      {selectedSubordinate?.rank} {selectedSubordinate?.name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {selectedSubordinate?.afsc || "No AFSC"} • {selectedSubordinate?.unit || "No Unit"}
                    </p>
                    {selectedSubordinate?.email && (
                      <p className="text-xs text-muted-foreground">{selectedSubordinate.email}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* EPB Due Date */}
              {selectedSubordinate?.rank && (() => {
                const daysUntil = getDaysUntilCloseout(selectedSubordinate.rank);
                if (daysUntil === null) return null;
                const isUrgent = daysUntil <= 30;
                const isWarning = daysUntil <= 60;
                return (
                  <div className={cn(
                    "p-3 rounded-lg border flex items-center gap-3",
                    isUrgent ? "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700" :
                    isWarning ? "bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700" :
                    "bg-muted/50"
                  )}>
                    <Calendar className={cn(
                      "size-5",
                      isUrgent ? "text-red-600" : isWarning ? "text-amber-600" : "text-muted-foreground"
                    )} />
                    <div>
                      <p className={cn(
                        "text-sm font-medium",
                        isUrgent ? "text-red-700 dark:text-red-400" : isWarning ? "text-amber-700 dark:text-amber-400" : ""
                      )}>
                        EPB Due in {daysUntil} days
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Close-out: {getStaticCloseoutDate(selectedSubordinate.rank)?.label || "N/A"}
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* MPA Statement Status */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <FileText className="size-4" />
                  Statement Status ({epbConfig?.current_cycle_year || new Date().getFullYear()})
                </h4>
                
                {loadingStatements ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {STANDARD_MGAS.map((mpa) => {
                      const stmts = subordinateStatements.filter(s => s.mpa === mpa.key);
                      const hasStatements = stmts.length > 0;
                      const isHLR = mpa.key === "hlr_assessment";
                      
                      return (
                        <div
                          key={mpa.key}
                          className={cn(
                            "p-2 rounded-lg border text-xs",
                            hasStatements ? "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700" : "bg-muted/30"
                          )}
                        >
                          <div className="flex items-center gap-1.5">
                            {hasStatements ? (
                              <Check className="size-3 text-green-600" />
                            ) : (
                              <X className="size-3 text-muted-foreground" />
                            )}
                            {isHLR && <Trophy className="size-3 text-amber-600" />}
                            <span className="font-medium truncate">
                              {MPA_ABBREVIATIONS[mpa.key] || mpa.key}
                            </span>
                            {hasStatements && (
                              <Badge variant="secondary" className="ml-auto text-[10px] h-4">
                                {stmts.length}
                              </Badge>
                            )}
                          </div>
                          {hasStatements && (
                            <p className="text-[10px] text-muted-foreground mt-1 line-clamp-1">
                              {stmts[0].created_by === profile?.id ? "By you" : "By member"}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                
                {!loadingStatements && subordinateStatements.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    No statements created yet for this cycle.
                  </p>
                )}
              </div>

              {/* Supervision Dates */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="size-4" />
                  Supervision Period
                </h4>
                
                {/* Duration summary */}
                {editStartDate && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-primary/10 border border-primary/20">
                    <Clock className="size-4 text-primary" />
                    <span className="text-sm font-medium">
                      {formatDaysSupervised(calculateDaysSupervised(editStartDate, editEndDate || null))}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({calculateDaysSupervised(editStartDate, editEndDate || null)} days)
                    </span>
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="startDate" className="text-xs">Start Date</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={editStartDate}
                      onChange={(e) => setEditStartDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="endDate" className="text-xs">End Date (optional)</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={editEndDate}
                      onChange={(e) => setEditEndDate(e.target.value)}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  These dates help track how long you supervised this member. The end date is automatically set when they are removed from your team.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedSubordinate(null)}>
                Cancel
              </Button>
              <Button onClick={saveSupervisionDates} disabled={isSavingDates}>
                {isSavingDates ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <Card className="border-amber-300 dark:border-amber-600/50 bg-amber-50/50 dark:bg-amber-900/10">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-base sm:text-lg">
              <Clock className="size-4 sm:size-5 shrink-0" />
              Pending Requests ({pendingRequests.length})
            </CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Requests waiting for your response
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
            {pendingRequests.map((request) => (
              <div
                key={request.id}
                className="flex flex-col gap-3 p-3 rounded-lg border bg-background sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <Avatar className="size-8 sm:size-10 shrink-0">
                    <AvatarFallback className="text-xs sm:text-sm">
                      {request.requester?.full_name?.charAt(0) || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm sm:text-base text-wrap">{getRequestDescription(request)}</p>
                    {request.message && (
                      <p className="text-xs sm:text-sm text-muted-foreground text-wrap">"{request.message}"</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {new Date(request.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 w-full sm:w-auto shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 sm:flex-initial text-red-600 hover:text-red-700 text-xs sm:text-sm"
                    onClick={() => respondToRequest(request.id, false)}
                    disabled={respondingToRequest === request.id}
                  >
                    {respondingToRequest === request.id ? (
                      <Loader2 className="size-3 sm:size-4 mr-1 animate-spin" />
                    ) : (
                      <X className="size-3 sm:size-4 mr-1" />
                    )}
                    Decline
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 sm:flex-initial bg-green-600 hover:bg-green-700 text-xs sm:text-sm"
                    onClick={() => respondToRequest(request.id, true)}
                    disabled={respondingToRequest === request.id}
                  >
                    {respondingToRequest === request.id ? (
                      <Loader2 className="size-3 sm:size-4 mr-1 animate-spin" />
                    ) : (
                      <Check className="size-3 sm:size-4 mr-1" />
                    )}
                    Accept
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Stats Cards - horizontal scroll on mobile */}
      <div className="relative -mx-4 px-4 md:mx-0 md:px-0">
        <div className="flex gap-2 sm:gap-3 overflow-x-auto pb-2 md:grid md:grid-cols-3 lg:grid-cols-4 md:overflow-visible md:pb-0 snap-x snap-mandatory scrollbar-hide">
          <Card className="shrink-0 w-28 sm:w-32 md:w-auto snap-start">
            <CardContent className="p-2 pl-2 md:p-4">
              <div className="flex items-center gap-2 md:gap-3">
                <ChevronDown className="size-4 md:size-5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-lg md:text-2xl font-bold">{subordinates.length}</p>
                  <p className="text-[10px] md:text-xs text-muted-foreground">Direct</p>
                </div>
              </div>
            </CardContent>
          </Card>
   
          {Object.entries(stats)
            .sort(([a], [b]) => RANK_ORDER.indexOf(a) - RANK_ORDER.indexOf(b))
            .slice(0, 3)
            .map(([rank, count]) => (
              <Card key={rank} className="shrink-0 w-24 sm:w-28 md:w-auto snap-start">
                <CardContent className="p-2 pl-2 md:p-4">
                  <div className="flex items-center gap-2 md:gap-3">
                    <User className="size-4 md:size-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-lg md:text-2xl font-bold">{count}</p>
                      <p className="text-[10px] md:text-xs text-muted-foreground">{rank}s</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      </div>

      <Tabs defaultValue="chain" className="w-full">
        <TabsList className="w-full h-auto flex flex-wrap justify-start gap-1 p-1 bg-muted/50">
          <TabsTrigger value="chain" className="gap-1 text-[10px] sm:text-xs px-2 sm:px-3 py-1.5">
            <Users className="size-3 sm:size-3.5 shrink-0" />
            <span className="hidden sm:inline">Chain</span>
            <Badge variant="secondary" className="h-4 px-1 text-[9px]">{subordinateChain.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="subordinates" className="gap-1 text-[10px] sm:text-xs px-2 sm:px-3 py-1.5">
            <ChevronDown className="size-3 sm:size-3.5 shrink-0" />
            <span className="hidden sm:inline">Subs</span>
            <Badge variant="secondary" className="h-4 px-1 text-[9px]">{subordinates.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="supervisors" className="gap-1 text-[10px] sm:text-xs px-2 sm:px-3 py-1.5">
            <ChevronUp className="size-3 sm:size-3.5 shrink-0" />
            <span className="hidden sm:inline">Sups</span>
            <Badge variant="secondary" className="h-4 px-1 text-[9px]">{supervisors.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="sent" className="gap-1 text-[10px] sm:text-xs px-2 sm:px-3 py-1.5">
            <Send className="size-3 sm:size-3.5 shrink-0" />
            <span className="hidden sm:inline">Requests</span>
            <Badge variant="secondary" className="h-4 px-1 text-[9px]">{sentRequests.length}</Badge>
          </TabsTrigger>
          <TabsTrigger 
            value="history" 
            className="gap-1 text-[10px] sm:text-xs px-2 sm:px-3 py-1.5"
            onClick={() => loadSupervisionHistory()}
          >
            <History className="size-3 sm:size-3.5 shrink-0" />
            <span className="hidden sm:inline">History</span>
          </TabsTrigger>
          {canSupervise(profile?.rank) && (subordinates.length > 0 || managedMembers.length > 0) && (
            <TabsTrigger 
              value="awards" 
              className="gap-1 text-[10px] sm:text-xs px-2 sm:px-3 py-1.5"
              onClick={() => loadAwards()}
            >
              <Trophy className="size-3 sm:size-3.5 shrink-0" />
              <span className="hidden sm:inline">Awards</span>
              {awards.length > 0 && (
                <Badge variant="secondary" className="h-4 px-1 text-[9px]">{awards.length}</Badge>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        {/* Full Chain Tab with Tree Visualization */}
        <TabsContent value="chain" className="mt-3 sm:mt-4 space-y-4">
          <Card>
            <CardHeader className="px-3 sm:px-6 pb-2 sm:pb-4">
              <CardTitle className="flex items-center gap-2 text-sm sm:text-base md:text-lg">
                <Users className="size-4 sm:size-5" />
                Supervision Tree
              </CardTitle>
              <CardDescription className="text-[11px] sm:text-xs md:text-sm">
                Tap to expand/collapse. Your position is highlighted.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-2 sm:px-4 md:px-6 pt-1.5 pb-3 sm:pb-4 md:pb-6">
              {!canSupervise(profile?.rank) ? (
                <div className="text-center py-6 sm:py-8">
                  <p className="text-sm sm:text-base text-muted-foreground">
                    Only SSgt and above can have a subordinate chain.
                  </p>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-2">
                    Current rank: {profile?.rank || "Unknown"}
                  </p>
                </div>
              ) : tree ? (
                <div className="overflow-x-auto">
                  <div className="md:max-w-2xl lg:max-w-3xl">{renderTreeNode(tree)}</div>
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-6 sm:py-8 text-xs sm:text-sm">
                  No subordinates in your chain of command.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Rank Color Settings */}
          <Card className="md:max-w-xl lg:max-w-2xl">
            <CardHeader className="px-3 sm:px-6 pb-2 sm:pb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-xs sm:text-sm">Rank Colors</CardTitle>
                  <CardDescription className="text-[10px] sm:text-xs">
                    Customize colors for the tree
                  </CardDescription>
                </div>
                {Object.keys(rankColors).length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setRankColors({});
                      localStorage.removeItem(STORAGE_KEY);
                    }}
                    className="text-[10px] sm:text-xs text-muted-foreground shrink-0 h-7 px-2"
                  >
                    Reset
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-3 sm:px-6 pb-3 sm:pb-4">
              <div className="grid grid-cols-3 sm:flex sm:flex-wrap gap-1.5 sm:gap-2">
                {RANK_ORDER.map((rank) => {
                  const color = rankColors[rank];
                  return (
                    <Popover key={rank}>
                      <PopoverTrigger asChild>
                        <button
                          className={cn(
                            "px-2 sm:px-3 py-1.5 rounded border-2 text-[10px] sm:text-xs font-medium transition-all hover:shadow-md cursor-pointer",
                            !color && "bg-card border-border hover:border-muted-foreground"
                          )}
                          style={color ? { backgroundColor: `${color}20`, borderColor: color } : undefined}
                        >
                          {rank}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-3" align="center" side="top">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-sm font-medium">{rank} Color</span>
                            {color && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-6"
                                onClick={() => updateRankColor(rank, null)}
                              >
                                <X className="size-3" />
                              </Button>
                            )}
                          </div>
                          <input
                            type="color"
                            value={color || "#6b7280"}
                            onChange={(e) => updateRankColor(rank, e.target.value)}
                            className="w-full h-10 rounded cursor-pointer border-0"
                          />
                          <div className="grid grid-cols-4 gap-1.5">
                            {["#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899"].map((preset) => (
                              <button
                                key={preset}
                                onClick={() => updateRankColor(rank, preset)}
                                className={cn(
                                  "size-7 rounded-full border-2 transition-transform hover:scale-110",
                                  color === preset ? "border-foreground ring-2 ring-offset-2 ring-foreground" : "border-transparent"
                                )}
                                style={{ backgroundColor: preset }}
                              />
                            ))}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Subordinates Tab */}
        <TabsContent value="subordinates" className="mt-3 sm:mt-4 space-y-4">
          {/* Registered Subordinates */}
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <User className="size-4 sm:size-5" />
                Registered Subordinates
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Team members with accounts who can manage their own entries
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              {!canSupervise(profile?.rank) ? (
                <div className="space-y-4 py-4">
                  {/* Show supervisor if they have one */}
                  {supervisors.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Your Supervisor</p>
                      {supervisors.map((sup) => (
                        <div
                          key={sup.id}
                          className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30"
                        >
                          <Avatar className="size-10 shrink-0">
                            <AvatarFallback>{sup.full_name?.charAt(0) || "?"}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">
                              {sup.rank} {sup.full_name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">{sup.unit}</p>
                          </div>
                          <Badge variant="outline" className="shrink-0">Supervisor</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Show current user */}
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">You</p>
                    <div className="flex items-center gap-3 p-3 rounded-lg border-2 border-primary/50 bg-primary/5">
                      <Avatar className="size-10 shrink-0">
                        <AvatarFallback>{profile?.full_name?.charAt(0) || "?"}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">
                          {profile?.rank} {profile?.full_name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{profile?.unit}</p>
                      </div>
                    </div>
                  </div>

                  {supervisors.length === 0 && (
                    <p className="text-center text-sm text-muted-foreground pt-2">
                      You don&apos;t have a supervisor yet. Use the &quot;My Supervisors&quot; tab to request one.
                    </p>
                  )}
                  
                  <p className="text-center text-xs text-muted-foreground border-t pt-4 mt-4">
                    SSgt and above can add subordinates to their team
                  </p>
                </div>
              ) : subordinates.length === 0 ? (
                <p className="text-center text-sm sm:text-base text-muted-foreground py-6 sm:py-8">
                  No registered subordinates yet. Send a request to invite users with accounts.
                </p>
              ) : (
                <div className="space-y-2 sm:space-y-3">
                  {subordinates
                    .sort((a, b) => getRankOrder(b.rank || "") - getRankOrder(a.rank || ""))
                    .map((sub) => (
                      <div
                        key={sub.id}
                        className={cn(
                          "flex flex-col gap-2 p-3 rounded-lg border-2 sm:flex-row sm:items-center sm:justify-between",
                          !hasCustomColor(sub.rank) && "border-border"
                        )}
                        style={getRankStyle(sub.rank)}
                      >
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                          <Avatar className="size-8 sm:size-10 shrink-0">
                            <AvatarFallback className="text-xs sm:text-sm">
                              {sub.full_name?.charAt(0) || "U"}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm sm:text-base truncate">
                              {sub.rank} {sub.full_name}
                            </p>
                            <p className="text-xs sm:text-sm text-muted-foreground truncate">
                              {sub.afsc} • {sub.unit}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 sm:justify-end">
                          <Badge variant="secondary" className="text-xs">{sub.role}</Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive shrink-0"
                            onClick={() => removeTeamMember(sub.id, false)}
                          >
                            <UserX className="size-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Managed Members */}
          {canSupervise(profile?.rank) && (
            <Card>
              <CardHeader className="p-4 sm:p-6">
                <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                  <Users className="size-4 sm:size-5" />
                  Managed Members
                  <Badge variant="outline" className="text-xs">
                    {managedMembers.length}
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Team members you manage. You can add entries and generate statements for them.
                  {managedMembers.some(m => m.is_placeholder) && (
                    <span className="block mt-1 text-amber-600 dark:text-amber-400">
                      Members marked as &quot;Managed&quot; don&apos;t have accounts yet.
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                {managedMembers.length === 0 ? (
                  <div className="text-center py-6 sm:py-8">
                    <p className="text-sm sm:text-base text-muted-foreground mb-3">
                      No managed members yet.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddMemberDialog(true)}
                    >
                      <UserPlus className="size-4 mr-2" />
                      Add First Member
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2 sm:space-y-3">
                    {managedMembers
                      .sort((a, b) => getRankOrder(b.rank || "") - getRankOrder(a.rank || ""))
                      .map((member) => (
                        <div
                          key={member.id}
                          className={cn(
                            "flex flex-col gap-2 p-3 rounded-lg border-2 sm:flex-row sm:items-center sm:justify-between",
                            !hasCustomColor(member.rank) && "border-border"
                          )}
                          style={getRankStyle(member.rank)}
                        >
                          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                            <Avatar className="size-8 sm:size-10 shrink-0">
                              <AvatarFallback className="text-xs sm:text-sm">
                                {member.full_name?.charAt(0) || "U"}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-sm sm:text-base truncate">
                                {member.rank} {member.full_name}
                              </p>
                              <p className="text-xs sm:text-sm text-muted-foreground truncate">
                                {member.afsc || "No AFSC"} • {member.unit || "No Unit"}
                              </p>
                              {member.email && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {member.email}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-2 sm:justify-end">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  {member.is_placeholder ? (
                                    <Badge variant="outline" className="text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-300 cursor-help">
                                      Managed
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-xs bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 cursor-help">
                                      Linked
                                    </Badge>
                                  )}
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[200px] text-center">
                                  {member.is_placeholder 
                                    ? "This member doesn't have an account yet. Their entries are managed by you."
                                    : "This member has signed up and their account is now linked."
                                  }
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-destructive shrink-0"
                              onClick={() => setConfirmDeleteMember({
                                id: member.id,
                                name: member.full_name || "Unknown",
                                type: member.member_status === "prior_subordinate" ? "prior_subordinate" : "managed"
                              })}
                            >
                              <UserX className="size-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Supervisors Tab */}
        <TabsContent value="supervisors" className="mt-3 sm:mt-4 space-y-4">
          {/* Current Supervisors */}
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg">Current Supervisors</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                People who currently supervise you
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              {supervisors.length === 0 ? (
                <p className="text-center text-sm sm:text-base text-muted-foreground py-6 sm:py-8">
                  You have no supervisors yet. Send a request to join a team.
                </p>
              ) : (
                <div className="space-y-2 sm:space-y-3">
                  {supervisors.map((sup) => (
                    <div
                      key={sup.id}
                      className={cn(
                        "flex flex-col gap-2 p-3 rounded-lg border-2 sm:flex-row sm:items-center sm:justify-between",
                        !hasCustomColor(sup.rank) && "border-border"
                      )}
                      style={getRankStyle(sup.rank)}
                    >
                      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        <Avatar className="size-8 sm:size-10 shrink-0">
                          <AvatarFallback className="text-xs sm:text-sm">
                            {sup.full_name?.charAt(0) || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm sm:text-base truncate">
                            {sup.rank} {sup.full_name}
                          </p>
                          <p className="text-xs sm:text-sm text-muted-foreground truncate">
                            {sup.afsc} • {sup.unit}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 sm:justify-end">
                        <Badge variant="outline" className="text-xs">Supervisor</Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive shrink-0"
                          onClick={() => setConfirmDeleteMember({
                            id: sup.id,
                            name: sup.full_name || "Unknown",
                            type: "real",
                            isSupervisor: true
                          })}
                        >
                          <UserX className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Supervision History */}
          <Card>
            <CardHeader className="p-4 sm:p-6 pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                    <History className="size-4" />
                    Supervision History
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Record of all supervisors who have supervised you
                  </CardDescription>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={loadSupervisionHistory}
                  disabled={isLoadingHistory}
                >
                  {isLoadingHistory ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "Load History"
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              {mySupervisionHistory.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-4">
                  {isLoadingHistory ? "Loading..." : "No supervision history found. Click 'Load History' to fetch."}
                </p>
              ) : (
                <div className="space-y-2">
                  {mySupervisionHistory.map((record) => (
                    <div
                      key={record.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm">
                            {record.supervisor_rank} {record.supervisor_name}
                          </p>
                          <Badge 
                            variant={record.status === "current" ? "default" : "secondary"}
                            className="text-[10px] px-1.5"
                          >
                            {record.status === "current" ? "Active" : "Past"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                          <Calendar className="size-3" />
                          <span>
                            {record.supervision_start_date 
                              ? new Date(record.supervision_start_date).toLocaleDateString()
                              : "Unknown"
                            }
                            {" → "}
                            {record.supervision_end_date 
                              ? new Date(record.supervision_end_date).toLocaleDateString()
                              : "Present"
                            }
                          </span>
                          {record.supervision_start_date && (
                            <span className="text-muted-foreground/60">
                              ({formatDaysSupervised(calculateDaysSupervised(record.supervision_start_date, record.supervision_end_date))})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sent Requests Tab */}
        <TabsContent value="sent" className="mt-3 sm:mt-4">
          <Card>
            <CardHeader className="p-4 sm:p-6">
              <CardTitle className="text-base sm:text-lg">Sent Requests</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Requests you've sent that are pending response
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
              {sentRequests.length === 0 ? (
                <p className="text-center text-sm sm:text-base text-muted-foreground py-6 sm:py-8">
                  No pending sent requests.
                </p>
              ) : (
                <div className="space-y-2 sm:space-y-3">
                  {sentRequests.map((request) => (
                    <div
                      key={request.id}
                      className="flex flex-col gap-2 p-3 rounded-lg border sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-start gap-2 sm:gap-3 min-w-0">
                        <Avatar className="size-8 sm:size-10 shrink-0">
                          <AvatarFallback className="text-xs sm:text-sm">
                            {request.target?.full_name?.charAt(0) || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm sm:text-base truncate">
                            {request.target?.rank} {request.target?.full_name}
                          </p>
                          <p className="text-xs sm:text-sm text-muted-foreground">
                            {request.request_type === "supervise"
                              ? "You want to supervise them"
                              : "You want them to supervise you"}
                          </p>
                          <p className="text-[10px] sm:text-xs text-muted-foreground">
                            Sent {new Date(request.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full sm:w-auto text-destructive text-xs sm:text-sm shrink-0"
                        onClick={() => cancelRequest(request.id)}
                      >
                        <X className="size-3 sm:size-4 mr-1" />
                        Cancel Request
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Supervision History Tab */}
        <TabsContent value="history" className="mt-3 sm:mt-4 space-y-4">
          {isLoadingHistory ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {/* My Subordinate History (for supervisors) */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="size-4" />
                    People I&apos;ve Supervised
                  </CardTitle>
                  <CardDescription className="text-xs">
                    History of all subordinates you have supervised
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {subordinateHistory.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No supervision history yet
                    </p>
                  ) : (
                    subordinateHistory.map((record) => (
                      <div
                        key={record.id}
                        className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm truncate">
                              {record.member_rank} {record.member_name}
                            </p>
                            <Badge 
                              variant={record.status === "current" ? "default" : "secondary"}
                              className="text-[10px] px-1.5"
                            >
                              {record.status === "current" ? "Active" : record.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                            <Calendar className="size-3" />
                            <span>
                              {record.supervision_start_date 
                                ? new Date(record.supervision_start_date).toLocaleDateString()
                                : "Unknown"
                              }
                              {" → "}
                              {record.supervision_end_date 
                                ? new Date(record.supervision_end_date).toLocaleDateString()
                                : "Present"
                              }
                            </span>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[10px] shrink-0">
                          {record.relationship_type}
                        </Badge>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              {/* My Supervisor History (for subordinates) */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="size-4" />
                    My Supervisors
                  </CardTitle>
                  <CardDescription className="text-xs">
                    History of supervisors who have supervised you
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {mySupervisionHistory.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No supervisor history yet
                    </p>
                  ) : (
                    mySupervisionHistory.map((record) => (
                      <div
                        key={record.id}
                        className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm truncate">
                              {record.supervisor_rank} {record.supervisor_name}
                            </p>
                            <Badge 
                              variant={record.status === "current" ? "default" : "secondary"}
                              className="text-[10px] px-1.5"
                            >
                              {record.status === "current" ? "Active" : record.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                            <Calendar className="size-3" />
                            <span>
                              {record.supervision_start_date 
                                ? new Date(record.supervision_start_date).toLocaleDateString()
                                : "Unknown"
                              }
                              {" → "}
                              {record.supervision_end_date 
                                ? new Date(record.supervision_end_date).toLocaleDateString()
                                : "Present"
                              }
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Awards Tab */}
        {canSupervise(profile?.rank) && (subordinates.length > 0 || managedMembers.length > 0) && (
          <TabsContent value="awards" className="mt-3 sm:mt-4 space-y-4">
            {/* Pending Award Requests */}
            {pendingAwardRequests.length > 0 && (
              <AwardRequestsPanel
                requests={pendingAwardRequests}
                onRequestUpdated={() => loadAwards()}
              />
            )}

            {/* Awards Panel */}
            <AwardsPanel
              awards={awards}
              isLoading={isLoadingAwards}
              canAddAwards={canSupervise(profile?.rank)}
              onAddAward={() => {
                setAwardRecipient(null);
                setShowAddAwardDialog(true);
              }}
            />
          </TabsContent>
        )}
      </Tabs>

      {/* Add Award Dialog */}
      <AddAwardDialog
        open={showAddAwardDialog}
        onOpenChange={setShowAddAwardDialog}
        recipientProfileId={awardRecipient?.profileId}
        recipientTeamMemberId={awardRecipient?.teamMemberId}
        recipientName={awardRecipient?.name}
        onSuccess={() => {
          loadAwards();
          setAwardRecipient(null);
        }}
      />
    </div>
  );
}
