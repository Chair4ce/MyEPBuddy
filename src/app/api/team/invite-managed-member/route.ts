import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripHtml } from "@/lib/email/html-safe";
import { searchProfileByEmail } from "@/lib/profile-directory";
import {
  buildManagedMemberInviteEmail,
  type ManagedMemberInviteVariant,
} from "@/lib/email/managed-member-invite";
import {
  getTransactionalFromEmail,
  sendResendEmail,
} from "@/lib/email/resend";

const MAX_EMAILS_PER_HOUR = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type RateLimitRecord = { count: number; resetAt: number };

const inviteRateLimits = new Map<string, RateLimitRecord>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const record = inviteRateLimits.get(userId);

  if (!record || now > record.resetAt) {
    inviteRateLimits.set(userId, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return true;
  }

  if (record.count >= MAX_EMAILS_PER_HOUR) {
    return false;
  }

  record.count += 1;
  return true;
}

function getSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://myepbuddy.com"
  );
}

type TeamMemberRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  supervisor_id: string;
};

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  rank: string | null;
};

function formatSupervisorDisplayName(supervisor: ProfileRow | null): string {
  const nameFromParts = [supervisor?.first_name, supervisor?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const name = supervisor?.full_name?.trim() || nameFromParts;
  const display = [supervisor?.rank, name].filter(Boolean).join(" ").trim();
  return display || "A MyEPBuddy supervisor";
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!checkRateLimit(user.id)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Maximum 20 invite emails per hour." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const teamMemberId =
      typeof body.teamMemberId === "string" ? body.teamMemberId.trim() : "";
    const rawEmail =
      typeof body.recipientEmail === "string" ? body.recipientEmail : "";
    const recipientEmail = stripHtml(rawEmail).trim().toLowerCase();

    if (!teamMemberId || !recipientEmail) {
      return NextResponse.json(
        { error: "teamMemberId and recipientEmail are required" },
        { status: 400 }
      );
    }

    if (!EMAIL_REGEX.test(recipientEmail)) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    const { data: member, error: memberError } = await supabase
      .from("team_members")
      .select("id, email, full_name, supervisor_id")
      .eq("id", teamMemberId)
      .eq("supervisor_id", user.id)
      .maybeSingle();

    if (memberError) {
      console.error("Invite managed member lookup error:", memberError);
      return NextResponse.json(
        { error: "Failed to verify team member" },
        { status: 500 }
      );
    }

    const teamMember = member as TeamMemberRow | null;
    if (!teamMember) {
      return NextResponse.json(
        { error: "Team member not found" },
        { status: 404 }
      );
    }

    const storedEmail = teamMember.email?.trim().toLowerCase() || null;
    if (!storedEmail || storedEmail !== recipientEmail) {
      return NextResponse.json(
        { error: "Email does not match this team member" },
        { status: 400 }
      );
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    const fromEmail = getTransactionalFromEmail();

    if (!resendApiKey || !fromEmail) {
      console.error(
        "Managed member invite not sent - missing RESEND_API_KEY or EMAIL_FROM/FEEDBACK_FROM_EMAIL."
      );
      return NextResponse.json(
        {
          error:
            "Email is not configured. Set RESEND_API_KEY and EMAIL_FROM (or FEEDBACK_FROM_EMAIL).",
        },
        { status: 503 }
      );
    }

    const { data: supervisorProfile } = await supabase
      .from("profiles")
      .select("id, email, full_name, first_name, last_name, rank")
      .eq("id", user.id)
      .maybeSingle();

    const supervisor = supervisorProfile as ProfileRow | null;
    const supervisorDisplayName = formatSupervisorDisplayName(supervisor);

    const existingProfile = await searchProfileByEmail(supabase, recipientEmail);

    const variant: ManagedMemberInviteVariant = existingProfile
      ? "existing_user"
      : "new_user";

    const { data: tokenResult, error: tokenError } = await (
      supabase.rpc as unknown as (
        fn: string,
        args: {
          p_team_member_id: string;
          p_invited_email: string;
          p_expires_days?: number;
        }
      ) => Promise<{
        data: { success?: boolean; token?: string; error?: string } | null;
        error: { message?: string } | null;
      }>
    )("issue_managed_member_invite_token", {
      p_team_member_id: teamMember.id,
      p_invited_email: recipientEmail,
      p_expires_days: 14,
    });

    if (tokenError || !tokenResult?.token) {
      console.error("Failed to issue managed invite token:", tokenError, tokenResult);
      return NextResponse.json(
        { error: "Failed to create invite link" },
        { status: 500 }
      );
    }

    const emailContent = buildManagedMemberInviteEmail({
      siteUrl: getSiteUrl(),
      recipientEmail,
      recipientName: teamMember.full_name,
      supervisorDisplayName,
      teamMemberId: teamMember.id,
      inviteToken: tokenResult.token,
      variant,
    });

    await sendResendEmail({
      resendApiKey,
      from: fromEmail,
      to: recipientEmail,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
      replyTo: supervisor?.email || user.email || null,
    });

    return NextResponse.json({
      success: true,
      variant,
    });
  } catch (error) {
    console.error("Managed member invite error:", error);
    return NextResponse.json(
      { error: "Failed to send invite email" },
      { status: 500 }
    );
  }
}
