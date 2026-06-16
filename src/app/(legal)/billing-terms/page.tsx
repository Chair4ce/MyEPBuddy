import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "AI Tokens Terms | My EPBuddy",
  description:
    "AI token terms, usage policies, and fee disclosure for My EPBuddy.",
  alternates: {
    canonical: "https://myepbuddy.com/billing-terms",
  },
};

const LAST_UPDATED = "June 6, 2026";

export default function BillingTermsPage() {
  return (
    <article className="prose prose-neutral dark:prose-invert max-w-none">
      <h1>AI Tokens Terms & Fee Disclosure</h1>
      <p className="text-muted-foreground">Last updated: {LAST_UPDATED}</p>

      <section className="mt-8">
        <h2>1. Overview</h2>
        <p>
          My EPBuddy offers prepaid &quot;AI tokens&quot; for users who
          prefer not to supply their own LLM API keys. These terms govern the
          purchase and use of AI tokens in addition to our general{" "}
          <Link href="/terms">Terms of Service</Link>.
        </p>
      </section>

      <section className="mt-8">
        <h2>2. What You Are Paying For</h2>
        <ul>
          <li>
            <strong>AI tokens</strong> — each token allows one
            billable AI action (e.g., statement generation, EPB assessment,
            accomplishment rating) using My EPBuddy&apos;s default hosted AI
            model.
          </li>
          <li>
            <strong>Trial grant</strong> — new users receive 100 free trial
            tokens. Trial tokens are promotional and do not convert to a
            subscription.
          </li>
          <li>
            <strong>Purchased tokens</strong> — available in packages starting
            at $1 for 100 tokens. Purchased tokens never expire.
          </li>
        </ul>
        <p>
          Tokens are not cryptocurrency, securities, or stored-value instruments
          under any jurisdiction. They represent prepaid access to a specific
          service feature within My EPBuddy only.
        </p>
      </section>

      <section className="mt-8">
        <h2>3. Fee Disclosure</h2>
        <div className="bg-muted/50 border rounded-lg p-4 not-prose text-sm space-y-2">
          <p>
            <strong>Current starter package:</strong> $1.00 USD for 100 AI tokens
            (one-time payment).
          </p>
          <p>
            Prices include My EPBuddy&apos;s cost to operate the default AI
            model plus a service fee for hosting, routing, and support. We do
            not itemize provider costs on each transaction in this version; bulk
            and premium model pricing may be offered separately in the future.
          </p>
          <p>
            <strong>No subscription.</strong> You are charged only when you
            choose to purchase tokens. There are no recurring fees unless you
            explicitly opt into a future subscription product.
          </p>
          <p>
            Payment processing is handled by Stripe. Stripe&apos;s terms apply
            to payment method storage and receipts.
          </p>
        </div>
      </section>

      <section className="mt-8">
        <h2>4. Usage Policies</h2>
        <ul>
          <li>
            One token is consumed per user-initiated billable AI action when
            using the app&apos;s default API key.
          </li>
          <li>
            Users who add their own API keys (BYOK) do not consume tokens and
            are billed directly by their LLM provider.
          </li>
          <li>
            A burst rate limit (5 actions per 60 seconds) applies to all users
            to prevent abuse.
          </li>
          <li>
            Tokens are non-transferable between accounts.
          </li>
          <li>
            Misuse, automated scraping, or attempts to circumvent usage limits
            may result in account suspension without refund.
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h2>5. Refunds</h2>
        <p>
          Because tokens are delivered immediately upon successful payment,
          purchases are generally non-refundable except where required by law or
          at our sole discretion for verified billing errors. Contact support
          through the app if you believe a charge was made in error.
        </p>
      </section>

      <section className="mt-8">
        <h2>6. Future Pricing Models (Roadmap Disclosure)</h2>
        <p>
          We may introduce additional options including metered pay-as-you-go
          billing (where you select a model and pay actual provider usage plus
          a disclosed overhead fee), bulk token discounts, and premium model
          tiers. Any new pricing will require updated disclosure and your
          consent before charges apply.
        </p>
      </section>

      <section className="mt-8">
        <h2>7. Acceptance</h2>
        <p>
          By checking the acceptance box and completing a purchase, you confirm
          that you have read and agree to these AI Tokens Terms and the fee
          disclosure above.
        </p>
      </section>
    </article>
  );
}
