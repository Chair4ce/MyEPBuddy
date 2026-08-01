# Plan 015: Restrict `analytics_events` INSERT RLS

> **Drift check**: `git diff --stat 71a367e..HEAD -- supabase/migrations/112_analytics_events.sql src/app/api/analytics`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `71a367e`, 2026-08-01

## Why this matters

`analytics_events` allows `INSERT WITH CHECK (true)`. The Next `/api/analytics` route sanitizes payloads, but clients can bypass it with the anon/authenticated key → insert spam / spoofed `user_id`.

## Current state

- `supabase/migrations/112_analytics_events.sql:49-52` — permissive INSERT.
- App posts via `src/app/api/analytics/route.ts` (server). Prefer: revoke client INSERT and insert with service role from the API, **or** `WITH CHECK (user_id IS NULL OR user_id = auth.uid())` if client insert must remain.

## Scope

**In scope**: next migration; optionally switch API route to service-role insert if dropping client INSERT.
**Out of scope**: analytics SELECT/admin dashboard redesign.

## Steps

1. Choose approach A (recommended): drop authenticated INSERT policy; API uses service role client to insert after validation.
2. Or approach B: tighten `WITH CHECK (user_id IS NULL OR user_id = (select auth.uid()))`.
3. Local `supabase db push --local` after instance checks.
4. Smoke: app analytics still records; direct client insert of another user’s id fails.

## Done criteria

- [ ] No open INSERT for arbitrary `user_id`
- [ ] App analytics path still works
- [ ] README 015 → DONE

## STOP conditions

- Browser client inserts analytics directly (not via `/api/analytics`) — inventory with `rg analytics_events src/` first; if client inserts exist, prefer approach B or migrate those call sites.
