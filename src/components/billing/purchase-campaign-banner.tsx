"use client";

import { Plane } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  featuredSaleTokens,
  formatCampaignEndsAt,
  type PurchaseCampaignOffer,
} from "@/lib/billing/purchase-campaign";
import { PURCHASE_CREDITS, PURCHASE_PRICE_USD } from "@/lib/billing/constants";
import { formatInteger } from "@/lib/format";
import {
  motionEnter,
  motionEnterDurNormal,
  motionSurfaceCard,
} from "@/lib/motion/classes";

type PurchaseCampaignBannerProps = {
  campaign: PurchaseCampaignOffer;
  className?: string;
};

export function PurchaseCampaignBanner({
  campaign,
  className,
}: PurchaseCampaignBannerProps) {
  const endsLabel = formatCampaignEndsAt(campaign.endsAt);
  const saleTokens = featuredSaleTokens(campaign.bonusCredits);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        motionEnter,
        motionEnterDurNormal,
        motionSurfaceCard,
        "rounded-lg bg-primary/5 p-4",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className="size-10 shrink-0 rounded-full bg-primary/10 flex items-center justify-center"
          aria-hidden="true"
        >
          <Plane className="size-5 text-primary" />
        </div>
        <div className="min-w-0 flex flex-col gap-1">
          <p className="text-sm font-medium">{campaign.title}</p>
          {campaign.claimed ? (
            <p className="text-sm text-muted-foreground leading-relaxed">
              Birthday bonus claimed. List price stays $
              {PURCHASE_PRICE_USD} per {formatInteger(PURCHASE_CREDITS)} tokens.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {campaign.subtitle}
              </p>
              <p className="text-xs text-muted-foreground">
                One bonus per account · ends {endsLabel} ·{" "}
                {formatInteger(saleTokens)} tokens if you buy one pack
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
