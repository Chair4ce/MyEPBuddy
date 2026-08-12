"use client";

import { useEffect, useState, Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import { useAccomplishmentsStore } from "@/stores/accomplishments-store";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { PageSpinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { EntryCard } from "@/components/entries/entry-card";
import { EntryFormDialog } from "@/components/entries/entry-form-dialog";
import { FuseToEpbBar } from "@/components/entries/fuse-to-epb-bar";
import { FuseToEpbDialog } from "@/components/entries/fuse-to-epb-dialog";
import { GenerateEpbDialog } from "@/components/entries/generate-epb-dialog";
import { TagFilterPopover } from "@/components/entries/tag-filter-popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "@/components/ui/sonner";
import { Analytics } from "@/lib/analytics";
import { deleteAccomplishment } from "@/app/actions/accomplishments";
import { evaluateEpbGenerationReadiness } from "@/lib/epb-generation-readiness";
import { Plus, Filter, FileText, LayoutList, CalendarDays, Sparkles } from "lucide-react";
import { ENTRY_MGAS, AWARD_QUARTERS, getQuarterDateRange, getFiscalQuarterDateRange, getActiveCycleYear, isEnlisted } from "@/lib/constants";
import { EPBProgressCard } from "@/components/epb/epb-progress-card";
import { SupervisorFeedbackPanel } from "@/components/entries/supervisor-feedback-panel";
import type { Rank } from "@/types/database";
import type { SelectedRatee } from "@/stores/epb-shell-store";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type {
  Accomplishment,
  AwardQuarter,
  EPBShell,
  EPBShellSection,
} from "@/types/database";
import { formatShortDate, formatShortDateWithYear } from "@/lib/format";

function EntriesContent() {
  const searchParams = useSearchParams();
  const { profile, subordinates, managedMembers } = useUserStore();
  const {
    accomplishments,
    setAccomplishments,
    removeAccomplishment,
    isLoading,
    setIsLoading,
  } = useAccomplishmentsStore();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Accomplishment | null>(null);
  const [selectedUser, setSelectedUser] = useState<string>("self");
  const [selectedMPA, setSelectedMPA] = useState<string>("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [creatorProfiles, setCreatorProfiles] = useState<Record<string, { full_name: string | null; rank: string | null }>>({});
  
  // View mode: list (chronological) or quarterly
  const [viewMode, setViewMode] = useState<"list" | "quarterly">("list");
  const [useFiscalYear, setUseFiscalYear] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(
    () => new Set()
  );
  const [fuseDialogOpen, setFuseDialogOpen] = useState(false);
  const [generateEpbOpen, setGenerateEpbOpen] = useState(false);
  const [genEpbShell, setGenEpbShell] = useState<
    (EPBShell & { sections: EPBShellSection[] }) | null
  >(null);
  const [genEpbDuty, setGenEpbDuty] = useState("");
  const [genEpbLoading, setGenEpbLoading] = useState(false);
  
  const supabase = createClient();
  // Cycle year is computed from the user's rank and SCOD
  const cycleYear = getActiveCycleYear(profile?.rank as Rank | null);
  // Use entry MPAs (excludes HLR which is Commander's assessment)
  const mgas = ENTRY_MGAS;

  const handleSelectedUserChange = (value: string) => {
    setSelectedUser(value);
    setSelectedEntryIds(new Set());
  };

  const toggleEntrySelected = (id: string, checked: boolean) => {
    setSelectedEntryIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  /** Card click selects the entry; ignore clicks on edit/delete/checkbox controls. */
  const handleEntryCardClick = (
    e: React.MouseEvent,
    entryId: string,
    isSelected: boolean,
    showSelect: boolean
  ) => {
    if (!showSelect) return;
    const target = e.target;
    if (
      target instanceof Element &&
      target.closest("button, a, input, label, [role='checkbox']")
    ) {
      return;
    }
    toggleEntrySelected(entryId, !isSelected);
  };

  // Open dialog if ?new=true
  useEffect(() => {
    if (searchParams.get("new") === "true") {
      setDialogOpen(true);
    }
  }, [searchParams]);

  // Check if selected user is a managed member (starts with "managed:")
  const isManagedMember = selectedUser.startsWith("managed:");
  const managedMemberId = isManagedMember ? selectedUser.replace("managed:", "") : null;

  const rateeRank = useMemo((): Rank | null => {
    if (isManagedMember && managedMemberId) {
      return (managedMembers.find((m) => m.id === managedMemberId)?.rank ?? null) as Rank | null;
    }
    if (selectedUser !== "self") {
      return (subordinates.find((s) => s.id === selectedUser)?.rank ?? null) as Rank | null;
    }
    return (profile?.rank ?? null) as Rank | null;
  }, [selectedUser, isManagedMember, managedMemberId, managedMembers, subordinates, profile?.rank]);

  // Load accomplishments
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      if (!profile) return;

      setIsLoading(true);

      try {
        let query = supabase
          .from("accomplishments")
          .select("*")
          .eq("cycle_year", cycleYear)
          .order("date", { ascending: false });

        if (isManagedMember && managedMemberId) {
          query = query.eq("team_member_id", managedMemberId);
        } else {
          const targetUserId = selectedUser === "self" ? profile.id : selectedUser;
          query = query.eq("user_id", targetUserId).is("team_member_id", null);
        }

        if (selectedMPA !== "all") {
          query = query.eq("mpa", selectedMPA);
        }

        const { data, error } = await query.abortSignal(controller.signal);

        if (!error && data) {
          const typedData = data as unknown as Accomplishment[];
          const ids = typedData.map((a) => a.id);
          let withLinks = typedData;
          if (ids.length > 0) {
            const { data: links } = await (supabase as any)
              .from("accomplishment_awards")
              .select("accomplishment_id, award_id, sort_order")
              .in("accomplishment_id", ids)
              .abortSignal(controller.signal);
            if (links && !controller.signal.aborted) {
              const byAcc = new Map<string, { award_id: string; sort_order: number }[]>();
              for (const row of links as Array<{
                accomplishment_id: string;
                award_id: string;
                sort_order: number;
              }>) {
                const list = byAcc.get(row.accomplishment_id) || [];
                list.push(row);
                byAcc.set(row.accomplishment_id, list);
              }
              withLinks = typedData.map((a) => {
                const rows = (byAcc.get(a.id) || []).sort(
                  (x, y) => x.sort_order - y.sort_order
                );
                return {
                  ...a,
                  linked_award_ids: rows.map((r) => r.award_id),
                };
              });
            }
          }
          setAccomplishments(withLinks);

          const creatorIds = [...new Set(
            withLinks
              .filter((a) => a.created_by && a.created_by !== a.user_id)
              .map((a) => a.created_by)
          )];

          if (creatorIds.length > 0) {
            const { data: creators } = await supabase
              .from("profiles")
              .select("id, full_name, rank")
              .in("id", creatorIds)
              .abortSignal(controller.signal);

            if (creators) {
              type CreatorProfile = { id: string; full_name: string | null; rank: string | null };
              const profileMap: Record<string, { full_name: string | null; rank: string | null }> = {};
              (creators as CreatorProfile[]).forEach((c) => {
                profileMap[c.id] = { full_name: c.full_name, rank: c.rank };
              });
              setCreatorProfiles(profileMap);
            }
          }
        }
      } finally {
        setIsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [profile, selectedUser, isManagedMember, managedMemberId, selectedMPA, cycleYear, supabase, setAccomplishments, setIsLoading]);

  // Group entries by quarter for quarterly view
  interface QuarterGroup {
    quarter: AwardQuarter;
    dateRange: { start: string; end: string };
    entries: Accomplishment[];
  }

  // Extract all unique tags from accomplishments for the filter
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    accomplishments.forEach((entry) => {
      if (Array.isArray(entry.tags)) {
        entry.tags.forEach((tag) => tagSet.add(tag));
      }
    });
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
  }, [accomplishments]);

  // Filter accomplishments by selected tags
  const filteredAccomplishments = useMemo(() => {
    if (selectedTags.length === 0) {
      return accomplishments;
    }
    return accomplishments.filter((entry) => {
      if (!Array.isArray(entry.tags) || entry.tags.length === 0) {
        return false;
      }
      // Entry matches if it has ANY of the selected tags
      return selectedTags.some((tag) => entry.tags.includes(tag));
    });
  }, [accomplishments, selectedTags]);

  // Re-compute quarter groups with filtered accomplishments
  const filteredQuarterGroups = useMemo((): QuarterGroup[] => {
    const groups: QuarterGroup[] = AWARD_QUARTERS.map((q) => {
      const dateRange = useFiscalYear
        ? getFiscalQuarterDateRange(q.value, cycleYear)
        : getQuarterDateRange(q.value, cycleYear);

      return {
        quarter: q.value,
        dateRange,
        entries: [],
      };
    });

    // Assign filtered entries to quarters based on date
    filteredAccomplishments.forEach((entry) => {
      const entryDate = entry.date;
      for (const group of groups) {
        if (entryDate >= group.dateRange.start && entryDate <= group.dateRange.end) {
          group.entries.push(entry);
          break;
        }
      }
    });

    return groups;
  }, [filteredAccomplishments, useFiscalYear, cycleYear]);

  const selectedAccomplishments = useMemo(
    () => filteredAccomplishments.filter((e) => selectedEntryIds.has(e.id)),
    [filteredAccomplishments, selectedEntryIds]
  );

  const fuseRatee = useMemo((): SelectedRatee | null => {
    if (!profile) return null;
    if (isManagedMember && managedMemberId) {
      const member = managedMembers.find((m) => m.id === managedMemberId);
      if (!member) return null;
      return {
        id: member.id,
        fullName: member.full_name,
        rank: (member.rank as Rank | null) ?? null,
        afsc: member.afsc ?? null,
        isManagedMember: true,
      };
    }
    if (selectedUser !== "self") {
      const sub = subordinates.find((s) => s.id === selectedUser);
      if (!sub) return null;
      return {
        id: sub.id,
        fullName: sub.full_name,
        rank: (sub.rank as Rank | null) ?? null,
        afsc: sub.afsc ?? null,
        isManagedMember: false,
      };
    }
    return {
      id: profile.id,
      fullName: profile.full_name,
      rank: (profile.rank as Rank | null) ?? null,
      afsc: profile.afsc ?? null,
      isManagedMember: false,
    };
  }, [
    profile,
    selectedUser,
    isManagedMember,
    managedMemberId,
    managedMembers,
    subordinates,
  ]);

  const canFuseToEpb =
    !!fuseRatee &&
    isEnlisted(fuseRatee.rank) &&
    selectedAccomplishments.length > 0;

  // Full-EPB generation readiness (content-based; the plan step selects entries).
  const epbReadiness = useMemo(
    () => evaluateEpbGenerationReadiness(accomplishments, { rank: rateeRank }),
    [accomplishments, rateeRank]
  );
  const showGenerateEpb = !!fuseRatee && isEnlisted(fuseRatee.rank);

  // Fetch the ratee's active shell (for the duty-description preflight) before
  // opening the Generate EPB dialog, so we can auto-open the workbench if empty.
  async function openGenerateEpb() {
    if (!fuseRatee) return;
    setGenEpbLoading(true);
    try {
      let query = supabase
        .from("epb_shells")
        .select(`*, sections:epb_shell_sections(*)`)
        .neq("status", "archived")
        .order("updated_at", { ascending: false });
      query = fuseRatee.isManagedMember
        ? query.eq("team_member_id", fuseRatee.id)
        : query.eq("user_id", fuseRatee.id).is("team_member_id", null);
      const { data } = await query.limit(1).maybeSingle();
      const shell =
        (data as (EPBShell & { sections: EPBShellSection[] }) | null) ?? null;
      setGenEpbShell(shell);
      setGenEpbDuty(shell?.duty_description ?? "");
    } catch {
      setGenEpbShell(null);
      setGenEpbDuty("");
    } finally {
      setGenEpbLoading(false);
      setGenerateEpbOpen(true);
    }
  }

  function handleEdit(entry: Accomplishment) {
    setEditingEntry(entry);
    setDialogOpen(true);
  }

  async function handleDelete(id: string) {
    const result = await deleteAccomplishment(id);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    removeAccomplishment(id);
    Analytics.accomplishmentDeleted("unknown");
    toast.success("Entry deleted");
    setDeleteId(null);
  }

  function handleDialogClose() {
    setDialogOpen(false);
    setEditingEntry(null);
  }

  // Users can add entries for subordinates if they have any (real or managed)
  const canManageTeam = subordinates.length > 0 || managedMembers.length > 0 || profile?.role === "admin";
  const hasSubordinates = subordinates.length > 0 || managedMembers.length > 0;

  if (isLoading) {
    return <PageSpinner />;
  }

  return (
    <div className={cn(
      "space-y-6 w-full max-w-7xl pb-10",
      selectedEntryIds.size > 0 && isEnlisted(fuseRatee?.rank ?? null) && "pb-28"
    )}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Accomplishments</h1>
        </div>
        <div className="flex items-center gap-2">
          <SupervisorFeedbackPanel />
          {showGenerateEpb && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      variant="outline"
                      disabled={!epbReadiness.canGenerate || genEpbLoading}
                      onClick={openGenerateEpb}
                    >
                      <Sparkles className="size-4 mr-2" />
                      Generate EPB
                    </Button>
                  </span>
                </TooltipTrigger>
                {!epbReadiness.canGenerate && epbReadiness.reasons.length > 0 && (
                  <TooltipContent className="max-w-xs">
                    {epbReadiness.reasons.join(" ")}
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          )}
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="size-4 mr-2" />
            New Entry
          </Button>
        </div>
      </div>

      {/* Performance Coverage & Progress — keyed to ratee, not viewer */}
      {rateeRank !== "Civilian" && (
        <EPBProgressCard
          rank={rateeRank}
          entries={accomplishments}
          viewerRole={selectedUser === "self" ? "self" : "rater"}
        />
      )}

      {/* Filters & View Controls - Local to entries list */}
      <div className="flex flex-wrap items-center gap-3">
        {canManageTeam && hasSubordinates && (
          <Select value={selectedUser} onValueChange={handleSelectedUserChange}>
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="Viewing for" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="self">Myself</SelectItem>
              {subordinates.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    Registered Team
                  </div>
                  {subordinates.map((sub) => (
                    <SelectItem key={sub.id} value={sub.id}>
                      {sub.rank} {sub.full_name}
                    </SelectItem>
                  ))}
                </>
              )}
              {managedMembers.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                    Managed Members
                  </div>
                  {managedMembers.map((member) => (
                    <SelectItem key={member.id} value={`managed:${member.id}`}>
                      {member.rank} {member.full_name}
                      {member.is_placeholder && " (Managed)"}
                    </SelectItem>
                  ))}
                </>
              )}
            </SelectContent>
          </Select>
        )}

        <Select value={selectedMPA} onValueChange={setSelectedMPA}>
          <SelectTrigger className="w-[160px] h-9">
            <Filter className="size-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue />
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

        <TagFilterPopover
          availableTags={availableTags}
          selectedTags={selectedTags}
          onSelectedTagsChange={setSelectedTags}
        />

        <div className="ml-auto flex items-center gap-3">
          {/* Fiscal Year Toggle - only show in quarterly view; sits left of List/Quarterly so the tabs stay pinned */}
          {viewMode === "quarterly" && (
            <div className="flex items-center gap-2 h-9 px-3 rounded-md border bg-background">
              <span className={cn("text-sm", !useFiscalYear && "font-medium")}>Calendar</span>
              <Switch
                checked={useFiscalYear}
                onCheckedChange={setUseFiscalYear}
                aria-label="Toggle fiscal year"
              />
              <span className={cn("text-sm", useFiscalYear && "font-medium")}>Fiscal</span>
            </div>
          )}

          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "list" | "quarterly")}>
            <TabsList className="h-9">
              <TabsTrigger value="list" className="gap-1.5 px-3">
                <LayoutList className="size-4" />
                <span className="hidden sm:inline">List</span>
              </TabsTrigger>
              <TabsTrigger value="quarterly" className="gap-1.5 px-3">
                <CalendarDays className="size-4" />
                <span className="hidden sm:inline">Quarterly</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Entries List or Quarterly View */}
      {filteredAccomplishments.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <FileText className="size-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-medium mb-2">No entries found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {selectedTags.length > 0
                  ? "No entries match the selected tags. Try adjusting your filters."
                  : selectedMPA !== "all"
                  ? "No entries for this MPA. Try a different filter."
                  : "Start tracking accomplishments by creating your first entry."}
              </p>
              {selectedTags.length > 0 || selectedMPA !== "all" ? (
                <Button 
                  variant="outline"
                  onClick={() => {
                    setSelectedTags([]);
                    setSelectedMPA("all");
                  }}
                >
                  Clear Filters
                </Button>
              ) : (
                <Button onClick={() => setDialogOpen(true)}>
                  <Plus className="size-4 mr-2" />
                  Create Entry
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : viewMode === "quarterly" ? (
        /* Quarterly View */
        <div className="space-y-6">
          {filteredQuarterGroups.map((group) => (
            <Card key={group.quarter}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "flex items-center justify-center size-10 rounded-lg font-bold text-lg",
                      group.entries.length > 0 
                        ? "bg-primary text-primary-foreground" 
                        : "bg-muted text-muted-foreground"
                    )}>
                      {group.quarter}
                    </div>
                    <CardDescription className="text-xs">
                      {formatShortDate(group.dateRange.start)} - {formatShortDateWithYear(group.dateRange.end)}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              {group.entries.length > 0 && (
                <CardContent className="pt-0">
                  <div className="space-y-2.5">
                    {group.entries.map((entry) => {
                      const isSelected = selectedEntryIds.has(entry.id);
                      const showSelect = isEnlisted(fuseRatee?.rank ?? null);
                      return (
                        <EntryCard
                          key={entry.id}
                          entry={entry}
                          variant="compact"
                          mpaLabel={
                            mgas.find((m) => m.key === entry.mpa)?.label ||
                            entry.mpa ||
                            "Unassigned"
                          }
                          showSelect={showSelect}
                          isSelected={isSelected}
                          showScore={isEnlisted(profile?.rank as Rank)}
                          creator={
                            entry.created_by
                              ? creatorProfiles[entry.created_by]
                              : undefined
                          }
                          onToggleSelect={(checked) =>
                            toggleEntrySelected(entry.id, checked)
                          }
                          onEdit={() => handleEdit(entry)}
                          onRequestDelete={() => setDeleteId(entry.id)}
                          onCardClick={(e) =>
                            handleEntryCardClick(
                              e,
                              entry.id,
                              isSelected,
                              showSelect
                            )
                          }
                        />
                      );
                    })}
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      ) : (
        /* List View */
        <div className="space-y-3">
          {filteredAccomplishments.map((entry) => {
            const isSelected = selectedEntryIds.has(entry.id);
            const showSelect = isEnlisted(fuseRatee?.rank ?? null);

            return (
              <EntryCard
                key={entry.id}
                entry={entry}
                variant="list"
                mpaLabel={
                  mgas.find((m) => m.key === entry.mpa)?.label ||
                  entry.mpa ||
                  "Unassigned"
                }
                showSelect={showSelect}
                isSelected={isSelected}
                showScore={isEnlisted(profile?.rank as Rank)}
                creator={
                  entry.created_by
                    ? creatorProfiles[entry.created_by]
                    : undefined
                }
                onToggleSelect={(checked) =>
                  toggleEntrySelected(entry.id, checked)
                }
                onEdit={() => handleEdit(entry)}
                onRequestDelete={() => setDeleteId(entry.id)}
                onCardClick={(e) =>
                  handleEntryCardClick(e, entry.id, isSelected, showSelect)
                }
              />
            );
          })}
        </div>
      )}

      <AlertDialog
        open={deleteId != null}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Entry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this entry? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                className="text-[#ffffff]"
                onClick={() => {
                  if (deleteId) handleDelete(deleteId);
                }}
              >
                Delete
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EntryFormDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        editEntry={editingEntry}
        targetUserId={selectedUser === "self" ? profile?.id : (isManagedMember ? null : selectedUser)}
        targetManagedMemberId={isManagedMember ? managedMemberId : null}
      />

      {fuseRatee && isEnlisted(fuseRatee.rank) && (
        <FuseToEpbBar
          selectedCount={selectedAccomplishments.length}
          canFuse={canFuseToEpb}
          onClear={() => setSelectedEntryIds(new Set())}
          onFuse={() => setFuseDialogOpen(true)}
        />
      )}

      {fuseDialogOpen && fuseRatee && selectedAccomplishments.length > 0 && (
        <FuseToEpbDialog
          key={selectedAccomplishments.map((a) => a.id).join(",")}
          open={fuseDialogOpen}
          onOpenChange={setFuseDialogOpen}
          accomplishments={selectedAccomplishments}
          ratee={fuseRatee}
        />
      )}

      {generateEpbOpen && fuseRatee && (
        <GenerateEpbDialog
          open={generateEpbOpen}
          onOpenChange={setGenerateEpbOpen}
          ratee={fuseRatee}
          readiness={epbReadiness}
          preselected={
            selectedAccomplishments.length > 0
              ? selectedAccomplishments
              : undefined
          }
          initialShell={genEpbShell}
          initialDutyDescription={genEpbDuty}
        />
      )}
    </div>
  );
}

export default function EntriesPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <EntriesContent />
    </Suspense>
  );
}

