"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import { useDecorationShellStore } from "@/stores/decoration-shell-store";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { PageSpinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Medal,
  Loader2,
  Plus,
  UserPlus,
  RefreshCw,
  FileText,
  Calendar,
  CheckCircle2,
  Clock,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DecorationWorkspaceDialog } from "@/components/decoration/decoration-workspace-dialog";
import { DECORATION_TYPES, DECORATION_REASONS } from "@/features/decorations/constants";
import { cn, getFullName } from "@/lib/utils";
import type {
  DecorationShell,
  DecorationAwardType,
  DecorationReason,
  Profile,
  ManagedMember,
  Rank,
} from "@/types/database";

// ============================================================================
// Types
// ============================================================================

interface RateeOption {
  id: string;
  label: string;
  fullName: string | null;
  rank: Rank | null;
  afsc: string | null;
  isManagedMember: boolean;
}

interface DecorationShellWithDetails {
  id: string;
  user_id: string;
  team_member_id: string | null;
  created_by: string;
  award_type: DecorationAwardType;
  reason: DecorationReason;
  duty_title: string;
  unit: string;
  start_date: string | null;
  end_date: string | null;
  citation_text: string;
  selected_statement_ids: string[];
  status: "draft" | "finalized";
  created_at: string;
  updated_at: string;
  owner_profile?: Profile | null;
  owner_team_member?: ManagedMember | null;
  creator_profile?: Profile | null;
}

// ============================================================================
// Component
// ============================================================================

