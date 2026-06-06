"use client";

import { useState } from "react";
import Link from "next/link";
import { useCreditsStore } from "@/stores/credits-store";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import {
  PURCHASE_CREDITS,
  PURCHASE_PACKAGE_LABEL,
  PURCHASE_PRICE_USD,
  TRIAL_CREDITS,
} from "@/lib/billing/constants";

export function CreditsPromoButton() {
  const {
    balance,
    hasOwnKey,
    billingTermsAccepted,
    setBillingTermsAccepted,
    isCheckoutLoading,
    setIsCheckoutLoading,
    openPurchaseDialog,
  } = useCreditsStore();

  const [open, setOpen] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);

  if (hasOwnKey) return null;

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
        if (!acceptRes.ok) throw new Error("Failed to accept billing terms");
        setBillingTermsAccepted(true);
      }

      const checkoutRes = await fetch("/api/billing/checkout", { method: "POST" });
      const data = await checkoutRes.json();
      if (!checkoutRes.ok || !data.url) {
        throw new Error(data.error || "Unable to start checkout");
      }
      window.location.href = data.url;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Checkout failed. Try again.",
      );
      setIsCheckoutLoading(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="rounded-full shadow-lg gap-2 bg-background hover:bg-accent"
          aria-label="AI call credits"
        >
          <Sparkles className="size-4" />
          <span className="hidden sm:inline">
            {balance !== null ? `${balance} calls left` : "AI calls"}
          </span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>AI Call Credits</SheetTitle>
          <SheetDescription>
            Prepaid calls for generation and assessments using our default AI
            model.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5 px-1">
          <div className="rounded-lg border bg-muted/40 p-4 space-y-1">
            <p className="text-sm text-muted-foreground">Your balance</p>
            <p className="text-3xl font-bold tabular-nums">
              {balance ?? "—"}{" "}
              <span className="text-base font-normal text-muted-foreground">
                calls
              </span>
            </p>
          </div>

          <div className="space-y-2 text-sm">
            <p className="font-medium">How it works</p>
            <ul className="space-y-2 text-muted-foreground list-disc pl-5">
              <li>
                New users receive {TRIAL_CREDITS} free trial calls — one call
                per generate or assessment action.
              </li>
              <li>
                Uses our default AI model (Gemini Flash) — fast and optimized
                for EPB workflows.
              </li>
              <li>
                Purchased calls never expire. No subscription — pay only when
                you need more.
              </li>
              <li>
                Add your own API key anytime in Settings for unlimited usage
                with your provider account.
              </li>
            </ul>
          </div>

          <div className="rounded-lg border p-4 space-y-2">
            <p className="text-sm font-medium">{PURCHASE_PACKAGE_LABEL}</p>
            <p className="text-xs text-muted-foreground">
              One-time payment · {PURCHASE_CREDITS} calls · never expire
            </p>
          </div>

          {!billingTermsAccepted && (
            <label
              htmlFor="promo-terms-checkbox"
              className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer"
            >
              <Checkbox
                id="promo-terms-checkbox"
                checked={termsChecked}
                onCheckedChange={(checked) => setTermsChecked(checked === true)}
                className="mt-0.5"
              />
              <span className="text-xs leading-relaxed">
                I agree to the{" "}
                <Link
                  href="/billing-terms"
                  className="text-primary underline underline-offset-2"
                  target="_blank"
                >
                  AI billing terms
                </Link>{" "}
                and fee disclosure.
              </span>
            </label>
          )}

          <div className="flex flex-col gap-2">
            <Button
              onClick={handlePurchase}
              disabled={
                isCheckoutLoading || (!billingTermsAccepted && !termsChecked)
              }
              aria-label={`Purchase ${PURCHASE_CREDITS} AI calls for ${PURCHASE_PRICE_USD} dollars`}
            >
              {isCheckoutLoading ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Redirecting...
                </>
              ) : (
                `Buy ${PURCHASE_CREDITS} calls — $${PURCHASE_PRICE_USD}`
              )}
            </Button>
            <Button variant="outline" asChild>
              <Link href="/settings/billing">View billing & history</Link>
            </Button>
            {(balance ?? 0) === 0 && (
              <Button variant="ghost" onClick={() => openPurchaseDialog()}>
                I&apos;m out of calls — purchase now
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
