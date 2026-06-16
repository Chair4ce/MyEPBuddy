"use client";

import Link from "next/link";
import { useState } from "react";
import { useCreditsStore } from "@/stores/credits-store";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Sparkles, Key } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import {
  PURCHASE_CREDITS,
  PURCHASE_PACKAGE_LABEL,
  PURCHASE_PRICE_USD,
} from "@/lib/billing/constants";

export function InsufficientCreditsDialog() {
  const {
    isOpen,
    closePurchaseDialog,
    billingTermsAccepted,
    setBillingTermsAccepted,
    isCheckoutLoading,
    setIsCheckoutLoading,
    openEmbeddedCheckout,
  } = useCreditsStore();

  const [termsChecked, setTermsChecked] = useState(false);

  async function handlePurchase() {
    if (!billingTermsAccepted && !termsChecked) {
      toast.error("Please accept the billing terms to continue.");
      return;
    }

    setIsCheckoutLoading(true);

    try {
      if (!billingTermsAccepted) {
        const acceptRes = await fetch("/api/billing/accept-terms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accepted: true }),
        });
        if (!acceptRes.ok) {
          throw new Error("Failed to accept billing terms");
        }
        setBillingTermsAccepted(true);
      }

      // Swap the "out of calls" dialog for in-app checkout (no redirect).
      await openEmbeddedCheckout();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Checkout failed. Try again.",
      );
    } finally {
      setIsCheckoutLoading(false);
    }
  }

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) closePurchaseDialog();
      }}
    >
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary shrink-0" />
            You&apos;re out of tokens
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4 pt-1">
              <p>
                You&apos;ve used all your tokens. Purchase more to
                keep generating statements and assessments.
              </p>

              <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                <p className="text-sm font-medium text-foreground">
                  {PURCHASE_PACKAGE_LABEL}
                </p>
                <p className="text-xs text-muted-foreground">
                  {PURCHASE_CREDITS} tokens · ${PURCHASE_PRICE_USD} one-time ·
                  never expire
                </p>
              </div>

              {!billingTermsAccepted && (
                <label
                  htmlFor="purchase-terms-checkbox"
                  className="flex items-start gap-3 rounded-lg border bg-background p-3 cursor-pointer"
                >
                  <Checkbox
                    id="purchase-terms-checkbox"
                    checked={termsChecked}
                    onCheckedChange={(checked) =>
                      setTermsChecked(checked === true)
                    }
                    className="mt-0.5"
                  />
                  <span className="text-xs leading-relaxed">
                    I agree to the{" "}
                    <Link
                      href="/billing-terms"
                      className="text-primary underline underline-offset-2"
                    >
                      AI tokens terms
                    </Link>{" "}
                    including usage policies and fee disclosure.
                  </span>
                </label>
              )}

              <div className="flex items-start gap-3 rounded-lg border p-3">
                <Key className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Prefer unlimited usage? Add your own API key in Settings — no
                  tokens needed.
                </p>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={closePurchaseDialog}
            disabled={isCheckoutLoading}
          >
            Not now
          </Button>
          <Button
            className="w-full sm:w-auto"
            onClick={handlePurchase}
            disabled={
              isCheckoutLoading ||
              (!billingTermsAccepted && !termsChecked)
            }
          >
            {isCheckoutLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Opening checkout...
              </>
            ) : (
              `Buy ${PURCHASE_CREDITS} tokens — $${PURCHASE_PRICE_USD}`
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
