# Plan 013: Classify `consume_credit` RPC failures as service errors (not “buy tokens”)

> **Drift check**: `git diff --stat 71a367e..HEAD -- src/lib/usage-tracker.ts src/lib/usage-gate.ts src/lib/__tests__/usage-tracker.test.ts`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `71a367e`, 2026-08-01

## Why this matters

When `consume_credit` RPC returns a PostgREST/DB **error** (outage, timeout), `usage-tracker.ts` sets `insufficientCredits: true`. The usage gate then shows the purchase dialog (402) instead of a retryable service error (503). Users may try to buy credits while debit is broken. BYOK path already maps RPC errors to `serviceError: true` — default-key path must match.

## Current state

`src/lib/usage-tracker.ts` (~118-138):

```ts
if (error) {
  console.error("[usage-tracker] consume_credit error:", error.message);
  return {
    allowed: false,
    usingDefaultKey: true,
    effectiveModel,
    insufficientCredits: true,  // ← wrong for RPC transport failures
    creditsRemaining: 0,
  };
}
```

BYOK path (~91-98) correctly uses `serviceError: true`.
`src/lib/usage-gate.ts` maps `serviceError` → 503; insufficient → purchase UX.
Balance `-2` remains the real insufficient-credits signal.

## Scope

**In scope**: `src/lib/usage-tracker.ts`, `src/lib/__tests__/usage-tracker.test.ts` (extend)
**Out of scope**: Stripe checkout, burst-limit SQL (Plan 014)

## Steps

### Step 1: Fix error branch

On `consume_credit` RPC `error`, return:

```ts
{
  allowed: false,
  usingDefaultKey: true,
  effectiveModel,
  serviceError: true,
}
```

Do **not** set `insufficientCredits` on transport errors. Keep `result === -2` as insufficient.

**Verify**: `rg -n "consume_credit error" -A8 src/lib/usage-tracker.ts` shows `serviceError: true`.

### Step 2: Unit test

Extend `src/lib/__tests__/usage-tracker.test.ts` (or create) to mock RPC error → assert `serviceError === true` and `insufficientCredits` falsy; mock data `-2` → `insufficientCredits === true`.

Model after existing BYOK RPC error test in that file if present.

**Verify**: `npm test -- src/lib/__tests__/usage-tracker.test.ts` → pass

### Step 3: Typecheck

`npx tsc --noEmit -p tsconfig.json` → exit 0

## Done criteria

- [ ] RPC error ≠ insufficient credits
- [ ] `-2` still insufficient
- [ ] Tests cover both
- [ ] README 013 → DONE

## STOP conditions

- `UsageCheckResult` type lacks `serviceError` — STOP (it should exist; check `usage-tracker.ts` interface).
- Callers specially assume 402 on any deny — report if you find one that breaks.

## Maintenance notes

Reviewer: confirm `enforceUsageGate` / `handleBillableLLMError` still behave for true empty balance.
