# Plan 026: Default-key bandwidth follow-ups

**Status:** TODO  
**Priority:** P2  
**Effort:** S–M  
**Depends on:** Migration `212_default_key_global_bandwidth.sql` (local + remote applied)  
**Written against:** `af06d76` (+ uncommitted bandwidth work on `acceptance`)

## Why

Shared default-key traffic is now gated by a global token bucket + fair share inside `consume_credit` instead of a rigid per-user 5/60. Residual gaps remain for observability, client retry under contention, and keeping TS fair-share helpers aligned with SQL.

## Current state (do not re-implement)

- `supabase/migrations/212_default_key_global_bandwidth.sql` — `epb_config.default_key_rpm`, `default_key_bandwidth` singleton, rewritten `consume_credit`
- Admin: `updateAdminDefaultKeyRpm` + Admin → AI Tokens RPM field
- Client pacing: `BYOK_BURST_LIMIT` (5) vs `DEFAULT_KEY_CLIENT_BURST_LIMIT` (50)
- Pure math mirror: `src/lib/default-key-bandwidth.ts` (+ tests)
- BYOK still uses `check_and_record_usage` at 5/60 (intentional)

## In scope

1. **Contention retry** — `fetch-with-retry` currently returns immediately on `burst_rate_limited`. Under fair-share contention that is transient; add 1–2 delayed retries (e.g. 1.5s / 3s) only for `burst_rate_limited`, keep `usage_limit_exceeded` / `insufficient_credits` non-retryable.
2. **Ops visibility** — lightweight admin read of bucket tokens + active default-key users in the last 60s (Studio SQL is enough short-term; optional Admin card).
3. **Drift guard** — comment or tiny test that documents SQL fair-share formula must match `defaultKeyFairCap` / `isDefaultKeyFairShareDenied` (no dual implementation of the bucket itself in TS).

## Out of scope

- Changing BYOK 5/60 without product sign-off
- Raising `default_key_rpm` above what Google project quotas support (admin-tunable; start at 60)
- Sacred EPB MPA DnD surfaces
- Refunding bandwidth tokens on credit `unique_violation` (accepted loss)

## Verification

```bash
# Instance check first (project_id myepbuddy, supabase_db_myepbuddy)
npx vitest run src/lib/__tests__/default-key-bandwidth.test.ts src/lib/__tests__/burst-pacing.test.ts
npx react-doctor@latest --verbose --scope changed
```

## Done when

- [ ] Contended default-key clients soft-retry burst 429s without toast spam on first hitch
- [ ] Admin or docs note how to inspect `default_key_bandwidth.tokens` and tune `default_key_rpm`
- [ ] Tests still pass; no regression of alone-user full-pool behavior
