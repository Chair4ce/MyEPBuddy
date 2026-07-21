# Plan 003: Add auth characterization tests (errors + restricted-browser)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 7ca7205..HEAD -- src/lib/auth-errors.ts src/lib/restricted-browser.ts src/lib/__tests__/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/001-stabilize-restricted-browser-snapshot.md
- **Category**: tests
- **Planned at**: commit `7ca7205`, 2026-07-21

## Why this matters

The auth double-email fix depends on contracts that are easy to regress: magic-link sign-in must keep `shouldCreateUser: false`, unknown emails surface `otp_disabled` / “signups not allowed for otp”, and restricted-browser detection must stay content-stable for `useSyncExternalStore`. The repo has **no** auth-page tests and Vitest runs in **`environment: "node"`** with **no** React Testing Library — so this plan adds **pure unit tests** only (no component mounts, no jsdom). That locks the contracts without introducing a new test stack.

## Current state

- Vitest config (`vitest.config.ts`): `test.environment = "node"`, `@` → `./src`.
- Existing test style (model after these):
  - `src/lib/__tests__/signup-trial-credits.test.ts` — small `describe`/`it`/`expect`
  - `src/lib/__tests__/usage-gate.test.ts` — same
- `src/lib/auth-errors.ts` — `parseAuthError` maps message patterns; magic-link unknown account (~L118–128):

```ts
{
  pattern: /signups not allowed for otp|otp_disabled/i,
  info: {
    title: "No account found",
    message: "We couldn't find an account with that email address.",
    action: "Sign up for a new account, or try Google or phone sign-in.",
    isRateLimit: false,
    isEmailDelivery: false,
  },
},
```

- Login magic link (`src/app/(auth)/login/page.tsx`) uses `shouldCreateUser: false` and treats `error.code === "otp_disabled"` as unknown account (do **not** change that code in this plan; tests document the **message** path via `parseAuthError`).
- After 001: `src/lib/restricted-browser.ts` exports `detectRestrictedBrowser({ userAgent, isStandalone })`.

**Assumption (document in test comments):** snapshot stability helper — if 001 exposed only `detectRestrictedBrowser` + hook, tests assert pure detection + a small exported `stabilizeRestrictedBrowserSnapshot(prev, next)` **only if 001 already exported it**. If 001 did **not** export a stabilize helper, add tests that call `detectRestrictedBrowser` twice with the same inputs and assert **deep equality** of fields (not referential equality of the hook cache — that is hook-internal). Prefer testing pure `detectRestrictedBrowser` only unless stabilize was exported.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| All tests | `npm test` | exit 0 |
| Filtered | `npm test -- src/lib/__tests__/auth-errors.test.ts src/lib/__tests__/restricted-browser.test.ts` | exit 0, both files run |
| Typecheck | `npx tsc --noEmit` | exit 0 |

## Scope

**In scope**:
- `src/lib/__tests__/auth-errors.test.ts` (**create**)
- `src/lib/__tests__/restricted-browser.test.ts` (**create**)
- Optionally `src/lib/restricted-browser.ts` **only** if you must export a tiny pure helper for snapshot caching tests (prefer not; keep 001’s public API)

**Out of scope**:
- Installing `@testing-library/react`, `jsdom`, or changing `vitest.config.ts` environment
- Editing login/signup/phone-login pages
- Plan 004 copy changes
- E2E / Playwright

## Git workflow

- Commit message example: `test: characterize auth errors and restricted-browser detection`
- Do NOT push unless asked.

## Steps

### Step 1: Confirm 001 exports

**Verify**: `rg -n "export function detectRestrictedBrowser" src/lib/restricted-browser.ts` → match  

If missing → STOP.

### Step 2: Write `src/lib/__tests__/auth-errors.test.ts`

Import `parseAuthError`, `isRateLimitError`, `isEmailDeliveryError` from `@/lib/auth-errors` (or relative `../auth-errors`).

Required cases:

1. `otp_disabled` → title `"No account found"`, `isRateLimit === false`, `isEmailDelivery === false`
2. `Signups not allowed for otp` (case-insensitive) → same title as (1)
3. Message containing `rate limit` → `isRateLimit === true` (and/or `isRateLimitError` true)
4. Message containing `already registered` → title `"Email Already Registered"`
5. Unknown string → title `"Authentication Error"`, message equals input (fallback)
6. Passing `{ message: "otp_disabled" }` object form works (login/supabase shape)

Do **not** assert on exact `action` strings if plan 004 may edit them later — assert `title` + flags. (If you assert `action`, plan 004 must update these tests — prefer not locking `action`.)

**Verify**: `npm test -- src/lib/__tests__/auth-errors.test.ts` → all pass

### Step 3: Write `src/lib/__tests__/restricted-browser.test.ts`

Import `detectRestrictedBrowser` from `@/lib/restricted-browser`.

Required cases (match 001’s ported rules):

1. `{ userAgent: "", isStandalone: true }` → `restricted: true`, `browserName: "this app"`
2. Instagram UA containing `Instagram` → restricted, browserName `"Instagram"`
3. LinkedIn UA → `"LinkedIn"`
4. Facebook `FBAN` → `"Facebook"`
5. Normal Chrome-like desktop UA, `isStandalone: false` → `restricted: false`, `browserName: ""`
6. Standalone wins over UA: `isStandalone: true` even with Instagram UA → `"this app"`
7. Same inputs twice → equal `restricted` and `browserName` (characterization of purity)

**Verify**: `npm test -- src/lib/__tests__/restricted-browser.test.ts` → all pass

### Step 4: Full suite + types

**Verify**: `npm test` → exit 0  
**Verify**: `npx tsc --noEmit` → exit 0

## Test plan

- The files created in steps 2–3 **are** the test plan.
- Structural pattern: `src/lib/__tests__/signup-trial-credits.test.ts`.

## Done criteria

- [ ] Both new test files exist and pass in isolation and in `npm test`
- [ ] No vitest environment / RTL dependency added
- [ ] No page components modified
- [ ] `npx tsc --noEmit` exits 0
- [ ] `plans/README.md` 003 → DONE

## STOP conditions

- 001 not landed / `detectRestrictedBrowser` missing.
- Tests seem to require jsdom or rendering React components — STOP; keep tests pure.
- `parseAuthError` patterns for otp were removed — STOP and report; do not invent new product copy.

## Maintenance notes

- Plan 004 may change user-facing phone/signup copy on pages; keep these tests focused on **titles/flags** for otp_disabled so 004 does not thrash them.
- If login later maps unknown accounts only via `error.code` and never via message, keep message-pattern tests — Supabase still returns those strings.
- Reviewer: ensure no secrets / live tokens in fixtures.
