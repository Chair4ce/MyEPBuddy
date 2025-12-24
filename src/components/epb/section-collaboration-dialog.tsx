"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Users,
  UserPlus,
  Loader2,
  Eye,
  Edit3,
  Handshake,
  Copy,
  Check,
  UserCheck,
  UserX,
  Clock,
  XCircle,
  Bell,
} from "lucide-react";
import { toast } from "@/components/ui/sonner";
import type { 
  ActiveSessionInfo, 
  SectionCollaborator,
  JoinRequest,
  ParticipantStatus,
} from "@/hooks/use-epb-section-collaboration";

interface SectionCollaborationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  activeSession: ActiveSessionInfo | null;
  mpaLabel: string;
  onJoinSession: () => Promise<boolean>;
  onViewOnly: () => void;
  isJoining: boolean;
  joinStatus?: ParticipantStatus | null;
}

export function SectionCollaborationDialog({
  isOpen,
  onClose,
  activeSession,
  mpaLabel,
  onJoinSession,
  onViewOnly,
  isJoining,
  joinStatus,
}: SectionCollaborationDialogProps) {
  const hostName = activeSession?.hostRank
    ? `${activeSession.hostRank} ${activeSession.hostFullName}`
    : activeSession?.hostFullName || "Someone";

  const handleJoin = async () => {
    await onJoinSession();
    // Don't close - wait for approval
  };

  // Show waiting state if pending
  if (joinStatus === "pending") {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="size-5 text-amber-500 animate-pulse" />
              Waiting for Approval
            </DialogTitle>
            <DialogDescription>
              Your request to join has been sent to <strong>{hostName}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="py-6 flex flex-col items-center gap-4">
            <div className="size-16 rounded-full bg-amber-500/10 flex items-center justify-center">
              <Loader2 className="size-8 text-amber-500 animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">Request Pending</p>
              <p className="text-xs text-muted-foreground mt-1">
                Waiting for {hostName} to approve your request...
              </p>
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button variant="outline" className="w-full" onClick={onClose}>
              Cancel Request
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              You&apos;ll be notified when approved
            </p>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Show rejection state
  if (joinStatus === "rejected") {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="size-5 text-destructive" />
              Request Declined
            </DialogTitle>
            <DialogDescription>
              {hostName} has declined your request to join the session
            </DialogDescription>
          </DialogHeader>

          <div className="py-6 flex flex-col items-center gap-4">
            <div className="size-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <UserX className="size-8 text-destructive" />
            </div>
            <p className="text-sm text-muted-foreground text-center">
              You can still view the section in read-only mode
            </p>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                onViewOnly();
                onClose();
              }}
            >
              <Eye className="size-4 mr-2" />
              View Only
            </Button>
            <Button variant="ghost" className="w-full" onClick={onClose}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit3 className="size-5 text-amber-500" />
            Section Currently Being Edited
          </DialogTitle>
          <DialogDescription>
            <strong>{hostName}</strong> is currently editing the{" "}
            <strong>{mpaLabel}</strong> section
            {activeSession && activeSession.participantCount > 1 && (
              <> with {activeSession.participantCount - 1} other{activeSession.participantCount > 2 ? "s" : ""}</>
            )}
            .
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Active editor indicator */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="size-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
              <span className="text-sm font-medium text-amber-600">
                {activeSession?.hostFullName?.charAt(0) || "?"}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{hostName}</p>
              <p className="text-xs text-muted-foreground">Currently editing</p>
            </div>
            <div className="relative shrink-0">
              <div className="size-3 rounded-full bg-green-500 animate-pulse" />
              <div className="absolute inset-0 size-3 rounded-full bg-green-500 animate-ping opacity-75" />
            </div>
          </div>

          {/* Options */}
          <div className="space-y-2">
            <p className="text-sm font-medium">What would you like to do?</p>
            <div className="grid gap-2">
              {/* Join option */}
              <button
                onClick={handleJoin}
                disabled={isJoining}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border transition-all text-left",
                  "hover:bg-primary/5 hover:border-primary/50",
                  "focus:outline-none focus:ring-2 focus:ring-primary/20"
                )}
              >
                <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Handshake className="size-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Request to join</p>
                  <p className="text-xs text-muted-foreground">
                    Ask {hostName.split(" ")[0]} to collaborate
                  </p>
                </div>
                {isJoining && <Loader2 className="size-4 animate-spin shrink-0" />}
              </button>

              {/* View only option */}
              <button
                onClick={() => {
                  onViewOnly();
                  onClose();
                }}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border transition-all text-left",
                  "hover:bg-muted/50 hover:border-muted-foreground/20",
                  "focus:outline-none focus:ring-2 focus:ring-muted-foreground/20"
                )}
              >
                <div className="size-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Eye className="size-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">View only</p>
                  <p className="text-xs text-muted-foreground">
                    See the section content without editing
                  </p>
                </div>
              </button>
            </div>
          </div>
        </div>

        <DialogFooter className="sm:justify-start">
          <p className="text-xs text-muted-foreground">
            The host will be asked to approve your request to join.
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Join request notification for the host
interface JoinRequestNotificationProps {
  request: JoinRequest;
  mpaLabel: string;
  onApprove: (oderId: string) => Promise<void>;
  onReject: (oderId: string) => Promise<void>;
  isProcessing?: boolean;
}

