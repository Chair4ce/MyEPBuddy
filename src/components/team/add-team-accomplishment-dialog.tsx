"use client";

import { useState, useEffect, useMemo } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ComboboxInput } from "@/components/ui/combobox-input";
import { toast } from "@/components/ui/sonner";
import { createAccomplishment } from "@/app/actions/accomplishments";
import {
  DEFAULT_ACTION_VERBS,
  ENTRY_MGAS,
  getActiveCycleYear,
} from "@/lib/constants";
import type { Rank, Profile, ManagedMember } from "@/types/database";
import {
  Loader2,
  Users,
  ChevronRight,
  ChevronLeft,
  Check,
  AlertCircle,
} from "lucide-react";
import { celebrateEntry } from "@/lib/confetti";
import { cn } from "@/lib/utils";
import { scanForSensitiveData, getScanSummary } from "@/lib/sensitive-data-scanner";

// Role-based verb suggestions to help supervisors choose appropriate verbs
const VERB_CATEGORIES = {
  leadership: {
    label: "Leadership",
    verbs: ["Led", "Directed", "Managed", "Supervised", "Spearheaded", "Championed"],
    description: "For members who took charge or led the effort",
  },
  collaboration: {
    label: "Collaboration",
    verbs: ["Co-led", "Partnered", "Collaborated", "Coordinated", "Teamed"],
    description: "For members who shared leadership or worked closely together",
  },
  support: {
    label: "Support",
    verbs: ["Supported", "Assisted", "Aided", "Helped", "Contributed"],
    description: "For members who provided key support",
  },
  execution: {
    label: "Execution",
    verbs: ["Executed", "Performed", "Completed", "Accomplished", "Delivered"],
    description: "For members who carried out specific tasks",
  },
  expertise: {
    label: "Expertise",
    verbs: ["Analyzed", "Developed", "Designed", "Engineered", "Implemented"],
    description: "For members who provided technical expertise",
  },
  mentorship: {
    label: "Mentorship",
    verbs: ["Mentored", "Trained", "Guided", "Coached", "Instructed"],
    description: "For members who trained or mentored others",
  },
};

interface TeamMemberOption {
  id: string;
  type: "profile" | "managed";
  name: string;
  rank: Rank | null;
  afsc: string | null;
}

interface SelectedMember extends TeamMemberOption {
  actionVerb: string;
}

interface AddTeamAccomplishmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subordinates: Profile[];
  managedMembers: ManagedMember[];
}

