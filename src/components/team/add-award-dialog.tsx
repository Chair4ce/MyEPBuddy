"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import { useAwardsStore } from "@/stores/awards-store";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import {
  AWARD_TYPES,
  AWARD_LEVELS,
  AWARD_CATEGORIES,
  AWARD_QUARTERS,
  getQuarterDateRange,
} from "@/lib/constants";
import type {
  AwardType,
  AwardLevel,
  AwardCategory,
  AwardQuarter,
  Profile,
  ManagedMember,
  AwardCatalog,
  Award as AwardType_DB,
  AwardRequest as AwardRequestType_DB,
} from "@/types/database";
import {
  Loader2,
  Award as AwardIcon,
  Medal,
  Trophy,
  Star,
  Users,
  Calendar,
  User,
} from "lucide-react";

interface AddAwardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Pre-selected recipient (optional)
  recipientProfileId?: string;
  recipientTeamMemberId?: string;
  recipientName?: string;
  // For request mode (member submitting to supervisor)
  isRequestMode?: boolean;
  approverId?: string;
  onSuccess?: () => void;
}

export function AddAwardDialog({
  open,
  onOpenChange,
  recipientProfileId,
  recipientTeamMemberId,
  recipientName,
  isRequestMode = false,
  approverId,
  onSuccess,
}: AddAwardDialogProps) {
  const { profile, subordinates, managedMembers, epbConfig } = useUserStore();
  const { awardCatalog, addAward, addMyRequest } = useAwardsStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [localCatalog, setLocalCatalog] = useState<AwardCatalog[]>([]);

  // Form state
  const [awardType, setAwardType] = useState<AwardType>("coin");
  const [selectedRecipientType, setSelectedRecipientType] = useState<"profile" | "team_member">(
    recipientProfileId ? "profile" : recipientTeamMemberId ? "team_member" : "profile"
  );
  const [selectedRecipientId, setSelectedRecipientId] = useState(
    recipientProfileId || recipientTeamMemberId || ""
  );

  // Coin fields
  const [coinPresenter, setCoinPresenter] = useState("");
  const [coinDescription, setCoinDescription] = useState("");
  const [coinDate, setCoinDate] = useState(new Date().toISOString().split("T")[0]);

  // Quarterly/Annual fields
  const [quarter, setQuarter] = useState<AwardQuarter>("Q1");
  const [awardYear, setAwardYear] = useState(new Date().getFullYear());
  const [awardLevel, setAwardLevel] = useState<AwardLevel>("squadron");
  const [awardCategory, setAwardCategory] = useState<AwardCategory>("nco");

  // Special award name
  const [awardName, setAwardName] = useState("");
  const [selectedCatalogAward, setSelectedCatalogAward] = useState<string>("");

  // Team award
  const [isTeamAward, setIsTeamAward] = useState(false);
  const [selectedTeamMembers, setSelectedTeamMembers] = useState<Set<string>>(new Set());

  const supabase = createClient();
  const currentYear = new Date().getFullYear();

  // Load award catalog on mount
  useEffect(() => {
    if (open && localCatalog.length === 0) {
      loadCatalog();
    }
  }, [open]);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setAwardType("coin");
      setSelectedRecipientId(recipientProfileId || recipientTeamMemberId || "");
      setSelectedRecipientType(
        recipientProfileId ? "profile" : recipientTeamMemberId ? "team_member" : "profile"
      );
      setCoinPresenter("");
      setCoinDescription("");
      setCoinDate(new Date().toISOString().split("T")[0]);
      setQuarter("Q1");
      setAwardYear(currentYear);
      setAwardLevel("squadron");
      setAwardCategory("nco");
      setAwardName("");
      setSelectedCatalogAward("");
      setIsTeamAward(false);
      setSelectedTeamMembers(new Set());
    }
  }, [open, recipientProfileId, recipientTeamMemberId]);

  async function loadCatalog() {
    setLoadingCatalog(true);
    try {
      const { data, error } = await supabase
        .from("award_catalog")
        .select("*")
        .eq("is_active", true)
        .order("display_order");

      if (error) throw error;
      setLocalCatalog(data || []);
    } catch (error) {
      console.error("Error loading award catalog:", error);
    } finally {
      setLoadingCatalog(false);
    }
  }

  // Filter catalog by award type
  const filteredCatalog = localCatalog.filter((c) => c.award_type === awardType);

  // All available recipients
  const allRecipients: { id: string; name: string; rank: string | null; type: "profile" | "team_member" }[] = [
    ...subordinates.map((s) => ({
      id: s.id,
      name: s.full_name || "Unknown",
      rank: s.rank,
      type: "profile" as const,
    })),
    ...managedMembers
      .filter((m) => m.member_status === "active")
      .map((m) => ({
        id: m.id,
        name: m.full_name || "Unknown",
        rank: m.rank,
        type: "team_member" as const,
      })),
  ];

  // Team members for team awards (exclude the main recipient)
  const teamMemberOptions = allRecipients.filter(
    (r) => !(r.type === selectedRecipientType && r.id === selectedRecipientId)
  );

  function toggleTeamMember(id: string) {
    setSelectedTeamMembers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function selectAllTeamMembers() {
    setSelectedTeamMembers(new Set(teamMemberOptions.map((m) => m.id)));
  }

  function clearTeamMembers() {
    setSelectedTeamMembers(new Set());
  }

  async function handleSubmit() {
    if (!profile) return;

    // Validation
    if (!selectedRecipientId) {
      toast.error("Please select a recipient");
      return;
    }

    if (awardType === "coin") {
      if (!coinPresenter.trim()) {
        toast.error("Please enter who presented the coin");
        return;
      }
      if (!coinDate) {
        toast.error("Please select when the coin was received");
        return;
      }
    }

    if (awardType === "special" && !awardName.trim() && !selectedCatalogAward) {
      toast.error("Please select or enter an award name");
      return;
    }

    setIsSubmitting(true);

    try {
      const cycleYear = epbConfig?.current_cycle_year || currentYear;
      const finalAwardName = selectedCatalogAward || awardName || null;

      // Calculate period dates for quarterly awards
      let periodStart: string | null = null;
      let periodEnd: string | null = null;
      if (awardType === "quarterly") {
        const dates = getQuarterDateRange(quarter, awardYear);
        periodStart = dates.start;
        periodEnd = dates.end;
      } else if (awardType === "annual") {
        periodStart = `${awardYear}-01-01`;
        periodEnd = `${awardYear}-12-31`;
      }

      const isProfileRecipient = selectedRecipientType === "profile";

      if (isRequestMode && approverId) {
        // Create an award request
        const { data: request, error: requestError } = await supabase
          .from("award_requests")
          .insert({
            requester_id: profile.id,
            approver_id: approverId,
            recipient_profile_id: isProfileRecipient ? selectedRecipientId : null,
            recipient_team_member_id: !isProfileRecipient ? selectedRecipientId : null,
            award_type: awardType,
            award_name: finalAwardName,
            coin_presenter: awardType === "coin" ? coinPresenter : null,
            coin_description: awardType === "coin" ? coinDescription || null : null,
            coin_date: awardType === "coin" ? coinDate : null,
            quarter: awardType === "quarterly" ? quarter : null,
            award_year: ["quarterly", "annual", "special"].includes(awardType) ? awardYear : null,
            period_start: periodStart,
            period_end: periodEnd,
            award_level: ["quarterly", "annual", "special"].includes(awardType) ? awardLevel : null,
            award_category: ["quarterly", "annual", "special"].includes(awardType) ? awardCategory : null,
            is_team_award: isTeamAward,
            cycle_year: cycleYear,
          } as never)
          .select()
          .single();

        if (requestError) throw requestError;

        const typedRequest = request as AwardRequestType_DB;

        // Add team members to request if team award
        if (isTeamAward && selectedTeamMembers.size > 0) {
          const teamMemberInserts = Array.from(selectedTeamMembers).map((memberId) => {
            const member = allRecipients.find((r) => r.id === memberId);
            return {
              request_id: typedRequest.id,
              profile_id: member?.type === "profile" ? memberId : null,
              team_member_id: member?.type === "team_member" ? memberId : null,
            };
          });

          await supabase.from("award_request_team_members").insert(teamMemberInserts as never);
        }

        addMyRequest(typedRequest);
        toast.success("Award request submitted for approval");
      } else {
        // Create the award directly (supervisor mode)
        const { data: award, error: awardError } = await supabase
          .from("awards")
          .insert({
            recipient_profile_id: isProfileRecipient ? selectedRecipientId : null,
            recipient_team_member_id: !isProfileRecipient ? selectedRecipientId : null,
            created_by: profile.id,
            supervisor_id: profile.id,
            award_type: awardType,
            award_name: finalAwardName,
            coin_presenter: awardType === "coin" ? coinPresenter : null,
            coin_description: awardType === "coin" ? coinDescription || null : null,
            coin_date: awardType === "coin" ? coinDate : null,
            quarter: awardType === "quarterly" ? quarter : null,
            award_year: ["quarterly", "annual", "special"].includes(awardType) ? awardYear : null,
            period_start: periodStart,
            period_end: periodEnd,
            award_level: ["quarterly", "annual", "special"].includes(awardType) ? awardLevel : null,
            award_category: ["quarterly", "annual", "special"].includes(awardType) ? awardCategory : null,
            is_team_award: isTeamAward,
            cycle_year: cycleYear,
          } as never)
          .select()
          .single();

        if (awardError) throw awardError;

        const typedAward = award as AwardType_DB;

        // Add team members if team award
        if (isTeamAward && selectedTeamMembers.size > 0) {
          const teamMemberInserts = Array.from(selectedTeamMembers).map((memberId) => {
            const member = allRecipients.find((r) => r.id === memberId);
            return {
              award_id: typedAward.id,
              profile_id: member?.type === "profile" ? memberId : null,
              team_member_id: member?.type === "team_member" ? memberId : null,
            };
          });

          await supabase.from("award_team_members").insert(teamMemberInserts as never);
        }

        addAward(typedAward);
        toast.success("Award added successfully");
      }

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error("Error adding award:", error);
      toast.error("Failed to add award");
    } finally {
      setIsSubmitting(false);
    }
  }

  function getAwardIcon(type: AwardType) {
    switch (type) {
      case "coin":
        return <Medal className="size-4" />;
      case "quarterly":
        return <AwardIcon className="size-4" />;
      case "annual":
        return <Trophy className="size-4" />;
      case "special":
        return <Star className="size-4" />;
      default:
        return <AwardIcon className="size-4" />;
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="size-5 text-amber-500" />
            {isRequestMode ? "Request Award Recognition" : "Add Award / Recognition"}
          </DialogTitle>
          <DialogDescription>
            {isRequestMode
              ? "Submit an award for supervisor approval"
              : "Record an award or recognition for a team member"}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4 -mr-4">
          <div className="space-y-4 pr-2">
            {/* Award Type Selection */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Award Type</Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {AWARD_TYPES.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setAwardType(type.value)}
                    className={cn(
                      "flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all",
                      awardType === type.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    {getAwardIcon(type.value)}
                    <span className="text-xs font-medium">{type.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Recipient Selection (if not pre-selected) */}
            {!recipientProfileId && !recipientTeamMemberId && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Recipient</Label>
                <Select
                  value={`${selectedRecipientType}:${selectedRecipientId}`}
                  onValueChange={(val) => {
                    const [type, id] = val.split(":");
                    setSelectedRecipientType(type as "profile" | "team_member");
                    setSelectedRecipientId(id);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select recipient" />
                  </SelectTrigger>
                  <SelectContent>
                    {allRecipients.map((r) => (
                      <SelectItem key={`${r.type}:${r.id}`} value={`${r.type}:${r.id}`}>
                        <span className="flex items-center gap-2">
                          <User className="size-3" />
                          {r.rank} {r.name}
                          {r.type === "team_member" && (
                            <Badge variant="outline" className="text-[8px] px-1">
                              Managed
                            </Badge>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Pre-selected recipient display */}
            {(recipientProfileId || recipientTeamMemberId) && recipientName && (
              <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                <User className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">{recipientName}</span>
              </div>
            )}

            {/* Coin-specific fields */}
            {awardType === "coin" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="coinPresenter">Presented By *</Label>
                  <Input
                    id="coinPresenter"
                    placeholder="e.g., Col Smith, 388 FW/CC"
                    value={coinPresenter}
                    onChange={(e) => setCoinPresenter(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="coinDate">Date Received *</Label>
                  <Input
                    id="coinDate"
                    type="date"
                    value={coinDate}
                    onChange={(e) => setCoinDate(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="coinDescription">What was it for?</Label>
                  <Textarea
                    id="coinDescription"
                    placeholder="Brief description of the exceptional performance..."
                    value={coinDescription}
                    onChange={(e) => setCoinDescription(e.target.value)}
                    rows={3}
                  />
                </div>
              </>
            )}

            {/* Quarterly/Annual/Special fields */}
            {["quarterly", "annual", "special"].includes(awardType) && (
              <>
                {/* Award Name (for special) or Catalog Selection */}
                {awardType === "special" && (
                  <div className="space-y-2">
                    <Label>Award Name</Label>
                    {loadingCatalog ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        Loading awards...
                      </div>
                    ) : filteredCatalog.length > 0 ? (
                      <Select
                        value={selectedCatalogAward}
                        onValueChange={(val) => {
                          setSelectedCatalogAward(val);
                          setAwardName("");
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select from catalog or enter custom" />
                        </SelectTrigger>
                        <SelectContent>
                          {filteredCatalog.map((cat) => (
                            <SelectItem key={cat.id} value={cat.name}>
                              {cat.name}
                              {cat.short_name && ` (${cat.short_name})`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : null}
                    {!selectedCatalogAward && (
                      <Input
                        placeholder="Or enter custom award name"
                        value={awardName}
                        onChange={(e) => setAwardName(e.target.value)}
                        className="mt-2"
                      />
                    )}
                  </div>
                )}

                {/* Quarter selection (for quarterly) */}
                {awardType === "quarterly" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Quarter *</Label>
                      <Select value={quarter} onValueChange={(v) => setQuarter(v as AwardQuarter)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {AWARD_QUARTERS.map((q) => (
                            <SelectItem key={q.value} value={q.value}>
                              {q.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Year *</Label>
                      <Select
                        value={String(awardYear)}
                        onValueChange={(v) => setAwardYear(parseInt(v))}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                            <SelectItem key={y} value={String(y)}>
                              {y}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                {/* Year selection (for annual/special) */}
                {["annual", "special"].includes(awardType) && (
                  <div className="space-y-2">
                    <Label>Award Year *</Label>
                    <Select
                      value={String(awardYear)}
                      onValueChange={(v) => setAwardYear(parseInt(v))}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[currentYear, currentYear - 1, currentYear - 2, currentYear - 3].map(
                          (y) => (
                            <SelectItem key={y} value={String(y)}>
                              {y}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Award Level */}
                <div className="space-y-2">
                  <Label>Highest Level Won At</Label>
                  <Select
                    value={awardLevel}
                    onValueChange={(v) => setAwardLevel(v as AwardLevel)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AWARD_LEVELS.map((level) => (
                        <SelectItem key={level.value} value={level.value}>
                          {level.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Award Category */}
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={awardCategory}
                    onValueChange={(v) => setAwardCategory(v as AwardCategory)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AWARD_CATEGORIES.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* Team Award Toggle */}
            {["quarterly", "annual", "special"].includes(awardType) && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="isTeamAward"
                    checked={isTeamAward}
                    onCheckedChange={(checked) => setIsTeamAward(checked as boolean)}
                  />
                  <Label htmlFor="isTeamAward" className="cursor-pointer">
                    <span className="flex items-center gap-1">
                      <Users className="size-3" />
                      This is a team award
                    </span>
                  </Label>
                </div>

                {/* Team member selection */}
                {isTeamAward && teamMemberOptions.length > 0 && (
                  <div className="space-y-2 p-3 border rounded-lg bg-muted/20">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Team Members</Label>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={selectAllTeamMembers}
                        >
                          Select All
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={clearTeamMembers}
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                      {teamMemberOptions.map((member) => (
                        <Badge
                          key={member.id}
                          variant={selectedTeamMembers.has(member.id) ? "default" : "outline"}
                          className={cn(
                            "cursor-pointer transition-colors",
                            selectedTeamMembers.has(member.id)
                              ? "bg-primary"
                              : "hover:bg-primary/10"
                          )}
                          onClick={() => toggleTeamMember(member.id)}
                        >
                          {member.rank} {member.name}
                        </Badge>
                      ))}
                    </div>
                    {selectedTeamMembers.size > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {selectedTeamMembers.size} team member(s) selected
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                {isRequestMode ? "Submitting..." : "Adding..."}
              </>
            ) : isRequestMode ? (
              "Submit Request"
            ) : (
              "Add Award"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

