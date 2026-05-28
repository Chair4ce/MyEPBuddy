"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import { useDecorationShellStore } from "@/stores/decoration-shell-store";
import { Analytics } from "@/lib/analytics";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
  PenLine,
  RefreshCw,
  Link2,
  AlertCircle,
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
import {
  ENLISTED_RANKS,
  OFFICER_RANKS,
  CIVILIAN_RANK,
  isOfficer,
} from "@/lib/constants";
import {
  createManagedTeamMember,
  lookupProfileByEmail,
  type ExistingUserMatch,
} from "@/lib/managed-member-create";
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

type RecipientMode = "member" | "manual";

function getAvailableSubordinateRanks(supervisorRank: Rank | null | undefined) {
  const supervisorIsOfficer = isOfficer(supervisorRank ?? null);
  return {
    enlisted: ENLISTED_RANKS,
    officers: supervisorIsOfficer ? OFFICER_RANKS : [],
    civilian: CIVILIAN_RANK,
  };
}

interface DecorationShellWithDetails {
  id: string;
  user_id: string;
  team_member_id: string | null;
  recipient_name: string | null;
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
  const { profile, subordinates, managedMembers, addManagedMember } = useUserStore();

  // Decoration shell store (for reset functionality)
  const { reset: resetDecorationStore } = useDecorationShellStore();

