"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUserStore } from "@/stores/user-store";
import type { Profile } from "@/types/database";
import { RealtimeChannel } from "@supabase/supabase-js";

export interface SectionEditingSession {
  id: string;
  section_id: string;
  host_user_id: string;
  session_code: string;
  workspace_state: SectionWorkspaceState;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
}

export interface SectionWorkspaceState {
  draftText: string;
  cursorPosition?: number;
  lastEditedBy?: string;
}

export type ParticipantStatus = "pending" | "approved" | "rejected";

export interface SectionCollaborator {
  id: string;
  oderId: string; // participant record ID in database
  fullName: string;
  rank: string | null;
  email: string;
  isHost: boolean;
  isOnline: boolean;
  status: ParticipantStatus;
}

export interface JoinRequest {
  oderId: string; // participant record ID in database
  userId: string;
  fullName: string;
  rank: string | null;
  requestedAt: string;
}

export interface ActiveSessionInfo {
  sessionId: string;
  sessionCode: string;
  hostUserId: string;
  hostFullName: string | null;
  hostRank: string | null;
  isOwnSession: boolean;
  participantCount: number;
}

interface UseEPBSectionCollaborationOptions {
  sectionId: string;
  onStateChange?: (state: SectionWorkspaceState) => void;
  onParticipantJoin?: (participant: SectionCollaborator) => void;
  onParticipantLeave?: (participantId: string) => void;
  onJoinRequest?: (request: JoinRequest) => void;
  onJoinApproved?: () => void;
  onJoinRejected?: () => void;
}

interface UseEPBSectionCollaborationReturn {
  // Session state
  session: SectionEditingSession | null;
  isHost: boolean;
  isInSession: boolean;
  isLoading: boolean;
  error: string | null;

  // Active session check (someone else editing)
  activeSession: ActiveSessionInfo | null;
  checkingActive: boolean;

  // Collaborators (approved only)
  collaborators: SectionCollaborator[];
  
  // Join requests (pending participants for host to approve)
  joinRequests: JoinRequest[];
  
  // Join status (for non-hosts waiting for approval)
  joinStatus: ParticipantStatus | null;

  // Actions
  startEditing: (initialState?: Partial<SectionWorkspaceState>) => Promise<string | null>;
  requestToJoin: (code?: string) => Promise<boolean>;
  leaveSession: () => Promise<void>;
  endSession: () => Promise<void>;
  checkActiveSession: () => Promise<ActiveSessionInfo | null>;
  
  // Host actions
  approveJoinRequest: (oderId: string) => Promise<void>;
  rejectJoinRequest: (oderId: string) => Promise<void>;

  // Sync
  broadcastState: (state: Partial<SectionWorkspaceState>) => void;
  updateActivity: () => void;
}

