"use client";

import { useState, useEffect, useMemo } from "react";
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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Loader2, UserPlus, User, Link2, AlertCircle } from "lucide-react";
import type { Rank, ManagedMember, Profile } from "@/types/database";
import { ENLISTED_RANKS, OFFICER_RANKS, CIVILIAN_RANK, SUPERVISOR_RANKS, isOfficer, isEnlisted } from "@/lib/constants";

// Get available subordinate ranks based on supervisor's rank
// Officers can supervise anyone, Enlisted can only supervise enlisted
function getAvailableSubordinateRanks(supervisorRank: Rank | null | undefined) {
  const supervisorIsOfficer = isOfficer(supervisorRank ?? null);
  
  return {
    enlisted: ENLISTED_RANKS,
    officers: supervisorIsOfficer ? OFFICER_RANKS : [], // Only show officers if supervisor is an officer
    civilian: CIVILIAN_RANK,
  };
}

// Parent option can be a profile or a managed member
interface ParentOption {
  id: string;
  full_name: string | null;
  rank: Rank | null;
  depth: number;
  type: "profile" | "managed"; // Distinguish between profile and managed member
  isPlaceholder?: boolean;
}

interface ExistingUserMatch {
  id: string;
  email: string;
  full_name: string | null;
  rank: Rank | null;
}

