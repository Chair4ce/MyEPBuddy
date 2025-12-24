"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/components/ui/sonner";
import {
  Users,
  UserPlus,
  Link2,
  Copy,
  Check,
  X,
  LogOut,
  Loader2,
  Crown,
  Circle,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { EPBCollaborator, ActiveSessionInfo } from "@/hooks/use-epb-collaboration";

interface EPBCollaborationPanelProps {
  isInSession: boolean;
  isHost: boolean;
  sessionCode: string | null;
  collaborators: EPBCollaborator[];
  isLoading: boolean;
  
  // Active session detection
  activeSession: ActiveSessionInfo | null;
  isCheckingSession: boolean;
  
  // Actions
  onCreateSession: () => Promise<string | null>;
  onJoinSession: (code?: string) => Promise<boolean>;
  onLeaveSession: () => Promise<void>;
  onEndSession: () => Promise<void>;
}

export function EPBCollaborationPanel({
  isInSession,
  isHost,
  sessionCode,
  collaborators,
  isLoading,
  activeSession,
  isCheckingSession,
  onCreateSession,
  onJoinSession,
  onLeaveSession,
  onEndSession,
}: EPBCollaborationPanelProps) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isJoinDialogOpen, setIsJoinDialogOpen] = useState(false);
  const [showActiveSessionDialog, setShowActiveSessionDialog] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  const handleCreateSession = async () => {
    setIsCreating(true);
    const code = await onCreateSession();
    setIsCreating(false);
    
    if (code) {
      toast.success("Live session started!", {
        description: `Share code: ${code}`,
      });
    }
  };

  const handleJoinActiveSession = async () => {
    setIsJoining(true);
    const success = await onJoinSession(); // No code = use active session
    setIsJoining(false);
    setShowActiveSessionDialog(false);

    if (success) {
      toast.success("Joined live session!");
    } else {
      toast.error("Failed to join session");
    }
  };

  const handleJoinByCode = async () => {
    if (!joinCode.trim()) {
      toast.error("Please enter a session code");
      return;
    }

    setIsJoining(true);
    const success = await onJoinSession(joinCode.trim());
    setIsJoining(false);

    if (success) {
      setIsJoinDialogOpen(false);
      setJoinCode("");
      toast.success("Joined live session!");
    } else {
      toast.error("Failed to join session", {
        description: "Check the code and try again",
      });
    }
  };

  const handleCopyCode = async () => {
    if (!sessionCode) return;
    
    try {
      await navigator.clipboard.writeText(sessionCode);
      setCopied(true);
      toast.success("Session code copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy code");
    }
  };

  const handleLeave = async () => {
    await onLeaveSession();
    setIsPopoverOpen(false);
    toast.info("Left live session");
  };

  const handleEnd = async () => {
    await onEndSession();
    setIsPopoverOpen(false);
    toast.info("Live session ended");
  };

  // Show active session dialog when there's an active session and we're not in it
  const shouldShowActiveSessionPrompt = activeSession && !isInSession && !isCheckingSession;

  // In a session - show session status
  if (isInSession) {
    return (
      <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-8 px-3 gap-2",
              "border-green-500/50 bg-green-500/10 hover:bg-green-500/20 text-green-700 dark:text-green-400"
            )}
          >
            <Circle className="size-2 fill-green-500 text-green-500 animate-pulse" />
            <span className="font-medium">Live</span>
            <span className="text-muted-foreground">•</span>
            <Users className="size-3.5" />
            <span>{collaborators.length}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="end" side="bottom">
          <div className="p-4 border-b bg-green-500/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Circle className="size-2 fill-green-500 text-green-500 animate-pulse" />
                <span className="text-sm font-medium">Live Session</span>
              </div>
              <Badge variant="outline" className="font-mono text-xs">
                {sessionCode}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {collaborators.length} {collaborators.length === 1 ? "person" : "people"} collaborating
            </p>
          </div>

          {/* Share Code */}
          <div className="p-4 border-b">
            <Label className="text-xs text-muted-foreground">Invite others with this code</Label>
            <div className="flex items-center gap-2 mt-2">
              <div className="flex-1 bg-muted rounded-md px-4 py-2 font-mono text-lg tracking-widest text-center">
                {sessionCode}
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10"
                onClick={handleCopyCode}
              >
                {copied ? (
                  <Check className="size-4 text-green-500" />
                ) : (
                  <Copy className="size-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Collaborators List */}
          <div className="p-4 space-y-3">
            <Label className="text-xs text-muted-foreground">In this session</Label>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {collaborators.map((collab) => (
                <div
                  key={collab.id}
                  className="flex items-center gap-3"
                >
                  <div className="relative">
                    <div 
                      className="size-8 rounded-full flex items-center justify-center text-xs font-medium text-white"
                      style={{ backgroundColor: collab.color }}
                    >
                      {collab.fullName.charAt(0).toUpperCase()}
                    </div>
                    <Circle
                      className={cn(
                        "absolute -bottom-0.5 -right-0.5 size-3",
                        collab.isOnline
                          ? "fill-green-500 text-green-500"
                          : "fill-gray-400 text-gray-400"
                      )}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {collab.rank ? `${collab.rank} ` : ""}{collab.fullName}
                      </span>
                      {collab.isHost && (
                        <Crown className="size-3.5 text-amber-500 flex-shrink-0" />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Leave/End Session */}
          <div className="p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
              onClick={handleLeave}
            >
              <LogOut className="size-4" />
              Leave Session
            </Button>
            {isHost && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={handleEnd}
              >
                <X className="size-4" />
                End Session for All
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  // Active session exists - show join prompt
  if (shouldShowActiveSessionPrompt) {
    const hostDisplay = activeSession.hostRank 
      ? `${activeSession.hostRank} ${activeSession.hostName}`
      : activeSession.hostName;

    return (
      <>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-3 gap-2 border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400"
          onClick={() => setShowActiveSessionDialog(true)}
        >
          <Circle className="size-2 fill-amber-500 text-amber-500 animate-pulse" />
          <span className="font-medium">Live</span>
          <span className="text-muted-foreground">•</span>
          <span className="text-xs">{activeSession.participantCount} editing</span>
        </Button>

        {/* Active Session Dialog */}
        <Dialog open={showActiveSessionDialog} onOpenChange={setShowActiveSessionDialog}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Circle className="size-2 fill-amber-500 text-amber-500 animate-pulse" />
                Live Session Active
              </DialogTitle>
              <DialogDescription>
                {hostDisplay} is currently editing this EPB with {activeSession.participantCount - 1} other{activeSession.participantCount > 2 ? "s" : ""}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="flex flex-col gap-3">
                <Button
                  className="w-full gap-2"
                  onClick={handleJoinActiveSession}
                  disabled={isJoining}
                >
                  {isJoining ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <UserPlus className="size-4" />
                  )}
                  Join Session
                </Button>
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => setShowActiveSessionDialog(false)}
                >
                  <Eye className="size-4" />
                  View Read-Only
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Join to collaborate in real-time or view to see the current state without editing.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // No session - show create/join options
  return (
    <>
      <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3 gap-2"
            disabled={isLoading || isCheckingSession}
          >
            {isCheckingSession ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Users className="size-4" />
            )}
            Collaborate
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-4" align="end" side="bottom">
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium">Real-Time Collaboration</div>
              <p className="text-xs text-muted-foreground mt-1">
                Work on this EPB together with your team. Cursors and edits sync instantly.
              </p>
            </div>
            <div className="space-y-2">
              <Button
                variant="default"
                size="sm"
                className="w-full gap-2"
                onClick={handleCreateSession}
                disabled={isCreating}
              >
                {isCreating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <UserPlus className="size-4" />
                )}
                Start Live Session
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2"
                onClick={() => {
                  setIsPopoverOpen(false);
                  setIsJoinDialogOpen(true);
                }}
              >
                <Link2 className="size-4" />
                Join with Code
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Join by Code Dialog */}
      <Dialog open={isJoinDialogOpen} onOpenChange={setIsJoinDialogOpen}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>Join Live Session</DialogTitle>
            <DialogDescription>
              Enter the 6-character code shared by another team member.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="epb-session-code">Session Code</Label>
              <Input
                id="epb-session-code"
                placeholder="e.g. ABC123"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
                className="text-center text-lg font-mono tracking-widest"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleJoinByCode();
                  }
                }}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setIsJoinDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 gap-2"
                onClick={handleJoinByCode}
                disabled={isJoining || joinCode.length < 6}
              >
                {isJoining ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Join"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Cursor overlay component for showing other users' cursors
export function CursorOverlay({ collaborators }: { collaborators: EPBCollaborator[] }) {
  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      {collaborators
        .filter((c) => c.cursor && c.isOnline)
        .map((collab) => (
          <div
            key={collab.id}
            className="absolute transition-all duration-75 ease-out"
            style={{
              left: collab.cursor!.x,
              top: collab.cursor!.y,
              transform: "translate(-2px, -2px)",
            }}
          >
            {/* Cursor pointer */}
            <svg
              width="24"
              height="36"
              viewBox="0 0 24 36"
              fill="none"
              className="drop-shadow-md"
            >
              <path
                d="M5.65376 12.4561L12.2969 29.5439L13.7469 26.4766L18.3374 26.1797L5.65376 12.4561Z"
                fill={collab.color}
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {/* Name label */}
            <div
              className="absolute left-4 top-5 whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium text-white"
              style={{ backgroundColor: collab.color }}
            >
              {collab.rank ? `${collab.rank} ` : ""}{collab.fullName.split(" ")[0]}
            </div>
          </div>
        ))}
    </div>
  );
}