export default function DecorationPage() {
  const router = useRouter();
  const supabase = createClient();
  const { profile, subordinates, managedMembers } = useUserStore();

  // Decoration shell store (for reset functionality)
  const { reset: resetDecorationStore } = useDecorationShellStore();

  // ---- State ----
  const [decorations, setDecorations] = useState<DecorationShellWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Create dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedRateeId, setSelectedRateeId] = useState<string>("self");
  const [createAwardType, setCreateAwardType] = useState<DecorationAwardType>("afam");
  const [createReason, setCreateReason] = useState<DecorationReason>("meritorious_service");
  const [isCreating, setIsCreating] = useState(false);

  // Workspace dialog state
  const [selectedDecoration, setSelectedDecoration] = useState<DecorationShellWithDetails | null>(null);
  const [showWorkspaceDialog, setShowWorkspaceDialog] = useState(false);

  // ============================================================================
  // Build ratee options
  // ============================================================================

  const rateeOptions: RateeOption[] = [
    {
      id: "self",
      label: `${profile?.rank || ""} ${getFullName(profile) || "Myself"} (Self)`.trim(),
      fullName: getFullName(profile) || null,
      rank: profile?.rank as Rank | null,
      afsc: profile?.afsc || null,
      isManagedMember: false,
    },
    ...subordinates.map((sub) => ({
      id: sub.id,
      label: `${sub.rank || ""} ${getFullName(sub)}`.trim(),
      fullName: getFullName(sub),
      rank: sub.rank as Rank | null,
      afsc: sub.afsc,
      isManagedMember: false,
    })),
    ...managedMembers.map((member) => ({
      id: `managed:${member.id}`,
      label: `${member.rank || ""} ${member.full_name}`.trim(), // Managed members only have full_name
      fullName: member.full_name,
      rank: member.rank as Rank | null,
      afsc: member.afsc,
      isManagedMember: true,
    })),
  ];

  // ============================================================================
  // Load Decorations
  // ============================================================================

  const loadDecorations = useCallback(async () => {
    if (!profile) return;

    try {
      const { data: shellsData, error } = await supabase
        .from("decoration_shells")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("Error loading decoration shells:", error);
        return;
      }

      // Enrich with owner profile/member info
      const enrichedDecorations: DecorationShellWithDetails[] = await Promise.all(
        ((shellsData || []) as unknown as DecorationShellWithDetails[]).map(async (shell) => {
          let ownerProfile: Profile | null = null;
          let ownerTeamMember: ManagedMember | null = null;
          let creatorProfile: Profile | null = null;

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
          } else {
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

          // Get creator info
          if (shell.created_by === profile.id) {
            creatorProfile = profile;
          } else {
            const creator = subordinates.find((s) => s.id === shell.created_by);
            if (creator) {
              creatorProfile = creator;
            } else {
              const { data: creatorData } = await supabase
                .from("profiles")
                .select("*")
                .eq("id", shell.created_by)
                .single();
              if (creatorData) {
                creatorProfile = creatorData as unknown as Profile;
              }
            }
          }

          return {
            ...shell,
            owner_profile: ownerProfile,
            owner_team_member: ownerTeamMember,
            creator_profile: creatorProfile,
          } as DecorationShellWithDetails;
        })
      );

      setDecorations(enrichedDecorations);
    } catch (error) {
      console.error("Error loading decorations:", error);
      toast.error("Failed to load decorations");
    }
  }, [profile, supabase, subordinates, managedMembers]);

  // Initial load
  useEffect(() => {
    async function init() {
      setIsLoading(true);
      await loadDecorations();
      setIsLoading(false);
    }
    init();
  }, [loadDecorations]);

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadDecorations();
    setIsRefreshing(false);
    toast.success("Decorations refreshed");
  };

  const handleRateeChange = (value: string) => {
    if (value === "add-member") {
      router.push("/team");
    } else {
      setSelectedRateeId(value);
    }
  };

  const handleCreateDecoration = async () => {
    if (!profile) return;

    const ratee = rateeOptions.find((r) => r.id === selectedRateeId);
    if (!ratee) return;

    setIsCreating(true);

    try {
      const isManagedMember = ratee.isManagedMember;
      const actualRateeId = isManagedMember
        ? selectedRateeId.replace("managed:", "")
        : selectedRateeId === "self"
        ? profile.id
        : selectedRateeId;

      const { data: newShell, error: createError } = await supabase
        .from("decoration_shells")
        .insert({
          user_id: isManagedMember ? profile.id : actualRateeId,
          team_member_id: isManagedMember ? actualRateeId : null,
          created_by: profile.id,
          award_type: createAwardType,
          reason: createReason,
        } as never)
        .select()
        .single();

      if (createError) throw createError;

      toast.success("Decoration draft created");
      setShowCreateDialog(false);

      // Reset form
      setSelectedRateeId("self");
      setCreateAwardType("afam");
      setCreateReason("meritorious_service");

      // Open the workspace dialog
      if (newShell) {
        const typedShell = newShell as unknown as DecorationShellWithDetails;
        const enrichedShell: DecorationShellWithDetails = {
          ...typedShell,
          owner_profile: isManagedMember ? null : (ratee.id === "self" ? profile : null),
          owner_team_member: isManagedMember ? managedMembers.find((m) => m.id === actualRateeId) || null : null,
          creator_profile: profile,
        };
        setSelectedDecoration(enrichedShell);
        setShowWorkspaceDialog(true);
      }

      // Reload the list
      await loadDecorations();
    } catch (error) {
      console.error("Error creating decoration:", error);
      toast.error("Failed to create decoration");
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenDecoration = (decoration: DecorationShellWithDetails) => {
    resetDecorationStore();
    setSelectedDecoration(decoration);
    setShowWorkspaceDialog(true);
  };

  // Get decoration config by key
  const getDecorationConfig = (awardType: DecorationAwardType) => {
    return DECORATION_TYPES.find((d) => d.key === awardType);
  };

  // Get reason label
  const getReasonLabel = (reason: DecorationReason) => {
    return DECORATION_REASONS.find((r) => r.key === reason)?.label || reason;
  };

  // Get owner display name
  const getOwnerDisplayName = (decoration: DecorationShellWithDetails) => {
    if (decoration.owner_team_member) {
      // Managed members only have full_name
      return `${decoration.owner_team_member.rank || ""} ${decoration.owner_team_member.full_name}`.trim();
    }
    if (decoration.owner_profile) {
      // Use getFullName for profiles to properly combine first_name + last_name
      return `${decoration.owner_profile.rank || ""} ${getFullName(decoration.owner_profile)}`.trim();
    }
    return "Unknown";
  };

  // ============================================================================
  // Render
  // ============================================================================

  if (isLoading) {
    return <PageSpinner />;
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Medal className="size-6 text-primary" />
            Decorations
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Create and manage decoration citations for yourself and your team
          </p>
        </div>
        <div className="flex items-center gap-2">
          <TooltipProvider>
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
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="size-4 mr-2" />
            New Decoration
          </Button>
        </div>
      </div>

      {/* Decorations Table */}
      {decorations.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Medal className="size-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Decorations Yet</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-4">
              Create your first decoration draft to start generating citations for
              AFAM, AFCM, MSM, and more.
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="size-4 mr-2" />
              Create First Decoration
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Your Decoration Drafts</CardTitle>
            <CardDescription>
              {decorations.length} decoration{decorations.length !== 1 ? "s" : ""} in progress
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Award</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {decorations.map((decoration) => {
                  const config = getDecorationConfig(decoration.award_type);
                  const hasContent = decoration.citation_text?.trim();
                  return (
                    <TableRow
                      key={decoration.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleOpenDecoration(decoration)}
                    >
                      <TableCell>
                        <div className="font-medium">{getOwnerDisplayName(decoration)}</div>
                        {decoration.duty_title && (
                          <div className="text-xs text-muted-foreground">
                            {decoration.duty_title}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">
                          {config?.abbreviation || decoration.award_type.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{getReasonLabel(decoration.reason)}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {decoration.status === "finalized" ? (
                            <>
                              <CheckCircle2 className="size-4 text-green-500" />
                              <span className="text-sm text-green-600">Finalized</span>
                            </>
                          ) : hasContent ? (
                            <>
                              <FileText className="size-4 text-blue-500" />
                              <span className="text-sm text-blue-600">In Progress</span>
                            </>
                          ) : (
                            <>
                              <Clock className="size-4 text-muted-foreground" />
                              <span className="text-sm text-muted-foreground">Draft</span>
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {new Date(decoration.updated_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Medal className="size-5" />
              New Decoration
            </DialogTitle>
            <DialogDescription>
              Create a new decoration draft for yourself or a team member.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Ratee Selection */}
            <div className="space-y-2">
              <Label className="text-sm">Recipient</Label>
              <Select value={selectedRateeId} onValueChange={handleRateeChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select recipient" />
                </SelectTrigger>
                <SelectContent>
                  {rateeOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      <div className="flex items-center gap-2">
                        <span>{option.label}</span>
                        {option.isManagedMember && (
                          <Badge variant="outline" className="text-[10px]">
                            Managed
                          </Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                  <SelectItem value="add-member">
                    <div className="flex items-center gap-2 text-primary">
                      <UserPlus className="size-4" />
                      <span>Add Team Member...</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Award Type */}
            <div className="space-y-2">
              <Label className="text-sm">Award Type</Label>
              <Select
                value={createAwardType}
                onValueChange={(v) => setCreateAwardType(v as DecorationAwardType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DECORATION_TYPES.map((type) => (
                    <SelectItem key={type.key} value={type.key}>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-xs">
                          {type.abbreviation}
                        </Badge>
                        <span>{type.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {getDecorationConfig(createAwardType)?.typicalRanks}
              </p>
            </div>

            {/* Reason */}
            <div className="space-y-2">
              <Label className="text-sm">Reason</Label>
              <Select
                value={createReason}
                onValueChange={(v) => setCreateReason(v as DecorationReason)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DECORATION_REASONS.map((reason) => (
                    <SelectItem key={reason.key} value={reason.key}>
                      <div>
                        <div className="font-medium">{reason.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {reason.description}
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateDecoration} disabled={isCreating}>
              {isCreating ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="size-4 mr-2" />
                  Create Draft
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Workspace Dialog */}
      {selectedDecoration && (
        <DecorationWorkspaceDialog
          open={showWorkspaceDialog}
          onOpenChange={setShowWorkspaceDialog}
          shell={selectedDecoration}
          onSaved={loadDecorations}
        />
      )}
    </div>
  );
}
