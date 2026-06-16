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
import { toast } from "@/components/ui/sonner";
import { createClient } from "@/lib/supabase/client";
import { createAccomplishment } from "@/app/actions/accomplishments";
import { handleStaleDeploymentError } from "@/lib/stale-deployment";
import {
  ENTRY_MGAS,
  getActiveCycleYear,
} from "@/lib/constants";
import type { Rank, Project } from "@/types/database";
import {
  Loader2,
  ChevronRight,
  ChevronLeft,
  Check,
  AlertCircle,
  FolderKanban,
  Crown,
} from "lucide-react";
import { celebrateEntry } from "@/lib/confetti";
import { cn } from "@/lib/utils";
import { scanForSensitiveData, getScanSummary } from "@/lib/sensitive-data-scanner";

// Role categories with their options
const ROLE_CATEGORIES = {
  leadership: {
    label: "Leadership",
    description: "Directed, managed, or led the effort",
    roles: [
      { value: "led", label: "Led", verb: "Led" },
      { value: "directed", label: "Directed", verb: "Directed" },
      { value: "managed", label: "Managed", verb: "Managed" },
      { value: "supervised", label: "Supervised", verb: "Supervised" },
      { value: "spearheaded", label: "Spearheaded", verb: "Spearheaded" },
    ],
    allowMultiple: false,
  },
  coLeadership: {
    label: "Co-Leadership",
    description: "Shared leadership with another member",
    roles: [
      { value: "co-led", label: "Co-Led", verb: "Co-led" },
      { value: "co-managed", label: "Co-Managed", verb: "Co-managed" },
      { value: "co-directed", label: "Co-Directed", verb: "Co-directed" },
    ],
    allowMultiple: true,
  },
  support: {
    label: "Support",
    description: "Guided, consulted, or provided resources",
    roles: [
      { value: "guided", label: "Guided", verb: "Guided" },
      { value: "consulted", label: "Consulted", verb: "Consulted" },
      { value: "advised", label: "Advised", verb: "Advised" },
      { value: "coordinated", label: "Coordinated", verb: "Coordinated" },
      { value: "facilitated", label: "Facilitated", verb: "Facilitated" },
      { value: "supported", label: "Supported", verb: "Supported" },
    ],
    allowMultiple: true,
  },
  execution: {
    label: "Execution",
    description: "Performed the technical work",
    roles: [
      { value: "performed", label: "Performed", verb: "Performed" },
      { value: "executed", label: "Executed", verb: "Executed" },
      { value: "configured", label: "Configured", verb: "Configured" },
      { value: "implemented", label: "Implemented", verb: "Implemented" },
      { value: "developed", label: "Developed", verb: "Developed" },
      { value: "completed", label: "Completed", verb: "Completed" },
      { value: "accomplished", label: "Accomplished", verb: "Accomplished" },
    ],
    allowMultiple: true,
  },
};

// Flatten all roles for easy lookup
const ALL_ROLES = Object.values(ROLE_CATEGORIES).flatMap((cat) => 
  cat.roles.map((r) => ({ ...r, category: cat.label, allowMultiple: cat.allowMultiple }))
);

interface ProjectMemberOption {
  id: string;
  memberId: string; // project_member id
  type: "profile" | "managed";
  name: string;
  rank: string | null;
  afsc: string | null;
  isOwner: boolean;
}

interface SelectedMember extends ProjectMemberOption {
  role: string; // The role value from ROLE_CATEGORIES
  actionVerb: string; // Derived from role or custom
}

interface AddProjectAccomplishmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
}

