"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import type { WorkspaceSession, WorkspaceSessionParticipant, WorkspaceState, Profile } from "@/types/database";
import { RealtimeChannel } from "@supabase/supabase-js";

interface CollaboratorPresence {
  id: string;
  fullName: string;
  email: string;
  isHost: boolean;
  isOnline: boolean;
}

interface UseWorkspaceCollaborationOptions {
  onStateChange?: (state: WorkspaceState) => void;
  onParticipantJoin?: (participant: CollaboratorPresence) => void;
  onParticipantLeave?: (participantId: string) => void;
}

interface UseWorkspaceCollaborationReturn {
  // Session state
  session: WorkspaceSession | null;
  isHost: boolean;
  isInSession: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Collaborators
  collaborators: CollaboratorPresence[];
  
  // Actions
  createSession: (initialState?: Partial<WorkspaceState>) => Promise<string | null>;
  joinSession: (code: string) => Promise<boolean>;
  leaveSession: () => Promise<void>;
  endSession: () => Promise<void>;
  
  // Sync
  broadcastState: (state: Partial<WorkspaceState>) => void;
}

export function useWorkspaceCollaboration(
  options: UseWorkspaceCollaborationOptions = {}
): UseWorkspaceCollaborationReturn {
  const { profile } = useUserStore();
  const supabase = createClient();
  
  const [session, setSession] = useState<WorkspaceSession | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collaborators, setCollaborators] = useState<CollaboratorPresence[]>([]);
  
  const channelRef = useRef<RealtimeChannel | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Clean up channel on unmount
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [supabase]);

  // Subscribe to realtime channel for a session
  const subscribeToSession = useCallback((sessionId: string, sessionCode: string) => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase.channel(`workspace:${sessionCode}`, {
      config: {
        presence: {
          key: profile?.id || "anonymous",
        },
      },
    });

    // Handle presence (who's online)
    channel
      .on("presence", { event: "sync" }, () => {
        const presenceState = channel.presenceState();
        const online: CollaboratorPresence[] = [];
        
        Object.entries(presenceState).forEach(([userId, presences]) => {
          const presence = presences[0] as unknown as { fullName: string; email: string; isHost: boolean } | undefined;
          if (presence) {
            online.push({
              id: userId,
              fullName: presence.fullName || "Unknown",
              email: presence.email || "",
              isHost: presence.isHost || false,
              isOnline: true,
            });
          }
        });
        
        setCollaborators(online);
      })
      .on("presence", { event: "join" }, ({ key, newPresences }) => {
        const presence = newPresences[0] as unknown as { fullName: string; email: string; isHost: boolean } | undefined;
        if (presence && optionsRef.current.onParticipantJoin) {
          optionsRef.current.onParticipantJoin({
            id: key,
            fullName: presence.fullName || "Unknown",
            email: presence.email || "",
            isHost: presence.isHost || false,
            isOnline: true,
          });
        }
      })
      .on("presence", { event: "leave" }, ({ key }) => {
        if (optionsRef.current.onParticipantLeave) {
          optionsRef.current.onParticipantLeave(key);
        }
      });

    // Handle broadcast messages for state sync
    channel.on("broadcast", { event: "state_update" }, ({ payload }) => {
      if (optionsRef.current.onStateChange && payload.state) {
        optionsRef.current.onStateChange(payload.state as WorkspaceState);
      }
    });

    // Handle session end broadcast
    channel.on("broadcast", { event: "session_ended" }, () => {
      setSession(null);
      setIsHost(false);
      setCollaborators([]);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        // Track presence
        await channel.track({
          fullName: profile?.full_name || "Unknown",
          email: profile?.email || "",
          isHost: isHost,
        });
      }
    });

    channelRef.current = channel;
  }, [profile, supabase, isHost]);

  // Create a new collaboration session
  const createSession = useCallback(async (initialState?: Partial<WorkspaceState>): Promise<string | null> => {
    if (!profile) {
      setError("You must be logged in to create a session");
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Create session in database with the host's current workspace state
      const workspaceState: WorkspaceState = {
        draftStatement: initialState?.draftStatement || "",
        selectedMpa: initialState?.selectedMpa || "",
        maxCharLimit: initialState?.maxCharLimit || 350,
        cycleYear: initialState?.cycleYear || new Date().getFullYear(),
        selectedSources: initialState?.selectedSources || [],
        snapshots: initialState?.snapshots || [],
      };

      const { data: newSession, error: createError } = await supabase
        .from("workspace_sessions")
        .insert({
          host_user_id: profile.id,
          workspace_state: workspaceState,
        } as never)
        .select()
        .single() as unknown as { data: WorkspaceSession | null; error: Error | null };

      if (createError || !newSession) throw createError || new Error("Failed to create session");

      // Add host as participant
      await supabase
        .from("workspace_session_participants")
        .insert({
          session_id: newSession.id,
          user_id: profile.id,
          is_host: true,
        } as never);

      setSession(newSession);
      setIsHost(true);
      
      // Subscribe to realtime channel
      subscribeToSession(newSession.id, newSession.session_code);

      return newSession.session_code;
    } catch (err) {
      console.error("Failed to create session:", err);
      setError("Failed to create collaboration session");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [profile, supabase, subscribeToSession]);

  // Join an existing session by code
  const joinSession = useCallback(async (code: string): Promise<boolean> => {
    if (!profile) {
      setError("You must be logged in to join a session");
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Find session by code
      const { data: existingSession, error: findError } = await supabase
        .from("workspace_sessions")
        .select("*, host_profile:profiles!workspace_sessions_host_user_id_fkey(*)")
        .eq("session_code", code.toUpperCase())
        .eq("is_active", true)
        .single() as unknown as { data: WorkspaceSession | null; error: Error | null };

      if (findError || !existingSession) {
        setError("Session not found or has expired");
        return false;
      }

      // Check if already a participant
      const { data: existingParticipant } = await supabase
        .from("workspace_session_participants")
        .select()
        .eq("session_id", existingSession.id)
        .eq("user_id", profile.id)
        .is("left_at", null)
        .single() as unknown as { data: { id: string } | null; error: Error | null };

      if (!existingParticipant) {
        // Join as participant
        const { error: joinError } = await supabase
          .from("workspace_session_participants")
          .insert({
            session_id: existingSession.id,
            user_id: profile.id,
            is_host: false,
          } as never);

        if (joinError) throw joinError;
      }

      setSession(existingSession);
      setIsHost(existingSession.host_user_id === profile.id);
      
      // Subscribe to realtime channel
      subscribeToSession(existingSession.id, existingSession.session_code);

      // Notify about current state
      if (optionsRef.current.onStateChange && existingSession.workspace_state) {
        optionsRef.current.onStateChange(existingSession.workspace_state as WorkspaceState);
      }

      return true;
    } catch (err) {
      console.error("Failed to join session:", err);
      setError("Failed to join collaboration session");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [profile, supabase, subscribeToSession]);

  // Leave the current session (without ending it)
  const leaveSession = useCallback(async () => {
    if (!session || !profile) return;

    try {
      // Mark participation as left
      await supabase
        .from("workspace_session_participants")
        .update({ left_at: new Date().toISOString() } as never)
        .eq("session_id", session.id)
        .eq("user_id", profile.id);

      // Unsubscribe from channel
      if (channelRef.current) {
        await channelRef.current.untrack();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      setSession(null);
      setIsHost(false);
      setCollaborators([]);
    } catch (err) {
      console.error("Failed to leave session:", err);
    }
  }, [session, profile, supabase]);

  // End the session completely (host only)
  const endSession = useCallback(async () => {
    if (!session || !isHost) return;

    try {
      // Broadcast session end to all participants
      if (channelRef.current) {
        await channelRef.current.send({
          type: "broadcast",
          event: "session_ended",
          payload: {},
        });
      }

      // Deactivate session in database
      await supabase
        .from("workspace_sessions")
        .update({ is_active: false } as never)
        .eq("id", session.id);

      // Clean up
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      setSession(null);
      setIsHost(false);
      setCollaborators([]);
    } catch (err) {
      console.error("Failed to end session:", err);
    }
  }, [session, isHost, supabase]);

  // Broadcast state changes to all participants
  const broadcastState = useCallback((state: Partial<WorkspaceState>) => {
    if (!channelRef.current || !session) return;

    // Merge with existing state
    const newState = {
      ...session.workspace_state,
      ...state,
    };

    // Broadcast to other participants
    channelRef.current.send({
      type: "broadcast",
      event: "state_update",
      payload: { state: newState },
    });

    // Also update in database (debounced would be better in production)
    supabase
      .from("workspace_sessions")
      .update({ workspace_state: newState } as never)
      .eq("id", session.id)
      .then(() => {
        // Update local state
        setSession((prev) => prev ? { ...prev, workspace_state: newState } : null);
      });
  }, [session, supabase]);

  return {
    session,
    isHost,
    isInSession: !!session,
    isLoading,
    error,
    collaborators,
    createSession,
    joinSession,
    leaveSession,
    endSession,
    broadcastState,
  };
}

