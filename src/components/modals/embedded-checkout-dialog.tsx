"use client";

import { useState } from "react";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { useCreditsStore } from "@/stores/credits-store";
import { getStripeClient } from "@/lib/stripe/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { PURCHASE_CREDITS } from "@/lib/billing/constants";

const STRIPE_CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
);
const stripePromise = getStripeClient();

export function EmbeddedCheckoutDialog() {
  const {
    embeddedCheckoutOpen,
    embeddedClientSecret,
    embeddedCheckoutLoading,
    embeddedCheckoutError,
    closeEmbeddedCheckout,
    openEmbeddedCheckout,
  } = useCreditsStore();

  const [completed, setCompleted] = useState(false);

  function handleOpenChange(open: boolean) {
    if (!open) {
      setCompleted(false);
      closeEmbeddedCheckout();
    }
  }

  function handleComplete() {
    setCompleted(true);
    // Credits are granted by the Stripe webhook (usually 1–3s later). The
    // user_credits realtime subscription bumps the ledger once balance increases.
  }

  return (
    <Dialog open={embeddedCheckoutOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-w-lg max-h-[90vh] overflow-y-auto p-6"
        hideCloseButton={completed}
      >
        {/* Title/description are screen-reader only — the drawer already
            explains the package; this modal is just the payment surface. */}
        <DialogTitle className="sr-only">Buy {PURCHASE_CREDITS} AI calls</DialogTitle>
        <DialogDescription className="sr-only">
          Secure Stripe checkout for purchasing AI calls.
        </DialogDescription>

        {completed ? (
          <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
            <CheckCircle2 className="size-12 text-emerald-500" />
            <div className="space-y-1">
              <p className="font-medium">Thanks for your purchase!</p>
              <p className="text-sm text-muted-foreground">
                Your {PURCHASE_CREDITS} AI calls are on the way and will appear
                in your balance momentarily.
              </p>
            </div>
            <Button className="mt-2" onClick={() => handleOpenChange(false)}>
              Back to work
            </Button>
          </div>
        ) : !STRIPE_CONFIGURED ? (
          <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
            <AlertCircle className="size-10 text-destructive" />
            <p className="text-sm text-muted-foreground">
              Checkout isn&apos;t configured. Set{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
              </code>{" "}
              and restart the dev server.
            </p>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Close
            </Button>
          </div>
        ) : embeddedCheckoutError ? (
          <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
            <AlertCircle className="size-10 text-destructive" />
            <p className="text-sm text-muted-foreground">
              {embeddedCheckoutError}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => void openEmbeddedCheckout()}>
                Try again
              </Button>
            </div>
          </div>
        ) : embeddedCheckoutLoading || !embeddedClientSecret ? (
          <div
            className="flex items-center justify-center py-16"
            role="status"
            aria-label="Loading secure checkout"
          >
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <EmbeddedCheckoutProvider
            stripe={stripePromise}
            options={{
              clientSecret: embeddedClientSecret,
              onComplete: handleComplete,
            }}
          >
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        )}
      </DialogContent>
    </Dialog>
  );
}
