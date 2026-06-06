import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const acceptTermsSchema = z.object({
  accepted: z.literal(true),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = acceptTermsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Terms must be accepted" }, { status: 400 });
  }

  const acceptedAt = new Date().toISOString();
  const { error } = await supabase
    .from("profiles")
    .update({ billing_terms_accepted_at: acceptedAt } as never)
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: "Failed to save acceptance" }, { status: 500 });
  }

  return NextResponse.json({ billingTermsAcceptedAt: acceptedAt });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const schema = z.object({ trialIntroSeen: z.literal(true) });
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const seenAt = new Date().toISOString();
  const { error } = await supabase
    .from("profiles")
    .update({ trial_intro_seen_at: seenAt } as never)
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }

  return NextResponse.json({ trialIntroSeenAt: seenAt });
}
