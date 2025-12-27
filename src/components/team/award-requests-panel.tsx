"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAwardsStore } from "@/stores/awards-store";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { AWARD_LEVELS, AWARD_CATEGORIES, AWARD_QUARTERS } from "@/lib/constants";
import type { AwardRequest, Award } from "@/types/database";
import {
  Check,
  X,
  Loader2,
  Clock,
  Medal,
  Award as AwardIcon,
  Trophy,
  Star,
  User,
  ChevronRight,
} from "lucide-react";

interface AwardRequestsPanelProps {
  requests: AwardRequest[];
  onRequestUpdated?: (requestId: string) => void;
  className?: string;
}

export function AwardRequestsPanel({
  requests,
  onRequestUpdated,
  className,
}: AwardRequestsPanelProps) {
  const { removePendingRequest, addAward } = useAwardsStore();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [denyDialogRequest, setDenyDialogRequest] = useState<AwardRequest | null>(null);
  const [denyReason, setDenyReason] = useState("");
  const [isDenying, setIsDenying] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<AwardRequest | null>(null);

  const supabase = createClient();

  const pendingRequests = requests.filter((r) => r.status === "pending");

  async function approveRequest(request: AwardRequest) {
    setProcessingId(request.id);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("approve_award_request", {
        p_request_id: request.id,
      });

      if (error) throw error;

      // Fetch the created award
      const { data: newAward } = await supabase
        .from("awards")
        .select("*")
        .eq("id", data)
        .single();

      if (newAward) {
        addAward(newAward as Award);
      }

      removePendingRequest(request.id);
      toast.success("Award approved and added");
      onRequestUpdated?.(request.id);
    } catch (error) {
      console.error("Error approving request:", error);
      toast.error("Failed to approve request");
    } finally {
      setProcessingId(null);
    }
  }

  async function denyRequest() {
    if (!denyDialogRequest) return;
    setIsDenying(true);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.rpc as any)("deny_award_request", {
        p_request_id: denyDialogRequest.id,
        p_reason: denyReason || null,
      });

      if (error) throw error;

      removePendingRequest(denyDialogRequest.id);
      toast.success("Award request denied");
      onRequestUpdated?.(denyDialogRequest.id);
      setDenyDialogRequest(null);
      setDenyReason("");
    } catch (error) {
      console.error("Error denying request:", error);
      toast.error("Failed to deny request");
    } finally {
      setIsDenying(false);
    }
  }

  function getAwardTypeIcon(type: string) {
    switch (type) {
      case "coin":
        return <Medal className="size-4 text-amber-500" />;
      case "quarterly":
        return <AwardIcon className="size-4 text-blue-500" />;
      case "annual":
        return <Trophy className="size-4 text-purple-500" />;
      case "special":
        return <Star className="size-4 text-emerald-500" />;
      default:
        return <Trophy className="size-4" />;
    }
  }

  function getRequestSummary(request: AwardRequest): string {
    if (request.award_type === "coin") {
      return `Coin from ${request.coin_presenter}`;
    }
    if (request.award_type === "quarterly") {
      const q = AWARD_QUARTERS.find((q) => q.value === request.quarter);
      return `${q?.label || request.quarter} ${request.award_year}`;
    }
    if (request.award_type === "annual") {
      return `${request.award_year} Annual Award`;
    }
    return request.award_name || "Special Award";
  }

  function getRecipientName(request: AwardRequest): string {
    if (request.recipient_profile) {
      return `${request.recipient_profile.rank || ""} ${request.recipient_profile.full_name || "Unknown"}`.trim();
    }
    if (request.recipient_team_member) {
      return `${request.recipient_team_member.rank || ""} ${request.recipient_team_member.full_name || "Unknown"}`.trim();
    }
    return "Unknown recipient";
  }

  if (pendingRequests.length === 0) {
    return null;
  }

  return (
    <>
      <Card className={cn("border-amber-200 dark:border-amber-800", className)}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="size-5 text-amber-500" />
            Pending Award Requests
            <Badge variant="secondary" className="ml-auto">
              {pendingRequests.length}
            </Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            Award submissions from team members awaiting your approval
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <ScrollArea className="max-h-[300px]">
            <div className="space-y-2">
              {pendingRequests.map((request) => {
                const isProcessing = processingId === request.id;
                return (
                  <div
                    key={request.id}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                  >
                    {getAwardTypeIcon(request.award_type)}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">
                          {getRequestSummary(request)}
                        </p>
                        {request.is_team_award && (
                          <Badge variant="outline" className="text-[8px] shrink-0">
                            Team
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <User className="size-3" />
                        {getRecipientName(request)}
                      </p>
                      {request.requester && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Submitted by {request.requester.rank} {request.requester.full_name}
                        </p>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        onClick={() => setSelectedRequest(request)}
                      >
                        <ChevronRight className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                        onClick={() => setDenyDialogRequest(request)}
                        disabled={isProcessing}
                      >
                        <X className="size-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                        onClick={() => approveRequest(request)}
                        disabled={isProcessing}
                      >
                        {isProcessing ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Check className="size-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Request Details Dialog */}
      <Dialog
        open={!!selectedRequest}
        onOpenChange={(open) => !open && setSelectedRequest(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedRequest && getAwardTypeIcon(selectedRequest.award_type)}
              Award Request Details
            </DialogTitle>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4">
              <div className="grid gap-3 text-sm">
                <div>
                  <Label className="text-xs text-muted-foreground">Type</Label>
                  <p className="font-medium capitalize">{selectedRequest.award_type}</p>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Recipient</Label>
                  <p className="font-medium">{getRecipientName(selectedRequest)}</p>
                </div>

                {selectedRequest.award_type === "coin" && (
                  <>
                    <div>
                      <Label className="text-xs text-muted-foreground">Presented By</Label>
                      <p className="font-medium">{selectedRequest.coin_presenter}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Date</Label>
                      <p className="font-medium">
                        {selectedRequest.coin_date &&
                          new Date(selectedRequest.coin_date).toLocaleDateString()}
                      </p>
                    </div>
                    {selectedRequest.coin_description && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Description</Label>
                        <p className="text-sm">{selectedRequest.coin_description}</p>
                      </div>
                    )}
                  </>
                )}

                {["quarterly", "annual", "special"].includes(selectedRequest.award_type) && (
                  <>
                    {selectedRequest.quarter && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Quarter</Label>
                        <p className="font-medium">{selectedRequest.quarter}</p>
                      </div>
                    )}
                    {selectedRequest.award_year && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Year</Label>
                        <p className="font-medium">{selectedRequest.award_year}</p>
                      </div>
                    )}
                    {selectedRequest.award_level && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Level Won At</Label>
                        <p className="font-medium">
                          {AWARD_LEVELS.find((l) => l.value === selectedRequest.award_level)
                            ?.label || selectedRequest.award_level}
                        </p>
                      </div>
                    )}
                    {selectedRequest.award_category && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Category</Label>
                        <p className="font-medium">
                          {AWARD_CATEGORIES.find(
                            (c) => c.value === selectedRequest.award_category
                          )?.label || selectedRequest.award_category}
                        </p>
                      </div>
                    )}
                  </>
                )}

                {selectedRequest.is_team_award && (
                  <div>
                    <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                      Team Award
                    </Badge>
                  </div>
                )}

                {selectedRequest.requester && (
                  <div className="pt-2 border-t">
                    <Label className="text-xs text-muted-foreground">Submitted By</Label>
                    <p className="font-medium">
                      {selectedRequest.requester.rank} {selectedRequest.requester.full_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(selectedRequest.created_at).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  className="text-red-500 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"
                  onClick={() => {
                    setDenyDialogRequest(selectedRequest);
                    setSelectedRequest(null);
                  }}
                >
                  <X className="size-4 mr-1" />
                  Deny
                </Button>
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => {
                    approveRequest(selectedRequest);
                    setSelectedRequest(null);
                  }}
                >
                  <Check className="size-4 mr-1" />
                  Approve
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Deny Dialog */}
      <Dialog
        open={!!denyDialogRequest}
        onOpenChange={(open) => {
          if (!open) {
            setDenyDialogRequest(null);
            setDenyReason("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Deny Award Request</DialogTitle>
            <DialogDescription>
              Optionally provide a reason for denying this request.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="denyReason">Reason (optional)</Label>
              <Textarea
                id="denyReason"
                placeholder="Enter reason for denial..."
                value={denyReason}
                onChange={(e) => setDenyReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDenyDialogRequest(null);
                setDenyReason("");
              }}
              disabled={isDenying}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={denyRequest} disabled={isDenying}>
              {isDenying ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Denying...
                </>
              ) : (
                "Deny Request"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}



