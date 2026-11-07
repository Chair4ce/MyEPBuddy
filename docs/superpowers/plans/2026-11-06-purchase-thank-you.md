# Purchase thank-you Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send the approved personal thank-you once per buyer, only after the first paid base grant of exactly 100 tokens that Stripe created at or after the activation cutoff.

**Architecture:** The Stripe webhook grants credits first, then asks a service-role claim function whether this checkout is that buyer's first exact-100 purchase. One `purchase_thank_you_claims` row per user is the lifetime dedupe. Resend is called only after the row is reserved, with a stable idempotency key. Uncertain outcomes stay `sending` and may retry only inside a 23-hour window; after that they become `ambiguous` and are not sent again. The feature stays off until `PURCHASE_THANK_YOU_MODE=live` and `PURCHASE_THANK_YOU_ENABLED_AT` are both set. The first persisted cutoff never moves earlier.

**Tech Stack:** Next.js route handlers, existing `sendResendEmail`, Supabase SQL migration `225`, Vitest, local SQL fixture.

## Global Constraints

- Subject is exactly `Thanks for supporting MyEPBuddy`.
- Body is the approved text, unchanged: greeting `Hi there,`, no personalization, no offers, no unsubscribe line.
- From is exactly `MyEPBuddy <team@updates.myepbuddy.com>`.
- Reply-To is exactly `JacyLH@peridocs.io` with no trailing `>`.
- One email per buyer lifetime. A later purchase never sends another.
- Qualifying grant is `credit_transactions.type = 'purchase'` and `amount = 100` after `payment_status = paid`. A 200-token pack is not qualifying. Trial, bonus, adjustment, unpaid, failed, and cancelled events are not qualifying.
- A prior different-size purchase does not block the first exact 100.
- `marketing_email_opt_in` is not read or written. Other marketing mail is unchanged.
- `profiles.email_suppressed_at` and a provider suppression response close the claim as `suppressed`.
- Credit grant commits before thank-you work. Thank-you errors do not throw out of the webhook and do not revoke credits.
- No scan of historical buyers. Migration and deploy send nothing.
- Do not special-case prior Stripe event ids. Do not put buyer addresses in fixtures.
- Default mode is off. Do not set the live env vars in this change.
- Leave the tokens-per-dollar work, Stripe account split, inactivity, and reminders untouched.

---

### Task 1: Copy and routing

- [ ] Add failing tests that the subject, text, From, and Reply-To match the approved values and that the HTML has no unsubscribe line.
- [ ] Run those tests and confirm they fail.
- [ ] Add `src/lib/email/purchase-thank-you.ts` with the exact copy.

### Task 2: Eligibility, cutoff, and retry decisions

- [ ] Add failing unit tests for first exact 100, repeats, other amounts and types, unpaid states, opt-in false still eligible, cutoff, disable/re-enable, suppression, and the 23-hour ambiguous window.
- [ ] Implement the pure decisions in `src/lib/billing/purchase-thank-you.ts`.

### Task 3: Durable claim

- [ ] Add migration `225_purchase_thank_you.sql`: settings row with null `activated_at`, claims table, RLS with no client access, service-role functions for activate, prepare-send, mark, expire, and retry candidates.
- [ ] Add `supabase/tests/purchase_thank_you.sql` and the Vitest wrapper. Skip the wrapper when the local MyEPBuddy database container is not running.

### Task 4: Send orchestration

- [ ] Add failing tests that grant runs before send, a grant failure does not send, a send failure does not throw, suppression does not retry, and an uncertain send keeps the same idempotency key.
- [ ] Implement `runPurchaseThankYou` and call it from the billing webhook only after `grantCreditsFromStripe` and the existing campaign-bonus block.
- [ ] Add an hourly cron that retries claim rows only. It does not read the ledger for new recipients. It no-ops unless the mode is live.

### Task 5: Verify

- [ ] `npm run test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`.
- [ ] Run the SQL fixture against the local stack when Docker is available. If it is not, report that limit.
