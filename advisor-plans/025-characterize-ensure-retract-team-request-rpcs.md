# 025 — Characterize ensure/retract team_request RPCs

## Goal
Add SQL or integration tests that prove `ensure_pending_team_request` never creates a second pending row, and that `retract_pending_team_request` clears matching `pending_managed_links` + unused invite tokens.

## Context
Migrations `207_one_pending_team_request.sql` and `208_retract_clears_managed_link.sql` encode the product rules. Client unit tests cover toast copy and invitee-filter helpers only.

## Steps
1. Add a Supabase SQL test script (or vitest + service-role against local) that:
   - Creates two profiles + inserts a pending supervise request via `ensure_pending_team_request`
   - Calls ensure again → expects `status = already_pending` and row count 1
   - Declines → ensure again → expects `created`
   - Creates pending_managed_links + invite token, retracts → expects link `rejected` and token `consumed_at` set
2. Wire into CI if an existing SQL test harness exists (`scripts/verify-*.sql`); otherwise document a manual `psql` recipe in the test file header.
3. Do not change RPC contracts.

## Verification
- Local: `supabase db push --local` already applied 207/208
- Run the new characterization test against local Postgres
- `npx tsc --noEmit`

## Out of scope
UI e2e for Sent Requests buttons; Resend email provider tests.
