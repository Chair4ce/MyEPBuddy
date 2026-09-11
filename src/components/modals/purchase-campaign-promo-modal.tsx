"use client";

import { useRef } from "react";
import { Plane } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { celebrateEntry } from "@/lib/confetti";
import {
  featuredSaleTokens,
  formatCampaignEndsAt,
  type PurchaseCampaignOffer,
} from "@/lib/billing/purchase-campaign";
import { PURCHASE_CREDITS, PURCHASE_PRICE_USD } from "@/lib/billing/constants";
import { formatInteger } from "@/lib/format";
import { motionPressOnly } from "@/lib/motion/classes";
import { cn } from "@/lib/utils";

type PurchaseCampaignPromoModalProps = {
  open: boolean;
  campaign: PurchaseCampaignOffer;
  onDismiss: () => void;
  onOpenDrawer: () => void;
};

export function PurchaseCampaignPromoModal({
  open,
  campaign,
  onDismiss,
  onOpenDrawer,
}: PurchaseCampaignPromoModalProps) {
  const celebrated = useRef(false);
  const saleTokens = featuredSaleTokens(campaign.bonusCredits);

  function handleOpenAutoFocus() {
    if (celebrated.current) return;
    celebrated.current = true;
    celebrateEntry();
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) onDismiss();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        size="sm"
        className="gap-0 p-0"
        onOpenAutoFocus={handleOpenAutoFocus}
        aria-describedby="purchase-campaign-promo-desc"
      >
        <div className="flex flex-col gap-5 p-6 md:p-8">
          <DialogHeader className="flex flex-col items-center gap-3 text-center sm:text-center">
            <div
              className="flex size-11 items-center justify-center rounded-full bg-primary/10"
              aria-hidden="true"
            >
              <Plane className="size-5 text-primary" />
            </div>
            <DialogTitle className="text-base md:text-lg">
              {campaign.title}
            </DialogTitle>
            <DialogDescription
              id="purchase-campaign-promo-desc"
              className="text-sm text-muted-foreground"
            >
              {campaign.subtitle} Ends {formatCampaignEndsAt(campaign.endsAt)}.
              One bonus per account.
            </DialogDescription>
          </DialogHeader>

          <p className="text-center text-sm font-medium tabular-nums">
            Buy {formatInteger(PURCHASE_CREDITS)} tokens for $
            {PURCHASE_PRICE_USD} — get {formatInteger(saleTokens)} this weekend
          </p>

          <DialogFooter className="flex flex-col gap-2 sm:flex-col">
            <Button
              type="button"
              className={cn("w-full", motionPressOnly)}
              onClick={onOpenDrawer}
              aria-label="Open tokens drawer to claim the birthday bonus"
            >
              Get {formatInteger(saleTokens)} tokens
            </Button>
            <Button
              type="button"
              variant="ghost"
              className={cn("w-full", motionPressOnly)}
              onClick={onDismiss}
            >
              Maybe later
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Find this anytime on Tokens left
            </p>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
