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
import { Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
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
    preferCreditsFirst,
    setPreferCreditsFirst,
    billingTermsAccepted,
    setBillingTermsAccepted,
    isCheckoutLoading,
    setIsCheckoutLoading,
    openPurchaseDialog,
    openEmbeddedCheckout,
  } = useCreditsStore();

  const [open, setOpen] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);

  const remaining = balance ?? 0;
  // BYOK users only see the button while they still have free calls to manage.
  // Once exhausted, they're fully on their own key and there's nothing to show.
  const byokWithCredits = hasOwnKey && remaining > 0;

  if (hasOwnKey && !byokWithCredits) return null;

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

      // Close the drawer and open in-app checkout so the user stays put.
      setOpen(false);
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
            {byokWithCredits
              ? "You added your own API key — choose how you want to use your remaining free calls."
              : "Your prepaid calls for generating and running assessments on our default AI model."}
          </SheetDescription>
        </SheetHeader>

        {byokWithCredits ? (
          <div className="mt-6 space-y-5 px-1">
            <div className="rounded-lg border bg-muted/40 p-4 space-y-1">
              <p className="text-sm text-muted-foreground">
                Your free calls remaining
              </p>
              <p className="text-3xl font-bold tabular-nums">
                {remaining}{" "}
                <span className="text-base font-normal text-muted-foreground">
                  {remaining === 1 ? "call" : "calls"}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">
                They never expire · they run on our default model (Gemini Flash)
              </p>
            </div>

            <div className="space-y-1.5 text-sm">
              <p className="font-medium">Heads up</p>
              <p className="text-muted-foreground leading-relaxed">
                Your free calls use our default model (Gemini Flash) —{" "}
                <span className="font-medium text-foreground">
                  not the model from the API key you added
                </span>{" "}
                — so your results may look different until you&apos;ve used them
                up.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">
                How would you like to use them?
              </p>

              <button
                type="button"
                onClick={() => void setPreferCreditsFirst(true)}
                aria-pressed={preferCreditsFirst}
                className={cn(
                  "w-full text-left rounded-lg border p-3 transition-colors",
                  preferCreditsFirst
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "hover:bg-accent",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    Use free calls first
                  </span>
                  {preferCreditsFirst && (
                    <Check className="size-4 text-primary shrink-0" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  You&apos;ll spend your {remaining} remaining{" "}
                  {remaining === 1 ? "call" : "calls"} on the default model, then
                  we&apos;ll switch you to your own key &amp; model automatically
                  when they run out.
                </p>
              </button>

              <button
                type="button"
                onClick={() => void setPreferCreditsFirst(false)}
                aria-pressed={!preferCreditsFirst}
                className={cn(
                  "w-full text-left rounded-lg border p-3 transition-colors",
                  !preferCreditsFirst
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "hover:bg-accent",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    Use my API key now
                  </span>
                  {!preferCreditsFirst && (
                    <Check className="size-4 text-primary shrink-0" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  We&apos;ll switch you to your own model right away. Your{" "}
                  {remaining} free{" "}
                  {remaining === 1 ? "call stays" : "calls stay"} saved for later
                  — they never expire.
                </p>
              </button>
            </div>

            <Button variant="outline" asChild>
              <Link href="/settings/billing">View billing &amp; history</Link>
            </Button>
          </div>
        ) : (
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
                You start with {TRIAL_CREDITS} free trial calls — one call each
                time you generate or run an assessment.
              </li>
              <li>
                Your calls use our default AI model (Gemini Flash) — fast and
                optimized for your EPB workflows.
              </li>
              <li>
                The calls you buy never expire. There&apos;s no subscription —
                you pay only when you need more.
              </li>
              <li>
                Add your own API key anytime in Settings for unlimited usage on
                your provider account.
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
                  Opening checkout...
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
        )}
      </SheetContent>
    </Sheet>
  );
}
