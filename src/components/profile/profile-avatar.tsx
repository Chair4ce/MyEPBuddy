import { RankInsignia } from "@/components/rank/rank-insignia";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { hasRankInsignia } from "@/lib/rank-insignia";
import {
  getProfilePhotoUrl,
  isRankInsigniaAvatar,
} from "@/lib/profile-avatar";
import { cn, getInitials } from "@/lib/utils";
import type { Profile } from "@/types/database";

type ProfileAvatarProfile = Pick<
  Profile,
  "avatar_url" | "rank" | "full_name" | "email" | "first_name" | "last_name"
>;

interface ProfileAvatarProps {
  profile: ProfileAvatarProfile | null | undefined;
  className?: string;
  fallbackClassName?: string;
  imageClassName?: string;
  alt?: string;
}

export function ProfileAvatar({
  profile,
  className,
  fallbackClassName,
  imageClassName,
  alt,
}: ProfileAvatarProps) {
  const initials =
    getInitials(profile) || profile?.email?.charAt(0).toUpperCase() || "U";
  const useRankInsignia =
    isRankInsigniaAvatar(profile?.avatar_url) &&
    hasRankInsignia(profile?.rank);
  const photoUrl = getProfilePhotoUrl(profile?.avatar_url);
  const label = alt || profile?.full_name || "User";

  return (
    <Avatar className={className}>
      {useRankInsignia ? (
        <AvatarFallback
          className={cn(
            "bg-transparent p-1.5 text-primary",
            fallbackClassName
          )}
          aria-label={`${profile?.rank} rank insignia profile photo`}
        >
          <RankInsignia rank={profile?.rank} size="avatar" />
        </AvatarFallback>
      ) : (
        <>
          <AvatarImage
            src={photoUrl}
            alt={label}
            className={imageClassName}
          />
          <AvatarFallback className={fallbackClassName}>
            {initials}
          </AvatarFallback>
        </>
      )}
    </Avatar>
  );
}