interface AddManagedMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddManagedMemberDialog({
  open,
  onOpenChange,
}: AddManagedMemberDialogProps) {
  const { profile, subordinates, managedMembers, addManagedMember } = useUserStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [existingUser, setExistingUser] = useState<ExistingUserMatch | null>(null);
  const [chainProfiles, setChainProfiles] = useState<ParentOption[]>([]);
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    rank: "" as Rank | "",
    afsc: "",
    unit: "",
    parentId: "", // Combined ID for the parent (could be profile or managed member)
  });

  const supabase = createClient();

  // Build parent options from profiles + managed members
  const parentOptions = useMemo(() => {
    const options: ParentOption[] = [...chainProfiles];
    
    // Helper to recursively add managed members with proper depth
    function addManagedMembersUnder(parentId: string, parentType: "profile" | "managed", baseDepth: number) {
      const children = managedMembers.filter((m) => {
        if (parentType === "profile") {
          return m.parent_profile_id === parentId;
        } else {
          return m.parent_team_member_id === parentId;
        }
      });
      
      for (const child of children) {
        // Only include members who can supervise (SSgt and above, officers, civilians)
        if (child.rank && !SUPERVISOR_RANKS.includes(child.rank)) {
          continue;
        }
        options.push({
          id: `managed:${child.id}`,
          full_name: child.full_name,
          rank: child.rank,
          depth: baseDepth + 1,
          type: "managed",
          isPlaceholder: child.is_placeholder,
        });
        // Recursively add children of this managed member
        addManagedMembersUnder(child.id, "managed", baseDepth + 1);
      }
    }
    
    // Add managed members under each profile option
    for (const profileOpt of chainProfiles) {
      addManagedMembersUnder(profileOpt.id.replace("profile:", ""), "profile", profileOpt.depth);
    }
    
    return options;
  }, [chainProfiles, managedMembers]);

  // Load all chain profiles for parent selection
  useEffect(() => {
    async function loadChainProfiles() {
      if (!profile || !open) return;

      // Get all subordinates in the chain
      const { data: chainData } = await (supabase.rpc as Function)("get_subordinate_chain", {
        supervisor_uuid: profile.id,
      }) as { data: { subordinate_id: string; depth: number }[] | null };

      const profiles: ParentOption[] = [
        // Self is always first option
        { 
          id: `profile:${profile.id}`, 
          full_name: profile.full_name, 
          rank: profile.rank, 
          depth: 0,
          type: "profile",
        },
      ];

      if (chainData && chainData.length > 0) {
        const subordinateIds = chainData.map((c) => c.subordinate_id);
        
        // Batch fetch profiles to avoid URI Too Long errors (414)
        const BATCH_SIZE = 50;
        const allProfilesData: Profile[] = [];
        
        for (let i = 0; i < subordinateIds.length; i += BATCH_SIZE) {
          const batch = subordinateIds.slice(i, i + BATCH_SIZE);
          const { data: batchProfiles } = await supabase
            .from("profiles")
            .select("id, full_name, rank")
            .in("id", batch);
          
          if (batchProfiles) {
            allProfilesData.push(...(batchProfiles as Profile[]));
          }
        }

        for (const p of allProfilesData) {
          // Only include members who can supervise (SSgt and above, officers, civilians)
          if (p.rank && !SUPERVISOR_RANKS.includes(p.rank)) {
            continue;
          }
          const chainEntry = chainData.find((c) => c.subordinate_id === p.id);
          profiles.push({
            id: `profile:${p.id}`,
            full_name: p.full_name,
            rank: p.rank,
            depth: chainEntry?.depth || 1,
            type: "profile",
          });
        }
      }

      // Sort by depth then by name
      profiles.sort((a, b) => {
        if (a.depth !== b.depth) return a.depth - b.depth;
        return (a.full_name || "").localeCompare(b.full_name || "");
      });

      setChainProfiles(profiles);
      
      // Default to self as parent
      if (!formData.parentId && profile) {
        setFormData((prev) => ({ ...prev, parentId: `profile:${profile.id}` }));
      }
    }

    loadChainProfiles();
  }, [profile, open, supabase]);

  // Check if email matches an existing user
  async function checkEmailForExistingUser(email: string) {
    if (!email || !email.includes("@")) {
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
    if (email) {
      await checkEmailForExistingUser(email);
    }
  }

  function resetForm() {
    setFormData({
      full_name: "",
      email: "",
      rank: "",
      afsc: "",
      unit: "",
      parentId: profile ? `profile:${profile.id}` : "",
    });
    setExistingUser(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;

    if (!formData.full_name.trim()) {
      toast.error("Name is required");
      return;
    }

    if (!formData.parentId) {
      toast.error("Please select who this member reports to");
      return;
    }

    setIsSubmitting(true);

    try {
      // Parse the parent ID to determine if it's a profile or managed member
      const [parentType, parentId] = formData.parentId.split(":");
      const email = formData.email.trim().toLowerCase() || null;
      
      // Check for existing user if email provided
      let existingMatch = existingUser;
      if (email && !existingUser) {
        existingMatch = await checkEmailForExistingUser(email);
      }
      
      const insertData: Record<string, unknown> = {
        supervisor_id: profile.id,
        full_name: formData.full_name.trim(),
        email: email,
        rank: formData.rank || null,
        afsc: formData.afsc.trim().toUpperCase() || null,
        unit: formData.unit.trim() || null,
        // If user already exists, mark as pending_link; otherwise active
        member_status: existingMatch ? "pending_link" : "active",
      };

      // Set the appropriate parent field
      if (parentType === "profile") {
        insertData.parent_profile_id = parentId;
        insertData.parent_team_member_id = null;
      } else {
        insertData.parent_profile_id = null;
        insertData.parent_team_member_id = parentId;
      }

      const { data, error } = await supabase
        .from("team_members")
        .insert(insertData as never)
        .select()
        .single();

      if (error) {
        // Handle specific error cases
        if (error.code === "23505") {
          // Unique constraint violation
          if (error.message?.includes("email")) {
            toast.error("A team member with this email already exists in your team.");
            return;
          }
          toast.error("This team member already exists.");
          return;
        }
        throw error;
      }

      // Add to store
      addManagedMember(data as unknown as ManagedMember);

      // If existing user found, also send a team request
      if (existingMatch) {
        // Send a team request to the existing user
        const { error: requestError } = await supabase.from("team_requests").insert({
          requester_id: profile.id,
          target_id: existingMatch.id,
          request_type: "supervise",
          message: `I've added you as a team member. Please accept this request to link your account and sync any entries I've created for you.`,
        } as never);

        if (requestError) {
          // Check if request already exists
          if (requestError.code === "23505") {
            toast.success(`${formData.full_name} added as a pending team member`, {
              description: `A supervisor request has already been sent to ${existingMatch.full_name || existingMatch.email}. They'll appear as linked once they accept.`,
            });
          } else {
            console.error("Error sending team request:", requestError);
            toast.success(`${formData.full_name} added as a pending team member`, {
              description: `Couldn't send a supervisor request automatically. You may need to send one manually.`,
            });
          }
        } else {
          toast.success(`${formData.full_name} added as a pending team member`, {
            description: `A supervisor request was sent to ${existingMatch.full_name || existingMatch.email}. They'll appear as linked once they accept.`,
          });
        }
      } else {
        toast.success(`${formData.full_name} added to your team`, {
          description: email 
            ? "If they sign up with this email, they'll be prompted to link their account."
            : undefined,
        });
      }

      resetForm();
      onOpenChange(false);
    } catch (error) {
      console.error("Error adding managed member:", error);
      const message = error instanceof Error ? error.message : "Failed to add team member";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-5" />
            Add Managed Subordinate
          </DialogTitle>
          <DialogDescription>
            Add a subordinate to your team who doesn&apos;t have an account yet.
            If they sign up later, their data will link automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Parent Selection - Who this member reports to */}
          <div className="space-y-2" data-tour="reports-to-field">
            <Label htmlFor="parent">
              Reports To <span className="text-destructive">*</span>
            </Label>
            <Select
              value={formData.parentId}
              onValueChange={(v) =>
                setFormData({ ...formData, parentId: v })
              }
            >
              <SelectTrigger id="parent">
                <SelectValue placeholder="Select supervisor" />
              </SelectTrigger>
              <SelectContent>
                {parentOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    <div className="flex items-center gap-1.5">
                      {option.depth > 0 && (
                        <span className="text-muted-foreground text-xs">
                          {"└".padStart(option.depth, " ")}
                        </span>
                      )}
                      {option.type === "managed" && (
                        <span className="text-amber-500">●</span>
                      )}
                      <span>
                        {option.rank} {option.full_name}
                        {option.id === `profile:${profile?.id}` && " (Me)"}
                      </span>
                      {option.type === "managed" && (
                        <span className="text-xs text-muted-foreground">
                          ({option.isPlaceholder ? "Managed" : "Linked"})
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Choose who this person reports to in your chain of command.
            </p>
          </div>

          <div className="space-y-2" data-tour="member-name-field">
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

          <div className="space-y-4" data-tour="remaining-fields">
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

            <div className="space-y-2" data-tour="member-email-field">
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
                    <p className="font-medium">Account found!</p>
                    <p className="text-xs opacity-80">
                      {existingUser.rank} {existingUser.full_name || existingUser.email} already has an account.
                      A supervisor request will be sent when you add them. Until they accept,
                      they&apos;ll appear as &quot;Pending&quot; and you can still create entries for them.
                    </p>
                  </div>
                </div>
              )}

              {!existingUser && !formData.email && (
                <p className="text-xs text-muted-foreground">
                  If they sign up with this email later, they&apos;ll be prompted to link their account.
                </p>
              )}
            </div>
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
              data-tour="submit-member-btn"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Adding...
                </>
              ) : existingUser ? (
                <>
                  <Link2 className="size-4 mr-2" />
                  Add & Send Request
                </>
              ) : (
                <>
                  <UserPlus className="size-4 mr-2" />
                  Add to Team
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
