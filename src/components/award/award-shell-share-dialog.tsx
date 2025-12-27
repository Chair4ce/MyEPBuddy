"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import {
  Share2,
  Search,
  UserPlus,
  X,
  Loader2,
  Users,
  Check,
  User,
  Crown,
  Shield,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Profile, AwardShellShare } from "@/types/database";
import type { SelectedNominee } from "@/stores/award-shell-store";

interface AwardShellShareDialogProps {
  shellId: string;
  isOpen: boolean;
  onClose: () => void;
  nominee: SelectedNominee | null;
  currentUserId?: string;
}

interface AccessUser {
  id: string;
  fullName: string | null;
  rank: string | null;
  afsc: string | null;
  accessType: "owner" | "nominee" | "supervisor" | "shared";
  email?: string | null;
  shareId?: string;
}

export function AwardShellShareDialog({
  shellId,
  isOpen,
  onClose,
  nominee,
  currentUserId,
}: AwardShellShareDialogProps) {
  const supabase = createClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [existingShares, setExistingShares] = useState<(AwardShellShare & { shared_with_profile?: Profile })[]>([]);
  const [supervisors, setSupervisors] = useState<Profile[]>([]);
  const [shellOwner, setShellOwner] = useState<Profile | null>(null);
  const [isLoadingAccess, setIsLoadingAccess] = useState(true);
  const [isSharing, setIsSharing] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState<string | null>(null);

  // Load existing access
  useEffect(() => {
    async function loadAccess() {
      if (!isOpen || !shellId) return;
      
      setIsLoadingAccess(true);
      try {
        // Load shell to get owner info
        const { data: shellData } = await supabase
          .from("award_shells")
          .select(`
            user_id,
            created_by,
            owner_profile:profiles!award_shells_user_id_fkey(
              id, full_name, rank, afsc, email
            )
          `)
          .eq("id", shellId)
          .single();

        const typedShellData = shellData as { user_id: string; created_by: string; owner_profile: Profile } | null;
        if (typedShellData?.owner_profile) {
          setShellOwner(typedShellData.owner_profile);
        }

        // Load explicit shares
        const { data: sharesData, error: sharesError } = await supabase
          .from("award_shell_shares")
          .select(`
            *,
            shared_with_profile:profiles!award_shell_shares_shared_with_id_fkey(
              id, full_name, rank, afsc, email
            )
          `)
          .eq("shell_id", shellId);

        if (sharesError) throw sharesError;
        setExistingShares((sharesData || []) as (AwardShellShare & { shared_with_profile?: Profile })[]);

        // Load supervisors of the nominee who have access
        if (nominee && !nominee.isManagedMember) {
          const { data: supervisionData } = await supabase
            .from("supervision_history")
            .select(`
              supervisor:profiles!supervision_history_supervisor_id_fkey(
                id, full_name, rank, afsc, email
              )
            `)
            .eq("subordinate_id", nominee.id)
            .is("end_date", null);

          const typedSupervisionData = supervisionData as { supervisor: Profile }[] | null;
          if (typedSupervisionData) {
            const supervisorProfiles = typedSupervisionData
              .map((s) => s.supervisor)
              .filter(Boolean);
            setSupervisors(supervisorProfiles);
          }
        }
      } catch (error) {
        console.error("Failed to load access:", error);
      } finally {
        setIsLoadingAccess(false);
      }
    }

    loadAccess();
  }, [shellId, isOpen, nominee, supabase]);

  // Build combined access list
  const accessList: AccessUser[] = [];

  if (nominee) {
    accessList.push({
      id: nominee.id,
      fullName: nominee.fullName,
      rank: nominee.rank,
      afsc: nominee.afsc,
      accessType: "nominee",
    });
  }

  if (shellOwner && shellOwner.id !== nominee?.id) {
    accessList.push({
      id: shellOwner.id,
      fullName: shellOwner.full_name,
      rank: shellOwner.rank,
      afsc: shellOwner.afsc,
      accessType: "owner",
    });
  }

  supervisors.forEach((sup) => {
    if (!accessList.some((a) => a.id === sup.id)) {
      accessList.push({
        id: sup.id,
        fullName: sup.full_name,
        rank: sup.rank,
        afsc: sup.afsc,
        accessType: "supervisor",
      });
    }
  });

  existingShares.forEach((share) => {
    if (share.shared_with_profile && !accessList.some((a) => a.id === share.shared_with_id)) {
      accessList.push({
        id: share.shared_with_id || "",
        fullName: share.shared_with_profile.full_name,
        rank: share.shared_with_profile.rank,
        afsc: share.shared_with_profile.afsc,
        email: share.shared_with_profile.email,
        accessType: "shared",
        shareId: share.id,
      });
    }
  });

  const getAccessBadge = (type: AccessUser["accessType"]) => {
    switch (type) {
      case "nominee":
        return { label: "Nominee", icon: User, color: "bg-blue-500/10 text-blue-600 border-blue-500/30" };
      case "owner":
        return { label: "Owner", icon: Crown, color: "bg-amber-500/10 text-amber-600 border-amber-500/30" };
      case "supervisor":
        return { label: "Supervisor", icon: Shield, color: "bg-purple-500/10 text-purple-600 border-purple-500/30" };
      case "shared":
        return { label: "Shared", icon: Share2, color: "bg-green-500/10 text-green-600 border-green-500/30" };
    }
  };

  // Search for users
  const handleSearch = async () => {
    if (searchQuery.length < 2) return;
    
    setIsSearching(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, rank, afsc, email")
        .or(`full_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
        .limit(10);

      if (error) throw error;
      
      // Filter out users who already have access
      const existingIds = accessList.map((a) => a.id);
      setSearchResults(((data || []) as Profile[]).filter((p) => !existingIds.includes(p.id)));
    } catch (error) {
      console.error("Search failed:", error);
      toast.error("Search failed");
    } finally {
      setIsSearching(false);
    }
  };

  // Share with a user
  const handleShare = async (userId: string) => {
    if (!currentUserId) return;
    
    setIsSharing(userId);
    try {
      const { error } = await supabase
        .from("award_shell_shares")
        .insert({
          shell_id: shellId,
          owner_id: currentUserId,
          share_type: "user",
          shared_with_id: userId,
        } as never);

      if (error) throw error;
      
      toast.success("Award shell shared successfully");
      setSearchQuery("");
      setSearchResults([]);
      
      // Reload shares
      const { data: sharesData } = await supabase
        .from("award_shell_shares")
        .select(`
          *,
          shared_with_profile:profiles!award_shell_shares_shared_with_id_fkey(
            id, full_name, rank, afsc, email
          )
        `)
        .eq("shell_id", shellId);
      
      setExistingShares((sharesData || []) as (AwardShellShare & { shared_with_profile?: Profile })[]);
    } catch (error) {
      console.error("Share failed:", error);
      toast.error("Failed to share award shell");
    } finally {
      setIsSharing(null);
    }
  };

  // Remove share
  const handleRemoveShare = async (shareId: string) => {
    setIsRemoving(shareId);
    try {
      const { error } = await supabase
        .from("award_shell_shares")
        .delete()
        .eq("id", shareId);

      if (error) throw error;
      
      toast.success("Access removed");
      setExistingShares((prev) => prev.filter((s) => s.id !== shareId));
    } catch (error) {
      console.error("Remove share failed:", error);
      toast.error("Failed to remove access");
    } finally {
      setIsRemoving(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="size-5" />
            Share Award Shell
          </DialogTitle>
          <DialogDescription>
            Share this award package with other users
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search for users */}
          <div className="space-y-2">
            <Label className="text-xs">Add people</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="pl-9"
                />
              </div>
              <Button onClick={handleSearch} disabled={isSearching || searchQuery.length < 2}>
                {isSearching ? <Loader2 className="size-4 animate-spin" /> : "Search"}
              </Button>
            </div>
          </div>

          {/* Search results */}
          {searchResults.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs">Search Results</Label>
              <div className="border rounded-lg divide-y">
                {searchResults.map((user) => (
                  <div key={user.id} className="flex items-center justify-between p-2">
                    <div>
                      <p className="text-sm font-medium">{user.rank} {user.full_name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleShare(user.id)}
                      disabled={isSharing === user.id}
                    >
                      {isSharing === user.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <UserPlus className="size-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {/* Current access list */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Users className="size-4" />
              <Label className="text-xs">Who has access</Label>
            </div>
            
            {isLoadingAccess ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ) : (
              <ScrollArea className="max-h-[200px]">
                <div className="space-y-2">
                  {accessList.map((user) => {
                    const badge = getAccessBadge(user.accessType);
                    const Icon = badge.icon;
                    const canRemove = user.accessType === "shared" && user.shareId;
                    
                    return (
                      <div key={user.id} className="flex items-center justify-between p-2 rounded-lg border">
                        <div className="flex items-center gap-2">
                          <div className={cn("p-1 rounded", badge.color)}>
                            <Icon className="size-3" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">{user.rank} {user.fullName}</p>
                            <Badge variant="outline" className={cn("text-[10px]", badge.color)}>
                              {badge.label}
                            </Badge>
                          </div>
                        </div>
                        {canRemove && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRemoveShare(user.shareId!)}
                            disabled={isRemoving === user.shareId}
                          >
                            {isRemoving === user.shareId ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <X className="size-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