export function AddProjectAccomplishmentDialog({
  open,
  onOpenChange,
  project,
}: AddProjectAccomplishmentDialogProps) {
  const { profile } = useUserStore();
  const supabase = createClient();

  const [step, setStep] = useState<1 | 2>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<SelectedMember[]>([]);

  const [form, setForm] = useState({
    date: new Date().toISOString().split("T")[0],
    details: "",
    impact: "",
    metrics: "",
    mpa: "executing_mission",
    tags: "",
  });

  const mgas = ENTRY_MGAS;
  const cycleYear = getActiveCycleYear(profile?.rank as Rank | null);

  // Build available members from project members only
  const availableMembers = useMemo((): ProjectMemberOption[] => {
    if (!project?.members) return [];

    return project.members
      .filter((m) => {
        // Only include members we can create entries for
        // (profile members we supervise or managed members)
        return m.profile_id || m.team_member_id;
      })
      .map((m): ProjectMemberOption => {
        if (m.profile_id && m.profile) {
          return {
            id: m.profile_id,
            memberId: m.id,
            type: "profile",
            name: m.profile.full_name || "Unknown",
            rank: m.profile.rank,
            afsc: m.profile.afsc,
            isOwner: m.is_owner,
          };
        } else if (m.team_member_id && m.team_member) {
          return {
            id: m.team_member_id,
            memberId: m.id,
            type: "managed",
            name: m.team_member.full_name || "Unknown",
            rank: m.team_member.rank,
            afsc: m.team_member.afsc,
            isOwner: m.is_owner,
          };
        }
        return null as unknown as ProjectMemberOption;
      })
      .filter(Boolean);
  }, [project]);

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

  function toggleMember(member: ProjectMemberOption) {
    setSelectedMembers((prev) => {
      const existing = prev.find((m) => m.id === member.id && m.type === member.type);
      if (existing) {
        return prev.filter((m) => !(m.id === member.id && m.type === member.type));
      }
      return [...prev, { ...member, role: "", actionVerb: "" }];
    });
  }

  function isMemberSelected(member: ProjectMemberOption) {
    return selectedMembers.some((m) => m.id === member.id && m.type === member.type);
  }

  function updateMemberRole(memberId: string, type: "profile" | "managed", role: string) {
    const roleInfo = ALL_ROLES.find((r) => r.value === role);
    setSelectedMembers((prev) =>
      prev.map((m) =>
        m.id === memberId && m.type === type 
          ? { ...m, role, actionVerb: roleInfo?.verb || "" } 
          : m
      )
    );
  }

  function selectAllMembers() {
    setSelectedMembers(availableMembers.map((m) => ({ ...m, role: "", actionVerb: "" })));
  }

  function deselectAllMembers() {
    setSelectedMembers([]);
  }

  function canProceedToStep2() {
    return form.details.trim().length > 0;
  }

  function canSubmit() {
    return (
      selectedMembers.length > 0 &&
      selectedMembers.every((m) => m.role.trim().length > 0) &&
      roleConflicts.length === 0
    );
  }

  // Check for role conflicts (leadership roles can only be used once unless co-leadership)
  const roleConflicts = useMemo(() => {
    const conflicts: string[] = [];
    const roleCounts: Record<string, number> = {};
    
    selectedMembers.forEach((m) => {
      if (m.role) {
        roleCounts[m.role] = (roleCounts[m.role] || 0) + 1;
      }
    });

    // Check each role for conflicts
    Object.entries(roleCounts).forEach(([role, count]) => {
      if (count > 1) {
        const roleInfo = ALL_ROLES.find((r) => r.value === role);
        if (roleInfo && !roleInfo.allowMultiple) {
          conflicts.push(role);
        }
      }
    });

    return conflicts;
  }, [selectedMembers]);

  // Get roles that are already taken (for disabling in dropdowns)
  function isRoleAvailable(role: string, currentMemberId: string, currentMemberType: string) {
    const roleInfo = ALL_ROLES.find((r) => r.value === role);
    if (!roleInfo) return true;
    if (roleInfo.allowMultiple) return true;
    
    // Check if another member already has this role
    const otherHasRole = selectedMembers.some(
      (m) => m.role === role && !(m.id === currentMemberId && m.type === currentMemberType)
    );
    return !otherHasRole;
  }

  async function handleSubmit() {
    if (!profile || !project || !canSubmit()) return;

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
    const createdAccomplishmentIds: string[] = [];

    // Create accomplishment for each selected member
    for (const member of selectedMembers) {
      try {
        const isManaged = member.type === "managed";

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
          cycle_year: cycleYear,
          assessment_scores: null,
          assessed_at: null,
          assessment_model: null,
        });

        if (result.error) {
          errors.push(`${member.rank || ""} ${member.name}: ${result.error}`);
        } else if (result.data) {
          successes.push(`${member.rank || ""} ${member.name}`);
          createdAccomplishmentIds.push(result.data.id);
          // Background PII/CUI scan (defense-in-depth)
          fetch("/api/scan-entry", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ accomplishmentId: result.data.id }),
          }).catch(() => {});
        }
      } catch (error) {
        if (handleStaleDeploymentError(error)) return;
        errors.push(`${member.rank || ""} ${member.name}: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }

    // Link all created accomplishments to the project
    if (createdAccomplishmentIds.length > 0) {
      try {
        const links = createdAccomplishmentIds.map((accomplishment_id) => ({
          accomplishment_id,
          project_id: project.id,
        }));

        await (supabase.from("accomplishment_projects") as any).insert(links);
      } catch (error) {
        console.error("Error linking accomplishments to project:", error);
        // Don't fail the whole operation if linking fails
      }
    }

    setIsSubmitting(false);

    if (successes.length > 0) {
      celebrateEntry();
      toast.success(`Created ${successes.length} ${successes.length === 1 ? "entry" : "entries"}!`, {
        description: `Linked to "${project.name}"`,
        duration: 5000,
      });
    }

    if (errors.length > 0) {
      toast.error(`Failed to create ${errors.length} ${errors.length === 1 ? "entry" : "entries"}`, {
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

  if (!project) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1rem)] max-w-2xl max-h-[85dvh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-4 pt-4 sm:px-6 sm:pt-6 pb-0">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <FolderKanban className="size-5 text-primary" />
            Add Entry to Project
          </DialogTitle>
          <DialogDescription className="text-sm">
            {step === 1
              ? `Create an accomplishment for "${project.name}"`
              : "Select project members and assign their roles"}
          </DialogDescription>
        </DialogHeader>

        {/* Project context banner */}
        <div className="mx-4 sm:mx-6 mt-3 p-3 rounded-lg bg-muted/50 border">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">{project.name}</span>
            <Badge variant="secondary" className="text-[10px]">
              {availableMembers.length} members
            </Badge>
          </div>
          {project.result && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
              Result: {project.result}
            </p>
          )}
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-4 sm:px-6 py-3 border-b bg-muted/30 mt-3">
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
            Members
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
                <Label htmlFor="details">Details *</Label>
                <Textarea
                  id="details"
                  placeholder="Describe the accomplishment..."
                  value={form.details}
                  onChange={(e) => setForm({ ...form, details: e.target.value })}
                  required
                  className="min-h-[100px] resize-y"
                  aria-label="Accomplishment details"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="impact">Impact/Result</Label>
                <Textarea
                  id="impact"
                  placeholder="What was the outcome? (optional)"
                  value={form.impact}
                  onChange={(e) => setForm({ ...form, impact: e.target.value })}
                  className="min-h-[60px] resize-y"
                  aria-label="Impact or result"
                />
                {project.result && (
                  <p className="text-xs text-muted-foreground">
                    Project result will also be used: &quot;{project.result.slice(0, 80)}...&quot;
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="metrics">Metrics</Label>
                  <Input
                    id="metrics"
                    placeholder="e.g., 15% increase"
                    value={form.metrics}
                    onChange={(e) => setForm({ ...form, metrics: e.target.value })}
                    aria-label="Quantifiable metrics"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tags">Tags</Label>
                  <Input
                    id="tags"
                    placeholder="comma separated"
                    value={form.tags}
                    onChange={(e) => setForm({ ...form, tags: e.target.value })}
                    aria-label="Tags"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {/* Header with legend and actions */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Select Members & Assign Roles</Label>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={selectAllMembers}
                    >
                      Select All
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={deselectAllMembers}
                    >
                      Clear
                    </Button>
                  </div>
                </div>

                {/* Role conflict warning */}
                {roleConflicts.length > 0 && (
                  <div className="flex items-center gap-2 p-2 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                    <AlertCircle className="size-3.5 shrink-0" />
                    <span>Leadership roles can only be assigned to one person. Use Co-Leadership for shared roles.</span>
                  </div>
                )}
              </div>

              {/* Member list with inline role selection */}
              <ScrollArea className="h-[320px] rounded-md border">
                <div className="p-2 space-y-1">
                  {availableMembers.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No members assigned to this project
                    </p>
                  ) : (
                    availableMembers.map((member) => {
                      const isSelected = isMemberSelected(member);
                      const selectedMember = selectedMembers.find(
                        (m) => m.id === member.id && m.type === member.type
                      );
                      const hasConflict = selectedMember && roleConflicts.includes(selectedMember.role);

                      return (
                        <div
                          key={`${member.type}-${member.id}`}
                          className={cn(
                            "flex items-center gap-3 p-2.5 rounded-md transition-colors",
                            isSelected
                              ? hasConflict
                                ? "bg-red-500/10 border border-red-500/30"
                                : "bg-primary/10 border border-primary/30"
                              : "hover:bg-muted border border-transparent"
                          )}
                        >
                          {/* Checkbox */}
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleMember(member)}
                            aria-label={`Select ${member.name}`}
                          />

                          {/* Avatar */}
                          <Avatar className="size-8 shrink-0">
                            <AvatarFallback className="text-xs">
                              {getInitials(member.name)}
                            </AvatarFallback>
                          </Avatar>

                          {/* Name */}
                          <div 
                            className="flex-1 min-w-0 cursor-pointer"
                            onClick={() => toggleMember(member)}
                          >
                            <div className="flex items-center gap-1.5">
                              <span className={cn(
                                "text-sm truncate",
                                isSelected ? "font-semibold" : "font-medium"
                              )}>
                                {member.rank} {member.name}
                              </span>
                              {member.isOwner && (
                                <Crown className="size-3 text-amber-500 shrink-0" />
                              )}
                              {member.type === "managed" && (
                                <Badge variant="secondary" className="text-[9px] px-1 py-0 shrink-0">
                                  Managed
                                </Badge>
                              )}
                            </div>
                          </div>

                          {/* Role dropdown - only show when selected */}
                          {isSelected && selectedMember && (
                            <Select
                              value={selectedMember.role}
                              onValueChange={(value) =>
                                updateMemberRole(member.id, member.type, value)
                              }
                            >
                              <SelectTrigger 
                                className={cn(
                                  "w-[140px] h-8 text-xs shrink-0",
                                  hasConflict && "border-red-500/50 bg-red-500/10",
                                  !selectedMember.role && "text-muted-foreground"
                                )}
                                aria-label={`Role for ${member.name}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <SelectValue placeholder="Select role" />
                              </SelectTrigger>
                              <SelectContent>
                                {/* Leadership roles */}
                                <div className="px-2 py-1.5 text-[10px] font-semibold text-blue-400 border-b border-border">
                                  Leadership (unique)
                                </div>
                                {ROLE_CATEGORIES.leadership.roles.map((role) => {
                                  const isAvailable = isRoleAvailable(role.value, member.id, member.type);
                                  return (
                                    <SelectItem 
                                      key={role.value} 
                                      value={role.value}
                                      disabled={!isAvailable}
                                      className={cn("text-xs", !isAvailable && "opacity-50")}
                                    >
                                      {role.label}
                                      {!isAvailable && " (taken)"}
                                    </SelectItem>
                                  );
                                })}

                                {/* Co-Leadership roles */}
                                <div className="px-2 py-1.5 text-[10px] font-semibold text-purple-400 border-b border-border mt-1">
                                  Co-Leadership
                                </div>
                                {ROLE_CATEGORIES.coLeadership.roles.map((role) => (
                                  <SelectItem key={role.value} value={role.value} className="text-xs">
                                    {role.label}
                                  </SelectItem>
                                ))}

                                {/* Support roles */}
                                <div className="px-2 py-1.5 text-[10px] font-semibold text-green-400 border-b border-border mt-1">
                                  Support
                                </div>
                                {ROLE_CATEGORIES.support.roles.map((role) => (
                                  <SelectItem key={role.value} value={role.value} className="text-xs">
                                    {role.label}
                                  </SelectItem>
                                ))}

                                {/* Execution roles */}
                                <div className="px-2 py-1.5 text-[10px] font-semibold text-amber-400 border-b border-border mt-1">
                                  Execution
                                </div>
                                {ROLE_CATEGORIES.execution.roles.map((role) => (
                                  <SelectItem key={role.value} value={role.value} className="text-xs">
                                    {role.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>

              {/* Status bar */}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {selectedMembers.length} of {availableMembers.length} selected
                </span>
                {selectedMembers.length > 0 && (
                  <span>
                    {selectedMembers.filter((m) => m.role).length} of {selectedMembers.length} roles assigned
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="px-4 pb-4 sm:px-6 sm:pb-6 pt-4 gap-2 border-t">
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
                    `Create ${selectedMembers.length} Entr${selectedMembers.length === 1 ? "y" : "ies"}`
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
