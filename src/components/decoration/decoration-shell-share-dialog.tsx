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
import type { Profile, DecorationShellShare, Rank } from "@/types/database";

interface SelectedRatee {
  id: string;
  fullName: string | null;
  rank: Rank | null;
  isManagedMember: boolean;
}

interface DecorationShellShareDialogProps {
  shellId: string;
  isOpen: boolean;
  onClose: () => void;
  ratee: SelectedRatee | null;
  currentUserId?: string;
}

interface AccessUser {
  id: string;
  fullName: string | null;
  rank: string | null;
  afsc: string | null;
  accessType: "owner" | "ratee" | "supervisor" | "shared";
  email?: string | null;
  shareId?: string;
}

export function DecorationShellShareDialog({
  shellId,
  isOpen,
  onClose,
  ratee,
  currentUserId,
}: DecorationShellShareDialogProps) {
  const supabase = createClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [existingShares, setExistingShares] = useState<
    (DecorationShellShare & { shared_with_profile?: Profile })[]
  >([]);
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
          .from("decoration_shells")
          .select(
            `
            user_id,
            created_by,
            owner_profile:profiles!decoration_shells_user_id_fkey(
              id, full_name, rank, afsc, email
            )
          `
          )
          .eq("id", shellId)
          .single();

        const typedShellData = shellData as {
          user_id: string;
          created_by: string;
          owner_profile: Profile;
        } | null;
        if (typedShellData?.owner_profile) {
          setShellOwner(typedShellData.owner_profile);
        }

        // Load explicit shares
        const { data: sharesData, error: sharesError } = await supabase
          .from("decoration_shell_shares")
          .select(
            `
            *,
            shared_with_profile:profiles!decoration_shell_shares_shared_with_id_fkey(
              id, full_name, rank, afsc, email
            )
          `
          )
          .eq("shell_id", shellId);

        if (sharesError) throw sharesError;
        setExistingShares(
          (sharesData || []) as (DecorationShellShare & { shared_with_profile?: Profile })[]
        );

        // Load supervisors of the ratee who have access
        if (ratee && !ratee.isManagedMember) {
          const { data: supervisionData } = await supabase
            .from("team_history")
            .select(
              `
              supervisor:profiles!team_history_supervisor_id_fkey(
                id, full_name, rank, afsc, email
              )
            `
            )
            .eq("subordinate_id", ratee.id)
            .is("ended_at", null);

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

  if (ratee) {
    accessList.push({
      id: ratee.id,
      fullName: ratee.fullName,
      rank: ratee.rank,
      afsc: null,
      accessType: "ratee",
    });
  }

  if (shellOwner && shellOwner.id !== ratee?.id) {
    accessList.push({
      id: shellOwner.id,
      fullName: shellOwner.full_name,
      rank: shellOwner.rank,
      afsc: shellOwner.afsc,
      accessType: "owner",
      email: shellOwner.email,
    });
  }

  supervisors.forEach((sup) => {
    if (!accessList.find((u) => u.id === sup.id)) {
      accessList.push({
        id: sup.id,
        fullName: sup.full_name,
        rank: sup.rank,
        afsc: sup.afsc,
        accessType: "supervisor",
        email: sup.email,
      });
    }
  });

  existingShares.forEach((share) => {
    if (share.shared_with_profile && !accessList.find((u) => u.id === share.shared_with_id)) {
      accessList.push({
        id: share.shared_with_id,
        fullName: share.shared_with_profile.full_name,
        rank: share.shared_with_profile.rank,
        afsc: share.shared_with_profile.afsc,
        accessType: "shared",
        email: share.shared_with_profile.email,
        shareId: share.id,
      });
    }
  });

  // Search for users
  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, rank, afsc, email")
        .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(10);

      // Filter out users who already have access
      const existingIds = accessList.map((u) => u.id);
      const typedData = (data || []) as unknown as Profile[];
      const filteredResults = typedData.filter((p) => !existingIds.includes(p.id));
      setSearchResults(filteredResults);
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setIsSearching(false);
    }
  };

  // Share with user
  const handleShare = async (userId: string) => {
    if (!currentUserId) return;

    setIsSharing(userId);
    try {
      const { error } = await supabase.from("decoration_shell_shares").insert({
        shell_id: shellId,
        owner_id: currentUserId,
        share_type: "user",
        shared_with_id: userId,
      } as never);

      if (error) throw error;

      // Add to existing shares
      const sharedUser = searchResults.find((u) => u.id === userId);
      if (sharedUser) {
        setExistingShares((prev) => [
          ...prev,
          {
            id: `temp-${Date.now()}`,
            shell_id: shellId,
            owner_id: currentUserId,
            share_type: "user",
            shared_with_id: userId,
            created_at: new Date().toISOString(),
            shared_with_profile: sharedUser,
          },
        ]);
      }

      setSearchQuery("");
      setSearchResults([]);
      Analytics.decorationShared();
      toast.success("Shared successfully");
    } catch (error) {
      console.error("Share error:", error);
      toast.error("Failed to share");
    } finally {
      setIsSharing(null);
    }
  };

  // Remove share
  const handleRemoveShare = async (shareId: string) => {
    setIsRemoving(shareId);
    try {
      const { error } = await supabase
        .from("decoration_shell_shares")
        .delete()
        .eq("id", shareId);

      if (error) throw error;

      setExistingShares((prev) => prev.filter((s) => s.id !== shareId));
      Analytics.decorationShareRemoved();
      toast.success("Access removed");
    } catch (error) {
      console.error("Remove share error:", error);
      toast.error("Failed to remove access");
    } finally {
      setIsRemoving(null);
    }
  };

  const getAccessIcon = (type: AccessUser["accessType"]) => {
    switch (type) {
      case "owner":
        return <Crown className="size-3.5 text-amber-500" />;
      case "ratee":
        return <User className="size-3.5 text-primary" />;
      case "supervisor":
        return <Shield className="size-3.5 text-blue-500" />;
      case "shared":
        return <Share2 className="size-3.5 text-green-500" />;
    }
  };

  const getAccessLabel = (type: AccessUser["accessType"]) => {
    switch (type) {
      case "owner":
        return "Owner";
      case "ratee":
        return "Ratee";
      case "supervisor":
        return "Supervisor";
      case "shared":
        return "Shared";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="size-5" />
            Share Decoration
          </DialogTitle>
          <DialogDescription>
            Manage who can view and edit this decoration draft.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="space-y-2">
            <Label className="text-xs">Add people</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search by name or email..."
                className="pl-8 h-9"
              />
              {isSearching && (
                <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 size-4 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* Search results */}
            {searchResults.length > 0 && (
              <div className="border rounded-md divide-y">
                {searchResults.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-2 hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="size-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <User className="size-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {user.rank && `${user.rank} `}
                          {user.full_name || "Unknown"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleShare(user.id)}
                      disabled={isSharing === user.id}
                      className="h-7 px-2"
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

          <Separator />

          {/* Access list */}
          <div className="space-y-2">
            <Label className="text-xs">People with access</Label>
            {isLoadingAccess ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : accessList.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No one has access yet
              </p>
            ) : (
              <ScrollArea className="max-h-[240px]">
                <div className="space-y-1">
                  {accessList.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="size-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                          {getAccessIcon(user.accessType)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">
                              {user.rank && `${user.rank} `}
                              {user.fullName || "Unknown"}
                            </p>
                            <Badge variant="outline" className="text-[10px] shrink-0">
                              {getAccessLabel(user.accessType)}
                            </Badge>
                          </div>
                          {user.email && (
                            <p className="text-xs text-muted-foreground truncate">
                              {user.email}
                            </p>
                          )}
                        </div>
                      </div>
                      {user.accessType === "shared" && user.shareId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveShare(user.shareId!)}
                          disabled={isRemoving === user.shareId}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        >
                          {isRemoving === user.shareId ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <X className="size-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
