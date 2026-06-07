import { createClient } from "@/lib/supabase/client";
import { isCivilian, isEnlisted, isOfficer } from "@/lib/constants";
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
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return null;
  }

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id, email, full_name, rank")
    .eq("email", normalizedEmail)
    .maybeSingle();

  const profile = existingProfile as ExistingUserMatch | null;
  if (!profile) {
    return null;
  }

  return {
    id: profile.id,
    email: profile.email || normalizedEmail,
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

  if (existingMatch && !skipAutoSupervise) {
    const { error: requestError } = await supabase.from("team_requests").insert({
      requester_id: input.supervisorId,
      target_id: existingMatch.id,
      request_type: "supervise",
      message: `I've added you as a team member. Please accept this request to link your account and sync any entries I've created for you.`,
    } as never);

    if (requestError && requestError.code !== "23505") {
      console.error("Error sending team request:", requestError);
    }
  }

  return { member, existingMatch };
}
