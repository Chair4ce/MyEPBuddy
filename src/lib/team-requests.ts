import type { createClient } from "@/lib/supabase/client";
import type { TeamRequestType } from "@/types/database";

type BrowserSupabaseClient = ReturnType<typeof createClient>;

export type EnsurePendingTeamRequestStatus =
  | "created"
  | "already_pending"
  | "already_linked"
  | "invalid_target";

export type EnsurePendingTeamRequestResult = {
  success: boolean;
  status: EnsurePendingTeamRequestStatus;
  request_id?: string;
  request_type?: TeamRequestType;
  created_at?: string;
  supervisor_id?: string;
  subordinate_id?: string;
  error?: string;
};

export function canRequestTeamSupervision(
  actorId: string | null | undefined,
  targetId: string | null | undefined
): boolean {
  return Boolean(actorId && targetId && actorId !== targetId);
}

export function mapEnsurePendingTeamRequestPayload(
  data: unknown
): EnsurePendingTeamRequestResult {
  const result = (data ?? {}) as Partial<EnsurePendingTeamRequestResult>;

  if (result.success === false) {
    return {
      success: false,
      status: result.status === "invalid_target" ? "invalid_target" : "created",
      error: result.error ?? "Failed to send request",
    };
  }

  if (result.success !== true) {
    return { success: false, status: "created", error: "Unexpected response" };
  }

  return {
    success: true,
    status: result.status ?? "created",
    request_id: result.request_id,
    request_type: result.request_type,
    created_at: result.created_at,
    supervisor_id: result.supervisor_id,
    subordinate_id: result.subordinate_id,
  };
}

type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
};

/**
 * Create a pending team_request, or return the existing pending one.
 * Never creates a second standing request for the same pair.
 */
export async function ensurePendingTeamRequest(
  supabase: BrowserSupabaseClient,
  params: {
    targetId: string;
    requestType?: TeamRequestType;
    message?: string | null;
    actorId?: string | null;
  }
): Promise<EnsurePendingTeamRequestResult> {
  if (
    params.actorId !== undefined &&
    !canRequestTeamSupervision(params.actorId, params.targetId)
  ) {
    return {
      success: false,
      status: "invalid_target",
      error: "You cannot send a team request to yourself",
    };
  }

  const { data, error } = await (supabase as unknown as RpcClient).rpc(
    "ensure_pending_team_request",
    {
      p_target_id: params.targetId,
      p_request_type: params.requestType ?? "supervise",
      p_message: params.message ?? null,
    }
  );

  if (error) {
    return { success: false, status: "created", error: error.message };
  }

  return mapEnsurePendingTeamRequestPayload(data);
}

export async function retractPendingTeamRequest(
  supabase: BrowserSupabaseClient,
  requestId: string
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await (supabase as unknown as RpcClient).rpc(
    "retract_pending_team_request",
    { p_request_id: requestId }
  );

  if (error) {
    return { success: false, error: error.message };
  }

  const result = (data ?? {}) as { success?: boolean; status?: string };
  if (result.success === false) {
    return { success: false, error: "Failed to retract request" };
  }

  return { success: true };
}

export function pendingRequestToastMessage(
  status: EnsurePendingTeamRequestResult["status"]
): string {
  switch (status) {
    case "already_pending":
      return "A supervisor request is still pending for this person. Resend the invite or copy the shareable link from Sent Requests.";
    case "already_linked":
      return "You're already linked with this person — no new request needed.";
    case "invalid_target":
      return "You cannot send a team request to yourself.";
    default:
      return "Request sent successfully!";
  }
}
