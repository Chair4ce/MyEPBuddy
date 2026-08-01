# Plan 001: Harden webhook credit derivation for adjustable quantity

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e1e258b..HEAD -- src/lib/billing/purchase-quantity.ts src/app/api/billing/webhook/route.ts src/lib/stripe/server.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
>
> **Note:** At plan time these changes were uncommitted on `main` at `e1e258b`.
> Prefer comparing against the working tree / whatever commit now contains the
> purchase-quantity feature if `e1e258b..HEAD` is empty.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `e1e258b`, 2026-07-31

## Why this matters

Checkout enables `adjustable_quantity`, so the buyer can change pack count inside Stripe after the session is created. Session metadata (`credits`, `packs`) is frozen at creation and becomes stale. The webhook correctly prefers line-item quantity, but falls back to `amount_total` then metadata. `amount_total` includes tax/discounts; the code comment claims “no tax on these sessions,” which is true today (no `automatic_tax`), but the metadata fallback can under/over-grant if line-item listing fails and `amount_total` is no longer pack-aligned. When derivation returns `null`, the webhook permanently records the event and never retries — a paid customer can be stuck with zero tokens.

## Current state

- `src/lib/billing/purchase-quantity.ts` — pure helpers for pack validation and credit derivation
- `src/app/api/billing/webhook/route.ts` — lists line items, calls `creditsFromPaidAmount`, grants via `grantCreditsFromStripe`
- `src/lib/stripe/server.ts` — creates sessions with `adjustable_quantity` and frozen metadata

Derivation today:

```49:92:src/lib/billing/purchase-quantity.ts
/**
 * Derive granted credits from what Stripe actually charged.
 * Prefer line-item quantity; fall back to amount_total (no tax on these sessions).
 */
export function creditsFromPaidAmount(params: {
  lineItemQuantity?: number | null;
  amountTotalCents?: number | null;
  metadataCredits?: string | null;
}): number | null {
  // 1) lineItemQuantity * PURCHASE_CREDITS when in [MIN, MAX]
  // 2) amountTotalCents / PURCHASE_PRICE_CENTS when divisible
  // 3) parse metadataCredits (stale if quantity was adjusted)
  // else null
}
```

Webhook wiring:

```15:38:src/app/api/billing/webhook/route.ts
async function resolvePurchasedCredits(
  session: Stripe.Checkout.Session,
): Promise<number | null> {
  let lineItemQuantity: number | null = null;
  try {
    const lineItems = await getStripe().checkout.sessions.listLineItems(
      session.id,
      { limit: 1 },
    );
    lineItemQuantity = lineItems.data[0]?.quantity ?? null;
  } catch (error) {
    console.error(/* ... */);
  }
  return creditsFromPaidAmount({
    lineItemQuantity,
    amountTotalCents: session.amount_total,
    metadataCredits: session.metadata?.credits,
  });
}
```

On unresolved credits it **acknowledges and records** (no Stripe retry):

```75:86:src/app/api/billing/webhook/route.ts
if (!userId || credits === null || credits <= 0) {
  // Acknowledge so Stripe stops retrying...
  await recordStripeEvent(event);
  return NextResponse.json({ received: true, skipped: "invalid_metadata" });
}
```

Metadata is set once at session create (never updated when qty changes in Checkout):

```110:116:src/lib/stripe/server.ts
function checkoutCreditMetadata(userId: string, packs: number) {
  const credits = creditsForPacks(packs);
  return {
    user_id: userId,
    packs: String(packs),
    credits: String(credits),
  };
}
```

**Conventions:** Keep helpers pure and unit-tested under `src/lib/billing/__tests__/`. Match existing webhook logging style (`[billing/webhook] ...`). Do not add `useEffect`. Do not change `grant_credits` RPC or checkout UI.

Stripe fact to honor: Checkout Session `amount_subtotal` is total before discounts/taxes; `amount_total` is after. Prefer subtotal for pack math.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Tests     | `npm test -- src/lib/billing/__tests__/purchase-quantity.test.ts` | all pass |
| Typecheck | `npx tsc --noEmit` (if slow, at least ensure edited files typecheck via IDE/`tsc`) | exit 0 |
| Lint      | `npx eslint src/lib/billing/purchase-quantity.ts src/app/api/billing/webhook/route.ts` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `src/lib/billing/purchase-quantity.ts`
- `src/app/api/billing/webhook/route.ts`
- `src/lib/billing/__tests__/purchase-quantity.test.ts` (update signatures / cases broken by API change)

**Out of scope** (do NOT touch, even though they look related):
- Checkout create helpers / `adjustable_quantity` limits in `src/lib/stripe/server.ts` (except if you must stop writing `credits` metadata — optional; leaving stale metadata is fine if unused)
- UI pickers, credits store, billing page
- `grant_credits` SQL / migrations
- Enabling or disabling Stripe Tax

## Git workflow

