import type { Rank } from "@/types/database";

/**
 * Resolve the ACA ratee rank for an accomplishment.
 * Managed-member entries store the supervisor on `user_id` and the ratee on
 * `team_member_id` — never use the supervisor profile rank for those rows.
 */
export function resolveAccomplishmentRateeRank(input: {
  teamMemberId: string | null | undefined;
  managedMemberRank: Rank | string | null | undefined;
  ownerProfileRank: Rank | string | null | undefined;
}): Rank | string | null {
  if (input.teamMemberId) {
    return input.managedMemberRank ?? null;
  }
  return input.ownerProfileRank ?? null;
}
