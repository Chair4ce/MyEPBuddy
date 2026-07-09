# Fix: team_members insert blocked by token-reward auth gate

## Goal

Restore client-side `INSERT INTO team_members` (add managed member) while keeping `grant_token_reward` callable only from trusted contexts (triggers / service_role), not as a direct authenticated RPC.

## Context / why

Production logs (`supabase_logs-6.csv`, 2026-07-09 ~14:52 UTC) show a repeated cascade:

1. iPhone Safari `POST /rest/v1/team_members` → **400**
2. Postgres **P0001**: `Access denied: token rewards are server-initiated only`

Root cause (confirmed on remote project `bxbwyjstmskpbpmnpegc`):

- Migration `183_token_reward_grant_system.sql` defines `grant_token_reward()` with:

```sql
IF auth.uid() IS NOT NULL THEN
  RAISE EXCEPTION 'Access denied: token rewards are server-initiated only';
END IF;
```

- Trigger `team_members_token_reward` (`AFTER INSERT ON team_members`) calls `grant_token_reward` via `trg_team_members_token_reward()`.
- Client inserts from `src/components/team/add-managed-member-dialog.tsx` run with the supervisor JWT, so `auth.uid()` is set inside the trigger → exception → **entire INSERT rolls back**.
- `EXECUTE` on `grant_token_reward` is already revoked from `PUBLIC` and granted only to `service_role`, so the `auth.uid()` check is redundant for direct RPC and actively breaks the intended trigger path.

Secondary noise (same CSV, not blocking):

- `GET /profiles?email=eq.…` **406** — `.single()` when zero rows (`david.metzgar2@gmail.com` not in `profiles`). Fix: `.maybeSingle()` in `checkEmailForExistingUser`.
- `GET /epb_shell_shares` **406** — `src/app/api/assess-epb/route.ts` uses `.single()` for optional share check. Fix: `.maybeSingle()`.

## Scope

**In scope**

1. New migration `187_*.sql` fixing the grant gate so triggers succeed.
2. Client `.maybeSingle()` swaps for the two 406 sources above.
3. Local then remote migration push per project rules.

**Out of scope**

- Redesigning token reward amounts / config.
- Hardening profiles email-search RLS (`USING (true)` from migration 007) — separate security task.
- Wiring other reward types (`referral_*`, `supervision_*`) marked “not wired yet” in 183.

## Files to change

| File | Change |
|------|--------|
| `supabase/migrations/187_fix_token_reward_trigger_auth_gate.sql` | **Create** — replace `grant_token_reward` body so trigger context is allowed |
| `src/components/team/add-managed-member-dialog.tsx` | `.single()` → `.maybeSingle()` in `checkEmailForExistingUser` (~L215–219) |
| `src/app/api/assess-epb/route.ts` | `.single()` → `.maybeSingle()` on `epb_shell_shares` lookup (~L107–112) |

Do **not** edit `183_token_reward_grant_system.sql` in place — always add a new incremental migration.

## Implementation steps

### 1. Migration — allow trigger-initiated grants

Create `supabase/migrations/187_fix_token_reward_trigger_auth_gate.sql`.

**Preferred approach** (keep one public function, allow nested trigger calls):

Replace the gate at the top of `grant_token_reward` with:

```sql
-- Block direct authenticated RPC; allow service_role (auth.uid() NULL)
-- and nested trigger calls (pg_trigger_depth() > 0).
IF auth.uid() IS NOT NULL AND pg_trigger_depth() = 0 THEN
  RAISE EXCEPTION 'Access denied: token rewards are server-initiated only';
END IF;
```

Copy the **full** current function body from remote / from `183_token_reward_grant_system.sql` `CREATE OR REPLACE FUNCTION grant_token_reward` and only change that `IF` block. Keep:

- `SECURITY DEFINER`
- `SET search_path = public`
- Existing `REVOKE ALL … FROM PUBLIC` / `GRANT EXECUTE … TO service_role` (re-assert at end of migration for safety)

**Do not** remove the gate entirely — authenticated users must still be unable to call the function successfully if execute privileges were ever re-granted.

