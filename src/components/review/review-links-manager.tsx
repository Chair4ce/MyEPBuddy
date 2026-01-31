"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import {
  Loader2,
  Link2,
  Copy,
  Check,
  Trash2,
  Clock,
  Send,
  Eye,
  User,
  Users,
  RefreshCw,
} from "lucide-react";

interface ReviewToken {
  id: string;
  token: string;
  shell_type: string;
  shell_id: string;
  ratee_name: string;
  ratee_rank: string | null;
  link_label: string | null;
  is_anonymous: boolean;
  recipient_email: string | null;
  expires_at: string;
  status: "active" | "submitted" | "expired" | "visited";
  visited_at: string | null;
  created_at: string;
}

interface ReviewLinksManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shellType: "epb" | "award" | "decoration";
  shellId: string;
  onCreateNew?: () => void;
}

export function ReviewLinksManager({
  open,
  onOpenChange,
  shellType,
  shellId,
  onCreateNew,
}: ReviewLinksManagerProps) {
  const [tokens, setTokens] = useState<ReviewToken[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revokeTokenId, setRevokeTokenId] = useState<string | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  const loadTokens = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/review-tokens?shellType=${shellType}&shellId=${shellId}`
      );
      const data = await response.json();

      if (response.ok && data.tokens) {
        setTokens(data.tokens);
      }
    } catch (error) {
      console.error("Load tokens error:", error);
      toast.error("Failed to load review links");
    } finally {
      setIsLoading(false);
    }
  }, [shellType, shellId]);

  useEffect(() => {
    if (open) {
      loadTokens();
    }
  }, [open, loadTokens]);

  const handleCopyLink = async (token: ReviewToken) => {
    const baseUrl = window.location.origin;
    const url = `${baseUrl}/review/${token.shell_type}/${token.token}`;
    
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(token.id);
      toast.success("Link copied to clipboard");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const handleRevoke = async () => {
    if (!revokeTokenId) return;
    
    setIsRevoking(true);
    try {
      const response = await fetch(`/api/review-tokens?id=${revokeTokenId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to revoke link");
      }

      setTokens((prev) =>
        prev.map((t) =>
          t.id === revokeTokenId ? { ...t, status: "expired" as const } : t
        )
      );
      toast.success("Link revoked successfully");
    } catch (error) {
      console.error("Revoke error:", error);
      toast.error("Failed to revoke link");
    } finally {
      setIsRevoking(false);
      setRevokeTokenId(null);
    }
  };

  const formatDate = (isoString: string) => {
    try {
      return new Date(isoString).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  const getStatusBadge = (token: ReviewToken) => {
    const isExpired = new Date(token.expires_at) < new Date();
    
    if (token.status === "submitted") {
      return (
        <Badge variant="default" className="bg-green-600 hover:bg-green-600">
          <Send className="size-3 mr-1" />
          Submitted
        </Badge>
      );
    }
    
    if (token.status === "expired" || isExpired) {
      return (
        <Badge variant="secondary" className="text-muted-foreground">
          <Clock className="size-3 mr-1" />
          Expired
        </Badge>
      );
    }
    
    if (token.visited_at) {
      return (
        <Badge variant="outline" className="border-blue-500 text-blue-600">
          <Eye className="size-3 mr-1" />
          Visited
        </Badge>
      );
    }
    
    return (
      <Badge variant="outline">
        <Clock className="size-3 mr-1" />
        Pending
      </Badge>
    );
  };

  const activeTokens = tokens.filter(
    (t) => t.status === "active" && new Date(t.expires_at) > new Date()
  );
  const otherTokens = tokens.filter(
    (t) => t.status !== "active" || new Date(t.expires_at) <= new Date()
  );

  const shellTypeLabel = shellType === "epb" ? "EPB" : shellType === "award" ? "Award" : "Decoration";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="size-5" />
              Review Links
            </DialogTitle>
            <DialogDescription>
              Manage feedback links for this {shellTypeLabel.toLowerCase()}. 
              Active links can be shared with reviewers for feedback.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Actions bar */}
            <div className="px-6 py-3 border-b bg-muted/30 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {activeTokens.length} active link{activeTokens.length !== 1 ? "s" : ""}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadTokens}
                  disabled={isLoading}
                >
                  <RefreshCw className={cn("size-4", isLoading && "animate-spin")} />
                </Button>
                {onCreateNew && (
                  <Button size="sm" onClick={onCreateNew}>
                    Create New Link
                  </Button>
                )}
              </div>
            </div>

            {/* Links list */}
            <ScrollArea className="flex-1">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              ) : tokens.length === 0 ? (
                <div className="text-center py-12 px-6">
                  <Link2 className="size-12 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-sm text-muted-foreground mb-4">
                    No review links created yet
                  </p>
                  {onCreateNew && (
                    <Button onClick={onCreateNew}>
                      Create Your First Link
                    </Button>
                  )}
                </div>
              ) : (
                <div className="p-4 space-y-3">
                  {/* Active links */}
                  {activeTokens.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
                        Active Links
                      </h4>
                      {activeTokens.map((token) => (
                        <TokenCard
                          key={token.id}
                          token={token}
                          copiedId={copiedId}
                          onCopy={handleCopyLink}
                          onRevoke={() => setRevokeTokenId(token.id)}
                          formatDate={formatDate}
                          getStatusBadge={getStatusBadge}
                        />
                      ))}
                    </div>
                  )}

                  {/* Past links */}
                  {otherTokens.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1 mt-4">
                        Past Links
                      </h4>
                      {otherTokens.map((token) => (
                        <TokenCard
                          key={token.id}
                          token={token}
                          copiedId={copiedId}
                          onCopy={handleCopyLink}
                          onRevoke={() => setRevokeTokenId(token.id)}
                          formatDate={formatDate}
                          getStatusBadge={getStatusBadge}
                          disabled
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      {/* Revoke confirmation */}
      <AlertDialog open={!!revokeTokenId} onOpenChange={() => setRevokeTokenId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Review Link?</AlertDialogTitle>
            <AlertDialogDescription>
              This will expire the link immediately. Anyone with the link will no longer 
              be able to access or submit feedback. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRevoking}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              disabled={isRevoking}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRevoking ? (
                <Loader2 className="size-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="size-4 mr-2" />
              )}
              Revoke Link
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Token card subcomponent
function TokenCard({
  token,
  copiedId,
  onCopy,
  onRevoke,
  formatDate,
  getStatusBadge,
  disabled = false,
}: {
  token: ReviewToken;
  copiedId: string | null;
  onCopy: (token: ReviewToken) => void;
  onRevoke: () => void;
  formatDate: (date: string) => string;
  getStatusBadge: (token: ReviewToken) => React.ReactNode;
  disabled?: boolean;
}) {
  const isExpiredOrSubmitted = token.status !== "active" || new Date(token.expires_at) < new Date();

  return (
    <div
      className={cn(
        "p-4 rounded-lg border bg-card",
        disabled && "opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Label and type */}
          <div className="flex items-center gap-2 mb-1">
            {token.is_anonymous ? (
              <Users className="size-4 text-muted-foreground" />
            ) : (
              <User className="size-4 text-muted-foreground" />
            )}
            <span className="font-medium text-sm truncate">
              {token.link_label || (token.is_anonymous ? "Anonymous Link" : "Unnamed Link")}
            </span>
            {getStatusBadge(token)}
          </div>

          {/* Details */}
          <div className="text-xs text-muted-foreground space-y-0.5">
            <p>Created {formatDate(token.created_at)}</p>
            {token.status === "active" && (
              <p>Expires {formatDate(token.expires_at)}</p>
            )}
            {token.visited_at && token.status !== "submitted" && (
              <p>Visited {formatDate(token.visited_at)}</p>
            )}
            {token.recipient_email && (
              <p>Email: {token.recipient_email}</p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-1">
          {!isExpiredOrSubmitted && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => onCopy(token)}
              >
                {copiedId === token.id ? (
                  <Check className="size-4 text-green-600" />
                ) : (
                  <Copy className="size-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-destructive hover:text-destructive"
                onClick={onRevoke}
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
