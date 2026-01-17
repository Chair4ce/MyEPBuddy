"use client";

import { useState } from "react";
import { useUserStore } from "@/stores/user-store";
import { useProjectsStore } from "@/stores/projects-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import type { Project, ProjectMember, Profile, ManagedMember } from "@/types/database";
import {
  Users,
  Crown,
  Plus,
  Trash2,
  Loader2,
  User,
  UserPlus,
} from "lucide-react";

interface ProjectMembersManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
  isOwner: boolean;
  onMemberAdded?: () => void;
  onMemberRemoved?: () => void;
}

export function ProjectMembersManager({
  open,
  onOpenChange,
  project,
  isOwner,
  onMemberAdded,
  onMemberRemoved,
}: ProjectMembersManagerProps) {
  const { profile, subordinates, managedMembers } = useUserStore();
  const { addProjectMember, removeProjectMember, updateProjectMember } =
    useProjectsStore();

  const [isAdding, setIsAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<string>("");
  const [confirmRemove, setConfirmRemove] = useState<ProjectMember | null>(null);

  if (!project) return null;

  const members = project.members || [];

  // Get available members to add (from chain of command, not already in project)
  const availableMembers = [
    // Self
    ...(members.some((m) => m.profile_id === profile?.id)
      ? []
      : [{ type: "profile" as const, id: profile?.id || "", label: `Myself (${profile?.rank} ${profile?.full_name})` }]),
    // Subordinates
    ...subordinates
      .filter((sub) => !members.some((m) => m.profile_id === sub.id))
      .map((sub) => ({
        type: "profile" as const,
        id: sub.id,
        label: `${sub.rank} ${sub.full_name}`,
      })),
    // Managed members
    ...managedMembers
      .filter((mm) => !members.some((m) => m.team_member_id === mm.id))
      .map((mm) => ({
        type: "team_member" as const,
        id: mm.id,
        label: `${mm.rank || ""} ${mm.full_name} (Managed)`,
      })),
  ];

  const handleAddMember = async () => {
    if (!selectedMember) return;

    const member = availableMembers.find((m) => `${m.type}:${m.id}` === selectedMember);
    if (!member) return;

    setIsAdding(true);

    try {
      const response = await fetch(`/api/projects/${project.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile_id: member.type === "profile" ? member.id : null,
          team_member_id: member.type === "team_member" ? member.id : null,
          is_owner: false,
        }),
      });

      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error || "Failed to add member");
      }

      const { member: newMember } = await response.json();
      addProjectMember(project.id, newMember);
      setSelectedMember("");
      toast.success("Member added to project");
      onMemberAdded?.();
    } catch (error) {
      console.error("Error adding member:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to add member"
      );
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveMember = async (member: ProjectMember) => {
    setRemovingId(member.id);

    try {
      const response = await fetch(
        `/api/projects/${project.id}/members/${member.id}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error || "Failed to remove member");
      }

      removeProjectMember(project.id, member.id);
      toast.success("Member removed from project");
      onMemberRemoved?.();
    } catch (error) {
      console.error("Error removing member:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to remove member"
      );
    } finally {
      setRemovingId(null);
      setConfirmRemove(null);
    }
  };

  const handleToggleOwnership = async (member: ProjectMember) => {
    try {
      const response = await fetch(
        `/api/projects/${project.id}/members/${member.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_owner: !member.is_owner }),
        }
      );

      if (!response.ok) {
        const { error } = await response.json();
        throw new Error(error || "Failed to update member");
      }

      updateProjectMember(project.id, member.id, {
        is_owner: !member.is_owner,
      });
      toast.success(
        member.is_owner ? "Ownership removed" : "Ownership granted"
      );
    } catch (error) {
      console.error("Error updating member:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to update member"
      );
    }
  };

  const getMemberName = (member: ProjectMember) => {
    if (member.profile) {
      return `${member.profile.rank || ""} ${member.profile.full_name}`.trim();
    }
    if (member.team_member) {
      return `${member.team_member.rank || ""} ${member.team_member.full_name}`.trim();
    }
    return "Unknown Member";
  };

  const getMemberAfsc = (member: ProjectMember) => {
    return member.profile?.afsc || member.team_member?.afsc;
  };

  const ownerCount = members.filter((m) => m.is_owner).length;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Users className="size-5 text-primary" />
              <DialogTitle>Project Members</DialogTitle>
            </div>
            <DialogDescription>
              Manage members for "{project.name}"
            </DialogDescription>
          </DialogHeader>

          {/* Add member section */}
          <div className="flex gap-2">
            <Select value={selectedMember} onValueChange={setSelectedMember}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select a team member to add..." />
              </SelectTrigger>
              <SelectContent>
                {availableMembers.length === 0 ? (
                  <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                    No more team members available to add
                  </div>
                ) : (
                  availableMembers.map((member) => (
                    <SelectItem
                      key={`${member.type}:${member.id}`}
                      value={`${member.type}:${member.id}`}
                    >
                      {member.label}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Button
              onClick={handleAddMember}
              disabled={!selectedMember || isAdding}
            >
              {isAdding ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <UserPlus className="size-4" />
              )}
            </Button>
          </div>

          {/* Members list */}
          <ScrollArea className="max-h-[300px]">
            <div className="space-y-2">
              {members.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <User className="size-8 mx-auto mb-2" />
                  <p className="text-sm">No members yet</p>
                </div>
              ) : (
                members.map((member) => {
                  const isCreator = project.created_by === member.profile_id;
                  const canRemove =
                    isOwner &&
                    !isCreator &&
                    !(member.is_owner && ownerCount <= 1);

                  return (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate">
                              {getMemberName(member)}
                            </span>
                            {member.is_owner && (
                              <Crown className="size-3.5 text-amber-500 shrink-0" />
                            )}
                            {isCreator && (
                              <Badge variant="outline" className="text-[10px]">
                                Creator
                              </Badge>
                            )}
                          </div>
                          {getMemberAfsc(member) && (
                            <span className="text-xs text-muted-foreground">
                              {getMemberAfsc(member)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        {isOwner && !isCreator && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleOwnership(member)}
                            className="text-xs"
                          >
                            {member.is_owner ? "Remove Owner" : "Make Owner"}
                          </Button>
                        )}
                        {canRemove && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive hover:text-destructive"
                            onClick={() => setConfirmRemove(member)}
                            disabled={removingId === member.id}
                          >
                            {removingId === member.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Trash2 className="size-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Confirm remove dialog */}
      <AlertDialog
        open={!!confirmRemove}
        onOpenChange={() => setConfirmRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {confirmRemove && getMemberName(confirmRemove)} from this project?
              They will no longer have access to project details.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmRemove && handleRemoveMember(confirmRemove)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
