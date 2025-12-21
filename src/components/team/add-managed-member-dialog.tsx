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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { Loader2, UserPlus, User } from "lucide-react";
import type { Rank, ManagedMember, Profile } from "@/types/database";

const RANKS: Rank[] = [
  "AB",
  "Amn",
  "A1C",
  "SrA",
  "SSgt",
  "TSgt",
  "MSgt",
  "SMSgt",
  "CMSgt",
];

// Parent option can be a profile or a managed member
interface ParentOption {
  id: string;
  full_name: string | null;
  rank: Rank | null;
  depth: number;
  type: "profile" | "managed"; // Distinguish between profile and managed member
  isPlaceholder?: boolean;
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
        const { data: profilesData } = await supabase
          .from("profiles")
          .select("id, full_name, rank")
          .in("id", subordinateIds);

        if (profilesData) {
          for (const p of profilesData as Profile[]) {
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

  function resetForm() {
    setFormData({
      full_name: "",
      email: "",
      rank: "",
      afsc: "",
      unit: "",
      parentId: profile ? `profile:${profile.id}` : "",
    });
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
      
      const insertData: Record<string, unknown> = {
        supervisor_id: profile.id,
        full_name: formData.full_name.trim(),
        email: formData.email.trim().toLowerCase() || null,
        rank: formData.rank || null,
        afsc: formData.afsc.trim().toUpperCase() || null,
        unit: formData.unit.trim() || null,
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
            toast.error("A team member with this email already exists. Try a different email or leave it blank.");
            return;
          }
          toast.error("This team member already exists.");
          return;
        }
        throw error;
      }

      // Add to store
      addManagedMember(data as unknown as ManagedMember);

      toast.success(`${formData.full_name} added to your team`);
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
            Add Team Member
          </DialogTitle>
          <DialogDescription>
            Add a subordinate to your team. They don&apos;t need an account yet
            — if they sign up later, their data will be linked automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Parent Selection - Who this member reports to */}
          <div className="space-y-2">
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
                  {RANKS.map((rank) => (
                    <SelectItem key={rank} value={rank}>
                      {rank}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                (for future account linking)
              </span>
            </Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              placeholder="e.g., john.doe@us.af.mil"
            />
            <p className="text-xs text-muted-foreground">
              If they sign up with this email, their entries will be linked to
              their account.
            </p>
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
              disabled={isSubmitting}
              className="w-full sm:w-auto"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Adding...
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

