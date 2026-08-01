# Plan 002: Expand purchase-quantity edge-case tests

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e1e258b..HEAD -- src/lib/billing/purchase-quantity.ts src/lib/billing/__tests__/purchase-quantity.test.ts src/app/api/billing/webhook/route.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
>
> **Prefer running after plan 001** so assertions match the hardened helper
> (`amountSubtotalCents`, no metadata grants). If 001 is not done, assert
> *current* helper behavior and note that in the PR — do not reintroduce
> metadata grants.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: advisor-plans/001-harden-adjustable-quantity-credit-derivation.md (soft)
- **Category**: tests
- **Planned at**: commit `e1e258b`, 2026-07-31

## Why this matters

Variable pack purchasing is a money path. Today `purchase-quantity.test.ts` has five cases: happy parse, basic reject, prefer line qty, amount fallback, metadata fallback. It does not lock MAX boundary, string coercion used by JSON bodies, tax-like non-divisible amounts, out-of-range line quantities, or “all inputs invalid → null”. Those are the exact places an adjustable-quantity regression shows up.

## Current state

Helper under test: `src/lib/billing/purchase-quantity.ts` (`parsePurchasePacks`, `creditsForPacks`, `creditsFromPaidAmount`).

Existing tests (at plan time):

```12:65:src/lib/billing/__tests__/purchase-quantity.test.ts
describe("parsePurchasePacks", () => {
  it("accepts integer pack counts in range", () => { /* 1 and 5 */ });
  it("rejects non-integers and out-of-range values", () => { /* 1.5, 0, MAX+1, abc */ });
});

describe("creditsFromPaidAmount", () => {
  it("prefers line-item quantity over metadata", () => { /* ... */ });
  it("uses amount_total when line items are missing", () => { /* ... */ });
  it("falls back to metadata credits", () => { /* ... */ });
});
```

Constants: `MIN_PURCHASE_PACKS = 1`, `MAX_PURCHASE_PACKS = 1000`, `PURCHASE_CREDITS = 100`, `PURCHASE_PRICE_CENTS = 100` in `src/lib/billing/constants.ts`.

**Conventions:** Vitest (`npm test` → `vitest run`). Colocate under `src/lib/billing/__tests__/`. Prefer explicit `toEqual` / `toBe` over snapshots. No network. Mirror style in the same file and `src/lib/billing/__tests__/idempotency-refund.test.ts`.

After plan 001, expect param name `amountSubtotalCents` and **no** metadata grant case (replace with “metadata must not grant” if that API is gone).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests   | `npm test -- src/lib/billing/__tests__/purchase-quantity.test.ts` | all pass, including new cases |
| Full billing unit suite (optional) | `npm test -- src/lib/billing` | all pass |

## Scope

**In scope**:
- `src/lib/billing/__tests__/purchase-quantity.test.ts`

**Out of scope**:
- Production source changes (unless a test reveals a bug — then STOP and report; do not silently fix outside 001)
- Full Next.js route HTTP tests for `/api/billing/webhook`
- UI component tests for `TokenPackQuantityPicker`

## Git workflow

- Branch: same as 001 / feature branch, or `advisor/002-expand-purchase-quantity-edge-tests`
- Commit message example: `Add edge-case tests for token pack purchase quantity`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Read the live helper signature

Open `src/lib/billing/purchase-quantity.ts` and note the exact `creditsFromPaidAmount` params after any 001 work. Update obsolete test names that still say `amount_total` / metadata fallback if those paths are gone.

**Verify**: file compiles; existing tests still make sense or are updated in step 2.

### Step 2: Expand `parsePurchasePacks` cases

Add tests for:

1. `MAX_PURCHASE_PACKS` accepted → credits `MAX * PURCHASE_CREDITS`, priceUsd `MAX * PURCHASE_PRICE_USD`
2. String integer `"3"` accepted (JSON-ish)
3. Negative `-1` rejected
4. `null` / `undefined` / `{}` rejected (whatever the helper returns today — `ok: false`)
5. `creditsForPacks(2) === 200` (smoke)

**Verify**: `npm test -- src/lib/billing/__tests__/purchase-quantity.test.ts` → pass so far.

### Step 3: Expand `creditsFromPaidAmount` cases

Add tests for (adapt names to post-001 API):

1. **Stale conflict:** `lineItemQuantity: 10` with any leftover metadata/total fields → `1000` credits (regression guard for adjustable qty)
2. **Subtotal fallback:** line qty null, subtotal `5 * PURCHASE_PRICE_CENTS` → `500`
3. **Tax-like total:** amount cents `107` (or `585` if you also test non-multiple) → `null`
4. **Out-of-range line qty:** `lineItemQuantity: MAX_PURCHASE_PACKS + 1` ignored; if subtotal valid for 2 packs → `200`; if no subtotal → `null`
5. **All missing:** null/null → `null`
6. **If metadata param still exists:** metadata-only must **not** grant after 001; if 001 not landed, document current behavior in a comment and still add cases 1–5 against current API

**Verify**: `npm test -- src/lib/billing/__tests__/purchase-quantity.test.ts` → all pass.

## Test plan

- File: `src/lib/billing/__tests__/purchase-quantity.test.ts` only
- Pattern: existing `describe` / `it` blocks in that file
- Verification: `npm test -- src/lib/billing/__tests__/purchase-quantity.test.ts` → exit 0; new tests ≥ 6 beyond the original five (or replacements that cover the same ground plus edges)

## Done criteria

- [ ] Edge cases listed in Steps 2–3 are covered by assertions
- [ ] No production files modified
- [ ] `npm test -- src/lib/billing/__tests__/purchase-quantity.test.ts` exits 0
- [ ] `advisor-plans/README.md` status row for 002 updated

## STOP conditions

Stop and report back (do not improvise) if:

- Helper behavior disagrees with 001’s intended contract and 001 is marked DONE (test failure = product bug — report, don’t weaken the assertion without operator input).
- You believe a production fix is required — point at 001 or open a finding; this plan is test-only.
- Drift: `purchase-quantity.ts` no longer exports the symbols under test.

## Maintenance notes

- Any future change to `MAX_PURCHASE_PACKS` or price cents must update these tests.
- Reviewers: ensure tests do not re-legitimize granting from stale Checkout metadata.
- Optional later: mock `listLineItems` around webhook `resolvePurchasedCredits` if that helper is exported for testing; not required here.
