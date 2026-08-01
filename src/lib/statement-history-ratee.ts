/**
 * `statement_history.ratee_id` FK → profiles. For managed (non-account) ratees,
 * store the supervising user as ratee_id and the member id on team_member_id.
 */
export function statementHistoryRateeFields(
  userId: string,
  rateeId: string | undefined,
  isManagedMember: boolean
): { ratee_id: string; team_member_id: string | null } {
  if (isManagedMember && rateeId) {
    return { ratee_id: userId, team_member_id: rateeId };
  }
  return { ratee_id: rateeId || userId, team_member_id: null };
}
