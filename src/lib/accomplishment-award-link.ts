/**
 * Pure helpers for linking awards to accomplishments (authz checks).
 */

export type AwardRecipientRow = {
  id: string;
  recipient_profile_id: string | null;
  recipient_team_member_id: string | null;
};

/**
 * Ensure every award belongs to the accomplishment ratee
 * (profile XOR managed member).
 */
export function awardsMatchRatee(
  awards: AwardRecipientRow[],
  expectedIds: string[],
  rateeUserId: string | null,
  rateeTeamMemberId: string | null
): { ok: true } | { ok: false; error: string } {
  const unique = [...new Set(expectedIds)];
  if (unique.length === 0) return { ok: true };

  if (awards.length !== unique.length) {
    return { ok: false, error: "One or more awards were not found" };
  }

  const byId = new Map(awards.map((a) => [a.id, a]));
  for (const id of unique) {
    const row = byId.get(id);
    if (!row) {
      return { ok: false, error: "One or more awards were not found" };
    }
    const matchesProfile =
      !!rateeUserId &&
      !!row.recipient_profile_id &&
      row.recipient_profile_id === rateeUserId;
    const matchesManaged =
      !!rateeTeamMemberId &&
      !!row.recipient_team_member_id &&
      row.recipient_team_member_id === rateeTeamMemberId;
    if (!matchesProfile && !matchesManaged) {
      return {
        ok: false,
        error: "Cannot link an award that does not belong to this ratee",
      };
    }
  }

  return { ok: true };
}
