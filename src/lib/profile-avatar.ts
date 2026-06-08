/** Stored in profiles.avatar_url when the user selects their rank insignia as their photo. */
export const RANK_INSIGNIA_AVATAR_URL = "myepbuddy://avatar/rank-insignia";

export function isRankInsigniaAvatar(
  avatarUrl: string | null | undefined
): boolean {
  return avatarUrl === RANK_INSIGNIA_AVATAR_URL;
}

export function isStorageAvatarUrl(
  avatarUrl: string | null | undefined
): boolean {
  return Boolean(avatarUrl?.includes("/storage/v1/object/"));
}

export function getProfilePhotoUrl(
  avatarUrl: string | null | undefined
): string | undefined {
  if (!avatarUrl || isRankInsigniaAvatar(avatarUrl)) return undefined;
  return avatarUrl;
}

export function getStorageAvatarPath(
  avatarUrl: string | null | undefined
): string | null {
  if (!avatarUrl || !isStorageAvatarUrl(avatarUrl)) return null;
  return avatarUrl.split("/avatars/")[1]?.split("?")[0] ?? null;
}

export function hasProfilePhoto(
  avatarUrl: string | null | undefined
): boolean {
  return Boolean(avatarUrl);
}
