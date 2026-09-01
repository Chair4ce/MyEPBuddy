export type PendingSupervisorLink = {
  team_member: {
    supervisor: { id: string } | null;
  };
  supervisor_accepted: boolean;
};

/** Managed-account link where the signed-in user is also listed as supervisor. */
export function isSelfSupervisorManagedLink(
  link: PendingSupervisorLink,
  profileId: string | null | undefined
): boolean {
  return Boolean(profileId && link.team_member.supervisor?.id === profileId);
}

export function canAcceptSupervisorFromManagedLink(
  link: PendingSupervisorLink,
  profileId: string | null | undefined
): boolean {
  return !link.supervisor_accepted && !isSelfSupervisorManagedLink(link, profileId);
}

/** Skip pending-link / supervise request when adding your own profile. */
export function shouldCreateManagedLinkForExistingUser(
  supervisorId: string,
  existingUserId: string | null | undefined
): boolean {
  return Boolean(existingUserId && existingUserId !== supervisorId);
}
