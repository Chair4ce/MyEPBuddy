import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getUsageStats } from "@/lib/usage-tracker";
import { getKeyStatus } from "@/app/actions/api-keys";
import {
  MAX_PURCHASE_PACKS,
  MIN_PURCHASE_PACKS,
  PURCHASE_CREDITS,
  PURCHASE_PRICE_USD,
} from "@/lib/billing/constants";
import {
  parseViewerTimeZone,
  VIEWER_TIMEZONE_HEADER,
} from "@/lib/billing/purchase-campaign";
import { getVisiblePurchaseCampaign } from "@/lib/billing/purchase-campaign-server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [stats, keyStatus, profileResult, purchaseCampaign] = await Promise.all([
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
                earn_tokens_intro_seen_at: string | null;
                purchase_campaign_promo_seen_slug: string | null;
              } | null;
              error: unknown;
            }>;
          };
        };
      };
    })
      .from("profiles")
      .select(
        "billing_terms_accepted_at, trial_intro_seen_at, earn_tokens_intro_seen_at, purchase_campaign_promo_seen_slug",
      )
      .eq("id", user.id)
      .single(),
    getVisiblePurchaseCampaign(user.id, {
      timeZone: parseViewerTimeZone(
        request.headers.get(VIEWER_TIMEZONE_HEADER),
      ),
    }),
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
    earnTokensIntroSeen: !!profile?.earn_tokens_intro_seen_at,
    purchaseCampaignPromoSeenSlug:
      profile?.purchase_campaign_promo_seen_slug ?? null,
    purchasePackage: {
      credits: PURCHASE_CREDITS,
      priceUsd: PURCHASE_PRICE_USD,
      minPacks: MIN_PURCHASE_PACKS,
      maxPacks: MAX_PURCHASE_PACKS,
      incrementCredits: PURCHASE_CREDITS,
    },
    purchaseCampaign,
  });
}
