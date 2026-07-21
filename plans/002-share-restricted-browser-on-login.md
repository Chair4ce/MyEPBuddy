# Plan 002: Share restricted-browser helper and drop login `useEffect` for UA detection

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 7ca7205..HEAD -- src/app/(auth)/login/page.tsx src/lib/restricted-browser.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/001-stabilize-restricted-browser-snapshot.md
- **Category**: tech-debt
- **Planned at**: commit `7ca7205`, 2026-07-21 (plus uncommitted login page)

## Why this matters

Login still duplicates the in-app browser detector and sets it via `useEffect`, which conflicts with the house “no useEffect” rule for new work and can drift from signup’s rules. After 001, login should consume the same `useRestrictedBrowser` hook. This plan is **behavior-preserving**: same UA list, same Google disable + copy-URL banner. Query-param toasts stay on `useEffect` for now (explicitly deferred — converting toast side effects without `useEffect` is a larger pattern change).

## Current state

Prerequisite: plan 001 DONE — `src/lib/restricted-browser.ts` exports `useRestrictedBrowser` and `detectRestrictedBrowser`.

Login today (`src/app/(auth)/login/page.tsx`):

- Local `isRestrictedBrowser()` ~L34–57 (duplicate of signup’s old helper).
- State + effect ~L80–90:

```tsx
const [restrictedBrowser, setRestrictedBrowser] = useState<{
  restricted: boolean;
  browserName: string;
}>({ restricted: false, browserName: "" });

useEffect(() => {
  setRestrictedBrowser(isRestrictedBrowser());
  // ... email_verified / error toasts from searchParams ...
}, [searchParams]);
```

- Google button still uses `restrictedBrowser.restricted` / `.browserName` (~L207–211, ~L300).

House convention: prefer `useSyncExternalStore` / event handlers over `useEffect` for client environment reads (see `src/lib/client-ready.ts`).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | exit 0 |
| React Doctor | `npx react-doctor@latest --verbose --scope changed` | ≥ 90 on changed scope |

## Scope

**In scope**:
- `src/app/(auth)/login/page.tsx`

**Out of scope**:
- `src/lib/restricted-browser.ts` (unless a tiny type-only import fix is required — prefer zero edits)
- Refactoring searchParams toast `useEffect` into a non-effect pattern
- Signup page, phone-login, forgot-password
- Changing which browsers are “restricted”

## Git workflow

- Commit message example: `refactor: use shared restricted-browser hook on login`
- Do NOT push unless asked.

## Steps

### Step 1: Confirm 001 landed

**Verify**: `test -f src/lib/restricted-browser.ts` → exists  
**Verify**: `rg -n "export function useRestrictedBrowser" src/lib/restricted-browser.ts` → match  
**Verify**: `rg -n "useRestrictedBrowser" "src/app/(auth)/signup/page.tsx"` → match  

If any fail → STOP (run 001 first).

### Step 2: Switch login to the shared hook

In `src/app/(auth)/login/page.tsx`:

1. `import { useRestrictedBrowser } from "@/lib/restricted-browser"`.
2. Remove the local `isRestrictedBrowser` function entirely.
3. Remove `restrictedBrowser` / `setRestrictedBrowser` `useState`.
4. Add `const restrictedBrowser = useRestrictedBrowser();` inside `LoginPageContent`.
5. In the existing `useEffect`, **delete only** the line `setRestrictedBrowser(isRestrictedBrowser());`. Keep all `email_verified` / `error` toast logic and the `[searchParams]` dependency.
6. Leave `useEffect` import in place (still needed for toasts).

**Verify**: `rg -n "function isRestrictedBrowser|setRestrictedBrowser" "src/app/(auth)/login/page.tsx"` → no matches  
**Verify**: `rg -n "useRestrictedBrowser" "src/app/(auth)/login/page.tsx"` → match  
**Verify**: `rg -n "useEffect" "src/app/(auth)/login/page.tsx"` → still present (toasts)  
**Verify**: `npx tsc --noEmit` → exit 0

### Step 3: Regression sanity

**Verify**: `npm test` → exit 0  
**Verify**: `npx react-doctor@latest --verbose --scope changed` → ≥ 90  

Manually: `/login` still shows password tab by default; Google still disables in restricted UA with the same toast/banner behavior as before.

## Test plan

- Covered by plan 003’s `detectRestrictedBrowser` cases (same rules).
- This plan: typecheck + doctor only.

## Done criteria

- [ ] Login has no local `isRestrictedBrowser` / `setRestrictedBrowser`
- [ ] Login uses `useRestrictedBrowser`
- [ ] SearchParams toast `useEffect` still runs (only UA setState removed)
- [ ] `npx tsc --noEmit` and `npm test` exit 0
- [ ] No files outside in-scope list modified
- [ ] `plans/README.md` 002 → DONE

## STOP conditions

- Plan 001 not done or hook API differs from what signup uses.
- Removing `setRestrictedBrowser` from the effect seems to require deleting the whole effect (including toasts) — STOP; keep toasts.
- Temptation to “also fix” toast `useEffect` — STOP; out of scope.

## Maintenance notes

- Follow-up (not this plan): replace login query-param toast `useEffect` with a pattern that honors the ban-useeffect rule (e.g. dedicated small client child with a once-guard). Track separately.
- Reviewer: ensure Google OAuth restricted-browser toast still references `restrictedBrowser.browserName`.
