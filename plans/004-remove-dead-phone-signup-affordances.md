# Plan 004: Remove dead phone-signup affordances (copy + CTAs only)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 7ca7205..HEAD -- "src/app/(auth)/signup/page.tsx" "src/app/(auth)/phone-login/page.tsx" "src/app/(auth)/login/page.tsx" src/lib/auth-errors.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED (user-visible CTA change on signup only)
- **Depends on**: plans/003-auth-characterization-tests.md
- **Category**: direction / correctness (UX honesty)
- **Planned at**: commit `7ca7205`, 2026-07-21

## Why this matters

Signup advertises **Phone** as a create path, but `/phone-login` always calls `signInWithOtp` with `shouldCreateUser: false`. Failed OTP then offers “Create a new account” → `/signup`, which again offers Phone → **dead loop**. That wastes users and contradicts the intentional email-confirm + magic-link-sign-in split (one confirmation email on signup; magic link only for existing users).

This plan is **deferred to last** because it changes signup UI affordances. It must **not** enable phone account creation.

### Breaking-change research (do not skip)

| Change | Breaks existing users? | Verdict |
|--------|------------------------|---------|
| Remove Phone button from `/signup` | No API break. Users who wanted phone create never succeeded. Phone sign-in remains on `/login` → `/phone-login`. | **Allowed in this plan** |
| Keep Phone on `/login` | Required | **Must keep** |
| Set `shouldCreateUser: true` on phone OTP | New accounts without email confirmation while `[auth.sms] enable_confirmations = false` in `supabase/config.toml` — credit-farming / abuse risk; changes security posture | **FORBIDDEN in this plan** |
| Delete `/phone-login` route | Breaks login Phone CTA and Settings add-phone flows that deep-link here | **FORBIDDEN** |

## Current state

- Signup header copy (~L218–221 in `src/app/(auth)/signup/page.tsx`):

```tsx
<CardDescription>
  Sign up with Google, phone, or email and password. After that, you can
  sign in with a magic link anytime.
</CardDescription>
```

- Signup Phone button (~L257–266) navigates to `/phone-login` with `aria-label="Sign up with phone"`.
- Phone login create gate (`src/app/(auth)/phone-login/page.tsx` ~L84–88):

```tsx
const { error } = await supabase.auth.signInWithOtp({
  phone: phone,
  options: {
    shouldCreateUser: false, // Don't auto-create new users
  },
});
```

- Phone login “Create a new account” panel (~L305–341) copy still says “Sign up with email or continue with phone”.
- Login page Phone button (~L329–343) must remain: `router.push("/phone-login")` for **sign-in**.
- `parseAuthError` otp action text still mentions “phone sign-in” — fine to leave (phone sign-in is valid for existing accounts). **Do not** change auth-errors in a way that breaks plan 003 title/flag assertions.

Layout convention: signup Google + Phone sit in `grid grid-cols-2`. After removing Phone, Google should become full-width (single primary OAuth button) to avoid a half-empty grid — match density of other auth pages; do not invent a new card layout.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | exit 0 (plan 003 must still pass) |
| React Doctor | `npx react-doctor@latest --verbose --scope changed` | ≥ 90 |
| Grep safety | see Done criteria | |

## Scope

**In scope**:
- `src/app/(auth)/signup/page.tsx`
- `src/app/(auth)/phone-login/page.tsx` (copy + secondary CTA text only)

**Out of scope**:
- `shouldCreateUser: true` anywhere
- Changing login Phone button or magic-link `shouldCreateUser: false`
- Supabase `config.toml` SMS settings
- Deleting `phone-login` route or Settings phone linking
- Redesigning auth chrome beyond removing the dead signup Phone CTA / fixing copy

## Git workflow

- Commit message example: `fix: stop advertising phone as a signup method`
- Do NOT push unless asked.

## Steps

### Step 1: Confirm tests from 003 still pass (baseline)

**Verify**: `npm test` → exit 0  

If fail → STOP (fix 003 first).

### Step 2: Signup — remove Phone create CTA; fix copy

In `src/app/(auth)/signup/page.tsx`:

1. Update `CardDescription` to **not** claim phone signup. Recommended copy (keep tone; may tweak slightly for length):

   > Sign up with Google or email and password. After that, you can sign in with a magic link or phone anytime.

2. Remove the Phone button that `router.push("/phone-login")`.
3. Adjust the Google button container: replace the `grid grid-cols-2` wrapping Google+Phone with a single full-width Google button (keep existing Google handler, loading, restricted-browser disable, SVG, aria-label “Sign up with Google”).
4. Remove unused `Smartphone` import if nothing else uses it.
5. Keep email/password form, names, mil-email notice, and footer link to login unchanged.

**Verify**: `rg -n "phone-login|Sign up with phone|Smartphone" "src/app/(auth)/signup/page.tsx"` → no matches  
**Verify**: `rg -n "Sign up with Google, phone" "src/app/(auth)/signup/page.tsx"` → no matches  

### Step 3: Phone-login — honest recovery copy

In `src/app/(auth)/phone-login/page.tsx`, inside the `showSignupOption` amber panel only:

1. Change helper text so it does **not** say users can “continue with phone” to create an account.
2. Recommended:
   - Title stays “Unable to verify phone” (or equivalent).
   - Body: explain they need an existing account, or create one with **email/password or Google**, then add phone in Settings.
3. Update the “Create a new account” secondary line from “Sign up with email or continue with phone” → “Sign up with email or Google, then add phone in Settings”.
4. Keep both buttons: Sign in with email → `/login`, Create account → `/signup`.
5. **Do not** change `shouldCreateUser: false`.

**Verify**: `rg -n "shouldCreateUser:\\s*false" "src/app/(auth)/phone-login/page.tsx"` → match  
**Verify**: `rg -n "shouldCreateUser:\\s*true" "src/app/(auth)"` → no matches  
**Verify**: `rg -n "continue with phone" "src/app/(auth)/phone-login/page.tsx"` → no matches  

### Step 4: Confirm login Phone sign-in path untouched

**Verify**: `rg -n "phone-login" "src/app/(auth)/login/page.tsx"` → match (Phone sign-in CTA still present)  
**Verify**: `rg -n "shouldCreateUser:\\s*false" "src/app/(auth)/login/page.tsx"` → match  

### Step 5: Verification suite

**Verify**: `npx tsc --noEmit` → exit 0  
**Verify**: `npm test` → exit 0  
**Verify**: `npx react-doctor@latest --verbose --scope changed` → ≥ 90  

## Test plan

- Automated: plan 003 suite must remain green (no reliance on signup Phone CTA).
- Manual:
  1. `/signup` — Google + email/password only; no Phone button.
  2. `/login` — Phone button still opens `/phone-login`.
  3. `/phone-login` with unknown number — panel copy points to email/Google signup + Settings, not “continue with phone”.

## Done criteria

- [ ] Signup does not navigate to `/phone-login` and does not advertise phone signup
- [ ] Login still offers Phone → `/phone-login`
- [ ] No `shouldCreateUser: true` under `src/app/(auth)`
- [ ] Phone OTP create remains `shouldCreateUser: false`
- [ ] `npx tsc --noEmit` and `npm test` exit 0
- [ ] Only in-scope files modified
- [ ] `plans/README.md` 004 → DONE

## STOP conditions

- Product owner asks to enable phone signup create — STOP; do not implement here; open a new plan that also addresses SMS confirmation / abuse controls.
- Settings or other routes require a Phone button on signup — STOP and report the caller.
- Layout change seems to need a new design system pattern beyond full-width Google button — STOP; keep the change minimal.

## Maintenance notes

- True phone signup is a **separate** initiative: would need product sign-off, likely `[auth.sms] enable_confirmations`, rate limits, and anti-abuse review before `shouldCreateUser: true`.
- Reviewer: confirm `/login` Phone path and Settings phone linking still work; confirm signup no longer loops.
- If marketing pages mention “sign up with phone”, update those in a follow-up docs pass (out of scope here unless a quick grep finds an obvious in-app string in `(auth)` only).