- Branch: `advisor/001-harden-adjustable-quantity-credit-derivation` (or continue on the feature branch if this lands in the same PR)
- Commit message style (from recent log): short imperative / descriptive sentences, e.g. `Harden token-pack credit derivation for adjustable Checkout quantity`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Change `creditsFromPaidAmount` contract

In `src/lib/billing/purchase-quantity.ts`:

1. Rename/replace the amount param to prefer **subtotal**:
   - Accept `amountSubtotalCents` (primary amount fallback).
   - Optionally keep `amountTotalCents` only if you need a last resort when subtotal is null — prefer **not** using total for pack math.
2. **Remove the metadataCredits grant path** (or keep the param but never return credits from it). Metadata may remain on the session for debugging/`user_id`, but must not determine grant size when `adjustable_quantity` can diverge.
3. Update the doc comment: prefer line-item quantity → `amount_subtotal` / pack-aligned cents → `null`.
4. Keep range checks against `MIN_PURCHASE_PACKS` / `MAX_PURCHASE_PACKS` and `PURCHASE_PRICE_CENTS` / `PURCHASE_CREDITS`.

Target shape (illustrative — match repo style):

```ts
export function creditsFromPaidAmount(params: {
  lineItemQuantity?: number | null;
  amountSubtotalCents?: number | null;
}): number | null {
  // 1) validated lineItemQuantity → packs * PURCHASE_CREDITS
  // 2) amountSubtotalCents > 0 && divisible by PURCHASE_PRICE_CENTS → packs in range → credits
  // 3) null
}
```

**Verify**: `rg -n "metadataCredits|amountTotalCents" src/lib/billing/purchase-quantity.ts` → no grant path using metadata; amount fallback uses subtotal naming.

### Step 2: Wire webhook + fail closed for retries

In `src/app/api/billing/webhook/route.ts` `resolvePurchasedCredits`:

1. Track whether `listLineItems` failed (`lineItemsFetchFailed = true` in the catch).
2. Pass `amountSubtotalCents: session.amount_subtotal` into `creditsFromPaidAmount` (not `amount_total`).
3. Stop passing `metadataCredits` for grant sizing.

In `POST`, for `checkout.session.completed` / `async_payment_succeeded`:

- If `session.payment_status === "paid"` (or you are about to grant) and credits could not be resolved **and** `lineItemsFetchFailed` was true → **return HTTP 500 without `recordStripeEvent`** so Stripe retries.
- If credits unresolved but line items were fetched successfully (quantity missing/out of range and subtotal also unusable) → keep today’s acknowledge+record skip (malformed session we cannot fix by retrying). Still log clearly.
- Missing `user_id` remains acknowledge+record (metadata identity is not recoverable by retry).

Refactor as needed so `resolvePurchasedCredits` can return enough info, e.g.:

```ts
type ResolveResult =
  | { credits: number }
  | { credits: null; retryable: boolean };
```

**Verify**: `rg -n "amount_total|metadataCredits|metadata\\?\\.credits" src/app/api/billing/webhook/route.ts` → `amount_total` may still appear in error logs; must not feed pack math. Grant path must not use `metadata.credits`.

### Step 3: Fix unit tests broken by the signature change

Update `src/lib/billing/__tests__/purchase-quantity.test.ts` so existing cases use `amountSubtotalCents` and drop metadata-grant expectations. Add at least:

- line quantity preferred over conflicting subtotal
- subtotal used when line quantity null
- non-pack-aligned subtotal (e.g. 107) → `null` (tax-like)
- metadata alone must **not** grant (if param removed, simply omit)

**Verify**: `npm test -- src/lib/billing/__tests__/purchase-quantity.test.ts` → all pass.

## Test plan

- Update / add cases in `src/lib/billing/__tests__/purchase-quantity.test.ts` (model after existing `describe("creditsFromPaidAmount")` blocks).
- Cases: happy line qty; subtotal fallback; tax-like non-divisible → null; out-of-range qty ignored then subtotal; all null → null; **no metadata grant**.
- Plan 002 adds more edges; this plan only needs tests that lock the new contract.

## Done criteria

- [ ] `creditsFromPaidAmount` does not grant from session metadata credits
- [ ] Amount fallback uses `amount_subtotal` (session field), not `amount_total`
- [ ] Paid + line-item fetch failure + unresolved credits → HTTP 500, event **not** recorded
- [ ] `npm test -- src/lib/billing/__tests__/purchase-quantity.test.ts` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `advisor-plans/README.md` status row for 001 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts (feature not present or already hardened differently).
- `session.amount_subtotal` is unavailable/typed unusable in the project's Stripe API version and you cannot type it safely without a broad SDK upgrade.
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require changing `grant_credits` SQL or checkout session creation beyond dropping unused metadata fields.

## Maintenance notes

- If Stripe Tax or promotion codes are enabled later, pack math must stay on **quantity** or **subtotal**, never `amount_total`.
- Reviewers should confirm webhook retry behavior does not infinite-loop on permanently bad sessions (retryable flag only when listLineItems threw).
- Optional follow-up: stop writing `credits`/`packs` into Checkout metadata entirely (keep `user_id` only) to avoid future misuse.
