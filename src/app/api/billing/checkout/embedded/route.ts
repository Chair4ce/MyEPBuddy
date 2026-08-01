import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { createEmbeddedCreditsCheckoutSession } from "@/lib/stripe/server";
import { parsePurchasePacks } from "@/lib/billing/purchase-quantity";
import { MIN_PURCHASE_PACKS } from "@/lib/billing/constants";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_CHECKOUT_ATTEMPTS = 5;

type RateLimitRecord = { count: number; resetAt: number };
const checkoutRateLimits = new Map<string, RateLimitRecord>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const record = checkoutRateLimits.get(userId);

  if (!record || now > record.resetAt) {
    checkoutRateLimits.set(userId, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return true;
  }

  if (record.count >= MAX_CHECKOUT_ATTEMPTS) {
    return false;
  }

  record.count += 1;
  return true;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!checkRateLimit(user.id)) {
    return NextResponse.json(
      { error: "Too many checkout attempts. Please wait a moment." },
      { status: 429 },
    );
  }

  let packs = MIN_PURCHASE_PACKS;
  try {
    const body = (await request.json()) as { packs?: unknown };
    const parsed = parsePurchasePacks(body.packs ?? MIN_PURCHASE_PACKS);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    packs = parsed.packs;
  } catch {
    // Empty / non-JSON body → default to one pack (backward compatible).
    packs = MIN_PURCHASE_PACKS;
  }

  const { data: profile, error: profileError } = await (supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          single: () => Promise<{
            data: { billing_terms_accepted_at: string | null } | null;
            error: unknown;
          }>;
        };
      };
    };
  })
    .from("profiles")
    .select("billing_terms_accepted_at")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.billing_terms_accepted_at) {
    return NextResponse.json(
      {
        error: "Please accept the AI tokens terms before purchasing credits.",
        errorCode: "billing_terms_required",
      },
      { status: 403 },
    );
  }

  try {
    const clientSecret = await createEmbeddedCreditsCheckoutSession({
      userId: user.id,
      email: user.email,
      packs,
    });

    return NextResponse.json({ clientSecret, packs });
  } catch (error) {
    console.error("[billing/checkout/embedded]", error);
    return NextResponse.json(
      { error: "Unable to start checkout. Please try again later." },
      { status: 500 },
    );
  }
}
