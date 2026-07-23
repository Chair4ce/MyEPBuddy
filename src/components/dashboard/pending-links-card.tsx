"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LinkIcon,
  UserPlus,
  X,
  Check,
  Download,
  Users,
  FileText,
  MessageSquare,
  Eye,
  Calendar,
  Loader2,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { Analytics } from "@/lib/analytics";
import type { Rank } from "@/types/database";
import { MPA_ABBREVIATIONS } from "@/lib/constants";
import { consumePersistedManagedInviteToken } from "@/lib/managed-member-invite-consume";

interface PreviewEntry {
  id: string;
  date: string;
  action_verb: string;
  details: string;
  impact: string | null;
  mpa: string;
  cycle_year: number;
}

interface PreviewStatement {
  id: string;
  statement: string;
  mpa: string;
  cycle_year: number;
  created_at: string;
}

interface PendingLink {
  id: string;
  team_member_id: string;
  status: "pending" | "accepted" | "rejected";
  data_synced: boolean;
  supervisor_accepted: boolean;
  created_at: string;
  // Joined data
  team_member: {
    full_name: string;
    email: string | null;
    rank: Rank | null;
    afsc: string | null;
    supervisor: {
      id: string;
      full_name: string | null;
      rank: Rank | null;
    } | null;
  };
  // Metrics
  entry_count: number;
  statement_count: number;
}

type ActionType = "sync_data" | "accept_supervisor" | "dismiss" | "snooze" | null;

