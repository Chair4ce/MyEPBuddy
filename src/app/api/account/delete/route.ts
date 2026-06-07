import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/server";
import { isValidExitReason, sanitizeComments } from "@/lib/account-deletion";
import type { Profile } from "@/types/database";

const MAX_DELETIONS_PER_HOUR = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const SURVEY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

type RateLimitRecord = {
  count: number;
  resetAt: number;
};

const deletionRateLimits = new Map<string, RateLimitRecord>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const record = deletionRateLimits.get(userId);

  if (!record || now > record.resetAt) {
    deletionRateLimits.set(userId, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return true;
  }

  if (record.count >= MAX_DELETIONS_PER_HOUR) {
    return false;
  }

  record.count += 1;
  return true;
}

async function deleteUserAvatars(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data: files, error } = await admin.storage.from("avatars").list(userId);
  if (error || !files?.length) return;

  const paths = files.map((file) => `${userId}/${file.name}`);
  await admin.storage.from("avatars").remove(paths);
}

async function deleteStripeCustomer(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
) {
  const { data: stripeRow } = await (admin as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{
            data: { stripe_customer_id: string } | null;
            error: unknown;
          }>;
        };
      };
    };
  })
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!stripeRow?.stripe_customer_id) return;

  try {
    const stripe = getStripe();
    await stripe.customers.del(stripeRow.stripe_customer_id);
  } catch (error) {
    console.error("Failed to delete Stripe customer during account deletion:", error);
  }
}

function generateSurveyToken(): string {
  return randomBytes(32).toString("hex");
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
        { error: "Too many deletion attempts. Please try again later." },
        { status: 429 },
      );
    }

    const body = await request.json();
    const confirmation =
      typeof body.confirmation === "string" ? body.confirmation.trim() : "";
    const rawReason = typeof body.reason === "string" ? body.reason.trim() : null;
    const comments = sanitizeComments(
      typeof body.comments === "string" ? body.comments : null,
    );

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, role, avatar_url")
      .eq("id", user.id)
      .single();

    if (profileError || !profileData) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const profile = profileData as Pick<Profile, "id" | "email" | "role" | "avatar_url">;

    if (profile.role === "admin") {
      return NextResponse.json(
        { error: "Administrator accounts cannot be self-deleted. Contact support." },
        { status: 403 },
      );
    }

    const expectedConfirmation = (profile.email || user.email || "").trim().toLowerCase();
    const phoneFallback = "DELETE";
    const normalizedConfirmation = confirmation.toLowerCase();

    const isConfirmed =
      (expectedConfirmation.length > 0 &&
        normalizedConfirmation === expectedConfirmation) ||
      (expectedConfirmation.length === 0 &&
        confirmation.toUpperCase() === phoneFallback);

    if (!isConfirmed) {
      return NextResponse.json(
        {
          error: expectedConfirmation
            ? "Confirmation must match your account email exactly."
            : 'Type "DELETE" to confirm account deletion.',
        },
        { status: 400 },
      );
    }

    const admin = createAdminClient();
    const reason = isValidExitReason(rawReason) ? rawReason : null;
    const hasSurvey = Boolean(reason || comments);

    const adminTables = admin as unknown as {
      from: (table: string) => {
        insert: (row: Record<string, string | null>) => Promise<{ error: { message: string } | null }>;
      };
    };

    if (hasSurvey) {
      const { error: surveyError } = await adminTables.from("account_exit_surveys").insert({
        reason,
        comments,
        source: "deletion_dialog",
      });

      if (surveyError) {
        console.error("Failed to save exit survey:", surveyError);
      }
    }

    let surveyToken: string | null = null;
    if (!hasSurvey) {
      surveyToken = generateSurveyToken();
      const expiresAt = new Date(Date.now() + SURVEY_TOKEN_TTL_MS).toISOString();

      const { error: tokenError } = await adminTables.from("account_exit_survey_tokens").insert({
        token: surveyToken,
        expires_at: expiresAt,
      });

      if (tokenError) {
        console.error("Failed to create exit survey token:", tokenError);
        surveyToken = null;
      }
    }

    await deleteUserAvatars(admin, user.id);
    await deleteStripeCustomer(admin, user.id);

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);

    if (deleteError) {
      console.error("Failed to delete auth user:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete account. Please contact support." },
        { status: 500 },
      );
    }

    await supabase.auth.signOut();

    return NextResponse.json({
      success: true,
      surveyToken,
    });
  } catch (error) {
    console.error("Unexpected account deletion error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
