"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCreditsStore } from "@/stores/credits-store";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/sonner";
import { Loader2, Sparkles, ExternalLink, Receipt } from "lucide-react";
import {
  PURCHASE_CREDITS,
  PURCHASE_PACKAGE_LABEL,
  PURCHASE_PRICE_USD,
  TRIAL_CREDITS,
} from "@/lib/billing/constants";

function formatTransactionType(type: string): string {
  switch (type) {
    case "trial":
      return "Trial grant";
    case "purchase":
      return "Purchase";
    case "consume":
      return "Used";
    case "refund":
      return "Refund";
    case "adjustment":
      return "Adjustment";
    default:
      return type;
  }
}

export default function BillingSettingsPage() {
  const searchParams = useSearchParams();
  const {
    balance,
    lifetimeConsumed,
    lifetimePurchased,
    hasOwnKey,
    billingTermsAccepted,
    recentTransactions,
    isLoading,
    isCheckoutLoading,
    setIsCheckoutLoading,
    setBillingTermsAccepted,
    fetchCredits,
  } = useCreditsStore();

  const [termsChecked, setTermsChecked] = useState(false);

  useEffect(() => {
    const checkout = searchParams.get("checkout");
    if (checkout === "success") {
      toast.success("Payment successful! Your credits have been added.");
      void fetchCredits();
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

      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Unable to start checkout");
      }
      window.location.href = data.url;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Checkout failed.",
      );
      setIsCheckoutLoading(false);
    }
  }, [
    billingTermsAccepted,
    termsChecked,
    setBillingTermsAccepted,
    setIsCheckoutLoading,
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
    return (
      <div className="space-y-6 max-w-2xl pb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Billing</h1>
          <p className="text-muted-foreground">
            You&apos;re using your own API keys — unlimited AI usage with no
            credit balance needed.
          </p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Manage keys in{" "}
              <Link href="/settings/api-keys" className="text-primary underline">
                Settings → AI Models
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl pb-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI Call Credits</h1>
        <p className="text-muted-foreground">
          Monitor your balance, purchase more calls, and view usage history.
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
                One call = one generate or assessment action
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
                  calls left
                </span>
              </p>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span>Trial grant: {TRIAL_CREDITS} calls</span>
                <span>Purchased: {lifetimePurchased} calls</span>
                <span>Used: {lifetimeConsumed} calls</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Purchase More Calls</CardTitle>
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
              aria-label={`Purchase ${PURCHASE_CREDITS} AI calls`}
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
          <CardDescription>Your credit ledger (most recent first)</CardDescription>
        </CardHeader>
        <CardContent>
          {recentTransactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentTransactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(tx.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-sm">
                        {tx.description || formatTransactionType(tx.type)}
                      </TableCell>
                      <TableCell
                        className={`text-right tabular-nums ${
                          tx.amount > 0 ? "text-emerald-600" : "text-muted-foreground"
                        }`}
                      >
                        {tx.amount > 0 ? `+${tx.amount}` : tx.amount}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {tx.balance_after}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
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
