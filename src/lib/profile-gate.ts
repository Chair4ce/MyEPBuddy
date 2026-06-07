import type { Profile } from "@/types/database";

/**
 * Profile used for blocking modals (terms, trial intro). Prefer the server-rendered
 * profile when the client store is empty or belongs to a different user — stale
 * zustand state otherwise lets secondary modals flash before OPSEC consent.
 */
export function getGateProfile(
  serverProfile: Profile | null,
  storeProfile: Profile | null
): Profile | null {
  if (!serverProfile) return storeProfile;
  if (!storeProfile || storeProfile.id !== serverProfile.id) return serverProfile;
  return storeProfile;
}