export function JoinRequestNotification({
  request,
  mpaLabel,
  onApprove,
  onReject,
  isProcessing,
}: JoinRequestNotificationProps) {
  const requesterName = request.rank
    ? `${request.rank} ${request.fullName}`
    : request.fullName;

  return (
    <div className="animate-in slide-in-from-top-2 fade-in duration-300 rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
      <div className="flex items-start gap-3">
        <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Bell className="size-5 text-primary animate-bounce" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Join Request</p>
          <p className="text-xs text-muted-foreground">
            <strong>{requesterName}</strong> wants to join your editing session for{" "}
            <strong>{mpaLabel}</strong>
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          className="flex-1 h-8"
          onClick={() => onApprove(request.oderId)}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <Loader2 className="size-3.5 animate-spin mr-1.5" />
          ) : (
            <UserCheck className="size-3.5 mr-1.5" />
          )}
          Accept
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 h-8"
          onClick={() => onReject(request.oderId)}
          disabled={isProcessing}
        >
          <UserX className="size-3.5 mr-1.5" />
          Decline
        </Button>
      </div>
    </div>
  );
}

// Panel showing join requests for host
interface JoinRequestsPanelProps {
  requests: JoinRequest[];
  mpaLabel: string;
  onApprove: (oderId: string) => Promise<void>;
  onReject: (oderId: string) => Promise<void>;
}

export function JoinRequestsPanel({
  requests,
  mpaLabel,
  onApprove,
  onReject,
}: JoinRequestsPanelProps) {
  const [processingId, setProcessingId] = useState<string | null>(null);

  if (requests.length === 0) return null;

  const handleApprove = async (oderId: string) => {
    setProcessingId(oderId);
    try {
      await onApprove(oderId);
      toast.success("User approved to join session");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (oderId: string) => {
    setProcessingId(oderId);
    try {
      await onReject(oderId);
      toast.info("Join request declined");
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-2">
      {requests.map((request) => (
        <JoinRequestNotification
          key={request.oderId}
          request={request}
          mpaLabel={mpaLabel}
          onApprove={handleApprove}
          onReject={handleReject}
          isProcessing={processingId === request.oderId}
        />
      ))}
    </div>
  );
}

interface CollaboratorsPanelProps {
  collaborators: SectionCollaborator[];
  sessionCode: string | null;
  isHost: boolean;
  onLeave: () => void;
  onEnd: () => void;
  joinRequests?: JoinRequest[];
  mpaLabel?: string;
  onApproveRequest?: (oderId: string) => Promise<void>;
  onRejectRequest?: (oderId: string) => Promise<void>;
}

export function CollaboratorsPanel({
  collaborators,
  sessionCode,
  isHost,
  onLeave,
  onEnd,
  joinRequests = [],
  mpaLabel = "",
  onApproveRequest,
  onRejectRequest,
}: CollaboratorsPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyCode = async () => {
    if (!sessionCode) return;
    await navigator.clipboard.writeText(sessionCode);
    setCopied(true);
    toast.success("Session code copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border bg-card p-3 space-y-3">
      {/* Join requests for host */}
      {isHost && joinRequests.length > 0 && onApproveRequest && onRejectRequest && (
        <JoinRequestsPanel
          requests={joinRequests}
          mpaLabel={mpaLabel}
          onApprove={onApproveRequest}
          onReject={onRejectRequest}
        />
      )}

      {/* Header with session code */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-primary" />
          <span className="text-sm font-medium">
            Collaborating ({collaborators.length})
          </span>
        </div>
        {sessionCode && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={handleCopyCode}
          >
            {copied ? (
              <Check className="size-3" />
            ) : (
              <Copy className="size-3" />
            )}
            {sessionCode}
          </Button>
        )}
      </div>

      {/* Collaborator avatars */}
      {collaborators.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {collaborators.map((collab) => (
            <div
              key={collab.id}
              className={cn(
                "flex items-center gap-2 px-2 py-1 rounded-full text-xs",
                collab.isHost
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "bg-muted"
              )}
            >
              <div className="relative">
                <div className="size-5 rounded-full bg-background flex items-center justify-center text-[10px] font-medium border">
                  {collab.fullName?.charAt(0) || "?"}
                </div>
                {collab.isOnline && (
                  <div className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-green-500 border border-background" />
                )}
              </div>
              <span className="max-w-[100px] truncate">
                {collab.rank && `${collab.rank} `}
                {collab.fullName?.split(" ")[0] || "Unknown"}
              </span>
              {collab.isHost && (
                <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
                  Host
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Leave/End button */}
      <div className="pt-2 border-t">
        {isHost ? (
          <Button
            variant="destructive"
            size="sm"
            className="w-full h-7 text-xs"
            onClick={onEnd}
          >
            End Session
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full h-7 text-xs"
            onClick={onLeave}
          >
            Leave Session
          </Button>
        )}
      </div>
    </div>
  );
}

interface EditingIndicatorProps {
  hostName: string;
  participantCount: number;
  onClick: () => void;
}

export function EditingIndicator({
  hostName,
  participantCount,
  onClick,
}: EditingIndicatorProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs",
        "bg-amber-500/10 border border-amber-500/30 text-amber-600",
        "hover:bg-amber-500/20 transition-colors",
        "animate-in fade-in slide-in-from-top-2 duration-300"
      )}
    >
      <div className="relative">
        <Edit3 className="size-3.5" />
        <div className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-green-500 animate-pulse" />
      </div>
      <span>
        {hostName} is editing
        {participantCount > 1 && ` (+${participantCount - 1})`}
      </span>
      <UserPlus className="size-3 ml-1" />
    </button>
  );
}
