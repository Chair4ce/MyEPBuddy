"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import {
  Archive,
  X,
  Share2,
  Users,
  User,
  Globe,
  Loader2,
  ChevronDown,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types/database";

interface ArchivedEPBHeaderProps {
  epbId: string;
  epbLabel: string;
  statementCount: number;
  onClearFilter: () => void;
  onBulkShareComplete?: () => void;
}

type ShareTarget = "community" | "team" | "user";

export function ArchivedEPBHeader({
  epbId,
  epbLabel,
  statementCount,
  onClearFilter,
  onBulkShareComplete,
}: ArchivedEPBHeaderProps) {
  const supabase = createClient();
  const { profile, subordinates } = useUserStore();
  const [isSharing, setIsSharing] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [shareResult, setShareResult] = useState<number | null>(null);

  const handleBulkShare = async (target: ShareTarget, userId?: string) => {
    if (!profile) return;

    setIsSharing(true);
    setShareResult(null);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("bulk_share_epb_statements", {
        p_shell_id: epbId,
        p_share_type: target,
        p_shared_with_id: target === "user" ? userId : null,
      });

      if (error) throw error;

      const count = data as number;
      setShareResult(count);

      if (count > 0) {
        toast.success(`Shared ${count} statements!`, {
          description:
            target === "community"
              ? "Statements shared with the community"
              : target === "team"
              ? "Statements shared with your team"
              : "Statements shared with selected user",
        });
      } else {
        toast.info("Statements already shared", {
          description: "All statements from this EPB are already shared",
        });
      }

      onBulkShareComplete?.();
    } catch (err) {
      console.error("Bulk share error:", err);
      toast.error("Failed to share statements");
    } finally {
      setIsSharing(false);
    }
  };

  const openShareDialog = (target: ShareTarget) => {
    setShareTarget(target);
    setSelectedUserId(null);
    setShareResult(null);

    if (target === "user") {
      setShowShareDialog(true);
    } else {
      // For team and community, share immediately
      handleBulkShare(target);
    }
  };

  const confirmUserShare = () => {
    if (selectedUserId) {
      handleBulkShare("user", selectedUserId);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
        <div className="flex items-center gap-2 min-w-0">
          <Archive className="size-4 text-primary shrink-0" />
          <span className="text-sm font-medium truncate">{epbLabel}</span>
          <Badge variant="secondary" className="shrink-0 text-xs">
            {statementCount} statements
          </Badge>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Bulk Share Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                disabled={isSharing || statementCount === 0}
              >
                {isSharing ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Share2 className="size-3.5" />
                )}
                <span className="hidden sm:inline">Share All</span>
                <ChevronDown className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => openShareDialog("community")}>
                <Globe className="size-4 mr-2 text-blue-500" />
                Share with Community
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openShareDialog("team")}>
                <Users className="size-4 mr-2 text-green-500" />
                Share with Team
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => openShareDialog("user")}>
                <User className="size-4 mr-2 text-primary" />
                Share with User...
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Clear Filter Button */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onClearFilter}
            title="Clear filter"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* Share with User Dialog */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md mx-auto">
          {!shareResult ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Share2 className="size-5 text-primary" />
                  Share All Statements
                </DialogTitle>
                <DialogDescription>
                  Share all {statementCount} statements from this archived EPB
                  with a team member
                </DialogDescription>
              </DialogHeader>

              <div className="py-4 space-y-2">
                <p className="text-sm font-medium text-muted-foreground mb-3">
                  Select a team member:
                </p>
                {subordinates.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No team members available. Add team members to share
                    statements with them.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto">
                    {subordinates.map((sub) => (
                      <button
                        key={sub.id}
                        onClick={() => setSelectedUserId(sub.id)}
                        className={cn(
                          "w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors",
                          selectedUserId === sub.id
                            ? "bg-primary/5 border-primary/30 ring-1 ring-primary/20"
                            : "bg-card hover:bg-muted/50"
                        )}
                      >
                        <User className="size-4 text-muted-foreground" />
                        <span className="text-sm">
                          {sub.rank} {sub.full_name}
                        </span>
                        {selectedUserId === sub.id && (
                          <CheckCircle2 className="size-4 text-primary ml-auto" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  onClick={() => setShowShareDialog(false)}
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
                <Button
                  onClick={confirmUserShare}
                  disabled={!selectedUserId || isSharing}
                  className="w-full sm:w-auto"
                >
                  {isSharing ? (
                    <Loader2 className="size-4 animate-spin mr-2" />
                  ) : (
                    <Share2 className="size-4 mr-2" />
                  )}
                  Share All Statements
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="size-5" />
                  Shared Successfully!
                </DialogTitle>
              </DialogHeader>

              <div className="py-8 text-center space-y-2">
                <p className="text-2xl font-bold text-green-600">
                  {shareResult}
                </p>
                <p className="text-sm text-muted-foreground">
                  statements shared
                </p>
              </div>

              <DialogFooter>
                <Button
                  onClick={() => setShowShareDialog(false)}
                  className="w-full sm:w-auto"
                >
                  Done
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

