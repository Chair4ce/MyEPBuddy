"use client";

import { FeedbackButton } from "@/components/layout/feedback-button";
import { CreditsPromoButton } from "@/components/layout/credits-promo-button";

export function FloatingActionButtons() {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      <CreditsPromoButton />
      <FeedbackButton inline />
    </div>
  );
}
