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
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CollaboratorPresence {
  id: string;
  fullName: string;
  email: string;
  isHost: boolean;
  isOnline: boolean;
}

interface WorkspaceCollaborationProps {
  isInSession: boolean;
  isHost: boolean;
  sessionCode: string | null;
  collaborators: CollaboratorPresence[];
  isLoading: boolean;
  onCreateSession: () => Promise<string | null>;
  onJoinSession: (code: string) => Promise<boolean>;
  onLeaveSession: () => Promise<void>;
  onEndSession: () => Promise<void>;
}

export function WorkspaceCollaboration({
  isInSession,
  isHost,
  sessionCode,
  collaborators,
  isLoading,
  onCreateSession,
  onJoinSession,
  onLeaveSession,
  onEndSession,
}: WorkspaceCollaborationProps) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isJoinDialogOpen, setIsJoinDialogOpen] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  const handleCreateSession = async () => {
    setIsCreating(true);
    const code = await onCreateSession();
    setIsCreating(false);
    
    if (code) {
      toast.success("Collaboration session created!", {
        description: `Share code: ${code}`,
      });
    }
  };

  const handleJoinSession = async () => {
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
      toast.success("Joined collaboration session!");
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
    toast.info("Left collaboration session");
  };

  const handleEnd = async () => {
    await onEndSession();
    setIsPopoverOpen(false);
    toast.info("Collaboration session ended");
  };

  // Not in a session - show create/join button
  if (!isInSession) {
    return (
      <>
        <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 gap-1 text-[10px]"
              disabled={isLoading}
            >
              <Users className="size-3" />
              Collaborate
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="start" side="bottom">
            <div className="space-y-3">
              <div className="text-sm font-medium">Start Collaborating</div>
              <p className="text-xs text-muted-foreground">
                Work on this statement together in real-time with another user.
              </p>
              <div className="space-y-2">
                <Button
                  variant="default"
                  size="sm"
                  className="w-full gap-2"
                  onClick={handleCreateSession}
                  disabled={isCreating}
                >
                  {isCreating ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <UserPlus className="size-3" />
                  )}
                  Create Session
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
                  <Link2 className="size-3" />
                  Join Session
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* Join Session Dialog */}
        <Dialog open={isJoinDialogOpen} onOpenChange={setIsJoinDialogOpen}>
          <DialogContent className="sm:max-w-[360px]">
            <DialogHeader>
              <DialogTitle>Join Collaboration Session</DialogTitle>
              <DialogDescription>
                Enter the 6-character code shared by the session host.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="session-code">Session Code</Label>
                <Input
                  id="session-code"
                  placeholder="e.g. ABC123"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  className="text-center text-lg font-mono tracking-widest"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleJoinSession();
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
                  onClick={handleJoinSession}
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

  // In a session - show session info
  return (
    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-6 px-2 gap-1 text-[10px]",
            "border-green-500/50 bg-green-500/10 hover:bg-green-500/20"
          )}
        >
          <Circle className="size-2 fill-green-500 text-green-500 animate-pulse" />
          <Users className="size-3" />
          <span className="font-mono">{collaborators.length}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start" side="bottom">
        <div className="p-3 border-b">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Live Collaboration</div>
            <Badge variant="outline" className="text-[10px] font-mono">
              {sessionCode}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {collaborators.length} {collaborators.length === 1 ? "person" : "people"} editing
          </p>
        </div>

        {/* Share Code */}
        <div className="p-3 border-b">
          <Label className="text-xs text-muted-foreground">Share this code</Label>
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 bg-muted rounded px-3 py-1.5 font-mono text-sm tracking-widest text-center">
              {sessionCode}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={handleCopyCode}
            >
              {copied ? (
                <Check className="size-3 text-green-500" />
              ) : (
                <Copy className="size-3" />
              )}
            </Button>
          </div>
        </div>

        {/* Collaborators List */}
        <div className="p-3 space-y-2">
          <Label className="text-xs text-muted-foreground">Collaborators</Label>
          <div className="space-y-1.5">
            {collaborators.map((collab) => (
              <div
                key={collab.id}
                className="flex items-center gap-2 text-sm"
              >
                <div className="relative">
                  <div className="size-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium">
                    {collab.fullName.charAt(0).toUpperCase()}
                  </div>
                  <Circle
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 size-2.5",
                      collab.isOnline
                        ? "fill-green-500 text-green-500"
                        : "fill-gray-400 text-gray-400"
                    )}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-medium">
                      {collab.fullName || collab.email}
                    </span>
                    {collab.isHost && (
                      <Crown className="size-3 text-amber-500 flex-shrink-0" />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        {/* Actions */}
        <div className="p-2">
          {isHost ? (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={handleEnd}
            >
              <X className="size-3" />
              End Session
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-xs"
              onClick={handleLeave}
            >
              <LogOut className="size-3" />
              Leave Session
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}





