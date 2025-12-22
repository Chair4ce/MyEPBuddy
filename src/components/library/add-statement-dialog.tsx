"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import { Button } from "@/components/ui/button";
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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/sonner";
import { cn, getCharacterCountColor } from "@/lib/utils";
import { MAX_STATEMENT_CHARACTERS, STANDARD_MGAS, RANKS } from "@/lib/constants";
import { Loader2, UserCheck, Users, Globe, CheckCircle2 } from "lucide-react";
import type { Rank, StatementType } from "@/types/database";

interface AddStatementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatementAdded?: () => void;
}

export function AddStatementDialog({
  open,
  onOpenChange,
  onStatementAdded,
}: AddStatementDialogProps) {
  const { profile, epbConfig, subordinates } = useUserStore();
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [statementText, setStatementText] = useState("");
  const [selectedMpa, setSelectedMpa] = useState("");
  const [selectedAfsc, setSelectedAfsc] = useState("");
  const [selectedRank, setSelectedRank] = useState<Rank | "">("");
  const [cycleYear, setCycleYear] = useState<number>(new Date().getFullYear());
  const [statementType, setStatementType] = useState<StatementType>("epb");

  // Granular sharing options
  const [shareWithSupervisor, setShareWithSupervisor] = useState(false);
  const [shareWithSubordinates, setShareWithSubordinates] = useState(false);
  const [shareWithCommunity, setShareWithCommunity] = useState(false);

  const supabase = createClient();
  const mgas = STANDARD_MGAS;
  const maxChars = epbConfig?.max_characters_per_statement || MAX_STATEMENT_CHARACTERS;

  // Derived state for "Share with All"
  const hasSupervisor = !!profile?.supervisor_id;
  const hasSubordinates = subordinates.length > 0;
  
  // Check if all available options are selected
  const allAvailableSelected = 
    (hasSupervisor ? shareWithSupervisor : true) && 
    (hasSubordinates ? shareWithSubordinates : true) && 
    shareWithCommunity;
  
  // For UI: show as "all selected" only if community is selected (always available)
  const allSelected = allAvailableSelected && shareWithCommunity;

  function handleShareAll(checked: boolean) {
    if (hasSupervisor) setShareWithSupervisor(checked);
    if (hasSubordinates) setShareWithSubordinates(checked);
    setShareWithCommunity(checked);
  }

  // Initialize defaults from profile when dialog opens
  useEffect(() => {
    if (open && profile) {
      setSelectedAfsc(profile.afsc || "");
      setSelectedRank(profile.rank || "");
      setCycleYear(epbConfig?.current_cycle_year || new Date().getFullYear());
    }
  }, [open, profile, epbConfig]);

  function resetForm() {
    setStatementText("");
    setSelectedMpa("");
    setSelectedAfsc(profile?.afsc || "");
    setSelectedRank(profile?.rank || "");
    setCycleYear(epbConfig?.current_cycle_year || new Date().getFullYear());
    setStatementType("epb");
    setShareWithSupervisor(false);
    setShareWithSubordinates(false);
    setShareWithCommunity(false);
  }

  async function handleSubmit() {
    if (!profile) return;

    // Validation
    if (!statementText.trim()) {
      toast.error("Please enter a statement");
      return;
    }
    if (!selectedMpa) {
      toast.error("Please select an MPA");
      return;
    }
    if (!selectedAfsc) {
      toast.error("Please enter an AFSC");
      return;
    }
    if (!selectedRank) {
      toast.error("Please select a rank");
      return;
    }

    setIsSaving(true);

    try {
      // Insert the refined statement
      const { data: newStatement, error: insertError } = await supabase
        .from("refined_statements")
        .insert({
          user_id: profile.id,
          mpa: selectedMpa,
          afsc: selectedAfsc.toUpperCase(),
          rank: selectedRank,
          statement: statementText.trim(),
          cycle_year: cycleYear,
          statement_type: statementType,
          is_favorite: false,
        } as never)
        .select("id")
        .single() as { data: { id: string } | null; error: Error | null };

      if (insertError || !newStatement) throw insertError || new Error("Failed to create statement");

      // Create shares based on granular sharing options
      const shares: Array<{
        statement_id: string;
        owner_id: string;
        share_type: "user" | "team" | "community";
        shared_with_id: string | null;
      }> = [];

      // Share with supervisor (individual user share)
      if (shareWithSupervisor && profile.supervisor_id) {
        shares.push({
          statement_id: newStatement.id,
          owner_id: profile.id,
          share_type: "user",
          shared_with_id: profile.supervisor_id,
        });
      }

      // Share with subordinates (individual user shares for each)
      if (shareWithSubordinates && subordinates.length > 0) {
        for (const subordinate of subordinates) {
          shares.push({
            statement_id: newStatement.id,
            owner_id: profile.id,
            share_type: "user",
            shared_with_id: subordinate.id,
          });
        }
      }

      // Share with community
      if (shareWithCommunity) {
        shares.push({
          statement_id: newStatement.id,
          owner_id: profile.id,
          share_type: "community",
          shared_with_id: null,
        });
      }

      if (shares.length > 0) {
        const { error: shareError } = await supabase
          .from("statement_shares")
          .insert(shares as never);
        if (shareError) throw shareError;
      }

      toast.success("Statement added to your library!");
      resetForm();
      onStatementAdded?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Error adding statement:", error);
      toast.error("Failed to add statement");
    } finally {
      setIsSaving(false);
    }
  }

  const isValid =
    statementText.trim() &&
    selectedMpa &&
    selectedAfsc &&
    selectedRank &&
    statementText.length <= maxChars;

  return (
    <Dialog open={open} onOpenChange={(value) => {
      if (!value) resetForm();
      onOpenChange(value);
    }}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg mx-auto max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">Add Statement</DialogTitle>
          <DialogDescription className="text-sm">
            Manually add a statement to your library
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Statement Textarea - Main Event */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="statement-text" className="text-sm font-medium">
                Statement
              </Label>
              <span
                className={cn(
                  "text-xs",
                  getCharacterCountColor(statementText.length, maxChars)
                )}
              >
                {statementText.length}/{maxChars}
              </span>
            </div>
            <Textarea
              id="statement-text"
              value={statementText}
              onChange={(e) => setStatementText(e.target.value)}
              placeholder="Enter your EPB statement..."
              rows={5}
              className="resize-none text-sm"
              aria-label="Statement text"
            />
          </div>

          <Separator />

          {/* Statement Type Selector */}
          <div className="space-y-2">
            <Label htmlFor="type-select" className="text-sm">
              Statement Type
            </Label>
            <Select value={statementType} onValueChange={(v) => setStatementType(v as StatementType)}>
              <SelectTrigger id="type-select" className="w-full">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="epb">EPB Statement</SelectItem>
                <SelectItem value="award">Award Statement (1206)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Options Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* MPA Selector */}
            <div className="space-y-2">
              <Label htmlFor="mpa-select" className="text-sm">
                MPA
              </Label>
              <Select value={selectedMpa} onValueChange={setSelectedMpa}>
                <SelectTrigger id="mpa-select" className="w-full">
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

            {/* Cycle Year Selector */}
            <div className="space-y-2">
              <Label htmlFor="cycle-select" className="text-sm">
                Cycle Year
              </Label>
              <Select
                value={cycleYear.toString()}
                onValueChange={(v) => setCycleYear(parseInt(v))}
              >
                <SelectTrigger id="cycle-select" className="w-full">
                  <SelectValue placeholder="Select year" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(
                    (year) => (
                      <SelectItem key={year} value={year.toString()}>
                        {year}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* AFSC Input */}
            <div className="space-y-2">
              <Label htmlFor="afsc-input" className="text-sm">
                AFSC
              </Label>
              <Input
                id="afsc-input"
                value={selectedAfsc}
                onChange={(e) => setSelectedAfsc(e.target.value.toUpperCase())}
                placeholder="e.g., 1A8X2"
                className="uppercase"
                aria-label="AFSC"
              />
            </div>

            {/* Rank Selector */}
            <div className="space-y-2">
              <Label htmlFor="rank-select" className="text-sm">
                Rank
              </Label>
              <Select
                value={selectedRank}
                onValueChange={(v) => setSelectedRank(v as Rank)}
              >
                <SelectTrigger id="rank-select" className="w-full">
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
          </div>

          <Separator />

          {/* Sharing Options */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Sharing (Optional)</Label>
              <button
                type="button"
                onClick={() => handleShareAll(!allSelected)}
                className={cn(
                  "flex items-center gap-1.5 text-xs font-medium transition-colors",
                  allSelected 
                    ? "text-primary" 
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <CheckCircle2 className={cn("size-3.5", allSelected && "fill-primary/20")} />
                {allSelected ? "Deselect All" : "Select All"}
              </button>
            </div>

            {/* Share with Supervisor */}
            <label
              className={cn(
                "flex items-start gap-3 p-3 rounded-lg border transition-colors",
                !hasSupervisor && "opacity-50 cursor-not-allowed",
                hasSupervisor && "cursor-pointer",
                shareWithSupervisor && hasSupervisor
                  ? "bg-primary/5 border-primary/30"
                  : "bg-card hover:bg-muted/50"
              )}
            >
              <Checkbox
                checked={shareWithSupervisor}
                onCheckedChange={(checked) => setShareWithSupervisor(!!checked)}
                disabled={!hasSupervisor}
                aria-label="Share with supervisor"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <UserCheck className="size-4" />
                  <span className="text-sm font-medium">Share with Supervisor</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {hasSupervisor 
                    ? "Your supervisor will be able to view this statement"
                    : "No supervisor configured — set one up in the Team page"}
                </p>
              </div>
            </label>

            {/* Share with Subordinates */}
            <label
              className={cn(
                "flex items-start gap-3 p-3 rounded-lg border transition-colors",
                !hasSubordinates && "opacity-50 cursor-not-allowed",
                hasSubordinates && "cursor-pointer",
                shareWithSubordinates && hasSubordinates
                  ? "bg-primary/5 border-primary/30"
                  : "bg-card hover:bg-muted/50"
              )}
            >
              <Checkbox
                checked={shareWithSubordinates}
                onCheckedChange={(checked) => setShareWithSubordinates(!!checked)}
                disabled={!hasSubordinates}
                aria-label="Share with subordinates"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Users className="size-4" />
                  <span className="text-sm font-medium">Share with Subordinates</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {hasSubordinates 
                    ? `${subordinates.length} team member${subordinates.length !== 1 ? "s" : ""} will be able to view this`
                    : "No subordinates — add team members in the Team page"}
                </p>
              </div>
            </label>

            {/* Community Share */}
            <label
              className={cn(
                "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                shareWithCommunity
                  ? "bg-primary/5 border-primary/30"
                  : "bg-card hover:bg-muted/50"
              )}
            >
              <Checkbox
                checked={shareWithCommunity}
                onCheckedChange={(checked) => setShareWithCommunity(!!checked)}
                aria-label="Share with community"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Globe className="size-4" />
                  <span className="text-sm font-medium">Share with Community</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Visible to all {selectedAfsc || "AFSC"} members for reference and voting
                </p>
              </div>
            </label>

          </div>
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSaving || !isValid}
            className="w-full sm:w-auto"
          >
            {isSaving ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
            Add Statement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

