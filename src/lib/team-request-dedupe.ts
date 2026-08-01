import type { TeamRequest } from "@/types/database";

/**
 * When a managed-account link already asks the invitee to accept the same
 * supervisor, hide the parallel Team-page supervise request so they only
 * consent once (dashboard Account Link card).
 */
export function filterSuperviseRequestsCoveredByManagedLinks(
  requests: TeamRequest[],
  coveredSupervisorIds: ReadonlySet<string>
): TeamRequest[] {
  return requests.filter((request) => {
    if (request.request_type !== "supervise") return true;
    return !coveredSupervisorIds.has(request.requester_id);
  });
}

export function coveredSupervisorIdsFromPendingLinks(
  rows: Array<{
    team_members?:
      | { supervisor_id?: string | null }
      | Array<{ supervisor_id?: string | null }>
      | null;
  }> | null | undefined
): Set<string> {
  const ids = new Set<string>();
  for (const row of rows ?? []) {
    const tm = row.team_members;
    const supervisorId = Array.isArray(tm)
      ? tm[0]?.supervisor_id
      : tm?.supervisor_id;
    if (supervisorId) ids.add(supervisorId);
  }
  return ids;
}
