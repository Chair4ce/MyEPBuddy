import { createClient } from "@/lib/supabase/client";
import { isCivilian, isEnlisted, isOfficer } from "@/lib/constants";
import { requestManagedMemberInvite } from "@/lib/managed-member-invite-client";
import { searchProfileByEmail } from "@/lib/profile-directory";
import { shouldCreateManagedLinkForExistingUser } from "@/lib/pending-managed-links";
import { ensurePendingTeamRequest } from "@/lib/team-requests";
import type { ManagedMember, Rank } from "@/types/database";

type BrowserSupabaseClient = ReturnType<typeof createClient>;

export interface ExistingUserMatch {
  id: string;
  email: string;
  full_name: string | null;
  rank: Rank | null;
}

export interface CreateManagedMemberInput {
  supervisorId: string;
  supervisorRank?: Rank | null;
  parentProfileId: string;
  fullName: string;
  email?: string | null;
  rank?: Rank | null;
  existingUser?: ExistingUserMatch | null;
}

export async function lookupProfileByEmail(
  supabase: BrowserSupabaseClient,
  email: string
): Promise<ExistingUserMatch | null> {
  const profile = await searchProfileByEmail(supabase, email);
  if (!profile) {
    return null;
  }

  return {
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
    rank: profile.rank,
  };
}

export async function createManagedTeamMember(
  supabase: BrowserSupabaseClient,
  input: CreateManagedMemberInput
): Promise<{ member: ManagedMember; existingMatch: ExistingUserMatch | null }> {
  const email = input.email?.trim().toLowerCase() || null;

  let existingMatch = input.existingUser ?? null;
  if (email && !existingMatch) {
    existingMatch = await lookupProfileByEmail(supabase, email);
  }

  const { data, error } = await supabase
    .from("team_members")
    .insert({
      supervisor_id: input.supervisorId,
      parent_profile_id: input.parentProfileId,
      parent_team_member_id: null,
      full_name: input.fullName.trim(),
      email,
      rank: input.rank || null,
      member_status: existingMatch ? "pending_link" : "active",
    } as never)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      if (error.message?.includes("email")) {
        throw new Error("A team member with this email already exists in your team.");
      }
      throw new Error("This team member already exists.");
    }
    throw error;
  }

  const member = data as unknown as ManagedMember;

  const subordinateIsCivilian = isCivilian(existingMatch?.rank ?? null);
  const supervisorIsMilitary =
    isOfficer(input.supervisorRank ?? null) ||
    isEnlisted(input.supervisorRank ?? null);
  const skipAutoSupervise =
    existingMatch && subordinateIsCivilian && supervisorIsMilitary;
  const isSelfExistingUser = !shouldCreateManagedLinkForExistingUser(
    input.supervisorId,
    existingMatch?.id ?? null
  ) && existingMatch != null;

  if (existingMatch && !isSelfExistingUser && !skipAutoSupervise) {
    const ensureResult = await ensurePendingTeamRequest(supabase, {
      targetId: existingMatch.id,
      requestType: "supervise",
      message: `I've added you as a team member. Please accept this request to link your account and sync any entries I've created for you.`,
    });
    if (!ensureResult.success) {
      console.error("Error ensuring team request:", ensureResult.error);
    }
  }

  if (existingMatch && !isSelfExistingUser) {
    const { error: linkError } = await (
      supabase.rpc as unknown as (
        fn: string,
        args: { p_team_member_id: string; p_user_id: string }
      ) => Promise<{ error: { message?: string } | null }>
    )("create_pending_link_for_existing_user", {
      p_team_member_id: member.id,
      p_user_id: existingMatch.id,
    });

    if (linkError) {
      console.error("Error creating pending managed link:", linkError);
    }
  }

  if (email && !isSelfExistingUser) {
    const invite = await requestManagedMemberInvite({
      teamMemberId: member.id,
      recipientEmail: email,
    });
    if (!invite.sent) {
      console.error("Managed member invite email not sent:", invite.error);
    }
  }

  return { member, existingMatch };
}
