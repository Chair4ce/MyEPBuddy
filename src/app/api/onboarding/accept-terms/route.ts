import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { syncResendMarketingContact } from "@/lib/email/resend-contacts";
import {
  isMarketingEmailOptInTrue,
  onboardingMarketingPreferenceUpdate,
  type MarketingEmailOptInSource,
} from "@/lib/marketing-email-opt-in";
import type { Profile } from "@/types/database";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let marketingEmailOptIn: boolean | undefined;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const body = (await request.json()) as { marketingEmailOptIn?: unknown };
      if (typeof body.marketingEmailOptIn === "boolean") {
        marketingEmailOptIn = body.marketingEmailOptIn;
      } else if (body.marketingEmailOptIn !== undefined) {
        marketingEmailOptIn = isMarketingEmailOptInTrue(body.marketingEmailOptIn);
      }
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
  }

  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("marketing_email_opt_in")
    .eq("id", user.id)
    .single();
  const currentOptIn =
    (currentProfile as Pick<Profile, "marketing_email_opt_in"> | null)
      ?.marketing_email_opt_in ?? null;

  const acceptedAt = new Date().toISOString();
  const update: {
    terms_accepted_at: string;
    marketing_email_opt_in?: boolean;
    marketing_email_opt_in_at?: string;
    marketing_email_opt_in_source?: MarketingEmailOptInSource;
  } = { terms_accepted_at: acceptedAt };

  let persistedMarketing: boolean | "unchanged" = "unchanged";
  let marketingSyncFailed = false;
  if (typeof marketingEmailOptIn === "boolean") {
    persistedMarketing = onboardingMarketingPreferenceUpdate(
      currentOptIn,
      marketingEmailOptIn
    );
  }

  if (persistedMarketing !== "unchanged") {
    try {
      await syncResendMarketingContact({
        email: user.email,
        optedIn: persistedMarketing,
      });
      update.marketing_email_opt_in = persistedMarketing;
      update.marketing_email_opt_in_at = acceptedAt;
      update.marketing_email_opt_in_source = "onboarding";
    } catch (syncError) {
      console.error("Resend marketing contact sync failed:", syncError);
      persistedMarketing = "unchanged";
      marketingSyncFailed = true;
    }
  }

  const { error } = await supabase
    .from("profiles")
    .update(update as never)
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: "Failed to save acceptance" }, { status: 500 });
  }

  const marketingEmailOptInResult =
    persistedMarketing === "unchanged"
      ? currentOptIn
      : persistedMarketing;

  return NextResponse.json({
    termsAcceptedAt: acceptedAt,
    marketingEmailOptIn: marketingEmailOptInResult,
    ...(marketingSyncFailed
      ? {
          warning:
            "Saved your acknowledgment. If reminder emails do not match this choice, change it in Settings → Email preferences.",
        }
      : {}),
  });
}
