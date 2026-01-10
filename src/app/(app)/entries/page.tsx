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
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { EntryFormDialog } from "@/components/entries/entry-form-dialog";
import { TagFilterPopover } from "@/components/entries/tag-filter-popover";
import { toast } from "@/components/ui/sonner";
import { deleteAccomplishment } from "@/app/actions/accomplishments";
import { Plus, Pencil, Trash2, Filter, FileText, LayoutList, CalendarDays, Calendar } from "lucide-react";
import { ENTRY_MGAS, AWARD_QUARTERS, getQuarterDateRange, getFiscalQuarterDateRange, getActiveCycleYear } from "@/lib/constants";
import { EPBProgressCard } from "@/components/epb/epb-progress-card";
import type { Rank } from "@/types/database";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { Accomplishment, ManagedMember, Profile, AwardQuarter } from "@/types/database";
import { UserCheck } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function EntriesContent() {
  const searchParams = useSearchParams();
  const { profile, subordinates, managedMembers, epbConfig } = useUserStore();
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
  
  const supabase = createClient();
  // Cycle year is computed from the user's rank and SCOD
  const cycleYear = getActiveCycleYear(profile?.rank as Rank | null);
  // Use entry MPAs (excludes HLR which is Commander's assessment)
  const mgas = ENTRY_MGAS;

  // Open dialog if ?new=true
  useEffect(() => {
    if (searchParams.get("new") === "true") {
      setDialogOpen(true);
    }
  }, [searchParams]);

  // Check if selected user is a managed member (starts with "managed:")
  const isManagedMember = selectedUser.startsWith("managed:");
  const managedMemberId = isManagedMember ? selectedUser.replace("managed:", "") : null;

  // Load accomplishments
  useEffect(() => {
    async function loadAccomplishments() {
      if (!profile) return;

      setIsLoading(true);

      let query = supabase
        .from("accomplishments")
        .select("*")
        .eq("cycle_year", cycleYear)
        .order("date", { ascending: false });

      // Filter by user type
      if (isManagedMember && managedMemberId) {
        // Load entries for managed member
        query = query.eq("team_member_id", managedMemberId);
      } else {
        // Load entries for self or real subordinate
        const targetUserId = selectedUser === "self" ? profile.id : selectedUser;
        query = query.eq("user_id", targetUserId).is("team_member_id", null);
      }

      if (selectedMPA !== "all") {
        query = query.eq("mpa", selectedMPA);
      }

      const { data, error } = await query;

      if (!error && data) {
        const typedData = data as unknown as Accomplishment[];
        setAccomplishments(typedData);
        
        // Find entries created by someone other than the owner (supervisor-created)
        const creatorIds = [...new Set(
          typedData
            .filter((a) => a.created_by && a.created_by !== a.user_id)
            .map((a) => a.created_by)
        )];
        
        if (creatorIds.length > 0) {
          // Fetch creator profiles
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
      }

      setIsLoading(false);
    }

    loadAccomplishments();
  }, [profile, selectedUser, isManagedMember, managedMemberId, selectedMPA, cycleYear, supabase, setAccomplishments, setIsLoading]);

  // Group entries by quarter for quarterly view
  interface QuarterGroup {
    quarter: AwardQuarter;
    label: string;
    dateRange: { start: string; end: string };
    entries: Accomplishment[];
  }

  const quarterGroups = useMemo((): QuarterGroup[] => {
    const groups: QuarterGroup[] = AWARD_QUARTERS.map((q) => {
      const dateRange = useFiscalYear
        ? getFiscalQuarterDateRange(q.value, cycleYear)
        : getQuarterDateRange(q.value, cycleYear);

      return {
        quarter: q.value,
        label: useFiscalYear ? `FY${cycleYear.toString().slice(-2)} ${q.value}` : `${q.value} ${cycleYear}`,
        dateRange,
        entries: [],
      };
    });

    // Assign entries to quarters based on date
    accomplishments.forEach((entry) => {
      const entryDate = entry.date;
      for (const group of groups) {
        if (entryDate >= group.dateRange.start && entryDate <= group.dateRange.end) {
          group.entries.push(entry);
          break;
        }
      }
    });

    return groups;
  }, [accomplishments, useFiscalYear, cycleYear]);

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
        label: useFiscalYear ? `FY${cycleYear.toString().slice(-2)} ${q.value}` : `${q.value} ${cycleYear}`,
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
    <div className="space-y-6 w-full max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Accomplishments</h1>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4 mr-2" />
          New Entry
        </Button>
      </div>

      {/* Performance Coverage & Progress - Only for military enlisted */}
      {profile?.rank !== "Civilian" && (
        <EPBProgressCard
          rank={profile?.rank as Rank | null}
          entries={accomplishments}
        />
      )}

      {/* Filters & View Controls - Local to entries list */}
      <div className="flex flex-wrap items-center gap-3">
        {canManageTeam && hasSubordinates && (
          <Select value={selectedUser} onValueChange={setSelectedUser}>
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

        <div className="flex-1" />

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

        {/* Fiscal Year Toggle - only show in quarterly view */}
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
                    <div>
                      <CardTitle className="text-base">{group.label}</CardTitle>
                      <CardDescription className="text-xs">
                        {new Date(group.dateRange.start).toLocaleDateString("en-US", { month: "short", day: "numeric" })} - {new Date(group.dateRange.end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant={group.entries.length > 0 ? "default" : "secondary"}>
                    {group.entries.length} {group.entries.length === 1 ? "entry" : "entries"}
                  </Badge>
                </div>
              </CardHeader>
              {group.entries.length > 0 && (
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    {group.entries.map((entry) => (
                      <div 
                        key={entry.id} 
                        className="group p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <Badge variant="outline" className="text-xs">
                                {mgas.find((m) => m.key === entry.mpa)?.label || entry.mpa}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {new Date(entry.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                              </span>
                              {entry.created_by && entry.created_by !== entry.user_id && creatorProfiles[entry.created_by] && (
                                <TooltipProvider delayDuration={200}>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge variant="secondary" className="text-xs gap-1">
                                        <UserCheck className="size-3" />
                                        {creatorProfiles[entry.created_by].rank}
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      Entry created by {creatorProfiles[entry.created_by].rank} {creatorProfiles[entry.created_by].full_name}
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                            <p className="font-medium text-sm">{entry.action_verb}</p>
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{entry.details}</p>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              onClick={() => handleEdit(entry)}
                              aria-label="Edit entry"
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <AlertDialog
                              open={deleteId === entry.id}
                              onOpenChange={(open) => !open && setDeleteId(null)}
                            >
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 text-destructive hover:text-destructive"
                                  onClick={() => setDeleteId(entry.id)}
                                  aria-label="Delete entry"
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Entry</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete this entry? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction asChild>
                                    <Button
                                      variant="destructive"
                                      className="text-[#ffffff]"
                                      onClick={() => handleDelete(entry.id)}
                                    >
                                      Delete
                                    </Button>
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      ) : (
        /* List View */
        <div className="space-y-4">
          {filteredAccomplishments.map((entry) => (
            <Card key={entry.id} className="group">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Badge variant="outline">
                        {mgas.find((m) => m.key === entry.mpa)?.label || entry.mpa}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {new Date(entry.date).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      {/* Show creator badge if entry was created by supervisor */}
                      {entry.created_by && entry.created_by !== entry.user_id && creatorProfiles[entry.created_by] && (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="secondary" className="text-xs gap-1">
                                <UserCheck className="size-3" />
                                {creatorProfiles[entry.created_by].rank} {creatorProfiles[entry.created_by].full_name?.split(" ")[0]}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              Entry created by {creatorProfiles[entry.created_by].rank} {creatorProfiles[entry.created_by].full_name}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    <CardTitle className="text-lg leading-tight">
                      {entry.action_verb}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(entry)}
                      aria-label="Edit entry"
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <AlertDialog
                      open={deleteId === entry.id}
                      onOpenChange={(open) => !open && setDeleteId(null)}
                    >
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteId(entry.id)}
                          aria-label="Delete entry"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Entry</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete this entry? This
                            action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction asChild>
                            <Button
                              variant="destructive"
                              className="text-[#ffffff]"
                              onClick={() => handleDelete(entry.id)}
                            >
                              Delete
                            </Button>
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Details
                  </p>
                  <p className="text-sm">{entry.details}</p>
                </div>
                {entry.impact && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Impact
                    </p>
                    <p className="text-sm">{entry.impact}</p>
                  </div>
                )}
                {entry.metrics && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Metrics
                    </p>
                    <p className="text-sm">{entry.metrics}</p>
                  </div>
                )}
                {entry.tags && entry.tags.length > 0 && (
                  <div className="flex gap-1 flex-wrap pt-2">
                    {entry.tags.map((tag: string) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <EntryFormDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        editEntry={editingEntry}
        targetUserId={selectedUser === "self" ? profile?.id : (isManagedMember ? null : selectedUser)}
        targetManagedMemberId={isManagedMember ? managedMemberId : null}
      />
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