**Alternative** (only if you prefer split functions): introduce `grant_token_reward_internal` without the gate, have the trigger call internal, keep public `grant_token_reward` with the gate for service_role. Prefer the `pg_trigger_depth()` one-liner unless product wants a clearer internal API.

Also update `trg_team_members_token_reward` only if you choose the split-function alternative; with `pg_trigger_depth()` no trigger change is required.

### 2. Client 406 cleanups

**`add-managed-member-dialog.tsx`**

```ts
const { data: existingProfile, error } = await supabase
  .from("profiles")
  .select("id, email, full_name, rank")
  .eq("email", email.toLowerCase())
  .maybeSingle();
```

Treat `error` only for real failures; `data === null` means no match (current catch path already clears `existingUser`).

**`assess-epb/route.ts`**

```ts
const { data: shareData } = await supabase
  .from("epb_shell_shares")
  .select("id")
  .eq("shell_id", shellId)
  .eq("shared_with_id", user.id)
  .maybeSingle();
```

Keep `const isShared = !!shareData`.

### 3. Apply migrations (instance verification first)

From repo root, before any local DB command:

1. Read `project_id` from `supabase/config.toml` (expect `myepbuddy`).
2. `supabase status` must succeed.
3. Confirm Docker container `supabase_db_myepbuddy` is running and ports match config (`54321` API, `54322` DB).
4. If wrong/missing stack: `supabase start` from this repo (stop other projects on those ports first).

Then:

```bash
supabase db push --local
# only after local success:
supabase db push
```

Never use other CLIs to apply migrations.

### 4. Manual verification

1. As a logged-in supervisor, add a managed team member from Team UI (desktop + mobile Safari if possible).
2. Expect: insert succeeds; if first managed member and reward config enabled, tokens grant once; retries do not double-grant (idempotency on `source_id`).
3. Blur an email that does **not** exist in profiles → no 406 in network/logs; UI shows “no existing user”.
4. Call assess-epb on a shell the user owns but is not shared → no 406 on `epb_shell_shares`.
5. Optional SQL smoke (service role / SQL editor):

```sql
-- Should still fail for authenticated role if they somehow have EXECUTE:
-- SELECT grant_token_reward(auth.uid(), 'first_managed_member', auth.uid()::text);
```

## Tests

- No existing Jest coverage required for this SQL path; manual QA above is the gate.
- If the repo has a SQL or integration test for team member create, extend it; otherwise do not invent a large test harness.
- Frontend: no new `useEffect` (project rule). Only change the query helper methods already used from blur/submit handlers.

## Verification commands

```bash
# From repo root after verifying myepbuddy stack:
supabase db push --local
supabase db push

# Typecheck / lint touched TS if you normally do:
npx tsc --noEmit
# If React UI changed in a review context:
npm run doctor -- --verbose --scope changed
```

## Acceptance criteria

- [ ] `POST /rest/v1/team_members` from an authenticated user succeeds (201/200), no P0001.
- [ ] First-managed-member reward still grants via trigger when config enabled; second insert for same supervisor does not double-pay (`once_per_user` / idempotency).
- [ ] Direct authenticated call to `grant_token_reward` still denied when `pg_trigger_depth() = 0` and `auth.uid()` is set.
- [ ] Profile email lookup and EPB share check use `.maybeSingle()` — no 406 for zero rows.
- [ ] Migration numbered `187_…` after `186_retire_claude_4_anthropic_models.sql`.

## Out of scope / follow-ups

- Restrict profiles SELECT policy (currently `USING (true)`) to limit email enumeration.
- Audit other `.single()` optional lookups for the same 406 pattern.
- Confirm `grant_credits` / nested SECURITY DEFINER chain still works under trigger depth (smoke after push).

## Assumptions

- No successful client `team_members` insert path bypasses this trigger; the feature is fully blocked until this ships.
- `pg_trigger_depth() > 0` is acceptable trust for all current callers of `grant_token_reward` from triggers; service_role continues to call with `auth.uid() IS NULL`.
