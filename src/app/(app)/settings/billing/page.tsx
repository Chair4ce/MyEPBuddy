"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCreditsStore } from "@/stores/credits-store";
import { CreditLedgerTable } from "@/components/settings/credit-ledger-table";
import { CreditsFirstBanner } from "@/components/billing/credits-first-banner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { Loader2, Sparkles, ExternalLink, Receipt, Coins } from "lucide-react";
import {
  PURCHASE_CREDITS,
  PURCHASE_PACKAGE_LABEL,
  PURCHASE_PRICE_USD,
} from "@/lib/billing/constants";

export default function BillingSettingsPage() {
  const searchParams = useSearchParams();
  const {
    balance,
    lifetimeConsumed,
    lifetimePurchased,
    trialCredits,
    hasOwnKey,
    preferCreditsFirst,
    billingTermsAccepted,
    isLoading,
    isCheckoutLoading,
    setIsCheckoutLoading,
    setBillingTermsAccepted,
    setPreferCreditsFirst,
    openEmbeddedCheckout,
    ledgerRefreshNonce,
    fetchCredits,
  } = useCreditsStore();

  const [termsChecked, setTermsChecked] = useState(false);
  const [ledgerRefreshKey, setLedgerRefreshKey] = useState(0);

  useEffect(() => {
    const checkout = searchParams.get("checkout");
    if (checkout === "success") {
      toast.success("Payment successful! Your tokens have been added.");
      void fetchCredits();
      setLedgerRefreshKey((key) => key + 1);
    } else if (checkout === "cancelled") {
      toast.message("Checkout cancelled.");
    }
  }, [searchParams, fetchCredits]);

  const startCheckout = useCallback(async () => {
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

      // Open in-app embedded checkout instead of redirecting to Stripe.
      await openEmbeddedCheckout();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Checkout failed.",
      );
    } finally {
      setIsCheckoutLoading(false);
    }
  }, [
    billingTermsAccepted,
    termsChecked,
    setBillingTermsAccepted,
    setIsCheckoutLoading,
    openEmbeddedCheckout,
  ]);

  async function openPortal() {
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Unable to open billing portal");
      }
      window.location.href = data.url;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to open portal.",
      );
    }
  }

  if (hasOwnKey) {
    const remaining = balance ?? 0;
    const hasLeftoverCredits = remaining > 0;

    return (
      <div className="space-y-6 max-w-2xl pb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Billing</h1>
          <p className="text-muted-foreground">
            You&apos;re using your own API keys — unlimited AI usage. Manage keys
            in{" "}
            <Link href="/settings/api-keys" className="text-primary underline">
              Settings → AI Models
            </Link>
            .
          </p>
        </div>

        {hasLeftoverCredits ? (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Coins className="size-5 text-primary" />
                </div>
                <div>
                  <CardTitle>
                    {remaining} free {remaining === 1 ? "token" : "tokens"}{" "}
                    remaining
                  </CardTitle>
                  <CardDescription>
                    You still have free tokens on the app&apos;s key. They never
                    expire.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <label
                htmlFor="prefer-credits-first"
                className="flex items-start justify-between gap-4 rounded-lg border p-4 cursor-pointer"
              >
                <div className="space-y-0.5">
                  <span className="text-base font-medium block">
                    Use free tokens first
                  </span>
                  <span className="text-sm text-muted-foreground block">
                    Spend your remaining free tokens on Gemini 2.5 Flash Lite,
                    then automatically switch to your own key &amp; model. Turn
                    off to use your own model now and save tokens for later.
                  </span>
                </div>
                <Switch
                  id="prefer-credits-first"
                  checked={preferCreditsFirst}
                  onCheckedChange={(checked) =>
                    void setPreferCreditsFirst(checked === true)
                  }
                  aria-label="Use free tokens before switching to your own key"
                />
              </label>

              {preferCreditsFirst ? (
                <CreditsFirstBanner balance={remaining} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Your own key &amp; model are active now. Your {remaining}{" "}
                  free {remaining === 1 ? "token is" : "tokens are"} saved — turn
                  this on anytime, or pick the free model in the generator to use
                  them.
                </p>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                Unlimited AI usage with your own keys — no token balance needed.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl pb-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI Tokens</h1>
        <p className="text-muted-foreground">
          Monitor your balance, purchase more tokens, and view usage history.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles className="size-5 text-primary" />
            </div>
            <div>
              <CardTitle>Current Balance</CardTitle>
              <CardDescription>
                One token = one generate or assessment action
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading balance...
            </div>
          ) : (
            <>
              <p className="text-4xl font-bold tabular-nums">
                {balance ?? 0}{" "}
                <span className="text-lg font-normal text-muted-foreground">
                  tokens left
                </span>
              </p>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span>Trial grant: {trialCredits} tokens</span>
                <span>Purchased: {lifetimePurchased} tokens</span>
                <span>Used: {lifetimeConsumed} tokens</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Purchase More Tokens</CardTitle>
          <CardDescription>
            {PURCHASE_PACKAGE_LABEL} · one-time · never expire · no subscription
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!billingTermsAccepted && (
            <label
              htmlFor="billing-page-terms"
              className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer"
            >
              <Checkbox
                id="billing-page-terms"
                checked={termsChecked}
                onCheckedChange={(checked) => setTermsChecked(checked === true)}
                className="mt-0.5"
              />
              <span className="text-sm leading-relaxed">
                I agree to the{" "}
                <Link
                  href="/billing-terms"
                  className="text-primary underline underline-offset-2"
                  target="_blank"
                >
                  AI billing terms
                </Link>{" "}
                including usage policies and fee disclosure.
              </span>
            </label>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={startCheckout}
              disabled={
                isCheckoutLoading ||
                (!billingTermsAccepted && !termsChecked)
              }
              aria-label={`Purchase ${PURCHASE_CREDITS} tokens`}
            >
              {isCheckoutLoading ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Opening checkout...
                </>
              ) : (
                `Buy ${PURCHASE_CREDITS} tokens — $${PURCHASE_PRICE_USD}`
              )}
            </Button>
            <Button variant="outline" onClick={openPortal}>
              <Receipt className="size-4 mr-2" />
              Receipts & payments
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Your token ledger (most recent first)</CardDescription>
        </CardHeader>
        <CardContent>
          <CreditLedgerTable refreshKey={ledgerRefreshKey + ledgerRefreshNonce} />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground flex items-center gap-1">
        <ExternalLink className="size-3" />
        Questions about billing? See our{" "}
        <Link href="/billing-terms" className="text-primary underline">
          AI billing terms
        </Link>
        .
      </p>
    </div>
  );
}