export function AddTeamAccomplishmentDialog({
  open,
  onOpenChange,
  subordinates,
  managedMembers,
}: AddTeamAccomplishmentDialogProps) {
  const { profile, epbConfig } = useUserStore();

  const [step, setStep] = useState<1 | 2>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<SelectedMember[]>([]);

  // Common accomplishment details
  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    details: "",
    impact: "",
    metrics: "",
    mpa: "executing_mission",
    tags: "",
  });

  const mgas = ENTRY_MGAS;

  // Build available team members list
  const availableMembers = useMemo((): TeamMemberOption[] => {
    const members: TeamMemberOption[] = [];

    // Add real subordinates
    subordinates.forEach((sub) => {
      members.push({
        id: sub.id,
        type: "profile",
        name: sub.full_name || "Unknown",
        rank: sub.rank,
        afsc: sub.afsc,
      });
    });

    // Add managed members (only active ones)
    managedMembers
      .filter((m) => m.member_status === "active" || m.member_status === "pending_link")
      .forEach((member) => {
        members.push({
          id: member.id,
          type: "managed",
          name: member.full_name || "Unknown",
          rank: member.rank,
          afsc: member.afsc,
        });
      });

    return members;
  }, [subordinates, managedMembers]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setStep(1);
      setSelectedMembers([]);
      setForm({
        date: new Date().toISOString().split("T")[0],
        details: "",
        impact: "",
        metrics: "",
        mpa: "executing_mission",
        tags: "",
      });
    }
  }, [open]);

  // Toggle member selection
  function toggleMember(member: TeamMemberOption) {
    setSelectedMembers((prev) => {
      const existing = prev.find((m) => m.id === member.id && m.type === member.type);
      if (existing) {
        return prev.filter((m) => !(m.id === member.id && m.type === member.type));
      }
      return [...prev, { ...member, actionVerb: "" }];
    });
  }

  // Check if member is selected
  function isMemberSelected(member: TeamMemberOption) {
    return selectedMembers.some((m) => m.id === member.id && m.type === member.type);
  }

  // Update action verb for a member
  function updateMemberVerb(memberId: string, type: "profile" | "managed", verb: string) {
    setSelectedMembers((prev) =>
      prev.map((m) =>
        m.id === memberId && m.type === type ? { ...m, actionVerb: verb } : m
      )
    );
  }

  // Validate step 1
  function canProceedToStep2() {
    return form.details.trim().length > 0;
  }

  // Validate step 2
  function canSubmit() {
    return (
      selectedMembers.length > 0 &&
      selectedMembers.every((m) => m.actionVerb.trim().length > 0)
    );
  }

  // Check for duplicate verbs
  const duplicateVerbs = useMemo(() => {
    const verbs = selectedMembers.map((m) => m.actionVerb.toLowerCase().trim()).filter(Boolean);
    const counts = verbs.reduce((acc, v) => ({ ...acc, [v]: (acc[v] || 0) + 1 }), {} as Record<string, number>);
    return Object.entries(counts)
      .filter(([, count]) => count > 1)
      .map(([verb]) => verb);
  }, [selectedMembers]);

  async function handleSubmit() {
    if (!profile || !canSubmit()) return;

    // Scan for PII, CUI, and classification markings — hard block if found
    const sensitiveMatches = scanForSensitiveData({
      details: form.details,
      impact: form.impact,
      metrics: form.metrics,
    });
    if (sensitiveMatches.length > 0) {
      toast.error(getScanSummary(sensitiveMatches), { duration: 10000 });
      return;
    }

    setIsSubmitting(true);

    const tags = form.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const errors: string[] = [];
    const successes: string[] = [];

    // Create accomplishment for each selected member
    for (const member of selectedMembers) {
      try {
        const isManaged = member.type === "managed";

        const memberCycleYear = getActiveCycleYear(member.rank as Rank | null);

        const result = await createAccomplishment({
          user_id: isManaged ? profile.id : member.id,
          created_by: profile.id,
          team_member_id: isManaged ? member.id : null,
          date: form.date,
          action_verb: member.actionVerb,
          details: form.details,
          impact: form.impact || null,
          metrics: form.metrics || null,
          mpa: form.mpa,
          tags,
          cycle_year: memberCycleYear,
          assessment_scores: null,
          assessed_at: null,
          assessment_model: null,
        });

        if (result.error) {
          errors.push(`${member.rank || ""} ${member.name}: ${result.error}`);
        } else {
          successes.push(`${member.rank || ""} ${member.name}`);
          // Background PII/CUI scan (defense-in-depth)
          if (result.data) {
            fetch("/api/scan-entry", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ accomplishmentId: result.data.id }),
            }).catch(() => {});
          }
        }
      } catch (error) {
        errors.push(`${member.rank || ""} ${member.name}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }

    setIsSubmitting(false);

    if (successes.length > 0) {
      celebrateEntry();
      toast.success(`Created ${successes.length} accomplishment${successes.length > 1 ? "s" : ""}!`, {
        description: successes.join(", "),
        duration: 5000,
      });
    }

    if (errors.length > 0) {
      toast.error(`Failed to create ${errors.length} accomplishment${errors.length > 1 ? "s" : ""}`, {
        description: errors.join("; "),
        duration: 8000,
      });
    }

    if (successes.length > 0) {
      onOpenChange(false);
    }
  }

  function getInitials(name: string) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1rem)] max-w-2xl max-h-[85dvh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 sm:px-6 sm:pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Users className="size-5" />
            Team Accomplishment
          </DialogTitle>
          <DialogDescription className="text-sm">
            {step === 1
              ? "Enter the shared accomplishment details for a project or event."
              : "Select team members and assign their unique roles."}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-4 sm:px-6 py-3 border-b bg-muted/30">
          <div
            className={cn(
              "flex items-center gap-1.5 text-sm font-medium",
              step === 1 ? "text-primary" : "text-muted-foreground"
            )}
          >
            <span
              className={cn(
                "size-6 rounded-full flex items-center justify-center text-xs",
                step === 1 ? "bg-primary text-primary-foreground" : "bg-muted"
              )}
            >
              {step > 1 ? <Check className="size-3.5" /> : "1"}
            </span>
            Details
          </div>
          <ChevronRight className="size-4 text-muted-foreground" />
          <div
            className={cn(
              "flex items-center gap-1.5 text-sm font-medium",
              step === 2 ? "text-primary" : "text-muted-foreground"
            )}
          >
            <span
              className={cn(
                "size-6 rounded-full flex items-center justify-center text-xs",
                step === 2 ? "bg-primary text-primary-foreground" : "bg-muted"
              )}
            >
              2
            </span>
            Members & Roles
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date">Date *</Label>
                  <Input
                    id="date"
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    required
                    aria-label="Accomplishment date"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mpa">Major Performance Area</Label>
                  <Select
                    value={form.mpa}
                    onValueChange={(value) => setForm({ ...form, mpa: value })}
                  >
                    <SelectTrigger id="mpa" aria-label="Select MPA">
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
              </div>

              <div className="space-y-2">
                <Label htmlFor="details">
                  Details *
                  <span className="text-muted-foreground font-normal ml-2 text-xs">
                    Describe the project/accomplishment (shared by all)
                  </span>
                </Label>
                <Textarea
                  id="details"
                  placeholder="Describe the project or accomplishment that the team worked on..."
                  value={form.details}
                  onChange={(e) => setForm({ ...form, details: e.target.value })}
                  required
                  className="min-h-[100px] resize-y"
                  aria-label="Accomplishment details"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="impact">
                  Impact/Result
                  <span className="text-muted-foreground font-normal ml-2 text-xs">
                    (optional) What was the outcome?
                  </span>
                </Label>
                <Textarea
                  id="impact"
                  placeholder="Describe the impact, results, or benefits..."
                  value={form.impact}
                  onChange={(e) => setForm({ ...form, impact: e.target.value })}
                  className="min-h-[80px] resize-y"
                  aria-label="Impact or result"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="metrics">
                  Metrics
                  <span className="text-muted-foreground font-normal ml-2 text-xs">
                    (optional)
                  </span>
                </Label>
                <Input
                  id="metrics"
                  placeholder="e.g., 15% increase, 200 hours saved"
                  value={form.metrics}
                  onChange={(e) => setForm({ ...form, metrics: e.target.value })}
                  aria-label="Quantifiable metrics"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tags">
                  Tags
                  <span className="text-muted-foreground font-normal ml-2 text-xs">
                    (comma separated)
                  </span>
                </Label>
                <Input
                  id="tags"
                  placeholder="e.g., Project Alpha, LOE 1, Training"
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  aria-label="Tags"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {/* Member selection */}
              <div className="space-y-2">
                <Label>Select Team Members</Label>
                <ScrollArea className="h-[140px] rounded-md border p-2">
                  <div className="space-y-1">
                    {availableMembers.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No team members available
                      </p>
                    ) : (
                      availableMembers.map((member) => (
                        <div
                          key={`${member.type}-${member.id}`}
                          className={cn(
                            "flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors",
                            isMemberSelected(member)
                              ? "bg-primary/10 border border-primary/30"
                              : "hover:bg-muted"
                          )}
                          onClick={() => toggleMember(member)}
                        >
                          <Checkbox
                            checked={isMemberSelected(member)}
                            onCheckedChange={() => toggleMember(member)}
                            aria-label={`Select ${member.name}`}
                          />
                          <Avatar className="size-7">
                            <AvatarFallback className="text-xs">
                              {getInitials(member.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium truncate">
                                {member.rank} {member.name}
                              </span>
                              {member.type === "managed" && (
                                <Badge variant="secondary" className="text-[10px] px-1 py-0">
                                  Managed
                                </Badge>
                              )}
                            </div>
                            {member.afsc && (
                              <span className="text-xs text-muted-foreground">
                                {member.afsc}
                              </span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
                <p className="text-xs text-muted-foreground">
                  {selectedMembers.length} member{selectedMembers.length !== 1 ? "s" : ""} selected
                </p>
              </div>

              {/* Role assignment for selected members */}
              {selectedMembers.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Assign Roles (Action Verbs)</Label>
                    {duplicateVerbs.length > 0 && (
                      <div className="flex items-center gap-1 text-amber-600 text-xs">
                        <AlertCircle className="size-3" />
                        Duplicate verbs detected
                      </div>
                    )}
                  </div>
                  
                  {/* Verb category suggestions */}
                  <div className="flex flex-wrap gap-1.5 pb-2">
                    {Object.entries(VERB_CATEGORIES).map(([key, category]) => (
                      <Badge
                        key={key}
                        variant="outline"
                        className="text-[10px] cursor-help"
                        title={`${category.description}: ${category.verbs.join(", ")}`}
                      >
                        {category.label}
                      </Badge>
                    ))}
                  </div>

                  <ScrollArea className="h-[200px] pr-3">
                    <div className="space-y-3">
                      {selectedMembers.map((member, index) => (
                        <div
                          key={`${member.type}-${member.id}`}
                          className="flex items-start gap-3 p-3 rounded-lg border bg-card"
                        >
                          <Avatar className="size-8 shrink-0">
                            <AvatarFallback className="text-xs">
                              {getInitials(member.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 space-y-2 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium truncate">
                                {member.rank} {member.name}
                              </span>
                            </div>
                            <ComboboxInput
                              value={member.actionVerb}
                              onChange={(value) =>
                                updateMemberVerb(member.id, member.type, value)
                              }
                              options={DEFAULT_ACTION_VERBS}
                              placeholder="Select or type action verb..."
                              aria-label={`Action verb for ${member.name}`}
                            />
                            {member.actionVerb &&
                              duplicateVerbs.includes(member.actionVerb.toLowerCase().trim()) && (
                                <p className="text-[10px] text-amber-600">
                                  This verb is used by another member
                                </p>
                              )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {selectedMembers.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="size-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Select team members above to assign roles</p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="px-4 pb-4 sm:px-6 sm:pb-6 pt-0 gap-2 border-t pt-4">
          <div className="flex w-full justify-between gap-2">
            {step === 2 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(1)}
                disabled={isSubmitting}
              >
                <ChevronLeft className="size-4 mr-1" />
                Back
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              {step === 1 ? (
                <Button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={!canProceedToStep2()}
                >
                  Next
                  <ChevronRight className="size-4 ml-1" />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting || !canSubmit()}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin mr-2" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Check className="size-4 mr-2" />
                      Create {selectedMembers.length} Entr{selectedMembers.length === 1 ? "y" : "ies"}
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