  // ---- State ----
  const [decorations, setDecorations] = useState<DecorationShellWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Create dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedRateeId, setSelectedRateeId] = useState<string>("self");
  const [recipientMode, setRecipientMode] = useState<RecipientMode>("member");
  const [manualRecipientName, setManualRecipientName] = useState("");
  const [manualRecipientRank, setManualRecipientRank] = useState<Rank | "">("");
  const [manualRecipientEmail, setManualRecipientEmail] = useState("");
  const [existingUserMatch, setExistingUserMatch] = useState<ExistingUserMatch | null>(null);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [createManagedAccount, setCreateManagedAccount] = useState(true);
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

  const availableSubordinateRanks = useMemo(
    () => getAvailableSubordinateRanks(profile?.rank as Rank | null),
    [profile?.rank]
  );

  const resetManualRecipientFields = () => {
    setManualRecipientName("");
    setManualRecipientRank("");
    setManualRecipientEmail("");
    setExistingUserMatch(null);
    setIsCheckingEmail(false);
    setCreateManagedAccount(true);
  };

  const handleManualEmailBlur = async () => {
    const email = manualRecipientEmail.trim();
    if (!email) {
      setExistingUserMatch(null);
      return;
    }

    setIsCheckingEmail(true);
    try {
      const match = await lookupProfileByEmail(supabase, email);
      setExistingUserMatch(match);
    } finally {
      setIsCheckingEmail(false);
    }
  };

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
            if (shell.recipient_name) {
              // Manual non-account recipient — name stored on shell
              ownerProfile = null;
            } else if (shell.user_id === profile.id) {
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

  const resetCreateForm = () => {
    setSelectedRateeId("self");
    setRecipientMode("member");
    resetManualRecipientFields();
    setCreateAwardType("afam");
    setCreateReason("meritorious_service");
  };

  const handleCreateDialogChange = (open: boolean) => {
    setShowCreateDialog(open);
    if (!open) {
      resetCreateForm();
    }
  };

  const handleCreateDecoration = async () => {
    if (!profile) return;

    const trimmedManualName = manualRecipientName.trim();

    if (recipientMode === "manual") {
      if (!trimmedManualName) {
        toast.error("Recipient name is required");
        return;
      }
    } else {
      const ratee = rateeOptions.find((r) => r.id === selectedRateeId);
      if (!ratee) return;
    }

    setIsCreating(true);

    try {
      let teamMemberId: string | null = null;
      let recipientName: string | null = null;
      let shellUserId = profile.id;
      let ownerProfile: Profile | null = null;
      let ownerTeamMember: ManagedMember | null = null;
      let pendingLinkMatch: ExistingUserMatch | null = null;

      if (recipientMode === "manual") {
        if (createManagedAccount) {
          const email = manualRecipientEmail.trim().toLowerCase() || null;
          if (email && !email.includes("@")) {
            toast.error("Please enter a valid email address");
            setIsCreating(false);
            return;
          }

          const { member, existingMatch } = await createManagedTeamMember(supabase, {
            supervisorId: profile.id,
            parentProfileId: profile.id,
            fullName: trimmedManualName,
            email,
            rank: manualRecipientRank || null,
            existingUser: existingUserMatch,
          });

          pendingLinkMatch = existingMatch;

          teamMemberId = member.id;
          ownerTeamMember = member;
          addManagedMember(member);
          Analytics.managedMemberAdded();
          Analytics.teamMemberAdded("managed");
        } else {
          recipientName = trimmedManualName;
        }
      } else {
        const ratee = rateeOptions.find((r) => r.id === selectedRateeId)!;
        const isManagedMember = ratee.isManagedMember;
        const actualRateeId = isManagedMember
          ? selectedRateeId.replace("managed:", "")
          : selectedRateeId === "self"
          ? profile.id
          : selectedRateeId;

        if (isManagedMember) {
          teamMemberId = actualRateeId;
          ownerTeamMember = managedMembers.find((m) => m.id === actualRateeId) || null;
        } else if (selectedRateeId === "self") {
          ownerProfile = profile;
        } else {
          shellUserId = actualRateeId;
          ownerProfile = subordinates.find((s) => s.id === actualRateeId) || null;
        }
      }

      const { data: newShell, error: createError } = await supabase
        .from("decoration_shells")
        .insert({
          user_id: shellUserId,
          team_member_id: teamMemberId,
          recipient_name: recipientName,
          created_by: profile.id,
          award_type: createAwardType,
          reason: createReason,
        } as never)
        .select()
        .single();

      if (createError) throw createError;

      Analytics.decorationCreated(createAwardType, createReason);
      toast.success("Decoration draft created", {
        description: pendingLinkMatch
          ? `Supervisor request sent to ${pendingLinkMatch.full_name || pendingLinkMatch.email}.`
          : undefined,
      });
      setShowCreateDialog(false);
      resetCreateForm();

      if (newShell) {
        const typedShell = newShell as unknown as DecorationShellWithDetails;
        const enrichedShell: DecorationShellWithDetails = {
          ...typedShell,
          owner_profile: ownerProfile,
          owner_team_member: ownerTeamMember,
          creator_profile: profile,
        };
        setSelectedDecoration(enrichedShell);
        setShowWorkspaceDialog(true);
      }

      await loadDecorations();
    } catch (error) {
      console.error("Error creating decoration:", error);
      const message = error instanceof Error ? error.message : "Failed to create decoration";
      toast.error(message);
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
      return `${decoration.owner_team_member.rank || ""} ${decoration.owner_team_member.full_name}`.trim();
    }
    if (decoration.recipient_name) {
      return decoration.recipient_name;
    }
    if (decoration.owner_profile) {
      return `${decoration.owner_profile.rank || ""} ${getFullName(decoration.owner_profile)}`.trim();
    }
    return "Unknown";
  };

  const canCreateDraft =
    recipientMode === "member" || manualRecipientName.trim().length > 0;

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
      <Dialog open={showCreateDialog} onOpenChange={handleCreateDialogChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Medal className="size-5" />
              New Decoration
            </DialogTitle>
            <DialogDescription>
              Create a new decoration draft for yourself, a team member, or someone without an account.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Recipient Selection */}
            <div className="space-y-2">
              <Label className="text-sm">Recipient</Label>

              {recipientMode === "member" ? (
                <>
                  <Select value={selectedRateeId} onValueChange={handleRateeChange}>
                    <SelectTrigger aria-label="Select decoration recipient">
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
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-muted-foreground hover:text-primary"
                    onClick={() => setRecipientMode("manual")}
                  >
                    <PenLine className="size-3.5 mr-1.5" />
                    Enter name manually
                  </Button>
                </>
              ) : (
                <>
                  <Input
                    id="manual-recipient-name"
                    value={manualRecipientName}
                    onChange={(e) => setManualRecipientName(e.target.value)}
                    placeholder="Full name (e.g., John Smith)"
                    aria-label="Recipient full name"
                    autoComplete="name"
                  />
                  <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
                    <Checkbox
                      id="create-managed-account"
                      checked={createManagedAccount}
                      onCheckedChange={(checked) => {
                        const enabled = checked === true;
                        setCreateManagedAccount(enabled);
                        if (!enabled) {
                          setManualRecipientRank("");
                          setManualRecipientEmail("");
                          setExistingUserMatch(null);
                        }
                      }}
                      aria-label="Create managed team member for this recipient"
                    />
                    <div className="space-y-1">
                      <Label htmlFor="create-managed-account" className="cursor-pointer font-medium">
                        Create managed team member
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Adds them to your team for tracking accomplishments. Uncheck to create a
                        decoration draft with just the name.
                      </p>
                    </div>
                  </div>

                  {createManagedAccount && (
                    <div className="space-y-3 rounded-lg border p-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="manual-recipient-rank" className="text-sm">
                            Rank{" "}
                            <span className="text-muted-foreground text-xs">(optional)</span>
                          </Label>
                          <Select
                            value={manualRecipientRank}
                            onValueChange={(value) => setManualRecipientRank(value as Rank)}
                          >
                            <SelectTrigger id="manual-recipient-rank" aria-label="Recipient rank">
                              <SelectValue placeholder="Select rank" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                <SelectLabel>Enlisted</SelectLabel>
                                {availableSubordinateRanks.enlisted.map((rank) => (
                                  <SelectItem key={rank.value} value={rank.value}>
                                    {rank.value}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                              {availableSubordinateRanks.officers.length > 0 && (
                                <SelectGroup>
                                  <SelectLabel>Officer</SelectLabel>
                                  {availableSubordinateRanks.officers.map((rank) => (
                                    <SelectItem key={rank.value} value={rank.value}>
                                      {rank.value}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              )}
                              <SelectGroup>
                                <SelectLabel>Civilian</SelectLabel>
                                {availableSubordinateRanks.civilian.map((rank) => (
                                  <SelectItem key={rank.value} value={rank.value}>
                                    {rank.value}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="manual-recipient-email" className="text-sm">
                            Email{" "}
                            <span className="text-muted-foreground text-xs">(optional)</span>
                          </Label>
                          <div className="relative">
                            <Input
                              id="manual-recipient-email"
                              type="email"
                              value={manualRecipientEmail}
                              onChange={(e) => {
                                setManualRecipientEmail(e.target.value);
                                setExistingUserMatch(null);
                              }}
                              onBlur={handleManualEmailBlur}
                              placeholder="john.doe@us.af.mil"
                              aria-label="Recipient email for account linking"
                              autoComplete="email"
                              className={existingUserMatch ? "pr-10 border-amber-500" : ""}
                            />
                            {isCheckingEmail && (
                              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 animate-spin text-muted-foreground" />
                            )}
                            {existingUserMatch && !isCheckingEmail && (
                              <Link2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-amber-500" />
                            )}
                          </div>
                        </div>
                      </div>

                      {existingUserMatch && (
                        <div className="flex items-start gap-2 rounded-md bg-amber-100 p-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                          <AlertCircle className="size-4 mt-0.5 shrink-0" />
                          <div>
                            <p className="font-medium">Account found</p>
                            <p className="text-xs opacity-80">
                              {existingUserMatch.rank} {existingUserMatch.full_name || existingUserMatch.email}{" "}
                              already has an account. A supervisor request will be sent when you create
                              this decoration.
                            </p>
                          </div>
                        </div>
                      )}

                      {!existingUserMatch && !manualRecipientEmail.trim() && (
                        <p className="text-xs text-muted-foreground">
                          If they sign up with this email later, they&apos;ll be prompted to link their account.
                        </p>
                      )}
                    </div>
                  )}

                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-muted-foreground hover:text-primary"
                    onClick={() => {
                      setRecipientMode("member");
                      resetManualRecipientFields();
                    }}
                  >
                    Back to member selection
                  </Button>
                </>
              )}
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
            <Button
              onClick={handleCreateDecoration}
              disabled={isCreating || !canCreateDraft}
            >
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