export function PendingLinksCard() {
  const { profile } = useUserStore();
  const [pendingLinks, setPendingLinks] = useState<PendingLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLink, setSelectedLink] = useState<PendingLink | null>(null);
  const [actionType, setActionType] = useState<ActionType>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Preview modal state
  const [previewLink, setPreviewLink] = useState<PendingLink | null>(null);
  const [previewEntries, setPreviewEntries] = useState<PreviewEntry[]>([]);
  const [previewStatements, setPreviewStatements] = useState<PreviewStatement[]>([]);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const supabase = createClient();

  // Type definitions for database rows
  type PendingLinkRow = {
    id: string;
    team_member_id: string;
    status: string;
    data_synced: boolean | null;
    supervisor_accepted: boolean | null;
    created_at: string;
    snoozed_until: string | null;
  };

  type TeamMemberRow = {
    id: string;
    full_name: string;
    email: string | null;
    rank: string | null;
    afsc: string | null;
    supervisor_id: string;
  };

  type SupervisorRow = {
    id: string;
    full_name: string | null;
    rank: string | null;
  };

  useEffect(() => {
    async function loadPendingLinks() {
      if (!profile?.id) return;

      setIsLoading(true);

      const consumed = await consumePersistedManagedInviteToken();
      if (consumed?.success) {
        toast.success(
          consumed.emailMismatch
            ? "Invite connected — your supervisor can update the managed account email"
            : "Invite connected to your supervisor's managed account",
          {
            description: consumed.memberName
              ? `Linked invite for ${consumed.memberName}`
              : undefined,
          }
        );
      } else if (consumed && !consumed.success && consumed.error) {
        console.error("Invite token consume:", consumed.error);
      }

      // Query pending links with type cast
      // Filter out snoozed links (snoozed_until is null or in the past)
      const { data, error } = await supabase
        .from("pending_managed_links")
        .select("id, team_member_id, status, data_synced, supervisor_accepted, created_at, snoozed_until")
        .eq("user_id", profile.id)
        .eq("status", "pending")
        .or("snoozed_until.is.null,snoozed_until.lt." + new Date().toISOString()) as { data: PendingLinkRow[] | null; error: Error | null };

      if (error) {
        console.error("Error loading pending links:", error);
        setIsLoading(false);
        return;
      }

      if (!data || data.length === 0) {
        setPendingLinks([]);
        setIsLoading(false);
        return;
      }

      // Fetch team member details
      const teamMemberIds = data.map((link) => link.team_member_id);

      const { data: teamMembersData } = await supabase
        .from("team_members")
        .select("id, full_name, email, rank, afsc, supervisor_id")
        .in("id", teamMemberIds) as { data: TeamMemberRow[] | null; error: Error | null };

      const teamMembers = teamMembersData || [];

      // Fetch supervisor profiles
      const supervisorIds = [...new Set(teamMembers.map((tm) => tm.supervisor_id))];
      const { data: supervisorsData } = await supabase
        .from("profiles")
        .select("id, full_name, rank")
        .in("id", supervisorIds) as { data: SupervisorRow[] | null; error: Error | null };

      const supervisors = supervisorsData || [];

      // Fetch entry and statement counts for each team member
      const { data: entryCounts } = await supabase
        .from("accomplishments")
        .select("team_member_id")
        .in("team_member_id", teamMemberIds) as { data: { team_member_id: string | null }[] | null; error: Error | null };

      const { data: statementCounts } = await supabase
        .from("refined_statements")
        .select("team_member_id")
        .in("team_member_id", teamMemberIds) as { data: { team_member_id: string | null }[] | null; error: Error | null };

      // Build lookup maps
      const teamMemberMap = new Map(teamMembers.map((tm) => [tm.id, tm]));
      const supervisorMap = new Map(supervisors.map((s) => [s.id, s]));

      // Count entries and statements per team member
      const entryCountMap = new Map<string, number>();
      const statementCountMap = new Map<string, number>();

      entryCounts?.forEach((e) => {
        const id = e.team_member_id;
        if (id) entryCountMap.set(id, (entryCountMap.get(id) || 0) + 1);
      });

      statementCounts?.forEach((s) => {
        const id = s.team_member_id;
        if (id) statementCountMap.set(id, (statementCountMap.get(id) || 0) + 1);
      });

      // Transform the data structure
      const transformed: PendingLink[] = data.map((link) => {
        const tm = teamMemberMap.get(link.team_member_id);
        const supervisor = tm ? supervisorMap.get(tm.supervisor_id) : null;

        return {
          id: link.id,
          team_member_id: link.team_member_id,
          status: link.status as "pending" | "accepted" | "rejected",
          data_synced: link.data_synced ?? false,
          supervisor_accepted: link.supervisor_accepted ?? false,
          created_at: link.created_at,
          team_member: {
            full_name: tm?.full_name || "Unknown",
            email: tm?.email || null,
            rank: (tm?.rank as Rank) || null,
            afsc: tm?.afsc || null,
            supervisor: supervisor
              ? {
                  id: supervisor.id,
                  full_name: supervisor.full_name,
                  rank: supervisor.rank as Rank,
                }
              : null,
          },
          entry_count: entryCountMap.get(link.team_member_id) || 0,
          statement_count: statementCountMap.get(link.team_member_id) || 0,
        };
      });

      setPendingLinks(transformed);
      setIsLoading(false);
    }

    loadPendingLinks();
  }, [profile?.id, supabase]);

  // Type for RPC calls (until types are regenerated)
  type RpcClient = {
    rpc: (fn: string, args: { link_id: string }) => Promise<{ data: unknown; error: Error | null }>;
  };

  const openPreview = async (link: PendingLink) => {
    setPreviewLink(link);
    setIsLoadingPreview(true);
    setPreviewEntries([]);
    setPreviewStatements([]);

    // Fetch entries
    const { data: entries } = await supabase
      .from("accomplishments")
      .select("id, date, action_verb, details, impact, mpa, cycle_year")
      .eq("team_member_id", link.team_member_id)
      .order("date", { ascending: false }) as { data: PreviewEntry[] | null };

    // Fetch statements
    const { data: statements } = await supabase
      .from("refined_statements")
      .select("id, statement, mpa, cycle_year, created_at")
      .eq("team_member_id", link.team_member_id)
      .order("created_at", { ascending: false }) as { data: PreviewStatement[] | null };

    setPreviewEntries(entries || []);
    setPreviewStatements(statements || []);
    setIsLoadingPreview(false);
  };

  const handleSyncFromPreview = async () => {
    if (!previewLink) return;
    setPreviewLink(null);
    await handleSyncData(previewLink);
  };

  const getMpaLabel = (mpa: string): string => {
    return MPA_ABBREVIATIONS[mpa] || mpa;
  };

  const handleSyncData = async (link: PendingLink) => {
    setIsProcessing(true);

    const { data, error } = await (supabase as unknown as RpcClient).rpc("sync_managed_account_data", {
      link_id: link.id,
    });

    if (error) {
      console.error("Error syncing data:", error);
      toast.error("Failed to sync data", { description: error.message });
    } else {
      const result = data as { entries_synced: number; statements_synced: number };
      
      // If supervisor already accepted, auto-complete
      if (link.supervisor_accepted) {
        await (supabase as unknown as RpcClient).rpc("complete_pending_link", { link_id: link.id });
        Analytics.managedAccountDataSynced();
        Analytics.managedAccountLinkCompleted();
        toast.success("All set!", {
          description: `Synced ${result.entries_synced} entries and ${result.statements_synced} statements.`,
        });
        setPendingLinks((prev) => prev.filter((l) => l.id !== link.id));
      } else {
        Analytics.managedAccountDataSynced();
        toast.success("Data synced!", {
          description: `Synced ${result.entries_synced} entries and ${result.statements_synced} statements.`,
        });
        // Update local state to show next step
        setPendingLinks((prev) =>
          prev.map((l) => (l.id === link.id ? { ...l, data_synced: true } : l))
        );
      }
    }

    setIsProcessing(false);
    setSelectedLink(null);
    setActionType(null);
  };

  const handleAcceptSupervisor = async (link: PendingLink) => {
    setIsProcessing(true);

    const { data, error } = await (supabase as unknown as RpcClient).rpc("accept_supervisor_from_link", {
      link_id: link.id,
    });

    if (error) {
      console.error("Error accepting supervisor:", error);
      toast.error("Failed to accept supervisor", { description: error.message });
    } else {
      const result = data as { supervisor_name: string };
      const hasData = link.entry_count > 0 || link.statement_count > 0;
      
      // If no data to sync, auto-complete the link
      if (!hasData) {
        await (supabase as unknown as RpcClient).rpc("complete_pending_link", { link_id: link.id });
        Analytics.managedAccountSupervisorAccepted();
        Analytics.managedAccountLinkCompleted();
        toast.success("Supervisor linked!", {
          description: `${result.supervisor_name} is now your supervisor.`,
        });
        setPendingLinks((prev) => prev.filter((l) => l.id !== link.id));
      } else {
        Analytics.managedAccountSupervisorAccepted();
        toast.success("Supervisor accepted!", {
          description: `${result.supervisor_name} is now your supervisor. You can now sync their entries.`,
        });
        // Update local state to show next step
        setPendingLinks((prev) =>
          prev.map((l) => (l.id === link.id ? { ...l, supervisor_accepted: true } : l))
        );
      }
    }

    setIsProcessing(false);
    setSelectedLink(null);
    setActionType(null);
  };

  const handleDismiss = async (link: PendingLink) => {
    setIsProcessing(true);

    const { error } = await (supabase as unknown as RpcClient).rpc("dismiss_pending_link", {
      link_id: link.id,
    });

    if (error) {
      console.error("Error dismissing link:", error);
      toast.error("Failed to dismiss", { description: error.message });
    } else {
      Analytics.managedAccountLinkDismissed();
      toast.info("Link dismissed");
      setPendingLinks((prev) => prev.filter((l) => l.id !== link.id));
    }

    setIsProcessing(false);
    setSelectedLink(null);
    setActionType(null);
  };

  const handleSnooze = async (link: PendingLink) => {
    setIsProcessing(true);

    const { error } = await (supabase as unknown as RpcClient).rpc("snooze_pending_link", {
      link_id: link.id,
    });

    if (error) {
      console.error("Error snoozing link:", error);
      toast.error("Failed to snooze", { description: error.message });
    } else {
      toast.info("Request snoozed for 7 days");
      setPendingLinks((prev) => prev.filter((l) => l.id !== link.id));
    }

    setIsProcessing(false);
    setSelectedLink(null);
    setActionType(null);
  };

  const handleComplete = async (link: PendingLink) => {
    const { error } = await (supabase as unknown as RpcClient).rpc("complete_pending_link", {
      link_id: link.id,
    });

    if (!error) {
      Analytics.managedAccountLinkCompleted();
      setPendingLinks((prev) => prev.filter((l) => l.id !== link.id));
      toast.success("Onboarding complete!");
    }
  };

  const openConfirmDialog = (link: PendingLink, action: ActionType) => {
    setSelectedLink(link);
    setActionType(action);
  };

  // Don't show anything during loading or if no pending links
  // This prevents the orange skeleton card from flickering before the main content loads
  if (isLoading || pendingLinks.length === 0) {
    return null;
  }

  return (
    <TooltipProvider>
      <Card
        id="pending-account-links"
        className="border-amber-300 dark:border-amber-600/50 bg-amber-50/50 dark:bg-amber-900/10 scroll-mt-24 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_2px_4px_rgba(0,0,0,0.02),0_0_0_0.5px_rgba(245,158,11,0.35)]"
      >
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <LinkIcon className="size-5" />
            Account Link Requests
          </CardTitle>
          <CardDescription>
            Supervisors have created managed accounts with your email. Review each one and decide what to sync.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {pendingLinks.map((link) => (
            <div
              key={link.id}
              className="p-4 rounded-lg border bg-card space-y-4"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                    <UserPlus className="size-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <span className="font-medium">
                      {link.team_member.supervisor?.rank}{" "}
                      {link.team_member.supervisor?.full_name || "Unknown Supervisor"}
                    </span>
                    <p className="text-sm text-muted-foreground">
                      Created {new Date(link.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-muted-foreground hover:text-amber-600 shrink-0"
                        onClick={() => openConfirmDialog(link, "snooze")}
                      >
                        <Clock className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Snooze for 7 days</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() => openConfirmDialog(link, "dismiss")}
                      >
                        <X className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Dismiss this link request</TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {/* Data Summary */}
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1.5">
                  <FileText className="size-4 text-muted-foreground" />
                  <span className="font-medium">{link.entry_count}</span>
                  <span className="text-muted-foreground">entries</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <MessageSquare className="size-4 text-muted-foreground" />
                  <span className="font-medium">{link.statement_count}</span>
                  <span className="text-muted-foreground">statements</span>
                </div>
              </div>

              {/* Actions - Context-aware buttons */}
              <div className="flex flex-wrap items-center gap-2">
                {(() => {
                  const hasData = link.entry_count > 0 || link.statement_count > 0;
                  const needsDataDecision = hasData && !link.data_synced;
                  const needsSupervisorDecision = !link.supervisor_accepted;

                  // Case 1: Nothing done yet - must accept supervisor first to see data
                  if (needsSupervisorDecision && needsDataDecision) {
                    return (
                      <div className="flex flex-col gap-2 w-full">
                        <Button
                          size="sm"
                          className="bg-amber-600 hover:bg-amber-700 text-white"
                          onClick={() => openConfirmDialog(link, "accept_supervisor")}
                        >
                          <Users className="size-4 mr-1.5" />
                          Accept Supervisor
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          Accept the supervisor link first to preview and sync entries/statements
                        </p>
                      </div>
                    );
                  }

                  // Case 2: No data, just needs supervisor decision
                  if (needsSupervisorDecision && !hasData) {
                    return (
                      <Button
                        size="sm"
                        className="bg-amber-600 hover:bg-amber-700 text-white"
                        onClick={() => openConfirmDialog(link, "accept_supervisor")}
                      >
                        <Users className="size-4 mr-1.5" />
                        Accept Supervisor
                      </Button>
                    );
                  }

                  // Case 3: Supervisor accepted, now decide on data
                  if (link.supervisor_accepted && needsDataDecision) {
                    return (
                      <>
                        <Badge variant="secondary" className="gap-1">
                          <Check className="size-3" />
                          Supervisor Linked
                        </Badge>
                        <div className="flex items-center gap-2 ml-auto">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleComplete(link)}
                          >
                            Skip Data
                          </Button>
                          <Button
                            size="sm"
                            className="bg-amber-600 hover:bg-amber-700 text-white"
                            onClick={() => openPreview(link)}
                          >
                            <Eye className="size-4 mr-1.5" />
                            Preview & Sync
                          </Button>
                        </div>
                      </>
                    );
                  }

                  // Case 4: Data synced, now decide on supervisor
                  if (link.data_synced && needsSupervisorDecision) {
                    return (
                      <>
                        <Badge variant="secondary" className="gap-1">
                          <Check className="size-3" />
                          Data Synced
                        </Badge>
                        <div className="flex items-center gap-2 ml-auto">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleComplete(link)}
                          >
                            Finish without Supervisor
                          </Button>
                          <Button
                            size="sm"
                            className="bg-amber-600 hover:bg-amber-700 text-white"
                            onClick={() => openConfirmDialog(link, "accept_supervisor")}
                          >
                            <Users className="size-4 mr-1.5" />
                            Accept Supervisor
                          </Button>
                        </div>
                      </>
                    );
                  }

                  // Case 5: Both done or no data and supervisor accepted - auto shows done state
                  return (
                    <>
                      {link.data_synced && (
                        <Badge variant="secondary" className="gap-1">
                          <Check className="size-3" />
                          Data Synced
                        </Badge>
                      )}
                      {link.supervisor_accepted && (
                        <Badge variant="secondary" className="gap-1">
                          <Check className="size-3" />
                          Supervisor Linked
                        </Badge>
                      )}
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700 text-white ml-auto"
                        onClick={() => handleComplete(link)}
                      >
                        <Check className="size-4 mr-1" />
                        Done
                      </Button>
                    </>
                  );
                })()}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog
        open={selectedLink !== null && actionType !== null}
        onOpenChange={() => {
          setSelectedLink(null);
          setActionType(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionType === "sync_data" && "Sync Data from Managed Account?"}
              {actionType === "accept_supervisor" && "Accept Supervisor?"}
              {actionType === "dismiss" && "Dismiss Link Request?"}
              {actionType === "snooze" && "Snooze Link Request?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionType === "sync_data" && (
                <>
                  This will import <strong>{selectedLink?.entry_count} entries</strong> and{" "}
                  <strong>{selectedLink?.statement_count} statements</strong> created by{" "}
                  <strong>
                    {selectedLink?.team_member.supervisor?.rank}{" "}
                    {selectedLink?.team_member.supervisor?.full_name}
                  </strong>{" "}
                  into your account. This action cannot be undone.
                </>
              )}
              {actionType === "accept_supervisor" && (
                <>
                  This will add{" "}
                  <strong>
                    {selectedLink?.team_member.supervisor?.rank}{" "}
                    {selectedLink?.team_member.supervisor?.full_name}
                  </strong>{" "}
                  as your supervisor. They will be able to view your entries and create statements for you.
                </>
              )}
              {actionType === "dismiss" && (
                <>
                  This will dismiss the link request from{" "}
                  <strong>
                    {selectedLink?.team_member.supervisor?.rank}{" "}
                    {selectedLink?.team_member.supervisor?.full_name}
                  </strong>
                  . Any entries or statements they created will remain with them and won&apos;t be synced to your account.
                </>
              )}
              {actionType === "snooze" && (
                <>
                  This will hide the link request from{" "}
                  <strong>
                    {selectedLink?.team_member.supervisor?.rank}{" "}
                    {selectedLink?.team_member.supervisor?.full_name}
                  </strong>{" "}
                  for 7 days. It will reappear after that, and you can still accept or dismiss it later.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isProcessing}
              className={
                actionType === "dismiss"
                  ? "bg-destructive hover:bg-destructive/90"
                  : actionType === "snooze"
                    ? "bg-amber-500 hover:bg-amber-600"
                    : "bg-amber-600 hover:bg-amber-700"
              }
              onClick={() => {
                if (!selectedLink) return;
                if (actionType === "sync_data") handleSyncData(selectedLink);
                else if (actionType === "accept_supervisor") handleAcceptSupervisor(selectedLink);
                else if (actionType === "dismiss") handleDismiss(selectedLink);
                else if (actionType === "snooze") handleSnooze(selectedLink);
              }}
            >
              {isProcessing
                ? "Processing..."
                : actionType === "sync_data"
                  ? "Sync Data"
                  : actionType === "accept_supervisor"
                    ? "Accept Supervisor"
                    : actionType === "snooze"
                      ? "Snooze"
                      : "Dismiss"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Preview Modal */}
      <Dialog open={previewLink !== null} onOpenChange={() => setPreviewLink(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="size-5" />
              Preview Data from {previewLink?.team_member.supervisor?.rank}{" "}
              {previewLink?.team_member.supervisor?.full_name}
            </DialogTitle>
            <DialogDescription>
              Review the entries and statements before syncing them to your account.
            </DialogDescription>
          </DialogHeader>

          {isLoadingPreview ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Tabs defaultValue="entries" className="flex-1 overflow-hidden flex flex-col">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="entries" className="gap-1.5">
                  <FileText className="size-4" />
                  Entries ({previewEntries.length})
                </TabsTrigger>
                <TabsTrigger value="statements" className="gap-1.5">
                  <MessageSquare className="size-4" />
                  Statements ({previewStatements.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="entries" className="flex-1 overflow-hidden mt-4">
                <ScrollArea className="h-[300px] pr-4">
                  {previewEntries.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No entries to sync</p>
                  ) : (
                    <div className="space-y-3">
                      {previewEntries.map((entry) => (
                        <div key={entry.id} className="p-3 rounded-lg border bg-muted/30">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <Badge variant="outline" className="text-xs">
                              {getMpaLabel(entry.mpa)}
                            </Badge>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Calendar className="size-3" />
                              {new Date(entry.date).toLocaleDateString()}
                            </div>
                            <Badge variant="secondary" className="text-xs">
                              FY{entry.cycle_year}
                            </Badge>
                          </div>
                          <p className="text-sm">
                            <span className="font-medium">{entry.action_verb}</span> - {entry.details}
                          </p>
                          {entry.impact && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Impact: {entry.impact}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="statements" className="flex-1 overflow-hidden mt-4">
                <ScrollArea className="h-[300px] pr-4">
                  {previewStatements.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No statements to sync</p>
                  ) : (
                    <div className="space-y-3">
                      {previewStatements.map((stmt) => (
                        <div key={stmt.id} className="p-3 rounded-lg border bg-muted/30">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <Badge variant="outline" className="text-xs">
                              {getMpaLabel(stmt.mpa)}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              FY{stmt.cycle_year}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              Created {new Date(stmt.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-sm font-mono">{stmt.statement}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setPreviewLink(null)}>
              Cancel
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={handleSyncFromPreview}
              disabled={isLoadingPreview || isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="size-4 mr-1.5 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <Download className="size-4 mr-1.5" />
                  Sync All to My Account
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