export function useEPBSectionCollaboration(
  options: UseEPBSectionCollaborationOptions
): UseEPBSectionCollaborationReturn {
  const { 
    sectionId, 
    onStateChange, 
    onParticipantJoin, 
    onParticipantLeave,
    onJoinRequest,
    onJoinApproved,
    onJoinRejected,
  } = options;
  const { profile } = useUserStore();
  const supabase = createClient();

  const [session, setSession] = useState<SectionEditingSession | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collaborators, setCollaborators] = useState<SectionCollaborator[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [joinStatus, setJoinStatus] = useState<ParticipantStatus | null>(null);
  const [activeSession, setActiveSession] = useState<ActiveSessionInfo | null>(null);
  const [checkingActive, setCheckingActive] = useState(false);
  const [myOderId, setMyOderId] = useState<string | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const optionsRef = useRef({ 
    onStateChange, 
    onParticipantJoin, 
    onParticipantLeave,
    onJoinRequest,
    onJoinApproved,
    onJoinRejected,
  });
  optionsRef.current = { 
    onStateChange, 
    onParticipantJoin, 
    onParticipantLeave,
    onJoinRequest,
    onJoinApproved,
    onJoinRejected,
  };
  const activityIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
      if (activityIntervalRef.current) {
        clearInterval(activityIntervalRef.current);
      }
    };
  }, [supabase]);

  // Check for active editing session on this section
  const checkActiveSession = useCallback(async (): Promise<ActiveSessionInfo | null> => {
    if (!profile || !sectionId) return null;

    setCheckingActive(true);
    try {
      // Type for the RPC response
      interface ActiveSessionRow {
        session_id: string;
        session_code: string;
        host_user_id: string;
        host_full_name: string | null;
        host_rank: string | null;
        is_own_session: boolean;
        participant_count: number;
      }

      const { data, error: rpcError } = await supabase.rpc("get_section_active_session", {
        p_section_id: sectionId,
        p_user_id: profile.id,
      } as never) as { data: ActiveSessionRow[] | null; error: Error | null };

      if (rpcError) throw rpcError;

      if (data && data.length > 0) {
        const row = data[0];
        const info: ActiveSessionInfo = {
          sessionId: row.session_id,
          sessionCode: row.session_code,
          hostUserId: row.host_user_id,
          hostFullName: row.host_full_name,
          hostRank: row.host_rank,
          isOwnSession: row.is_own_session,
          participantCount: row.participant_count,
        };
        setActiveSession(info);
        return info;
      }

      setActiveSession(null);
      return null;
    } catch (err) {
      console.error("Failed to check active session:", err);
      return null;
    } finally {
      setCheckingActive(false);
    }
  }, [profile, sectionId, supabase]);

  // Subscribe to realtime channel for a session
  const subscribeToSession = useCallback(
    (sessionId: string, sessionCode: string) => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }

      const channel = supabase.channel(`epb-section:${sessionCode}`, {
        config: {
          presence: {
            key: profile?.id || "anonymous",
          },
        },
      });

      // Handle presence (who's online) - only show approved participants
      channel
        .on("presence", { event: "sync" }, () => {
          const presenceState = channel.presenceState();
          const online: SectionCollaborator[] = [];

          Object.entries(presenceState).forEach(([oderId, presences]) => {
            const presence = presences[0] as unknown as {
              oderId: string;
              fullName: string;
              rank: string | null;
              email: string;
              isHost: boolean;
              status: ParticipantStatus;
            } | undefined;
            // Only show approved participants
            if (presence && (presence.status === "approved" || presence.isHost)) {
              online.push({
                id: oderId,
                oderId: presence.oderId || oderId,
                fullName: presence.fullName || "Unknown",
                rank: presence.rank || null,
                email: presence.email || "",
                isHost: presence.isHost || false,
                isOnline: true,
                status: presence.status || "approved",
              });
            }
          });

          setCollaborators(online);
        })
        .on("presence", { event: "join" }, ({ key, newPresences }) => {
          const presence = newPresences[0] as unknown as {
            oderId: string;
            fullName: string;
            rank: string | null;
            email: string;
            isHost: boolean;
            status: ParticipantStatus;
          } | undefined;
          if (presence && presence.status === "approved" && optionsRef.current.onParticipantJoin) {
            optionsRef.current.onParticipantJoin({
              id: key,
              oderId: presence.oderId || key,
              fullName: presence.fullName || "Unknown",
              rank: presence.rank || null,
              email: presence.email || "",
              isHost: presence.isHost || false,
              isOnline: true,
              status: presence.status,
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
          optionsRef.current.onStateChange(payload.state as SectionWorkspaceState);
        }
      });

      // Handle join request broadcast (for hosts)
      channel.on("broadcast", { event: "join_request" }, ({ payload }) => {
        const request = payload as JoinRequest;
        setJoinRequests((prev) => {
          // Avoid duplicates
          if (prev.some((r) => r.oderId === request.oderId)) return prev;
          return [...prev, request];
        });
        if (optionsRef.current.onJoinRequest) {
          optionsRef.current.onJoinRequest(request);
        }
      });

      // Handle join approval broadcast (for requesters)
      channel.on("broadcast", { event: "join_approved" }, ({ payload }) => {
        if (payload.oderId === myOderId) {
          setJoinStatus("approved");
          if (optionsRef.current.onJoinApproved) {
            optionsRef.current.onJoinApproved();
          }
          // Re-track presence with approved status
          channel.track({
            oderId: myOderId,
            fullName: profile?.full_name || "Unknown",
            rank: profile?.rank || null,
            email: profile?.email || "",
            isHost: false,
            status: "approved",
          });
        }
        // Remove from join requests list
        setJoinRequests((prev) => prev.filter((r) => r.oderId !== payload.oderId));
      });

      // Handle join rejection broadcast (for requesters)
      channel.on("broadcast", { event: "join_rejected" }, ({ payload }) => {
        if (payload.oderId === myOderId) {
          setJoinStatus("rejected");
          if (optionsRef.current.onJoinRejected) {
            optionsRef.current.onJoinRejected();
          }
        }
        // Remove from join requests list
        setJoinRequests((prev) => prev.filter((r) => r.oderId !== payload.oderId));
      });

      // Handle session end broadcast
      channel.on("broadcast", { event: "session_ended" }, () => {
        setSession(null);
        setIsHost(false);
        setCollaborators([]);
        setJoinRequests([]);
        setJoinStatus(null);
        setActiveSession(null);
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }
        if (activityIntervalRef.current) {
          clearInterval(activityIntervalRef.current);
          activityIntervalRef.current = null;
        }
      });

      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            fullName: profile?.full_name || "Unknown",
            rank: profile?.rank || null,
            email: profile?.email || "",
            isHost: isHost,
          });
        }
      });

      channelRef.current = channel;
    },
    [profile, supabase, isHost]
  );

  // Start editing (create session)
  const startEditing = useCallback(
    async (initialState?: Partial<SectionWorkspaceState>): Promise<string | null> => {
      if (!profile || !sectionId) {
        setError("You must be logged in to start editing");
        return null;
      }

      // First check if someone else is already editing
      const existing = await checkActiveSession();
      if (existing && !existing.isOwnSession) {
        setError(`${existing.hostRank ? existing.hostRank + " " : ""}${existing.hostFullName || "Someone"} is currently editing this section`);
        return null;
      }

      // If we already have our own session, rejoin it
      if (existing?.isOwnSession) {
        subscribeToSession(existing.sessionId, existing.sessionCode);
        setSession({
          id: existing.sessionId,
          section_id: sectionId,
          host_user_id: profile.id,
          session_code: existing.sessionCode,
          workspace_state: initialState as SectionWorkspaceState || { draftText: "" },
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString(),
        });
        setIsHost(true);
        return existing.sessionCode;
      }

      setIsLoading(true);
      setError(null);

      try {
        const workspaceState: SectionWorkspaceState = {
          draftText: initialState?.draftText || "",
          cursorPosition: initialState?.cursorPosition,
          lastEditedBy: profile.id,
        };

        const { data: newSession, error: createError } = await supabase
          .from("epb_section_editing_sessions")
          .insert({
            section_id: sectionId,
            host_user_id: profile.id,
            workspace_state: workspaceState,
          } as never)
          .select()
          .single();

        if (createError || !newSession) throw createError || new Error("Failed to create session");

        const typedSession = newSession as unknown as SectionEditingSession;

        // Add host as participant
        await supabase.from("epb_section_editing_participants").insert({
          session_id: typedSession.id,
          user_id: profile.id,
          is_host: true,
        } as never);

        setSession(typedSession);
        setIsHost(true);

        // Subscribe to realtime channel
        subscribeToSession(typedSession.id, typedSession.session_code);

        // Start activity heartbeat (every 5 minutes)
        activityIntervalRef.current = setInterval(() => {
          supabase
            .from("epb_section_editing_sessions")
            .update({ last_activity_at: new Date().toISOString() } as never)
            .eq("id", typedSession.id)
            .then();
        }, 5 * 60 * 1000);

        return typedSession.session_code;
      } catch (err) {
        console.error("Failed to start editing:", err);
        setError("Failed to start editing session");
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [profile, sectionId, supabase, subscribeToSession, checkActiveSession]
  );

  // Request to join an existing session (requires host approval)
  const requestToJoin = useCallback(
    async (code?: string): Promise<boolean> => {
      if (!profile) {
        setError("You must be logged in to join a session");
        return false;
      }

      // Use provided code or the active session's code
      const sessionCode = code || activeSession?.sessionCode;
      if (!sessionCode) {
        setError("No session code provided");
        return false;
      }

      setIsLoading(true);
      setError(null);
      setJoinStatus("pending");

      try {
        // Find session by code
        const { data: existingSession, error: findError } = await supabase
          .from("epb_section_editing_sessions")
          .select("*")
          .eq("session_code", sessionCode.toUpperCase())
          .eq("is_active", true)
          .single();

        if (findError || !existingSession) {
          setError("Session not found or has expired");
          setJoinStatus(null);
          return false;
        }

        const typedSession = existingSession as unknown as SectionEditingSession;

        // Check if already a participant
        const { data: existingParticipant } = await supabase
          .from("epb_section_editing_participants")
          .select("id, status")
          .eq("session_id", typedSession.id)
          .eq("user_id", profile.id)
          .is("left_at", null)
          .single() as { data: { id: string; status: ParticipantStatus } | null; error: Error | null };

        let oderId: string;

        if (existingParticipant) {
          oderId = existingParticipant.id;
          setJoinStatus(existingParticipant.status as ParticipantStatus);
          
          // If already approved, just rejoin
          if (existingParticipant.status === "approved") {
            setSession(typedSession);
            setMyOderId(oderId);
            subscribeToSession(typedSession.id, typedSession.session_code);
            return true;
          }
        } else {
          // Create pending participant record
          const { data: newParticipant, error: joinError } = await supabase
            .from("epb_section_editing_participants")
            .insert({
              session_id: typedSession.id,
              user_id: profile.id,
              is_host: false,
              status: "pending",
            } as never)
            .select("id")
            .single() as { data: { id: string } | null; error: Error | null };

          if (joinError || !newParticipant) throw joinError;
          oderId = newParticipant.id;
        }

        setSession(typedSession);
        setMyOderId(oderId);

        // Subscribe to realtime channel to listen for approval
        subscribeToSession(typedSession.id, typedSession.session_code);

        // Broadcast join request to host
        if (channelRef.current) {
          await channelRef.current.send({
            type: "broadcast",
            event: "join_request",
            payload: {
              oderId,
              userId: profile.id,
              fullName: profile.full_name || "Unknown",
              rank: profile.rank || null,
              requestedAt: new Date().toISOString(),
            } as JoinRequest,
          });
        }

        // Track presence with pending status
        if (channelRef.current) {
          await channelRef.current.track({
            oderId,
            fullName: profile.full_name || "Unknown",
            rank: profile.rank || null,
            email: profile.email || "",
            isHost: false,
            status: "pending",
          });
        }

        return true;
      } catch (err) {
        console.error("Failed to request to join session:", err);
        setError("Failed to request to join editing session");
        setJoinStatus(null);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [profile, supabase, subscribeToSession, activeSession]
  );

  // Approve a join request (host only)
  const approveJoinRequest = useCallback(
    async (oderId: string): Promise<void> => {
      if (!session || !isHost) return;

      try {
        // Update participant status in database
        await supabase
          .from("epb_section_editing_participants")
          .update({ status: "approved" } as never)
          .eq("id", oderId);

        // Broadcast approval to the requester
        if (channelRef.current) {
          await channelRef.current.send({
            type: "broadcast",
            event: "join_approved",
            payload: { oderId },
          });
        }

        // Remove from local join requests
        setJoinRequests((prev) => prev.filter((r) => r.oderId !== oderId));
      } catch (err) {
        console.error("Failed to approve join request:", err);
      }
    },
    [session, isHost, supabase]
  );

  // Reject a join request (host only)
  const rejectJoinRequest = useCallback(
    async (oderId: string): Promise<void> => {
      if (!session || !isHost) return;

      try {
        // Update participant status in database
        await supabase
          .from("epb_section_editing_participants")
          .update({ status: "rejected", left_at: new Date().toISOString() } as never)
          .eq("id", oderId);

        // Broadcast rejection to the requester
        if (channelRef.current) {
          await channelRef.current.send({
            type: "broadcast",
            event: "join_rejected",
            payload: { oderId },
          });
        }

        // Remove from local join requests
        setJoinRequests((prev) => prev.filter((r) => r.oderId !== oderId));
      } catch (err) {
        console.error("Failed to reject join request:", err);
      }
    },
    [session, isHost, supabase]
  );

  // Leave session without ending it
  const leaveSession = useCallback(async () => {
    if (!session || !profile) return;

    try {
      // Mark participation as left
      await supabase
        .from("epb_section_editing_participants")
        .update({ left_at: new Date().toISOString() } as never)
        .eq("session_id", session.id)
        .eq("user_id", profile.id);

      // If host leaving, end the session
      if (isHost) {
        await supabase
          .from("epb_section_editing_sessions")
          .update({ is_active: false } as never)
          .eq("id", session.id);

        // Broadcast session end
        if (channelRef.current) {
          await channelRef.current.send({
            type: "broadcast",
            event: "session_ended",
            payload: {},
          });
        }
      }

      // Unsubscribe from channel
      if (channelRef.current) {
        await channelRef.current.untrack();
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      // Clear activity interval
      if (activityIntervalRef.current) {
        clearInterval(activityIntervalRef.current);
        activityIntervalRef.current = null;
      }

      setSession(null);
      setIsHost(false);
      setCollaborators([]);
      setActiveSession(null);
    } catch (err) {
      console.error("Failed to leave session:", err);
    }
  }, [session, profile, supabase, isHost]);

  // End session (host only)
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
        .from("epb_section_editing_sessions")
        .update({ is_active: false } as never)
        .eq("id", session.id);

      // Clean up
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      if (activityIntervalRef.current) {
        clearInterval(activityIntervalRef.current);
        activityIntervalRef.current = null;
      }

      setSession(null);
      setIsHost(false);
      setCollaborators([]);
      setActiveSession(null);
    } catch (err) {
      console.error("Failed to end session:", err);
    }
  }, [session, isHost, supabase]);

  // Broadcast state changes to all participants
  const broadcastState = useCallback(
    (state: Partial<SectionWorkspaceState>) => {
      if (!channelRef.current || !session) return;

      // Merge with existing state
      const newState: SectionWorkspaceState = {
        ...session.workspace_state,
        ...state,
        lastEditedBy: profile?.id,
      };

      // Broadcast to other participants
      channelRef.current.send({
        type: "broadcast",
        event: "state_update",
        payload: { state: newState },
      });

      // Also update in database
      supabase
        .from("epb_section_editing_sessions")
        .update({ workspace_state: newState, last_activity_at: new Date().toISOString() } as never)
        .eq("id", session.id)
        .then(() => {
          setSession((prev) => (prev ? { ...prev, workspace_state: newState } : null));
        });
    },
    [session, supabase, profile]
  );

  // Manual activity update
  const updateActivity = useCallback(() => {
    if (!session) return;

    supabase
      .from("epb_section_editing_sessions")
      .update({ last_activity_at: new Date().toISOString() } as never)
      .eq("id", session.id)
      .then();
  }, [session, supabase]);

  return {
    session,
    isHost,
    isInSession: !!session && joinStatus === "approved",
    isLoading,
    error,
    activeSession,
    checkingActive,
    collaborators,
    joinRequests,
    joinStatus,
    startEditing,
    requestToJoin,
    leaveSession,
    endSession,
    checkActiveSession,
    approveJoinRequest,
    rejectJoinRequest,
    broadcastState,
    updateActivity,
  };
}

