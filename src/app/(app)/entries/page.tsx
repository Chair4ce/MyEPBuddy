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
import { Skeleton } from "@/components/ui/skeleton";
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
import { toast } from "@/components/ui/sonner";
import { deleteAccomplishment } from "@/app/actions/accomplishments";
import { Plus, Pencil, Trash2, Filter, FileText, LayoutList, CalendarDays, Calendar, Check, Copy, Crown, MessageSquare, Send, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ENTRY_MGAS, AWARD_QUARTERS, getQuarterDateRange, getFiscalQuarterDateRange, STANDARD_MGAS, MPA_ABBREVIATIONS } from "@/lib/constants";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { Accomplishment, ManagedMember, Profile, AwardQuarter } from "@/types/database";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UserCheck } from "lucide-react";

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
  
  // MPA Statement status
  const [mpaStatements, setMpaStatements] = useState<Record<string, { statement: string; created_by: string | null }[]>>({});
  const [expandedMpas, setExpandedMpas] = useState<Record<string, boolean>>({});
  const [loadingStatements, setLoadingStatements] = useState(false);
  const [copiedMpa, setCopiedMpa] = useState<string | null>(null);
  
  // Feedback dialog state
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);
  const [feedbackQ1, setFeedbackQ1] = useState("");
  const [feedbackQ2, setFeedbackQ2] = useState("");
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  const supabase = createClient();
  const cycleYear = epbConfig?.current_cycle_year || new Date().getFullYear();
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

  // Load MPA statements for the selected user
  useEffect(() => {
    async function loadMpaStatements() {
      if (!profile) return;
      
      setLoadingStatements(true);
      
      try {
        let query = supabase
          .from("refined_statements")
          .select("mpa, statement, created_by")
          .eq("cycle_year", cycleYear)
          .eq("statement_type", "epb");
        
        if (isManagedMember && managedMemberId) {
          query = query.eq("team_member_id", managedMemberId);
        } else {
          const targetUserId = selectedUser === "self" ? profile.id : selectedUser;
          query = query.eq("user_id", targetUserId);
        }
        
        const { data } = await query as { data: { mpa: string; statement: string; created_by: string | null }[] | null };
        
        const grouped: Record<string, { statement: string; created_by: string | null }[]> = {};
        STANDARD_MGAS.forEach(mpa => { grouped[mpa.key] = []; });
        
        if (data) {
          data.forEach(row => {
            if (grouped[row.mpa]) {
              grouped[row.mpa].push({ statement: row.statement, created_by: row.created_by });
            }
          });
        }
        
        setMpaStatements(grouped);
      } catch (error) {
        console.error("Error loading statements:", error);
      } finally {
        setLoadingStatements(false);
      }
    }
    
    loadMpaStatements();
  }, [profile, selectedUser, isManagedMember, managedMemberId, cycleYear, supabase]);

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

  async function handleSubmitFeedback() {
    if (!feedbackQ1.trim() && !feedbackQ2.trim()) {
      toast.error("Please answer at least one question");
      return;
    }

    setIsSubmittingFeedback(true);
    try {
      const feedbackContent = [
        feedbackQ1.trim() ? `Q1 (Most important about tracking): ${feedbackQ1.trim()}` : "",
        feedbackQ2.trim() ? `Q2 (What completed EPB means): ${feedbackQ2.trim()}` : "",
      ].filter(Boolean).join("\n\n");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("user_feedback").insert({
        user_id: profile?.id,
        feature: "epb_status_tracking",
        feedback: feedbackContent,
      });

      if (error) throw error;

      toast.success("Thank you for your feedback!");
      setShowFeedbackDialog(false);
      setFeedbackQ1("");
      setFeedbackQ2("");
    } catch (error) {
      console.error("Error submitting feedback:", error);
      toast.error("Failed to submit feedback");
    } finally {
      setIsSubmittingFeedback(false);
    }
  }

  // Users can add entries for subordinates if they have any (real or managed)
  const canManageTeam = subordinates.length > 0 || managedMembers.length > 0 || profile?.role === "admin";
  const hasSubordinates = subordinates.length > 0 || managedMembers.length > 0;

  if (isLoading) {
    return <EntriesSkeleton />;
  }

  // Get selected MPA for detail view
  const selectedMpaForView = Object.keys(expandedMpas).find(k => expandedMpas[k]) || null;
  const selectedMpaStatements = selectedMpaForView ? mpaStatements[selectedMpaForView] || [] : [];
  const selectedMpaLabel = selectedMpaForView ? STANDARD_MGAS.find(m => m.key === selectedMpaForView)?.label : null;

  return (
    <div className="space-y-6 w-full max-w-7xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Entries</h1>
          <p className="text-muted-foreground">
            Track and manage your accomplishments for the {cycleYear} cycle
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4 mr-2" />
          New Entry
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-end">
            {canManageTeam && hasSubordinates && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Viewing for</label>
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
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
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium flex items-center gap-2">
                <Filter className="size-4" />
                Filter by MPA
              </label>
              <Select value={selectedMPA} onValueChange={setSelectedMPA}>
                <SelectTrigger className="w-[200px]">
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
            </div>

            {/* View Mode Toggle */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">View</label>
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

            {/* Fiscal Year Toggle - only show in quarterly view */}
            {viewMode === "quarterly" && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="size-4" />
                  Year Type
                </label>
                <div className="flex items-center gap-2 h-9 px-3 rounded-md border bg-background">
                  <span className={cn("text-sm", !useFiscalYear && "font-medium")}>Calendar</span>
                  <Switch
                    checked={useFiscalYear}
                    onCheckedChange={setUseFiscalYear}
                    aria-label="Toggle fiscal year"
                  />
                  <span className={cn("text-sm", useFiscalYear && "font-medium")}>Fiscal</span>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* MPA Statement Status - Horizontal Grid Layout */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="size-4" />
                Statement Status
              </CardTitle>
              <CardDescription className="text-xs">
                {cycleYear} Cycle • {Object.values(mpaStatements).filter(s => s.length > 0).length}/{STANDARD_MGAS.length} MPAs complete
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {loadingStatements && (
                <Badge variant="secondary" className="text-xs">Loading...</Badge>
              )}
              <Dialog open={showFeedbackDialog} onOpenChange={setShowFeedbackDialog}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 text-xs gap-1.5">
                    <MessageSquare className="size-3.5" />
                    <span className="hidden sm:inline">Feedback</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <MessageSquare className="size-5" />
                      EPB Tracking Feedback
                    </DialogTitle>
                    <DialogDescription>
                      Help us improve EPB tracking. Your answers shape how we build this feature.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-5 py-2">
                    <div className="space-y-2">
                      <Label htmlFor="feedback-q1" className="text-sm font-medium">
                        1. What is the most important thing about tracking the status of your EPB or your subordinates&apos; EPB?
                      </Label>
                      <Textarea
                        id="feedback-q1"
                        placeholder="e.g., Knowing what's left to write, seeing deadlines, tracking team progress..."
                        value={feedbackQ1}
                        onChange={(e) => setFeedbackQ1(e.target.value)}
                        rows={3}
                        className="resize-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="feedback-q2" className="text-sm font-medium">
                        2. What does a completed EPB mean to you?
                      </Label>
                      <Textarea
                        id="feedback-q2"
                        placeholder="e.g., All MPAs written, approved by supervisor, submitted in myEval..."
                        value={feedbackQ2}
                        onChange={(e) => setFeedbackQ2(e.target.value)}
                        rows={3}
                        className="resize-none"
                      />
                    </div>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowFeedbackDialog(false)}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleSubmitFeedback} 
                      disabled={isSubmittingFeedback || (!feedbackQ1.trim() && !feedbackQ2.trim())}
                    >
                      {isSubmittingFeedback ? (
                        <>
                          <Loader2 className="size-4 animate-spin mr-2" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="size-4 mr-2" />
                          Submit
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {/* Fixed-height container to prevent layout shift */}
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 min-h-[200px]">
            {/* MPA List - Left Column */}
            <div className="space-y-1.5">
              {STANDARD_MGAS.map((mpa) => {
                const statements = mpaStatements[mpa.key] || [];
                const hasStatements = statements.length > 0;
                const isSelected = selectedMpaForView === mpa.key;
                const isHLR = mpa.key === "hlr_assessment";
                
                return (
                  <button
                    key={mpa.key}
                    onClick={() => {
                      if (hasStatements) {
                        setExpandedMpas(prev => {
                          const newState: Record<string, boolean> = {};
                          // Only one can be expanded at a time
                          STANDARD_MGAS.forEach(m => { newState[m.key] = m.key === mpa.key && !prev[mpa.key]; });
                          return newState;
                        });
                      }
                    }}
                    className={cn(
                      "w-full flex items-center justify-between p-2.5 rounded-lg border text-left transition-all",
                      isSelected && "ring-2 ring-primary",
                      hasStatements 
                        ? "bg-green-50/50 dark:bg-green-900/10 border-green-200 dark:border-green-800 hover:bg-green-50 dark:hover:bg-green-900/20 cursor-pointer" 
                        : "bg-muted/30 cursor-default opacity-60"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {hasStatements ? (
                        <Check className="size-3.5 text-green-600 shrink-0" />
                      ) : (
                        <div className="size-3.5 rounded-full border-2 border-muted-foreground/30 shrink-0" />
                      )}
                      {isHLR && <Crown className="size-3.5 text-amber-600 shrink-0" />}
                      <span className="text-xs font-medium truncate">{MPA_ABBREVIATIONS[mpa.key] || mpa.key}</span>
                    </div>
                    <Badge variant={hasStatements ? "default" : "secondary"} className="text-[10px] shrink-0">
                      {statements.length}
                    </Badge>
                  </button>
                );
              })}
            </div>
            
            {/* Statement Detail - Right Column */}
            <div className="rounded-lg border bg-muted/20 p-4 min-h-[200px]">
              {selectedMpaForView && selectedMpaStatements.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">{selectedMpaLabel}</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setExpandedMpas({})}
                    >
                      Close
                    </Button>
                  </div>
                  <div className="space-y-3 max-h-[300px] overflow-y-auto">
                    {selectedMpaStatements.map((stmt, idx) => (
                      <div 
                        key={idx} 
                        className="p-3 rounded-lg border bg-card text-sm"
                      >
                        <p className="leading-relaxed">{stmt.statement}</p>
                        <div className="flex items-center justify-between mt-2 pt-2 border-t">
                          <span className="text-xs text-muted-foreground">
                            {stmt.created_by === profile?.id ? "Created by you" : 
                             selectedUser === "self" ? "Created by your supervisor" : "Created by member"}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7"
                            onClick={() => {
                              navigator.clipboard.writeText(stmt.statement);
                              setCopiedMpa(`${selectedMpaForView}-${idx}`);
                              toast.success("Copied to clipboard");
                              setTimeout(() => setCopiedMpa(null), 2000);
                            }}
                          >
                            {copiedMpa === `${selectedMpaForView}-${idx}` ? (
                              <Check className="size-3 mr-1" />
                            ) : (
                              <Copy className="size-3 mr-1" />
                            )}
                            Copy
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center py-8">
                  <FileText className="size-8 text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {Object.values(mpaStatements).some(s => s.length > 0) 
                      ? "Click an MPA to view its statement"
                      : "No statements created yet"}
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Entries List or Quarterly View */}
      {accomplishments.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <FileText className="size-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="font-medium mb-2">No entries found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {selectedMPA !== "all"
                  ? "No entries for this MPA. Try a different filter."
                  : "Start tracking accomplishments by creating your first entry."}
              </p>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="size-4 mr-2" />
                Create Entry
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : viewMode === "quarterly" ? (
        /* Quarterly View */
        <div className="space-y-6">
          {quarterGroups.map((group) => (
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
                                  <AlertDialogAction
                                    onClick={() => handleDelete(entry.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Delete
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
          {accomplishments.map((entry) => (
            <Card key={entry.id} className="group">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Badge variant="outline">
                        {mgas.find((m) => m.key === entry.mpa)?.label ||
                          entry.mpa}
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
                          <AlertDialogAction
                            onClick={() => handleDelete(entry.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
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
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Impact
                  </p>
                  <p className="text-sm">{entry.impact}</p>
                </div>
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
    <Suspense fallback={<EntriesSkeleton />}>
      <EntriesContent />
    </Suspense>
  );
}

function EntriesSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-28" />
      </div>
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-10 w-48" />
          </div>
        </CardContent>
      </Card>
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <div className="flex gap-2 mb-2">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-20" />
              </div>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

