"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import {
  Users,
  Globe,
  User,
  Loader2,
  Search,
  X,
  Check,
  UserPlus,
} from "lucide-react";
import type { RefinedStatement, StatementShare, Profile } from "@/types/database";

interface ShareStatementDialogProps {
  statement: RefinedStatement | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSharesUpdated?: () => void;
}

type ShareTarget = {
  id: string;
  type: "user" | "team" | "community";
  label: string;
  sublabel?: string;
};

export function ShareStatementDialog({
  statement,
  open,
  onOpenChange,
  onSharesUpdated,
}: ShareStatementDialogProps) {
  const { profile, subordinates } = useUserStore();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [existingShares, setExistingShares] = useState<StatementShare[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Profile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // Selected shares
  const [shareWithTeam, setShareWithTeam] = useState(false);
  const [shareWithCommunity, setShareWithCommunity] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<Profile[]>([]);

  const supabase = createClient();

  // Load existing shares when statement changes
  useEffect(() => {
    if (statement && open) {
      loadExistingShares();
    }
  }, [statement?.id, open]);

  async function loadExistingShares() {
    if (!statement) return;
    setIsLoading(true);

    try {
      const { data } = await supabase
        .from("statement_shares")
        .select("*")
        .eq("statement_id", statement.id);

      const shares = (data || []) as StatementShare[];
      setExistingShares(shares);

      // Set UI state based on existing shares
      setShareWithTeam(shares.some((s) => s.share_type === "team"));
      setShareWithCommunity(shares.some((s) => s.share_type === "community"));

      // Load user details for individual shares
      const userShares = shares.filter((s) => s.share_type === "user" && s.shared_with_id);
      if (userShares.length > 0) {
        const { data: users } = await supabase
          .from("profiles")
          .select("*")
          .in("id", userShares.map((s) => s.shared_with_id!));
        setSelectedUsers((users || []) as Profile[]);
      } else {
        setSelectedUsers([]);
      }
    } catch (error) {
      console.error("Error loading shares:", error);
      toast.error("Failed to load sharing settings");
    } finally {
      setIsLoading(false);
    }
  }

  async function searchUsers(query: string) {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
        .neq("id", profile?.id || "")
        .limit(10);

      setSearchResults((data || []) as Profile[]);
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setIsSearching(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      searchUsers(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  function addUser(user: Profile) {
    if (!selectedUsers.find((u) => u.id === user.id)) {
      setSelectedUsers([...selectedUsers, user]);
    }
    setSearchQuery("");
    setSearchResults([]);
  }

  function removeUser(userId: string) {
    setSelectedUsers(selectedUsers.filter((u) => u.id !== userId));
  }

  async function saveShares() {
    if (!statement || !profile) return;
    setIsSaving(true);

    try {
      // Delete all existing shares for this statement
      await supabase
        .from("statement_shares")
        .delete()
        .eq("statement_id", statement.id);

      const newShares: Array<{
        statement_id: string;
        owner_id: string;
        share_type: "user" | "team" | "community";
        shared_with_id?: string | null;
      }> = [];

      // Add team share
      if (shareWithTeam) {
        newShares.push({
          statement_id: statement.id,
          owner_id: profile.id,
          share_type: "team",
          shared_with_id: null,
        });
      }

      // Add community share
      if (shareWithCommunity) {
        newShares.push({
          statement_id: statement.id,
          owner_id: profile.id,
          share_type: "community",
          shared_with_id: null,
        });
      }

      // Add individual user shares
      for (const user of selectedUsers) {
        newShares.push({
          statement_id: statement.id,
          owner_id: profile.id,
          share_type: "user",
          shared_with_id: user.id,
        });
      }

      if (newShares.length > 0) {
        const { error } = await supabase.from("statement_shares").insert(newShares as never);
        if (error) throw error;
      }

      toast.success("Sharing settings updated");
      onSharesUpdated?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Save error:", error);
      toast.error("Failed to update sharing settings");
    } finally {
      setIsSaving(false);
    }
  }

  const hasChanges =
    shareWithTeam !== existingShares.some((s) => s.share_type === "team") ||
    shareWithCommunity !== existingShares.some((s) => s.share_type === "community") ||
    selectedUsers.length !== existingShares.filter((s) => s.share_type === "user").length ||
    selectedUsers.some(
      (u) => !existingShares.find((s) => s.share_type === "user" && s.shared_with_id === u.id)
    );

  const activeShareCount =
    (shareWithTeam ? 1 : 0) + (shareWithCommunity ? 1 : 0) + selectedUsers.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-[calc(100%-2rem)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="size-5" />
            Share Statement
          </DialogTitle>
          <DialogDescription>
            Control who can view this statement. Shared statements can be copied but not edited.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Statement Preview */}
            <div className="p-3 rounded-lg bg-muted/50 text-sm">
              <p className="line-clamp-3">{statement?.statement}</p>
            </div>

            <Separator />

            {/* Share Options */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Share with</Label>

              {/* Team Option */}
              <label
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                  shareWithTeam
                    ? "bg-primary/5 border-primary/30"
                    : "bg-card hover:bg-muted/50"
                )}
              >
                <Checkbox
                  checked={shareWithTeam}
                  onCheckedChange={(checked) => setShareWithTeam(!!checked)}
                  aria-label="Share with team"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Users className="size-4" />
                    <span className="text-sm font-medium">My Team</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Share with your supervisors, subordinates, and teammates
                  </p>
                </div>
              </label>

              {/* Community Option */}
              <label
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                  shareWithCommunity
                    ? "bg-primary/5 border-primary/30"
                    : "bg-card hover:bg-muted/50"
                )}
              >
                <Checkbox
                  checked={shareWithCommunity}
                  onCheckedChange={(checked) => setShareWithCommunity(!!checked)}
                  aria-label="Share with community"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Globe className="size-4" />
                    <span className="text-sm font-medium">Community</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Make visible to all users for reference and learning
                  </p>
                </div>
              </label>
            </div>

            <Separator />

            {/* Individual Users */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Share with specific users</Label>

              {/* Selected Users */}
              {selectedUsers.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedUsers.map((user) => (
                    <Badge
                      key={user.id}
                      variant="secondary"
                      className="gap-1 pr-1"
                    >
                      <span className="truncate max-w-[120px]">
                        {user.rank} {user.full_name || user.email}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeUser(user.id)}
                        className="ml-1 rounded-full p-0.5 hover:bg-muted"
                        aria-label={`Remove ${user.full_name || user.email}`}
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {/* Search Input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  aria-label="Search users"
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 animate-spin text-muted-foreground" />
                )}
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <ScrollArea className="h-[120px] rounded-lg border">
                  <div className="p-2 space-y-1">
                    {searchResults.map((user) => {
                      const isSelected = selectedUsers.some((u) => u.id === user.id);
                      return (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => !isSelected && addUser(user)}
                          disabled={isSelected}
                          className={cn(
                            "w-full flex items-center gap-2 p-2 rounded-md text-left transition-colors",
                            isSelected
                              ? "bg-primary/10 text-muted-foreground cursor-not-allowed"
                              : "hover:bg-muted"
                          )}
                        >
                          <User className="size-4 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {user.rank} {user.full_name || "Unknown"}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {user.email}
                            </p>
                          </div>
                          {isSelected && <Check className="size-4 text-primary shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}

              {/* Quick Add: Subordinates */}
              {subordinates.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <UserPlus className="size-3" />
                    Quick add from your team:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {subordinates.slice(0, 5).map((sub) => {
                      const isSelected = selectedUsers.some((u) => u.id === sub.id);
                      return (
                        <Button
                          key={sub.id}
                          type="button"
                          variant={isSelected ? "secondary" : "outline"}
                          size="sm"
                          onClick={() => !isSelected && addUser(sub)}
                          disabled={isSelected}
                          className="text-xs h-7"
                        >
                          {isSelected && <Check className="size-3 mr-1" />}
                          {sub.rank} {sub.full_name?.split(" ")[0] || ""}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Summary */}
            {activeShareCount > 0 && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                <Check className="size-4 text-green-500" />
                <span>
                  Sharing with {activeShareCount} {activeShareCount === 1 ? "recipient" : "recipients"}
                </span>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={saveShares}
            disabled={isSaving || isLoading}
            className="w-full sm:w-auto"
          >
            {isSaving ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : null}
            Save Sharing Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

