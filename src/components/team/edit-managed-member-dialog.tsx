"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Loader2, UserCog, Link2, AlertCircle } from "lucide-react";
import type { Rank, ManagedMember } from "@/types/database";
import { ENLISTED_RANKS, OFFICER_RANKS, CIVILIAN_RANK, isOfficer, isCivilian } from "@/lib/constants";

function getAvailableSubordinateRanks(supervisorRank: Rank | null | undefined) {
  const canAssignOfficerRanks =
    isOfficer(supervisorRank ?? null) || isCivilian(supervisorRank ?? null);

  return {
    enlisted: ENLISTED_RANKS,
    officers: canAssignOfficerRanks ? OFFICER_RANKS : [],
    civilian: CIVILIAN_RANK,
  };
}

interface ExistingUserMatch {
  id: string;
  email: string;
  full_name: string | null;
  rank: Rank | null;
}

interface EditManagedMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: ManagedMember | null;
  onSuccess?: () => void;
}

export function EditManagedMemberDialog({
  open,
  onOpenChange,
  member,
  onSuccess,
}: EditManagedMemberDialogProps) {
  const { profile, updateManagedMember } = useUserStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [existingUser, setExistingUser] = useState<ExistingUserMatch | null>(null);
  const [showLinkConfirm, setShowLinkConfirm] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    rank: "" as Rank | "",
    afsc: "",
    unit: "",
  });

  const supabase = createClient();

  // Reset form when member changes
  useEffect(() => {
    if (member) {
      setFormData({
        full_name: member.full_name || "",
        email: member.email || "",
        rank: member.rank || "",
        afsc: member.afsc || "",
        unit: member.unit || "",
      });
      setExistingUser(null);
    }
  }, [member]);

  // Check if email matches an existing user
  async function checkEmailForExistingUser(email: string) {
    if (!email || !email.includes("@")) {
      setExistingUser(null);
      return null;
    }

    // Don't check if email hasn't changed
    if (email.toLowerCase() === member?.email?.toLowerCase()) {
      setExistingUser(null);
      return null;
    }

    setIsCheckingEmail(true);

    try {
      // Check if a profile exists with this email
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id, email, full_name, rank")
        .eq("email", email.toLowerCase())
        .single() as { data: { id: string; email: string | null; full_name: string | null; rank: string | null } | null };

      if (existingProfile) {
        const match: ExistingUserMatch = {
          id: existingProfile.id,
          email: existingProfile.email || email,
          full_name: existingProfile.full_name,
          rank: existingProfile.rank as Rank,
        };
        setExistingUser(match);
        return match;
      } else {
        setExistingUser(null);
        return null;
      }
    } catch {
      setExistingUser(null);
      return null;
    } finally {
      setIsCheckingEmail(false);
    }
  }

  // Handle email blur to check for existing users
  async function handleEmailBlur() {
    const email = formData.email.trim().toLowerCase();
    if (email && email !== member?.email?.toLowerCase()) {
      await checkEmailForExistingUser(email);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !member) return;

    if (!formData.full_name.trim()) {
      toast.error("Name is required");
      return;
    }

    const newEmail = formData.email.trim().toLowerCase() || null;
    const emailChanged = newEmail !== (member.email?.toLowerCase() || null);

    // If email changed and matches an existing user, confirm linking
    if (emailChanged && newEmail) {
      const existingMatch = await checkEmailForExistingUser(newEmail);
      if (existingMatch) {
        setShowLinkConfirm(true);
        return;
      }
    }

    await performUpdate(false);
  }

  async function performUpdate(createLink: boolean) {
    if (!profile || !member) return;

    setIsSubmitting(true);

    try {
      const newEmail = formData.email.trim().toLowerCase() || null;
      const emailChanged = newEmail !== (member.email?.toLowerCase() || null);

      // Update the team member
      const updateData = {
        full_name: formData.full_name.trim(),
        email: newEmail,
        rank: formData.rank || null,
        afsc: formData.afsc.trim().toUpperCase() || null,
        unit: formData.unit.trim() || null,
      };
      
      const { error } = await supabase
        .from("team_members")
        .update(updateData as never)
        .eq("id", member.id)
        .eq("supervisor_id", profile.id);

      if (error) {
        if (error.code === "23505" && error.message?.includes("email")) {
          toast.error("A team member with this email already exists");
          return;
        }
        throw error;
      }

      // Update store
      updateManagedMember(member.id, {
        full_name: formData.full_name.trim(),
        email: newEmail,
        rank: (formData.rank || null) as Rank | null,
        afsc: formData.afsc.trim().toUpperCase() || null,
        unit: formData.unit.trim() || null,
      });

      // If email changed and we should create a pending link
      if (emailChanged && newEmail && createLink && existingUser) {
        // Call the function to create a pending link
        const { error: linkError } = await (supabase.rpc as Function)(
          "create_pending_link_for_existing_user",
          {
            p_team_member_id: member.id,
            p_user_id: existingUser.id,
          }
        );

        if (linkError) {
          console.error("Error creating pending link:", linkError);
          toast.warning(
            `${formData.full_name} updated, but we couldn't create the account link. They may already have a pending link.`
          );
        } else {
          toast.success(
            `${formData.full_name} updated! A link request has been sent to ${existingUser.full_name || existingUser.email}.`,
            {
              description: "They'll see a prompt to link their account on their dashboard.",
            }
          );
        }
      } else if (emailChanged && newEmail && !createLink) {
        toast.success(`${formData.full_name} updated!`, {
          description: "If they sign up with this email later, they'll be prompted to link.",
        });
      } else {
        toast.success(`${formData.full_name} updated!`);
      }

      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Error updating managed member:", error);
      const message = error instanceof Error ? error.message : "Failed to update team member";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
      setShowLinkConfirm(false);
    }
  }

  if (!member) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="size-5" />
              Edit Team Member
            </DialogTitle>
            <DialogDescription>
              Update information for {member.full_name}. Changes to email may trigger account linking.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">
                Full Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="full_name"
                value={formData.full_name}
                onChange={(e) =>
                  setFormData({ ...formData, full_name: e.target.value })
                }
                placeholder="e.g., John Doe"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="rank">Rank</Label>
                {(() => {
                  const availableRanks = getAvailableSubordinateRanks(profile?.rank);
                  return (
                    <Select
                      value={formData.rank}
                      onValueChange={(v) =>
                        setFormData({ ...formData, rank: v as Rank })
                      }
                    >
                      <SelectTrigger id="rank">
                        <SelectValue placeholder="Select rank" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>Enlisted</SelectLabel>
                          {availableRanks.enlisted.map((rank) => (
                            <SelectItem key={rank.value} value={rank.value}>
                              {rank.value}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                        {availableRanks.officers.length > 0 && (
                          <SelectGroup>
                            <SelectLabel>Officer</SelectLabel>
                            {availableRanks.officers.map((rank) => (
                              <SelectItem key={rank.value} value={rank.value}>
                                {rank.value}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                        <SelectGroup>
                          <SelectLabel>Civilian</SelectLabel>
                          {availableRanks.civilian.map((rank) => (
                            <SelectItem key={rank.value} value={rank.value}>
                              {rank.value}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  );
                })()}
              </div>

              <div className="space-y-2">
                <Label htmlFor="afsc">AFSC</Label>
                <Input
                  id="afsc"
                  value={formData.afsc}
                  onChange={(e) =>
                    setFormData({ ...formData, afsc: e.target.value })
                  }
                  placeholder="e.g., 3D0X2"
                  className="uppercase"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="unit">Unit</Label>
              <Input
                id="unit"
                value={formData.unit}
                onChange={(e) =>
                  setFormData({ ...formData, unit: e.target.value })
                }
                placeholder="e.g., 123rd Communications Squadron"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">
                Email{" "}
                <span className="text-muted-foreground text-xs">
                  (for account linking)
                </span>
              </Label>
              <div className="relative">
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => {
                    setFormData({ ...formData, email: e.target.value });
                    setExistingUser(null);
                  }}
                  onBlur={handleEmailBlur}
                  placeholder="e.g., john.doe@us.af.mil"
                  className={existingUser ? "pr-10 border-amber-500" : ""}
                />
                {isCheckingEmail && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 animate-spin text-muted-foreground" />
                )}
                {existingUser && !isCheckingEmail && (
                  <Link2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-amber-500" />
                )}
              </div>

              {existingUser && (
                <div className="flex items-start gap-2 p-2 rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 text-sm">
                  <AlertCircle className="size-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">Existing account found!</p>
                    <p className="text-xs opacity-80">
                      {existingUser.rank} {existingUser.full_name || existingUser.email} already has an account.
                      When you save, they&apos;ll receive a prompt to link their entries.
                    </p>
                  </div>
                </div>
              )}

              {!existingUser && formData.email && formData.email !== member.email && (
                <p className="text-xs text-muted-foreground">
                  If they sign up with this email, they&apos;ll be prompted to link their account.
                </p>
              )}

              {!formData.email && member.email && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Removing the email will prevent future account linking.
                </p>
              )}
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || isCheckingEmail}
                className="w-full sm:w-auto"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog for linking existing user */}
      <AlertDialog open={showLinkConfirm} onOpenChange={setShowLinkConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Link2 className="size-5 text-amber-500" />
              Link to Existing Account?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  The email <strong>{formData.email}</strong> belongs to an existing user:
                </p>
                <div className="p-3 rounded-md bg-muted">
                  <p className="font-medium">
                    {existingUser?.rank} {existingUser?.full_name || "Unknown"}
                  </p>
                  <p className="text-sm text-muted-foreground">{existingUser?.email}</p>
                </div>
                <p>
                  Would you like to send them a link request? They&apos;ll see a prompt on their dashboard
                  to sync any entries you&apos;ve created for them and optionally accept you as their supervisor.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => performUpdate(false)}
              disabled={isSubmitting}
            >
              Just Update Email
            </Button>
            <AlertDialogAction
              onClick={() => performUpdate(true)}
              disabled={isSubmitting}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Linking...
                </>
              ) : (
                <>
                  <Link2 className="size-4 mr-2" />
                  Send Link Request
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

