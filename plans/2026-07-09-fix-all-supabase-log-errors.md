# Fix: remaining production errors from supabase_logs-7

**Status: DONE** (implemented 2026-07-09) — migrations 187–188 pushed local + remote; client fixes landed.

## Goal

Clear every **app-relevant** error/warning class in `supabase_logs-7.csv` (Jul 5–9 2026). Scanner probes on `auth.myepbuddy.com` are out of scope.

**Status at plan write time:** zero fixes from the prior plan have shipped. This plan supersedes and expands `plans/2026-07-09-fix-team-members-token-reward-trigger.md` — execute that work as Batch A, then Batches B–D below.

## Inventory (36 app rows / 94 total)

| ID | Severity | Symptom | Count | Status |
|----|----------|---------|-------|--------|
| A | P0 | `team_members` POST 400 + P0001 token rewards | 4 | Planned, not shipped |
| B | P0 | `process_style_feedback` 400 + `preferred_version` 42703 | 1 | Open |
| C | P0 | `epb_shells.ratee_rank` 42703 | 2 | Open |
| D | P1 | `api_usage` POST 403 + RLS 42501 | 1 | Open |
| E | P2 | `epb_shell_shares` GET 406 | 9 | Planned, not shipped |
| F | P2 | `profiles` email GET 406 | 4 | Planned, not shipped |
| G | P2 | `user_style_profiles` GET 406 | 3 | Open |
| H | P3 | Auth OTP 422 / verify 403 | 5 | Monitor only |
| — | — | Scanner 401/404 on auth host | 58 | Ignore |

## Batch A — Unblock team member create + quiet known 406s

Same as prior plan. Do this first.

### A1. Migration `187_fix_token_reward_trigger_auth_gate.sql`

Replace the gate in `grant_token_reward` (copy full body from current remote / `183_token_reward_grant_system.sql`, change only the IF):

```sql
IF auth.uid() IS NOT NULL AND pg_trigger_depth() = 0 THEN
  RAISE EXCEPTION 'Access denied: token rewards are server-initiated only';
END IF;
```

Re-assert:

```sql
REVOKE ALL ON FUNCTION grant_token_reward(UUID, credit_reward_type, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION grant_token_reward(UUID, credit_reward_type, TEXT, JSONB) TO service_role;
```

### A2. `.maybeSingle()` swaps

| File | Change |
|------|--------|
| `src/components/team/add-managed-member-dialog.tsx` | `checkEmailForExistingUser`: `.single()` → `.maybeSingle()` |
| `src/app/api/assess-epb/route.ts` | `epb_shell_shares` lookup: `.single()` → `.maybeSingle()` |

### A3. Push migrations

Verify MyEPBuddy local stack (`project_id` `myepbuddy`, `supabase_db_myepbuddy`, ports 54321/54322), then:

```bash
supabase db push --local
supabase db push   # only after local success
```

---

## Batch B — Restore `process_style_feedback` to real schema

### Problem

Migration `116_security_and_performance_fixes.sql` replaced `process_style_feedback` with updates to columns that **do not exist** on `user_style_profiles`:

- `preferred_version`, `aggressiveness`, `fill_to_max`, `updated_at`

Real columns (from `075_user_style_learning.sql`, confirmed on remote):

- `version_1_count` / `version_2_count` / `version_3_count` / `version_other_count`
- `avg_aggressiveness` / `aggressiveness_samples`
- `fill_to_max_ratio` / `fill_to_max_samples`
- `last_updated` (not `updated_at`)

Live remote function still has the broken 116 body.

### B1. Migration `188_restore_process_style_feedback.sql`

`CREATE OR REPLACE FUNCTION process_style_feedback(p_user_id UUID, p_batch_size INTEGER DEFAULT 50)` restoring the **075 logic**, with 116’s security hardening kept:

- `SECURITY DEFINER`
- `SET search_path = public` (or `SET search_path = ''` with fully-qualified `public.` names — match 116’s search_path style if using qualified names)
- Keep `GRANT EXECUTE … TO authenticated` as in 075

Use the CASE branches from 075:

- `revision_selected` / `revision_copied` → increment version counts + `total_revisions_selected`
- `slider_used` → running avg on `avg_aggressiveness`
- `toggle_used` → running avg on `fill_to_max_ratio`
- `statement_finalized` / `statement_edited` → counters
- Mark events `processed = true`

Do **not** invent `preferred_version` columns.

### Verify

```sql
SELECT process_style_feedback('<user_with_pending_events>'::uuid, 10);
-- Expect integer >= 0, no 42703
```

---

## Batch C — Style signature refresh path

Two failures fire together when refreshing style signatures (same second in logs).

### C1. Fix nonexistent `epb_shells.ratee_rank` / `ratee_afsc`

**File:** `src/lib/style-signatures.ts` — `refreshUserSignatures` (~L390–405)

`epb_shells` has no `ratee_rank` / `ratee_afsc`. Rank/AFSC live on `profiles` (self) and `team_members` (managed), same pattern as `archived_epbs_view` in migration 082.

**Preferred approach:** select shells with joins:

```ts
const { data: shells } = await supabase
  .from("epb_shells")
  .select(`
    id,
    team_member_id,
    profile:profiles!epb_shells_user_id_fkey(rank, afsc),
    team_member:team_members!epb_shells_team_member_id_fkey(rank, afsc)
  `)
  .eq("user_id", userId);
```

Then for each shell:

```ts
const rank = shell.team_member_id
  ? shell.team_member?.rank
  : shell.profile?.rank;
const afsc = shell.team_member_id
  ? shell.team_member?.afsc
  : shell.profile?.afsc;
```

Adjust FK hint names to match generated types in `src/types/supabase.ts` if the embed names differ. Alternative if embeds are awkward: two queries (shells, then batch profiles + team_members by id) — fine and clearer.

**Do not** add `ratee_rank` / `ratee_afsc` columns to `epb_shells` unless product explicitly wants denormalized copies — view/join is the existing pattern.

Also fix TypeScript types that claim `epb_shells.ratee_rank` if present in `src/types/database.ts` / local interfaces used by this path (library page uses `ArchivedEPBView.ratee_rank` which is correct for the **view** — leave that alone).

### C2. Fix `api_usage` RLS on cooldown insert

**File:** `src/app/api/refresh-style-signatures/route.ts` (~L46–52)

Migration 170 intentionally blocked client inserts into `api_usage`. The route uses cookie `createClient()` → 403/42501.

**Fix:** use `createAdminClient()` from `@/lib/supabase/server` for the cooldown **insert only**. Keep the cooldown **read** on the user client (SELECT policy allows own rows) OR also use admin for the count — either is fine; prefer admin for both cooldown ops so one client owns the side effect.

```ts
import { createClient, createAdminClient } from "@/lib/supabase/server";

// after auth check with createClient():
const admin = createAdminClient();
await admin.from("api_usage").insert({
  user_id: user.id,
  action_type: "refresh_style_signatures",
  used_default_key: false,
  model_id: null,
  provider: null,
});
```

Security: only insert after `getUser()` succeeds and only for `user.id` — never accept a client-supplied user id.

---

## Batch D — Remaining 406 noise

| File | Change |
|------|--------|
| `src/hooks/use-style-feedback.ts` ~L276–280 | `.single()` → `.maybeSingle()` on `user_style_profiles` |
| `src/lib/style-learning.ts` ~L59–63 | `.single()` → `.maybeSingle()` on `user_style_profiles` |

Both already treat null as “no profile” / defaults — `.maybeSingle()` matches that intent without PGRST116.

---

## Batch E — Auth OTP / verify (investigate only)

Do **not** change auth code until Auth service logs show the exact error (`email_not_confirmed`, rate limit, `otp_expired`, redirect not allow-listed, etc.).

Steps:

1. Supabase Dashboard → Auth logs around `2026-07-06T19:28` and `2026-07-07T06:26–06:27` (OTP 422) and `2026-07-07T13:54` (verify 403).
2. Confirm Site URL / redirect allow list includes `https://www.myepbuddy.com/auth/confirm`.
3. Only then open a follow-up plan if it’s an app bug.

---

## Out of scope

- Scanner traffic (`.env`, `phpinfo`, n8n `/rest/*`, LeakIX) — correctly denied.
- Profiles SELECT `USING (true)` email enumeration hardening — separate security task.
- Adding new columns to `epb_shells` for ratee metadata.

## Migration numbering

Latest existing: `186_retire_claude_4_anthropic_models.sql`.

| File | Purpose |
|------|---------|
| `187_fix_token_reward_trigger_auth_gate.sql` | Batch A |
| `188_restore_process_style_feedback.sql` | Batch B |

If 187 already exists when you start, use the next free number — never insert before existing files.

## Verification gates

```bash
# Instance check then:
supabase db push --local && supabase db push

npx tsc --noEmit
npm run doctor -- --verbose --scope changed   # if reviewing React UI changes
```

Manual QA:

1. Add managed team member → succeeds; no P0001.
2. Trigger style feedback processing / use style learning path → no `preferred_version` error.
3. POST `/api/refresh-style-signatures` → 200; no `ratee_rank` / `api_usage` errors.
4. Assess EPB as owner (no share) → no 406 on shares.
5. Blur unknown email in add-member dialog → no 406 on profiles.
6. Open UI that loads style profile for new user → no 406 on `user_style_profiles`.

## Acceptance criteria

- [ ] All Batch A–D code + migrations landed and pushed local then remote
- [ ] No recurrence of P0001 token-reward / 42703 preferred_version / 42703 ratee_rank / 42501 api_usage on a smoke pass
- [ ] 406s for shares / profiles email / style profiles gone for zero-row cases
- [ ] Auth OTP left as monitor unless Auth logs prove an app bug
- [ ] No new `useEffect` introduced (project rule)

## Assumptions

- Ratee rank/AFSC for signatures = profile or team_member at query time (same as archive view).
- Cooldown rows in `api_usage` for `refresh_style_signatures` remain non-billable metadata; service-role insert is acceptable.
- Auth 422/403 are likely user/rate-limit/redirect issues until proven otherwise.
