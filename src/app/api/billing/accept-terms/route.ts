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

  const schema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("trialIntro"), trialIntroSeen: z.literal(true) }),
    z.object({
      kind: z.literal("earnTokensIntro"),
      earnTokensIntroSeen: z.literal(true),
    }),
  ]);

  const legacyTrial = z.object({ trialIntroSeen: z.literal(true) }).safeParse(body);
  const legacyEarn = z
    .object({ earnTokensIntroSeen: z.literal(true) })
    .safeParse(body);
  const parsed = schema.safeParse(body);

  const seenAt = new Date().toISOString();

  if (legacyTrial.success) {
    const { error } = await supabase
      .from("profiles")
      .update({ trial_intro_seen_at: seenAt } as never)
      .eq("id", user.id);

    if (error) {
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }

    return NextResponse.json({ trialIntroSeenAt: seenAt });
  }

  if (legacyEarn.success) {
    const { error } = await supabase
      .from("profiles")
      .update({ earn_tokens_intro_seen_at: seenAt } as never)
      .eq("id", user.id);

    if (error) {
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }

    return NextResponse.json({ earnTokensIntroSeenAt: seenAt });
  }

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (parsed.data.kind === "trialIntro") {
    const { error } = await supabase
      .from("profiles")
      .update({ trial_intro_seen_at: seenAt } as never)
      .eq("id", user.id);

    if (error) {
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }

    return NextResponse.json({ trialIntroSeenAt: seenAt });
  }

  const { error } = await supabase
    .from("profiles")
    .update({ earn_tokens_intro_seen_at: seenAt } as never)
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }

  return NextResponse.json({ earnTokensIntroSeenAt: seenAt });
}
