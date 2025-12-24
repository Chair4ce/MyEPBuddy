"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import { RealtimeChannel } from "@supabase/supabase-js";

// Cursor position for real-time tracking
export interface CursorPosition {
  x: number;
  y: number;
  mpaKey: string | null; // Which MPA section they're in
}

// Collaborator with cursor tracking
export interface EPBCollaborator {
  id: string;
  fullName: string;
  rank: string | null;
  isHost: boolean;
  isOnline: boolean;
  cursor: CursorPosition | null;
  color: string;
}

// EPB workspace state that gets synced
export interface EPBWorkspaceState {
  sections: Record<string, { draftText: string; mode: string }>;
  activeMpa: string | null;
}

// Session data
interface EPBSession {
  id: string;
  session_code: string;
  host_user_id: string;
  shell_id: string;
  is_active: boolean;
  workspace_state: EPBWorkspaceState | null;
}

// Active session info (when someone else is editing)
export interface ActiveSessionInfo {
  sessionCode: string;
  hostName: string;
  hostRank: string | null;
  participantCount: number;
}

interface UseEPBCollaborationOptions {
  shellId: string | null;
  onStateChange?: (state: EPBWorkspaceState) => void;
  onParticipantJoin?: (participant: EPBCollaborator) => void;
  onParticipantLeave?: (participantId: string) => void;
}

interface UseEPBCollaborationReturn {
  // Session state
  session: EPBSession | null;
  sessionCode: string | null;
  isHost: boolean;
  isInSession: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Active session detection
  activeSession: ActiveSessionInfo | null;
  isCheckingSession: boolean;
  
  // Collaborators with cursors
  collaborators: EPBCollaborator[];
  
  // Actions
  checkForActiveSession: () => Promise<ActiveSessionInfo | null>;
  createSession: (initialState?: Partial<EPBWorkspaceState>) => Promise<string | null>;
  joinSession: (code?: string) => Promise<boolean>; // code optional - will use active session
  leaveSession: () => Promise<void>;
  endSession: () => Promise<void>;
  
  // Sync
  broadcastState: (state: Partial<EPBWorkspaceState>) => void;
  broadcastCursor: (cursor: CursorPosition) => void;
}

// Generate random color for cursor
const CURSOR_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
];

function getRandomColor(): string {
  return CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];
}

