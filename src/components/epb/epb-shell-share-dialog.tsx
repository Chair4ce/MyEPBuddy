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
import { Analytics } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import {
  Share2,
  Search,
  UserPlus,
  X,
  Loader2,
  Users,
  User,
  Crown,
  Shield,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Profile, EPBShellShare } from "@/types/database";
import type { SelectedRatee } from "@/stores/epb-shell-store";

interface EPBShellShareDialogProps {
  shellId: string;
  isOpen: boolean;
  onClose: () => void;
  ratee: SelectedRatee | null;
}

interface AccessUser {
  id: string;
  fullName: string | null;
  rank: string | null;
  afsc: string | null;
  accessType: "owner" | "ratee" | "supervisor" | "shared";
  email?: string | null;
  shareId?: string; // For shared users so we can remove them
}

export function EPBShellShareDialog({
  shellId,
  isOpen,
  onClose,
  ratee,
}: EPBShellShareDialogProps) {
  const supabase = createClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [existingShares, setExistingShares] = useState<(EPBShellShare & { shared_with_profile?: Profile })[]>([]);
  const [supervisors, setSupervisors] = useState<Profile[]>([]);
  const [shellOwner, setShellOwner] = useState<Profile | null>(null);
  const [isLoadingAccess, setIsLoadingAccess] = useState(true);
  const [isSharing, setIsSharing] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState<string | null>(null);

  // Load existing access (shares, supervisors, owner)
  useEffect(() => {
    async function loadAccess() {
      if (!isOpen || !shellId) return;
      
      setIsLoadingAccess(true);
      try {
        // Load shell to get owner info
        const { data: shellData } = await supabase
          .from("epb_shells")
          .select(`
            user_id,
            created_by,
            owner_profile:profiles!epb_shells_user_id_fkey(
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
          .from("epb_shell_shares")
          .select(`
            *,
            shared_with_profile:profiles!epb_shell_shares_shared_with_id_fkey(
              id, full_name, rank, afsc, email
            )
          `)
          .eq("shell_id", shellId);

        if (sharesError) throw sharesError;
        setExistingShares((sharesData || []) as (EPBShellShare & { shared_with_profile?: Profile })[]);

        // Load supervisors of the ratee who have access
        if (ratee && !ratee.isManagedMember) {
          // Get the supervision history for real users
          const { data: supervisionData } = await supabase
            .from("supervision_history")
            .select(`
              supervisor:profiles!supervision_history_supervisor_id_fkey(
                id, full_name, rank, afsc, email
              )
            `)
            .eq("subordinate_id", ratee.id)
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
  }, [shellId, isOpen, ratee, supabase]);

  // Build combined access list
  const accessList: AccessUser[] = [];

  // 1. Add the ratee (member this EPB is for)
  if (ratee) {
    accessList.push({
      id: ratee.id,
      fullName: ratee.fullName,
      rank: ratee.rank,
      afsc: ratee.afsc,
      accessType: "ratee",
    });
  }

  // 2. Add the shell owner if different from ratee
  if (shellOwner && shellOwner.id !== ratee?.id) {
    accessList.push({
      id: shellOwner.id,
      fullName: shellOwner.full_name,
      rank: shellOwner.rank,
      afsc: shellOwner.afsc,
      accessType: "owner",
    });
  }

  // 3. Add supervisors
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

  // 4. Add explicitly shared users
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

  // Get badge and icon for access type
  const getAccessBadge = (type: AccessUser["accessType"]) => {
    switch (type) {
      case "ratee":
        return { label: "Member", icon: User, color: "bg-blue-500/10 text-blue-600 border-blue-500/30" };
      case "owner":
        return { label: "Owner", icon: Crown, color: "bg-amber-500/10 text-amber-600 border-amber-500/30" };
      case "supervisor":
        return { label: "Supervisor", icon: Shield, color: "bg-green-500/10 text-green-600 border-green-500/30" };
      case "shared":
        return { label: "Shared", icon: Share2, color: "bg-primary/10 text-primary border-primary/30" };
    }
  };

  // Search for users
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, rank, afsc, email")
        .or(`full_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
        .limit(10);

      if (error) throw error;

      // Filter out users who already have access
      const accessIds = new Set(accessList.map((a) => a.id));
      setSearchResults((data as Profile[]).filter((p) => !accessIds.has(p.id)));
    } catch (error) {
      console.error("Search failed:", error);
      toast.error("Failed to search users");
    } finally {
      setIsSearching(false);
    }
  };

  // Share with a user
  const handleShare = async (userId: string) => {
    const { data: profile } = await supabase.auth.getUser();
    if (!profile.user) return;

    setIsSharing(userId);
    try {
      const { data, error } = await supabase
        .from("epb_shell_shares")
        .insert({
          shell_id: shellId,
          owner_id: profile.user.id,
          share_type: "user",
          shared_with_id: userId,
        } as never)
        .select(`
          *,
          shared_with_profile:profiles!epb_shell_shares_shared_with_id_fkey(
            id, full_name, rank, afsc, email
          )
        `)
        .single();

      if (error) throw error;

      setExistingShares((prev) => [...prev, data as EPBShellShare & { shared_with_profile?: Profile }]);
      setSearchResults((prev) => prev.filter((p) => p.id !== userId));
      setSearchQuery("");
      Analytics.epbShared();
      toast.success("Shell shared successfully");
    } catch (error) {
      console.error("Failed to share:", error);
      toast.error("Failed to share shell");
    } finally {
      setIsSharing(null);
    }
  };

  // Remove share
  const handleRemoveShare = async (shareId: string) => {
    setIsRemoving(shareId);
    try {
      const { error } = await supabase
        .from("epb_shell_shares")
        .delete()
        .eq("id", shareId);

      if (error) throw error;

      setExistingShares((prev) => prev.filter((s) => s.id !== shareId));
      Analytics.epbShareRemoved();
      toast.success("Share removed");
    } catch (error) {
      console.error("Failed to remove share:", error);
      toast.error("Failed to remove share");
    } finally {
      setIsRemoving(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="size-5" />
            Share EPB Shell
          </DialogTitle>
          <DialogDescription>
            Manage who has access to this EPB shell
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 space-y-4">
          {/* Current access list */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Users className="size-4" />
              People with access
              <Badge variant="secondary" className="text-xs ml-auto">
                {accessList.length}
              </Badge>
            </Label>
            {isLoadingAccess ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <ScrollArea className="h-[180px] pr-3">
                <div className="space-y-1.5">
                  {accessList.map((user) => {
                    const badge = getAccessBadge(user.accessType);
                    const BadgeIcon = badge.icon;
                    const canRemove = user.accessType === "shared" && user.shareId;
                    
                    return (
                      <div
                        key={user.id}
                        className="flex items-center justify-between p-2 rounded-lg border bg-card"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="size-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                            <span className="text-xs font-medium">
                              {user.fullName?.charAt(0) || "?"}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">
                              {user.rank && `${user.rank} `}{user.fullName || "Unknown"}
                            </p>
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className={cn("text-[10px] h-4 px-1", badge.color)}>
                                <BadgeIcon className="size-2.5 mr-0.5" />
                                {badge.label}
                              </Badge>
                              {user.afsc && (
                                <span className="text-[10px] text-muted-foreground">{user.afsc}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        {canRemove && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRemoveShare(user.shareId!)}
                            disabled={isRemoving === user.shareId}
                            className="text-destructive hover:text-destructive shrink-0 size-7 p-0"
                          >
                            {isRemoving === user.shareId ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <X className="size-3.5" />
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

          <Separator />

          {/* Search for users to add */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Add people</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="Search by name or email..."
                  className="pl-9"
                />
              </div>
              <Button onClick={handleSearch} disabled={isSearching} size="sm">
                {isSearching ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Search"
                )}
              </Button>
            </div>

            {/* Search results */}
            {searchResults.length > 0 && (
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {searchResults.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-2 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="size-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <span className="text-xs font-medium">
                          {user.full_name?.charAt(0) || user.email?.charAt(0) || "?"}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {user.rank && `${user.rank} `}{user.full_name || user.email}
                        </p>
                        {user.afsc && (
                          <p className="text-xs text-muted-foreground">{user.afsc}</p>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleShare(user.id)}
                      disabled={isSharing === user.id}
                      className="shrink-0"
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
            )}
          </div>

          {/* Info note */}
          <p className="text-xs text-muted-foreground">
            <strong>Note:</strong> The member and their supervisors automatically have access. 
            Use sharing to grant access to others outside the chain.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
