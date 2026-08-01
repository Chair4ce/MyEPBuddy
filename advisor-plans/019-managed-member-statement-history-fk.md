# Plan 019: Persist managed-member generate history with `team_member_id`

> **Drift check**: `git diff --stat 71a367e..HEAD -- src/app/api/generate/route.ts src/components/epb/epb-shell-form.tsx src/components/entries/fuse-to-epb-dialog.tsx`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `71a367e`, 2026-08-01

## Why this matters

For managed (non-account) ratees, clients pass `rateeId` = `team_members.id`. Generate inserts `statement_history.ratee_id` FK → `profiles(id)`, so inserts fail silently (`if (historyData)`). Managed generates never enter history / style learning.

## Current state

- Schema: `statement_history.ratee_id` → profiles; `team_member_id` added in managed-member migrations (`022_managed_team_members.sql` region).
- Insert loop: `src/app/api/generate/route.ts` ~1681-1694 sets `ratee_id: rateeId` only.
- Clients already know managed vs profile in EPB store / Fuse ratee object — find `isManaged` / `team_member` flags.

## Scope

**In scope**: generate route request body + history insert; EPB/Fuse payloads to pass `isManagedMember` or separate ids; RLS-compatible insert fields.

**Out of scope**: Backfilling old failed history; award history tables.

## Steps

1. Extend `GenerateRequest` with `teamMemberId?: string` and/or `isManagedMember?: boolean`.
2. When managed: set `team_member_id` to member id; set `ratee_id` to supervising `user.id` (or null if schema allows — **read schema constraints first**).
3. When normal profile ratee: keep today’s `ratee_id`.
4. Log insert errors instead of swallowing.
5. Unit or integration assertion if feasible; else manual managed generate → row appears.

## Done criteria

- [ ] Managed generate creates `statement_history` row with `team_member_id`
- [ ] Profile ratee path unchanged
- [ ] README 019 → DONE

## STOP conditions

- RLS policy forbids insert shape you chose — stop and adjust to match existing managed history writers elsewhere (`rg team_member_id statement_history`).