export function useEPBCollaboration(
  options: UseEPBCollaborationOptions
): UseEPBCollaborationReturn {
  const { shellId, onStateChange, onParticipantJoin, onParticipantLeave } = options;
  const { profile } = useUserStore();
  const supabase = createClient();
  
  const [session, setSession] = useState<EPBSession | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collaborators, setCollaborators] = useState<EPBCollaborator[]>([]);
  
  // Active session detection
  const [activeSession, setActiveSession] = useState<ActiveSessionInfo | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(false);
  
  const channelRef = useRef<RealtimeChannel | null>(null);
  const colorRef = useRef<string>(getRandomColor());
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

  // Check for active sessions on this shell
  const checkForActiveSession = useCallback(async (): Promise<ActiveSessionInfo | null> => {
    if (!shellId) return null;
    
    setIsCheckingSession(true);
    try {
      // Find active session for this shell
      type SessionWithHost = {
        id: string;
        session_code: string;
        host_user_id: string;
        is_active: boolean;
        host_profile: { full_name: string | null; rank: string | null } | null;
      };
      
      const { data: activeSessionData, error: findError } = await supabase
        .from("workspace_sessions")
        .select("id, session_code, host_user_id, is_active, host_profile:profiles!workspace_sessions_host_user_id_fkey(full_name, rank)")
        .eq("shell_id", shellId)
        .eq("is_active", true)
        .single() as { data: SessionWithHost | null; error: Error | null };

      if (findError || !activeSessionData) {
        setActiveSession(null);
        return null;
      }

      // Count participants
      const { count } = await supabase
        .from("workspace_session_participants")
        .select("id", { count: "exact", head: true })
        .eq("session_id", activeSessionData.id)
        .is("left_at", null);

      const hostProfile = activeSessionData.host_profile;
      const sessionInfo: ActiveSessionInfo = {
        sessionCode: activeSessionData.session_code,
        hostName: hostProfile?.full_name || "Unknown",
        hostRank: hostProfile?.rank || null,
        participantCount: count || 1,
      };

      setActiveSession(sessionInfo);
      return sessionInfo;
    } catch (err) {
      console.error("Failed to check for active session:", err);
      setActiveSession(null);
      return null;
    } finally {
      setIsCheckingSession(false);
    }
  }, [shellId, supabase]);

  // Check for active session when shell changes
  useEffect(() => {
    if (shellId && !session) {
      checkForActiveSession();
    }
  }, [shellId, session, checkForActiveSession]);

  // Subscribe to realtime channel for a session
  const subscribeToSession = useCallback((sessionId: string, sessionCode: string) => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase.channel(`epb:${sessionCode}`, {
      config: {
        presence: {
          key: profile?.id || "anonymous",
        },
      },
    });

    // Handle presence (who's online + cursors)
    channel
      .on("presence", { event: "sync" }, () => {
        const presenceState = channel.presenceState();
        const online: EPBCollaborator[] = [];
        
        Object.entries(presenceState).forEach(([oderId, presences]) => {
          const presence = presences[0] as unknown as { 
            fullName: string; 
            rank: string | null;
            isHost: boolean;
            cursor: CursorPosition | null;
            color: string;
          } | undefined;
          
          if (presence) {
            online.push({
              id: oderId,
              fullName: presence.fullName || "Unknown",
              rank: presence.rank || null,
              isHost: presence.isHost || false,
              isOnline: true,
              cursor: presence.cursor || null,
              color: presence.color || "#888888",
            });
          }
        });
        
        setCollaborators(online);
      })
      .on("presence", { event: "join" }, ({ key, newPresences }) => {
        const presence = newPresences[0] as unknown as { 
          fullName: string; 
          rank: string | null;
          isHost: boolean;
          color: string;
        } | undefined;
        
        if (presence && optionsRef.current.onParticipantJoin) {
          optionsRef.current.onParticipantJoin({
            id: key,
            fullName: presence.fullName || "Unknown",
            rank: presence.rank || null,
            isHost: presence.isHost || false,
            isOnline: true,
            cursor: null,
            color: presence.color || "#888888",
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
        optionsRef.current.onStateChange(payload.state as EPBWorkspaceState);
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
        // Track presence with cursor support
        await channel.track({
          fullName: profile?.full_name || "Unknown",
          rank: profile?.rank || null,
          isHost: isHost,
          cursor: null,
          color: colorRef.current,
        });
      }
    });

    channelRef.current = channel;
  }, [profile, supabase, isHost]);

  // Create a new collaboration session
  const createSession = useCallback(async (initialState?: Partial<EPBWorkspaceState>): Promise<string | null> => {
    if (!profile || !shellId) {
      setError("You must be logged in and have an EPB shell to create a session");
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const workspaceState: EPBWorkspaceState = {
        sections: initialState?.sections || {},
        activeMpa: initialState?.activeMpa || null,
      };

      // Use the existing workspace_sessions table with shell_id
      const { data: newSession, error: createError } = await supabase
        .from("workspace_sessions")
        .insert({
          host_user_id: profile.id,
          workspace_state: workspaceState,
          shell_id: shellId, // Link to EPB shell
        } as never)
        .select()
        .single() as { data: { id: string; session_code: string; host_user_id: string; shell_id: string | null; is_active: boolean; workspace_state: unknown } | null; error: Error | null };

      if (createError || !newSession) throw createError || new Error("Failed to create session");

      // Add host as participant
      await supabase
        .from("workspace_session_participants")
        .insert({
          session_id: newSession.id,
          user_id: profile.id,
          is_host: true,
        } as never);

      const epbSession: EPBSession = {
        id: newSession.id,
        session_code: newSession.session_code,
        host_user_id: newSession.host_user_id,
        shell_id: shellId,
        is_active: newSession.is_active,
        workspace_state: newSession.workspace_state as EPBWorkspaceState | null,
      };

      setSession(epbSession);
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
  }, [profile, shellId, supabase, subscribeToSession]);

  // Join an existing session by code (or use active session if no code provided)
  const joinSession = useCallback(async (code?: string): Promise<boolean> => {
    if (!profile) {
      setError("You must be logged in to join a session");
      return false;
    }
    
    // If no code provided, use the active session code
    const sessionCode = code || activeSession?.sessionCode;
    if (!sessionCode) {
      setError("No session code provided and no active session found");
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Find session by code
      type SessionData = { id: string; session_code: string; host_user_id: string; shell_id: string | null; is_active: boolean; workspace_state: unknown };
      const { data: existingSession, error: findError } = await supabase
        .from("workspace_sessions")
        .select("*")
        .eq("session_code", sessionCode.toUpperCase())
        .eq("is_active", true)
        .single() as { data: SessionData | null; error: Error | null };

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
        .single() as { data: { id: string } | null; error: Error | null };

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

      const epbSession: EPBSession = {
        id: existingSession.id,
        session_code: existingSession.session_code,
        host_user_id: existingSession.host_user_id,
        shell_id: existingSession.shell_id || "",
        is_active: existingSession.is_active,
        workspace_state: existingSession.workspace_state as EPBWorkspaceState | null,
      };

      setSession(epbSession);
      setIsHost(existingSession.host_user_id === profile.id);
      
      // Subscribe to realtime channel
      subscribeToSession(existingSession.id, existingSession.session_code);

      // Notify about current state
      if (optionsRef.current.onStateChange && existingSession.workspace_state) {
        optionsRef.current.onStateChange(existingSession.workspace_state as EPBWorkspaceState);
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
  const broadcastState = useCallback((state: Partial<EPBWorkspaceState>) => {
    if (!channelRef.current || !session) return;

    // Merge with existing state
    const currentState = session.workspace_state || { sections: {}, activeMpa: null };
    const newState: EPBWorkspaceState = {
      sections: { ...currentState.sections, ...state.sections },
      activeMpa: state.activeMpa !== undefined ? state.activeMpa : currentState.activeMpa,
    };

    // Broadcast to other participants
    channelRef.current.send({
      type: "broadcast",
      event: "state_update",
      payload: { state: newState },
    });

    // Also update in database
    supabase
      .from("workspace_sessions")
      .update({ workspace_state: newState } as never)
      .eq("id", session.id)
      .then(() => {
        // Update local state
        setSession((prev) => prev ? { ...prev, workspace_state: newState } : null);
      });
  }, [session, supabase]);

  // Broadcast cursor position
  const broadcastCursor = useCallback((cursor: CursorPosition) => {
    if (!channelRef.current || !profile) return;

    // Update presence with new cursor position
    channelRef.current.track({
      fullName: profile.full_name || "Unknown",
      rank: profile.rank || null,
      isHost: isHost,
      cursor: cursor,
      color: colorRef.current,
    });
  }, [profile, isHost]);

  return {
    session,
    sessionCode: session?.session_code || null,
    isHost,
    isInSession: !!session,
    isLoading,
    error,
    
    // Active session detection
    activeSession,
    isCheckingSession,
    
    collaborators,
    checkForActiveSession,
    createSession,
    joinSession,
    leaveSession,
    endSession,
    broadcastState,
    broadcastCursor,
  };
}

