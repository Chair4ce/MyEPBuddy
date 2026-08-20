import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { ResendSendError } from "@/lib/email/resend";
import { syncResendMarketingContact } from "@/lib/email/resend-contacts";
import type { Profile } from "@/types/database";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let optedIn: boolean;
  try {
    const body = (await request.json()) as { optedIn?: unknown };
    if (typeof body.optedIn !== "boolean") {
      return NextResponse.json(
        { error: "optedIn must be a boolean" },
        { status: 400 }
      );
    }
    optedIn = body.optedIn;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const optedAt = new Date().toISOString();

  try {
    await syncResendMarketingContact({
      email: user.email,
      optedIn,
    });
  } catch (error) {
    console.error("Resend marketing contact sync failed:", error);
    const message =
      error instanceof ResendSendError
        ? "Could not update the email list. Try again."
        : "Could not update the email list. Try again.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
  const { data, error } = await supabase
    .from("profiles")
    .update({
      marketing_email_opt_in: optedIn,
      marketing_email_opt_in_at: optedAt,
      marketing_email_opt_in_source: "settings",
    } as never)
    .eq("id", user.id)
    .select("marketing_email_opt_in, marketing_email_opt_in_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Failed to save preference" }, { status: 500 });
  }

  const saved = data as Pick<
    Profile,
    "marketing_email_opt_in" | "marketing_email_opt_in_at"
  >;

  return NextResponse.json({
    marketingEmailOptIn: saved.marketing_email_opt_in,
    marketingEmailOptInAt: saved.marketing_email_opt_in_at,
  });
}
