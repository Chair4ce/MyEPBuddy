import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getUsageStats } from "@/lib/usage-tracker";
import { getKeyStatus } from "@/app/actions/api-keys";
import { PURCHASE_CREDITS, PURCHASE_PRICE_USD } from "@/lib/billing/constants";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [stats, keyStatus, profileResult] = await Promise.all([
      getUsageStats(user.id),
      getKeyStatus(),
      (supabase as unknown as {
        from: (table: string) => {
          select: (cols: string) => {
            eq: (col: string, val: string) => {
              single: () => Promise<{
                data: {
                  billing_terms_accepted_at: string | null;
                  trial_intro_seen_at: string | null;
                } | null;
                error: unknown;
              }>;
            };
          };
        };
      })
        .from("profiles")
        .select("billing_terms_accepted_at, trial_intro_seen_at")
        .eq("id", user.id)
        .single(),
    ]);

  const hasOwnKey =
    keyStatus.openai_key ||
    keyStatus.anthropic_key ||
    keyStatus.google_key ||
    keyStatus.grok_key;

  const profile = profileResult.data;

  return NextResponse.json({
    ...stats,
    hasOwnKey,
    billingTermsAccepted: !!profile?.billing_terms_accepted_at,
    trialIntroSeen: !!profile?.trial_intro_seen_at,
    purchasePackage: {
      credits: PURCHASE_CREDITS,
      priceUsd: PURCHASE_PRICE_USD,
    },
  });
}
