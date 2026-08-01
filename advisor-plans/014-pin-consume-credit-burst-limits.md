# Plan 014: Pin burst/rate limits inside credit RPCs (ignore caller args)

> **Drift check**: `git diff --stat 71a367e..HEAD -- supabase/migrations src/lib/usage-tracker.ts`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (can land parallel with 011)
- **Category**: security
- **Planned at**: commit `71a367e`, 2026-08-01

## Why this matters

`consume_credit` (and related usage RPCs) accept `p_burst_limit` (and similar) with defaults, and are `GRANT`ed to `authenticated`. The app omits the args, but any logged-in client can call PostgREST with a huge limit and bypass anti-abuse throttling → accelerated credit burn / app-key LLM cost.

## Current state

- `supabase/migrations/177_burst_window_and_grant_cleanup.sql` — `consume_credit(..., p_burst_limit INT DEFAULT 5, ...)` used in burst check; `GRANT EXECUTE ... TO authenticated`.
- App: `src/lib/usage-tracker.ts` calls RPC without passing burst limit.
- Same pattern may exist on `check_and_record_usage` / style-signature RPCs — fix **consume_credit** first; fix siblings in the same migration if the same caller-controlled pattern exists.

## Scope

**In scope**: New migration `199` or `200` (use next free after Plan 011 if both land — coordinate: if 011 takes 199, this is **200**) that replaces `consume_credit` body to use **constants** for burst/daily limits and ignore/remove caller-supplied limit parameters (prefer drop params + recreate function to avoid overload confusion).

**Out of scope**: Changing the numeric limit values product-wide without noting current defaults (5 burst, etc.) — keep existing defaults as constants unless product asks otherwise.

## Steps

### Step 1: Inventory

`rg -n "p_burst_limit|p_daily_limit" supabase/migrations | tail -40` — list current signatures.

### Step 2: Migration

- `CREATE OR REPLACE FUNCTION consume_credit(...)` with limits as SQL constants (or remove limit args and hardcode).
- Keep `auth.uid() = p_user_id` checks.
- Re-grant execute to `authenticated` / `service_role` as today.
- Update any other RPCs in the same family with the same hole.

**Verify**: Local push after instance check; calling RPC with `p_burst_limit := 999999` either fails signature mismatch or has no effect on throttle.

### Step 3: App compile

Ensure `usage-tracker.ts` still matches the new signature (if args removed, remove from call).

`npx tsc --noEmit` → 0

## Done criteria

- [ ] Authenticated clients cannot raise burst caps
- [ ] App still consumes credits successfully
- [ ] README 014 → DONE

## STOP conditions

- Function signature change would break mobile/external clients not in this repo — report.
- Conflict with Plan 011 migration number — pick next free number.

## Maintenance notes

Never re-expose limit knobs to `authenticated` without a SECURITY DEFINER admin wrapper.
