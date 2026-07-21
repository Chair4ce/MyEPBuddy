# Plan 001: Stabilize restricted-browser `useSyncExternalStore` snapshot on signup

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 7ca7205..HEAD -- src/app/(auth)/signup/page.tsx src/lib/restricted-browser.ts src/lib/client-ready.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
>
> Note: at plan time the auth pages were **uncommitted** on top of `7ca7205`.
> Prefer matching the live working tree excerpts below over the committed blob.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `7ca7205`, 2026-07-21 (plus uncommitted signup page)

## Why this matters

Signup currently uses `useSyncExternalStore` with a `getSnapshot` that returns a **new object every call**. React compares snapshots with `Object.is`. A fresh object every read forces repeated re-renders and can infinite-loop. This was introduced when replacing `useEffect` for in-app browser detection. Fixing it restores a safe client store pattern already used elsewhere (`src/lib/client-ready.ts`, `src/lib/rank-modal-storage.ts`) and creates a shared module for plan 002.

## Current state

- `src/app/(auth)/signup/page.tsx` — signup UI; broken store (~L56–74):

```tsx
const RESTRICTED_BROWSER_SERVER = { restricted: false, browserName: "" };

function subscribeRestrictedBrowser() {
  return () => {};
}

// ...
const restrictedBrowser = useSyncExternalStore(
  subscribeRestrictedBrowser,
  isRestrictedBrowser, // returns a NEW object every call
  () => RESTRICTED_BROWSER_SERVER
);
```

- Local `isRestrictedBrowser()` (~L31–54) duplicates login’s UA checks (LinkedIn, Instagram, standalone PWA, etc.).
- Exemplar for a stable snapshot: `src/lib/client-ready.ts` returns primitives (`true`/`false`).
- Exemplar for content-stable caching pattern when returning objects: cache previous snapshot and return the same reference when fields are unchanged (see React `useSyncExternalStore` docs — snapshot must be immutable / referentially stable when data unchanged).
- House rule: do **not** add `useEffect` for this. Pure store / event handlers only.
- Repo tests: Vitest, `environment: "node"` in `vitest.config.ts` — no React Testing Library. Plan 003 adds unit tests; this plan only needs typecheck + doctor on changed scope.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Unit tests (smoke) | `npm test` | exit 0 |
| React Doctor | `npx react-doctor@latest --verbose --scope changed` | score ≥ 90; no new error-severity issues on touched files |

## Scope

**In scope** (the only files you should modify):
- `src/lib/restricted-browser.ts` (**create**)
- `src/app/(auth)/signup/page.tsx`

**Out of scope** (do NOT touch):
- `src/app/(auth)/login/page.tsx` — plan 002 migrates login
- `src/app/(auth)/phone-login/page.tsx`
- Auth flows, Supabase config, email templates
- Adding `@testing-library/react` or changing Vitest environment

## Git workflow

- Work on the current branch / working tree unless the operator names a branch.
- Commit message style from recent history: short imperative / `fix:` prefix, e.g. `fix: stabilize restricted-browser snapshot on signup`
- Do NOT push or open a PR unless asked.

## Steps

### Step 1: Create `src/lib/restricted-browser.ts`

Create a module that exports:

1. `export type RestrictedBrowserInfo = { restricted: boolean; browserName: string }`
2. `export function detectRestrictedBrowser(input: { userAgent: string; isStandalone: boolean }): RestrictedBrowserInfo`  
   - Pure function: **no** `window` access.  
   - Port the exact match order from signup’s current `isRestrictedBrowser()`:
     - if `isStandalone` → `{ restricted: true, browserName: "this app" }`
     - LinkedIn, Facebook (`FBAN|FBAV`), Instagram, Twitter/X, Snapchat, Slack, Line (`Line/`), KakaoTalk, WeChat (`WeChat|MicroMessenger`)
     - else `{ restricted: false, browserName: "" }`
3. `export function useRestrictedBrowser(): RestrictedBrowserInfo` using `useSyncExternalStore`:
   - `subscribe`: no-op unsubscribe (UA does not change during a session); match `subscribeClientReady` style in `client-ready.ts`.
   - `getServerSnapshot`: always return a **module-level constant** `SERVER_SNAPSHOT` (`restricted: false`, `browserName: ""`).
   - `getClientSnapshot`:
     - Read `navigator.userAgent` and standalone flags the same way signup does today (`matchMedia('(display-mode: standalone)')` and `navigator.standalone`).
     - Call `detectRestrictedBrowser(...)`.
     - **Stabilize**: keep a module-level `let cachedClientSnapshot = SERVER_SNAPSHOT`. If `next.restricted === cached.restricted && next.browserName === cached.browserName`, return `cached`; else assign `cached = next` and return it.
4. Do **not** export a throwing or window-touching function for use outside the hook’s client snapshot path except `detectRestrictedBrowser` (pure).

**Verify**: `test -f src/lib/restricted-browser.ts` → file exists; `npx tsc --noEmit` → exit 0 (may still fail until step 2 wires signup — if so, continue to step 2 then re-run).

### Step 2: Wire signup to the shared hook

In `src/app/(auth)/signup/page.tsx`:

1. Remove local `isRestrictedBrowser`, `RESTRICTED_BROWSER_SERVER`, `subscribeRestrictedBrowser`, and the local `useSyncExternalStore` call.
2. Remove `useSyncExternalStore` from the React import if unused.
3. `import { useRestrictedBrowser } from "@/lib/restricted-browser"`.
4. `const restrictedBrowser = useRestrictedBrowser();`
5. Keep all Google-disable / banner behavior identical (still keyed off `restrictedBrowser.restricted` / `.browserName`).

**Verify**: `npx tsc --noEmit` → exit 0  
**Verify**: `rg -n "useSyncExternalStore|function isRestrictedBrowser|subscribeRestrictedBrowser" "src/app/(auth)/signup/page.tsx"` → no matches  
**Verify**: `rg -n "useRestrictedBrowser" "src/app/(auth)/signup/page.tsx"` → at least one match

### Step 3: Sanity checks

**Verify**: `npm test` → exit 0  
**Verify**: `npx react-doctor@latest --verbose --scope changed` → ≥ 90; triage any new findings on the two in-scope files

## Test plan

- No new test file in this plan (plan 003). Manually confirm in a normal browser that `/signup` still loads and Google is enabled; optional: in an Instagram in-app browser UA (or temporary override in DevTools) the yellow “Open in Safari or Chrome” banner still appears.
- Regression this plan fixes: `getClientSnapshot` returns the **same object reference** when UA classification is unchanged (covered by unit tests in 003).

## Done criteria

- [ ] `src/lib/restricted-browser.ts` exists with `detectRestrictedBrowser` + `useRestrictedBrowser`
- [ ] Signup uses `useRestrictedBrowser` only; no local unstable snapshot
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm test` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row for 001 → DONE

## STOP conditions

- Signup no longer uses `useSyncExternalStore` for restricted browser (already fixed differently) — STOP and reconcile with 002.
- Stabilizing the snapshot appears to require `useEffect` — STOP; do not add `useEffect`.
- Detection rules must change to fix a product bug — STOP; this plan only ports existing rules.

## Maintenance notes

- Reviewers: confirm snapshot caching compares **both** `restricted` and `browserName`.
- Plan 002 will delete the duplicate detector from login.
- If a future change needs live UA updates (rare), replace the no-op subscribe with a real subscription; keep snapshot caching.
