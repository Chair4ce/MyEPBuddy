"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import { useDecorationShellStore } from "@/stores/decoration-shell-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/sonner";
import { AI_MODELS } from "@/lib/constants";
import { DECORATION_TYPES, DECORATION_REASONS } from "@/features/decorations/constants";
import { cn } from "@/lib/utils";
import {
  Medal,
  Save,
  Share2,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
  Smartphone,
  RotateCcw,
  Trash2,
  AlertTriangle,
  MoreVertical,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { DecorationStatementSelector } from "@/components/decoration/decoration-statement-selector";
import { DecorationCitationEditor } from "@/components/decoration/decoration-citation-editor";
import { DecorationShellShareDialog } from "@/components/decoration/decoration-shell-share-dialog";
import type {
  Accomplishment,
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

interface DecorationShellInput {
  id: string;
  user_id: string;
  team_member_id: string | null;
  created_by: string;
  award_type: DecorationAwardType;
  reason: DecorationReason;
}

interface DecorationWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shell: DecorationShellInput;
  onSaved?: () => void;
}

interface RateeInfo {
  id: string;
  fullName: string | null;
  rank: Rank | null;
  afsc: string | null;
  unit: string | null;
  isManagedMember: boolean;
  gender?: "male" | "female";
}

// ============================================================================
// Component
// ============================================================================

export function DecorationWorkspaceDialog({
  open,
  onOpenChange,
  shell,
  onSaved,
}: DecorationWorkspaceDialogProps) {
  const supabase = createClient();
  const { profile, subordinates, managedMembers } = useUserStore();

  // Decoration shell store
  const {
    currentShell,
    setCurrentShell,
    awardType,
    setAwardType,
    reason,
    setReason,
    dutyTitle,
    setDutyTitle,
    unit,
    setUnit,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    citationText,
    selectedStatementIds,
    selectedRatee,
    setSelectedRatee,
    selectedModel,
    setSelectedModel,
    isLoadingShell,
    setIsLoadingShell,
    isSaving,
    setIsSaving,
    isDirty,
    setIsDirty,
    reset,
  } = useDecorationShellStore();

  // Local state
  const [accomplishments, setAccomplishments] = useState<Accomplishment[]>([]);
  const [showConfig, setShowConfig] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [rateeInfo, setRateeInfo] = useState<RateeInfo | null>(null);

  // Mobile orientation state
  const [isMobilePortrait, setIsMobilePortrait] = useState(false);
  const [dismissedLandscapeHint, setDismissedLandscapeHint] = useState(false);

  // ============================================================================
  // Effects
  // ============================================================================

  // Detect mobile portrait orientation
  useEffect(() => {
    if (typeof window === "undefined" || !open) return;

    const checkOrientation = () => {
      const isMobile = window.innerWidth < 768;
      const isPortrait = window.innerHeight > window.innerWidth;
      setIsMobilePortrait(isMobile && isPortrait);
    };

    checkOrientation();

    window.addEventListener("resize", checkOrientation);
    window.addEventListener("orientationchange", checkOrientation);

    return () => {
      window.removeEventListener("resize", checkOrientation);
      window.removeEventListener("orientationchange", checkOrientation);
    };
  }, [open]);

  // Load shell data when dialog opens
  useEffect(() => {
    async function loadShellData() {
      if (!open || !shell) return;

      setIsLoadingShell(true);

      try {
        const { data: shellData } = await supabase
          .from("decoration_shells")
          .select("*")
          .eq("id", shell.id)
          .single();

        if (shellData) {
          setCurrentShell(shellData as DecorationShell);
        }
      } catch (error) {
        console.error("Error loading shell data:", error);
        toast.error("Failed to load decoration");
      } finally {
        setIsLoadingShell(false);
      }
    }

    loadShellData();
  }, [open, shell, supabase, setCurrentShell, setIsLoadingShell]);

  // Determine ratee info from shell
  useEffect(() => {
    if (!shell || !profile) return;

    let info: RateeInfo | null = null;

    if (shell.team_member_id) {
      // It's a managed member
      const member = managedMembers.find((m) => m.id === shell.team_member_id);
      if (member) {
        info = {
          id: member.id,
          fullName: member.full_name,
          rank: member.rank as Rank | null,
          afsc: member.afsc,
          unit: member.unit,
          isManagedMember: true,
        };
      }
    } else if (shell.user_id === profile.id) {
      // It's the user's own shell
      info = {
        id: profile.id,
        fullName: profile.full_name,
        rank: profile.rank as Rank | null,
        afsc: profile.afsc,
        unit: profile.unit,
        isManagedMember: false,
      };
    } else {
      // It's a subordinate's shell
      const sub = subordinates.find((s) => s.id === shell.user_id);
      if (sub) {
        info = {
          id: sub.id,
          fullName: sub.full_name,
          rank: sub.rank as Rank | null,
          afsc: sub.afsc,
          unit: sub.unit,
          isManagedMember: false,
        };
      }
    }

    setRateeInfo(info);
    if (info) {
      setSelectedRatee({
        id: info.id,
        fullName: info.fullName,
        rank: info.rank,
        afsc: info.afsc,
        unit: info.unit,
        isManagedMember: info.isManagedMember,
        gender: info.gender,
      });
      // Set unit from ratee if not already set
      if (!unit && info.unit) {
        setUnit(info.unit);
      }
    }
  }, [shell, profile, subordinates, managedMembers, setSelectedRatee, unit, setUnit]);

  // Load accomplishments for the ratee
  useEffect(() => {
    async function loadAccomplishments() {
      if (!rateeInfo) return;

      if (rateeInfo.isManagedMember) {
        const { data } = await supabase
          .from("accomplishments")
          .select("*")
          .eq("team_member_id", rateeInfo.id)
          .order("date", { ascending: false });
        setAccomplishments((data as Accomplishment[]) || []);
      } else {
        const { data } = await supabase
          .from("accomplishments")
          .select("*")
          .eq("user_id", rateeInfo.id)
          .is("team_member_id", null)
          .order("date", { ascending: false });
        setAccomplishments((data as Accomplishment[]) || []);
      }
    }
    loadAccomplishments();
  }, [rateeInfo, supabase]);

  // Reset store when dialog closes
  useEffect(() => {
    if (!open) {
      reset();
      setDismissedLandscapeHint(false);
    }
  }, [open, reset]);

  // ============================================================================
  // Handlers
  // ============================================================================

  // Save shell
  const handleSaveShell = useCallback(async () => {
    if (!currentShell || !profile) return;

    setIsSaving(true);

    try {
      const { error } = await supabase
        .from("decoration_shells")
        .update({
          award_type: awardType,
          reason,
          duty_title: dutyTitle,
          unit,
          start_date: startDate || null,
          end_date: endDate || null,
          citation_text: citationText,
          selected_statement_ids: selectedStatementIds,
        } as never)
        .eq("id", currentShell.id);

      if (error) throw error;

      setIsDirty(false);
      toast.success("Decoration saved successfully");
      onSaved?.();
    } catch (error) {
      console.error("Error saving decoration shell:", error);
      toast.error("Failed to save decoration");
    } finally {
      setIsSaving(false);
    }
  }, [
    currentShell,
    profile,
    awardType,
    reason,
    dutyTitle,
    unit,
    startDate,
    endDate,
    citationText,
    selectedStatementIds,
    supabase,
    setIsSaving,
    setIsDirty,
    onSaved,
  ]);

  // Delete the decoration shell
  const handleDeleteShell = useCallback(async () => {
    if (!currentShell) return;

    setIsDeleting(true);

    try {
      const { error } = await supabase
        .from("decoration_shells")
        .delete()
        .eq("id", currentShell.id);

      if (error) throw error;

      toast.success("Decoration deleted");
      setShowDeleteConfirm(false);
      onOpenChange(false);
      onSaved?.();
    } catch (error) {
      console.error("Error deleting decoration shell:", error);
      toast.error("Failed to delete decoration");
    } finally {
      setIsDeleting(false);
    }
  }, [currentShell, supabase, onOpenChange, onSaved]);

  // Determine if user can edit this shell
  const canEdit = useMemo(() => {
    if (!profile || !shell) return false;
    // User created this shell
    if (shell.created_by === profile.id) return true;
    // User owns this shell (their own decoration)
    if (shell.user_id === profile.id && !shell.team_member_id) return true;
    // User is a supervisor of the shell owner
    if (subordinates.some((s) => s.id === shell.user_id)) return true;
    // User owns the managed member
    const member = managedMembers.find((m) => m.id === shell.team_member_id);
    if (member && member.supervisor_id === profile.id) return true;
    return false;
  }, [profile, shell, subordinates, managedMembers]);

  // Get decoration config
  const decorationConfig = useMemo(() => {
    return DECORATION_TYPES.find((d) => d.key === awardType);
  }, [awardType]);

  // ============================================================================
  // Render
  // ============================================================================

  const rateeDisplayName = rateeInfo
    ? `${rateeInfo.rank || ""} ${rateeInfo.fullName || ""}`.trim()
    : "Unknown";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          hideCloseButton
          className="!fixed !inset-0 !translate-x-0 !translate-y-0 !top-0 !left-0 w-screen h-screen !max-w-none !max-h-none flex flex-col overflow-hidden p-0 !rounded-none"
        >
          {/* Mobile Portrait Landscape Hint */}
          {isMobilePortrait && !dismissedLandscapeHint && (
            <div className="bg-gradient-to-r from-primary/15 to-primary/5 border-b border-primary/20 px-3 py-2.5 shrink-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="relative shrink-0">
                    <Smartphone className="size-4 text-primary" />
                    <RotateCcw className="size-2.5 text-primary absolute -bottom-0.5 -right-0.5" />
                  </div>
                  <div className="text-xs">
                    <p className="font-medium text-primary">Best viewed in landscape</p>
                    <p className="text-[10px] text-muted-foreground">
                      Rotate phone for better editing experience
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDismissedLandscapeHint(true)}
                  className="shrink-0 h-7 w-7 p-0"
                >
                  <X className="size-3.5" />
                  <span className="sr-only">Dismiss</span>
                </Button>
              </div>
            </div>
          )}

          <DialogHeader className="px-4 pt-4 pb-3 border-b shrink-0">
            {/* Title row with close button */}
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <Medal className="size-5 text-primary shrink-0" />
                <div className="min-w-0">
                  <DialogTitle className="text-base font-semibold leading-tight">
                    {rateeDisplayName}&apos;s Decoration
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    {decorationConfig?.name || "Decoration"} •{" "}
                    {decorationConfig?.abbreviation || awardType.toUpperCase()}
                  </DialogDescription>
                </div>
              </div>
              <DialogClose asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 shrink-0 -mr-1 -mt-1"
                >
                  <X className="size-4" />
                  <span className="sr-only">Close</span>
                </Button>
              </DialogClose>
            </div>

            {/* Action buttons row */}
            <div className="flex items-center gap-2">
              {canEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveShell}
                  disabled={isSaving || isLoadingShell}
                  className="h-8 px-3 flex-1"
                >
                  {isSaving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}
                  <span className="ml-1.5 text-xs">Save</span>
                  {isDirty && (
                    <Badge variant="secondary" className="ml-1 text-[10px]">
                      •
                    </Badge>
                  )}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowShareDialog(true)}
                className="h-8 px-3 flex-1"
              >
                <Share2 className="size-4" />
                <span className="ml-1.5 text-xs">Share</span>
              </Button>

              {/* More options menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8 shrink-0">
                    <MoreVertical className="size-4" />
                    <span className="sr-only">More options</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuSeparator />
                  <AlertDialog
                    open={showDeleteConfirm}
                    onOpenChange={setShowDeleteConfirm}
                  >
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem
                        onSelect={(e) => e.preventDefault()}
                        className="text-destructive focus:text-destructive focus:bg-destructive/10"
                      >
                        <Trash2 className="size-4 mr-2" />
                        Delete Decoration
                      </DropdownMenuItem>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                          <AlertTriangle className="size-5 text-destructive" />
                          Delete Decoration
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete this decoration for{" "}
                          <strong>{rateeDisplayName}</strong>? This will permanently
                          delete the citation and cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>
                          Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleDeleteShell}
                          disabled={isDeleting}
                          className="bg-destructive text-white hover:bg-destructive/90"
                        >
                          {isDeleting ? (
                            <>
                              <Loader2 className="size-4 mr-1.5 animate-spin" />
                              Deleting...
                            </>
                          ) : (
                            <>
                              <Trash2 className="size-4 mr-1.5" />
                              Delete Permanently
                            </>
                          )}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1 min-h-0 relative">
            {/* Floating landscape hint button */}
            {isMobilePortrait && dismissedLandscapeHint && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDismissedLandscapeHint(false)}
                className="fixed bottom-20 right-4 z-50 shadow-lg bg-background/95 backdrop-blur-sm border-primary/30"
              >
                <RotateCcw className="size-4 mr-1.5 text-primary" />
                <span className="text-xs">Rotate phone</span>
              </Button>
            )}

            <div className="p-3 sm:p-6 space-y-4">
              {/* Settings Collapsible */}
              {canEdit && (
                <Collapsible open={showConfig} onOpenChange={setShowConfig}>
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                      <span className="text-sm font-medium">Settings</span>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>
                          {decorationConfig?.abbreviation || awardType.toUpperCase()} •{" "}
                          {DECORATION_REASONS.find((r) => r.key === reason)?.label || reason}
                        </span>
                        {showConfig ? (
                          <ChevronUp className="size-4" />
                        ) : (
                          <ChevronDown className="size-4" />
                        )}
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="pt-4 space-y-4">
                      {/* Award Type and Reason */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-xs">Award Type</Label>
                          <Select
                            value={awardType}
                            onValueChange={(v) => setAwardType(v as DecorationAwardType)}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {DECORATION_TYPES.map((d) => (
                                <SelectItem key={d.key} value={d.key}>
                                  {d.abbreviation} - {d.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Reason</Label>
                          <Select
                            value={reason}
                            onValueChange={(v) => setReason(v as DecorationReason)}
                          >
                            <SelectTrigger className="h-9">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {DECORATION_REASONS.map((r) => (
                                <SelectItem key={r.key} value={r.key}>
                                  {r.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Position Info */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-xs">Duty Title</Label>
                          <Input
                            value={dutyTitle}
                            onChange={(e) => setDutyTitle(e.target.value)}
                            placeholder="e.g., Flight Chief"
                            className="h-9"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Unit</Label>
                          <Input
                            value={unit}
                            onChange={(e) => setUnit(e.target.value)}
                            placeholder="e.g., 1st Fighter Squadron"
                            className="h-9"
                          />
                        </div>
                      </div>

                      {/* Dates */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-xs">Start Date</Label>
                          <Input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="h-9"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">End Date</Label>
                          <Input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="h-9"
                          />
                        </div>
                      </div>

                      {/* AI Model */}
                      <div className="space-y-2">
                        <Label className="text-xs">AI Model</Label>
                        <Select value={selectedModel} onValueChange={setSelectedModel}>
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {AI_MODELS.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Loading State */}
              {isLoadingShell ? (
                <div className="flex items-center justify-center py-12">
                  <Spinner size="lg" />
                </div>
              ) : (
                /* Main Content */
                <div className="grid gap-4 lg:grid-cols-2">
                  {/* Statement Selector */}
                  <DecorationStatementSelector accomplishments={accomplishments} />

                  {/* Citation Editor */}
                  <DecorationCitationEditor accomplishments={accomplishments} />
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      {currentShell && (
        <DecorationShellShareDialog
          shellId={currentShell.id}
          isOpen={showShareDialog}
          onClose={() => setShowShareDialog(false)}
          ratee={{
            id: rateeInfo?.id || "",
            fullName: rateeInfo?.fullName || null,
            rank: rateeInfo?.rank || null,
            isManagedMember: rateeInfo?.isManagedMember || false,
          }}
          currentUserId={profile?.id}
        />
      )}
    </>
  );
}
