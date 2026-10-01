# Scaling audit

Surveyed at `61f004b` (`main`). Read-only code review of every App Router page, route handler, the authenticated layout, middleware, and the migrations those queries depend on. No production traces, no `EXPLAIN`, and no load test were run. Local LLM and Stripe keys are empty, so those calls were not executed.

Labels:

- **Fact** — present in the cited file. Not a guess about production latency.
- **Hypothesis** — a plausible effect that this survey did not measure.

Pool size is out of scope (changed in the Supabase dashboard, not here).

## How a signed-in navigation spends connections

**Fact.** `middleware.ts` runs `updateSession` on every path except static assets and the Stripe/Resend webhook prefixes. `updateSession` always calls `supabase.auth.getUser()` before the `/api/` early return (`src/lib/supabase/middleware.ts` lines 45–77). API routes therefore pay an Auth round trip even when they call `getUser()` again.

**Fact.** `src/app/(app)/layout.tsx` sets `dynamic = "force-dynamic"` and, after its own `getUser()`, awaits these in order:

1. `profiles` `select *` for the user
2. `epb_config` `select *` where `id = 1`
3. `teams` where `supervisor_id = user.id`
4. `profiles` `select *` for those subordinate ids (only if step 3 returned rows)
5. RPC `get_visible_managed_members(viewer_uuid)`

Steps 1–3 do not depend on each other. Step 5 does not depend on steps 2–4. Every page under `(app)` pays this waterfall, including settings and admin. `epb_config` is a singleton row and is not cached. The model catalog is the exception: `src/lib/ai-models/catalog-cache.ts` uses `unstable_cache` (300s) plus `revalidateTag`.

**Fact.** `get_visible_managed_members` (`supabase/migrations/101_security_hardening.sql`) is `STABLE SECURITY DEFINER` and walks `get_subordinate_chain` plus a recursive `team_members` CTE capped at depth 20. The layout calls it on every authenticated navigation. Accomplishment RLS also calls it (below). Whether Postgres caches that as an InitPlan was not checked with `EXPLAIN`.

## Database facts that affect many workflows

**Fact.** Accomplishment RLS was last rewritten for the hot policies in `061_fix_rls_auth_initplan.sql` and `102_fix_function_overload.sql`. `auth.uid()` in those policies is wrapped as `(select auth.uid())`. Select policies still include:

- own rows: `user_id = (select auth.uid())`
- chain rows: `user_id IN (SELECT subordinate_id FROM get_subordinate_chain((select auth.uid())))`
- managed rows: `team_member_id IN (SELECT id FROM get_visible_managed_members((select auth.uid())))`

**Fact.** Indexes that exist for list filters (not a complete catalog):

| Table | Index | Matches |
| --- | --- | --- |
| `accomplishments` | `(user_id)`, `(cycle_year)`, `(mpa)`, partial `(team_member_id)` | separate columns, not one composite |
| `refined_statements` | `(user_id)`, `(user_id, cycle_year, statement_type)` | library sorts by `created_at`, not cycle |
| `api_usage` | `(user_id, created_at DESC)`, `(user_id, used_default_key, created_at DESC)` | leading column is `user_id` |
| `llm_token_usage` | `(user_id, created_at DESC)`, `(user_id, used_default_key, created_at DESC)` | same |
| `credit_transactions` | `(user_id, created_at DESC)` | ledger route |
| `analytics_events` | `(user_id, created_at DESC)`, `(event_name)`, `(created_at DESC)` | insert path |

**Fact.** No migration creates `(user_id, cycle_year, date)` on `accomplishments`, `(used_default_key, created_at)` on `api_usage`, or `(used_default_key, created_at)` on `llm_token_usage`. Search was `CREATE INDEX` across `supabase/migrations`.

**Fact.** `consume_credit` (`212_default_key_global_bandwidth.sql`) runs on every default-key billable call and does all of the following before decrementing:

- `COUNT(DISTINCT user_id)` on `api_usage` where `used_default_key` and `created_at >= now() - 60s` (no `user_id` predicate)
- `COUNT(*)` for the caller in that same window (this one can use `idx_api_usage_user_default_key`)
- `SELECT … FROM default_key_bandwidth WHERE id = 1 FOR UPDATE`

The bucket row is a single lock for all default-key traffic. `epb_config.default_key_rpm` defaults to 60.

**Hypothesis.** The global `COUNT(DISTINCT …)` seq-scans or bitmap-scans `api_usage` as that table grows toward the 90-day retention in `prune_api_usage`. Not confirmed with `EXPLAIN`.

**Hypothesis.** `FOR UPDATE` on `default_key_bandwidth` serializes default-key consumes. That is the intended token bucket. Throughput above the row-lock rate was not measured.

**Fact.** `admin_default_key_token_usage` (`161_admin_default_key_usage.sql`) aggregates `llm_token_usage` several times for a window and once with **no time bound** (`all_time`, `used_default_key = true` only). The admin usage page calls this RPC in parallel with `admin_user_credit_analytics` (`src/app/(app)/admin/usage/page.tsx`). Days are clamped to 7, 30, 90, or 365.

**Fact.** `prune_api_usage` (90 days) and `prune_billable_request_cache` (48 hours) are scheduled with `pg_cron` only when that extension loads (`179_credit_housekeeping_jobs.sql`). The migration swallows failure. There is no Vercel cron for those prunes. The only Vercel cron is `GET /api/cron/sync-model-catalog` daily at 06:00 UTC (`vercel.json`). Whether hosted `pg_cron` is actually enabled was not checked in the dashboard.

## AI generation (code-verified only)

**Fact.** Every generation route uses `generateText` from the AI SDK (buffered). None use `streamText`. `maxDuration` is 60s on most routes, 90s on `POST /api/generate`, 120s on batch scan and catalog sync, 300s on `POST /api/plan-epb`.

**Fact.** `POST /api/generate` (`src/app/api/generate/route.ts`) does this before the model call, each `await` after the previous one: user settings, decrypt API keys, resolve model, idempotency context, replay cache, `checkAndTrackUsage`, example statements, optional style signature, feature flags, prompt rules, existing MPA statements. The MPA loop then `await`s `generateText` one MPA at a time (and, when `generatePerAccomplishment` is set, one accomplishment at a time inside that). Example fetches are internally sequential (`refined_statements` limits 15 and 10, then community). Comment at the MPA fetch says cross-MPA verb variety is why statements are loaded once and filtered in memory. Parallelizing the MPA loop would change that ordering.

**Fact.** Default-key calls go through `consume_credit` (global bucket above). BYOK still records usage and keeps a per-user burst (`check_and_record_usage` path; see comments in `212` and `src/lib/usage-tracker.ts`). Idempotent replay is `getReplayedBillableResponse` before the charge. Failures after a charge call `refundBillableCreditIfNeeded` via `handleBillableLLMError`.

**Fact.** The browser helper `billableFetch` (`src/lib/fetch-with-retry.ts`) is a single `fetch` with no timeout. `fetchWithRetry` defaults to 55s and 2 retries, and is used for `/api/revise-selection` and `/api/synonyms`, not for `/api/generate`. Generate callers (`epb-shell-form`, `generate-epb-dialog`, `fuse-to-epb-dialog`, `custom-context-workspace`, `opb-shell-form`) use `billableFetch` or plain `fetch`.

**Fact.** `generate_failed` is a client analytics name, not a server log line. It is emitted only from:

- `src/components/epb/epb-shell-form.tsx` catch around statement generation (passes `error.message` or `"Unknown error"`)
- `src/components/entries/fuse-to-epb-dialog.tsx` catch (same)

`src/app/api/analytics/route.ts` `sanitizeProperties` keeps string properties only when they match `^[a-zA-Z0-9_\-.]+$` and are at most 50 characters. `error` is an allowed key, but messages with spaces fail that regex and are dropped. This survey did not read production `analytics_events` rows, so it does not know why last week's `generate_failed` events fired.

**Hypothesis.** Sequential MPA `generateText` calls plus `maxDuration = 90` can hit the platform limit on multi-MPA jobs. Not observed in this environment (no provider keys).

**Fact.** `POST /api/plan-epb` bundles unassessed-entry scoring at concurrency 4 (`BUNDLED_ASSESS_CONCURRENCY`) and then one grouping `generateText`. `maxDuration` is 300. The client uses `billableFetch` with no timeout.

**Fact.** In-memory `Map` rate limits (lost on cold start, not shared across instances): checkout (`src/app/api/billing/checkout/route.ts`, 5/minute), review email (`src/app/api/send-review-email/route.ts`, 10/hour), managed-member invite, prompt-rules, user-feedback. The authoritative AI limiter is the database bucket, not these maps.

## Pages

Server work below is in addition to middleware `getUser()` and, for `(app)` routes, the layout waterfall.

| Route | What it does | Server / database | Priority |
| --- | --- | --- | --- |
| `/` | Static marketing page. No Supabase. | None in the page. Middleware still calls `getUser()` on `/`. | Low |
| `/login`, `/signup`, `/phone-login`, `/forgot-password` | Client auth forms (`"use client"`). | No page-level query. Auth calls go to Supabase Auth from the browser. Logged-in users are redirected in middleware. | Low for DB. Login itself was not timed. |
| `/reset-password` | Client page, `force-dynamic`. | Session comes from the recovery link. No list query. | Low |
| `/auth/confirm` | Server page, `force-dynamic`. Exchanges a token. | Auth verify. Not a list. | Low |
| `/auth/callback` | Route handler (not a page). | Session exchange. | Low |
| `/account-deleted` | Static confirmation. | None. | Low |
| `/privacy`, `/terms`, `/billing-terms` | Static legal copy. | None in the page. Middleware `getUser()`. | Low |
| `/email-preview/cycle-reminder`, `/email-preview/managed-invite` | Server previews, `force-dynamic`. | Render email HTML. No user table scan found in the page modules. | Low |
| `/dashboard` | Client page. Welcome, pending-link cards, supervisor feed. | After layout: `accomplishments` `select *` for `user_id` + `cycle_year`, **no `.limit()`** (`dashboard/page.tsx` ~59–64). Supervisors also mount `TeamAccomplishmentsFeed` (next section). Pending-link cards issue several unbounded reads (`pending_managed_links`, `team_members`, `profiles`, `accomplishments`, `refined_statements`) with no `.limit()` in `pending-links-card.tsx`. | **High** for supervisors |
| `/entries` | Client list, filters, generate dialog. | `accomplishments` `select *` for cycle + user or `team_member_id`, **no `.limit()`**, then `accomplishment_awards` `.in(accomplishment_id)` (`entries/page.tsx` ~173–200). Second query is batched, not per row. | **High** as a user's entries grow |
| `/epb` | Re-exports `/generate`. | Same as generate. | High |
| `/generate` | Client EPB workspace. | `teams` limit 1; `community_statements` `select afsc` for all approved rows, **no limit**; `accomplishments` `select *` for the ratee's cycle, **no limit**; then shell + sections (`generate/page.tsx` ~264–392). | **High** |
| `/library` | Client tabs: mine, shared, community. | Sequential: all `refined_statements` for the user `select *` **no limit**; shares `.in(statement_id)` (can exceed URL/filter limits once a user has a large library — not measured); `shared_statements_view` **no limit**; `community_statements` `select *` limit 200; all of the user's `statement_votes` **no limit**; `archived_epbs_view` **no limit** (`library/page.tsx` ~134–248). | **High** for library size |
| `/team` | Client team tree (~4k lines). | One metrics query loads every visible accomplishment for the distinct cycle years on the tree, columns only, **no user filter and no limit** (`team/page.tsx` `loadMemberMetrics` ~866–869). RLS is the only bound. Other reads (teams, requests, awards, history) are per action and were not each timed. | **Medium** (one wide read, not an N+1) |
| `/award` | Client award shells. | `award_shells` `select *` plus sections, **no limit**, then **one** `.in()` for missing profiles and members (`award/page.tsx` ~276–336). | Medium (unbounded list; enrichment is batched) |
| `/decoration` | Client decoration shells. | `decoration_shells` `select *` **no limit**, then `Promise.all` over shells. Each shell may `select` `team_members` or `profiles` by id, and again for `created_by` (`decoration/page.tsx` ~246–319). | **High** relative to award, because it is per shell |
| `/settings` | Client profile editor. | Single-row `profiles` reads/writes; avatar storage. | Low |
| `/settings/llm` | Client prompt settings. | `user_llm_settings` by `user_id`. | Low |
| `/settings/api-keys` | Server page. | Profile role plus key status (presence flags, not key material in the response reviewed). | Low |
| `/settings/models` | Model preferences. | Catalog via cached loader when the client calls `/api/models`. | Low |
| `/settings/billing` | Client purchase UI. | `GET /api/billing/credits` (parallel stats, key flags, profile flags, campaign) and paginated `GET /api/billing/ledger` (max page size 50, exact count). | Low–medium (count on every ledger page) |
| `/support` | `redirect("/dashboard")`. | No extra query. | Low |
| `/admin/usage` | Server page, `force-dynamic`. Admin gate then two RPCs. | See admin SQL above. | **Medium** (grows with all default-key traffic, not with one user) |
| `/admin/config` | Client editor. | `epb_config` singleton. | Low |
| `/review/epb/[token]`, `/review/award/[token]`, `/review/decoration/[token]` | Public client review by token. | `GET /api/review/[token]` loads one shell by token. Middleware treats `/review/` as public but still calls `getUser()`. | Low |

## Route handlers

Auth column means an explicit `getUser()` or equivalent inside the handler. Middleware has already called `getUser()` unless the path is a webhook excluded by the matcher.

| Route | Methods | Auth in handler | Work | Limit / duration |
| --- | --- | --- | --- | --- |
| `/api/generate` | POST | yes | Billable buffered generation. See AI section. | `maxDuration` 90. No row pagination (request body is the accomplishments). |
| `/api/plan-epb` | POST | yes | Score missing entries (concurrency 4) + one grouping call. | 300s |
| `/api/generate-award` | POST | yes | Several sequential `generateText` calls (lines ~597, 740, 938, 1078). | 60s |
| `/api/generate-decoration` | POST | yes | One `generateText`. | 60s |
| `/api/generate-war` | POST | yes | One `generateText`. | 60s |
| `/api/generate-slot-statement` | POST | yes | One `generateText`. | 60s |
| `/api/generate-feedback-session-guide` | POST | yes | One `generateText`. | 60s |
| `/api/revise-feedback-session-guide` | POST | yes | One `generateText`. | 60s |
| `/api/revise-selection` | POST | yes | One `generateText`. Client timeout 55s via `fetchWithRetry`. | 60s server, 55s client |
| `/api/synonyms` | POST | yes | One `generateText`. Not in `BILLABLE_API_PATHS`. | 60s |
| `/api/dictionary-synonyms` | GET | not re-read line-by-line | Word lookup. | Not measured |
| `/api/assess-epb` | POST | yes | One `generateText`. | 60s |
| `/api/assess-accomplishment` | POST | yes | One `generateText`. | 60s |
| `/api/assess-accomplishment-preview` | POST | yes | One `generateText`. | 60s |
| `/api/parse-bulk-statements` | POST | yes | One `generateText`. | 60s |
| `/api/extract-accomplishments` | POST | yes | One or two `generateText` calls. | 60s |
| `/api/convert-sentences` | POST | yes | One `generateText`. | 60s |
| `/api/combine` | POST | yes | One `generateText`. | 60s |
| `/api/combine-statements` | POST | yes | One `generateText`. | 60s |
| `/api/adapt-sentence` | POST | yes | One `generateText`. | 60s |
| `/api/feedback` | POST, GET | yes | Feedback rows for the user. | Not a full-table admin scan |
| `/api/feedback/apply` | POST | yes | `generateText`. | 60s |
| `/api/feedback/[id]` | GET, PATCH | yes | One row. | — |
| `/api/scan-entry` | POST | yes | One accomplishment scan. | — |
| `/api/scan-entries-batch` | POST | yes | Up to 50 unscanned accomplishments, then **per-row** service-role updates. The select has **no `user_id` filter**; visibility is whatever accomplishment SELECT policies return. No in-repo caller (`rg` only hits this file). | 120s, batch 50 |
| `/api/refresh-style-signatures` | POST | yes | Signature refresh. | 60s |
| `/api/prompt-rules` | GET, POST, PATCH, DELETE | yes | User rules. In-memory rate limit. | — |
| `/api/models` | GET | via action | Cached catalog. `Cache-Control: private, max-age=300`. | — |
| `/api/usage` | GET | yes | `getUsageStats` + key flags, `Promise.all`. | — |
| `/api/version` | GET | no | Build version. | — |
| `/api/analytics` | POST | RPC uses the user JWT | `insert_analytics_event`. Fired on many UI events including `generate_failed`. No batching. | One insert per event |
| `/api/billing/credits` | GET | yes | Parallel balance/profile/campaign. | — |
| `/api/billing/ledger` | GET | yes | `credit_transactions` page size ≤ 50 plus exact `count`. | Paginated |
| `/api/billing/checkout` | POST | yes | Stripe Checkout session. In-memory 5/minute. Requires billing terms. | — |
| `/api/billing/checkout/embedded` | POST | yes | Embedded Checkout. Same pack parsing pattern. | — |
| `/api/billing/webhook` | POST | Stripe signature. Matcher skips middleware. | Idempotent `isStripeEventProcessed`, line items, `grantCreditsFromStripe`, optional campaign bonus. 500 on line-item fetch failure so Stripe retries. | Not executed (no Stripe secret used here) |
| `/api/billing/portal` | POST | yes | Stripe customer portal. | — |
| `/api/billing/accept-terms` | POST, PATCH | yes | Profile timestamp. | — |
| `/api/billing/credit-preference` | POST | yes | Preference flag. | — |
| `/api/billing/earn-rewards` | GET | yes | Reward status. | — |
| `/api/onboarding/accept-terms` | POST | yes | Terms acceptance. | — |
| `/api/account/delete` | POST | yes | Account deletion. | Not load-tested |
| `/api/account/exit-survey` | POST | yes | One insert. | — |
| `/api/projects` and nested member routes | GET/POST/PUT/DELETE | yes | Project CRUD. | Not an unbounded global list in the handlers reviewed at the top of each file |
| `/api/review-tokens` | POST, GET, DELETE | yes | Token issue/list/revoke. | — |
| `/api/review/[token]` | GET | token, not session | One shared shell. | — |
| `/api/send-review-email` | POST | yes | Resend send. In-memory 10/hour per user. | One recipient path |
| `/api/team/invite-managed-member` | POST | yes | Invite + optional email. In-memory rate limit. | — |
| `/api/settings/marketing-email-opt-in` | POST | yes | Opt-in flag. Audience rules were not changed by this audit. | — |
| `/api/webhooks/resend` | GET, POST | Svix signature. Matcher skips middleware. | Contact sync. `contactSync: "failed"` is a Resend sync status, not `generate_failed`. | — |
| `/api/user-feedback` | POST | yes | Support note. In-memory rate limit. | — |
| `/api/admin/user-feedback` (+ reply, archive) | GET, POST | admin | Admin inbox. | Not a user-facing hot path |
| `/api/cron/sync-model-catalog` | GET | `Bearer CRON_SECRET` | Lock + provider catalog sync. | 120s, daily |
| `/api/admin` token grant | server action `admin-token-grant.ts` | admin | Credit grant. | Not on the request hot path |

Server actions under `src/app/actions/` (`accomplishments`, `supervisor-expectations`, `supervisor-feedbacks`, `shell-shares`, `api-keys`, `ai-models`, `admin-config`) revalidate specific paths after writes. They are not cached reads. Accomplishment mutations revalidate `/entries` and `/dashboard`, which does not remove the client `useEffect` refetch (those pages are client-fetched).

## Supervisor feed (highest verified fan-out)

**Fact.** `src/components/dashboard/team-accomplishments-feed.tsx` `loadTeamFeed`:

1. RPC `get_subordinate_chain`
2. `profiles` `.in(id, subordinateIds)` `select *`
3. `accomplishments` `.in(user_id)` `.is(team_member_id, null)` `.order(created_at)` `.limit(500)`
4. `accomplishments` `.in(team_member_id)` `.order(created_at)` `.limit(500)` for active managed members
5. `Promise.all` over **every** returned accomplishment. Real-profile rows call `buildProfileChain`, which calls RPC `get_supervisor_chain` once per accomplishment (lines 268–314 and 430–442). Managed-member rows walk in-memory maps.

Two users with the same supervisor chain still cause two RPCs per accomplishment, not per person. Cap is 500 + 500 rows, so the RPC fan-out cap is 500.

**Hypothesis.** A supervisor opening the dashboard opens on the order of hundreds of Postgres RPCs from the browser, on top of the layout's `get_visible_managed_members`. Not counted in a running session.

## Rendering

**Fact.** Authenticated product UI is client components (`"use client"` on dashboard, entries, generate, epb, library, team, award, decoration, settings, billing, admin config). Data loads in effects after the layout's server render. That is a waterfall: HTML, then browser Supabase, then paint. `force-dynamic` on `(app)/layout.tsx` opts the whole segment out of static/ISR caching. Legal and landing pages are server components without `force-dynamic`, but middleware still dynamic-evaluates the session.

**Fact.** `community_statements` on `/generate` selects every approved `afsc` with no limit to build a dropdown (`generate/page.tsx` ~305–309). Community statement bodies on `/library` are capped at 200.

No bundle analyzer was run. `recharts` is a dependency (`package.json`) and is a likely admin-chart cost. That is a dependency fact, not a measured KB figure.

## Prioritized remediation

Ordered by user impact and fix risk. Do these; do not boil the ocean.

### 1. Indexes for the hot filters (low risk)

New migration after `220_usaf_birthday_local_tz_anchors.sql` (next number `221`). Local `supabase db push --local` only.

- `api_usage (created_at DESC) WHERE used_default_key = true` — `consume_credit`'s global 60s count and admin windows that do not lead with `user_id`.
- `llm_token_usage (created_at DESC) WHERE used_default_key = true` — `admin_default_key_token_usage` windowed scans. The unbounded `all_time` aggregate still reads every default-key row; the partial index makes that the index's row set instead of a filter over all usage.
- `accomplishments (user_id, cycle_year, date DESC)` — dashboard, entries, and generate list shape.
- `accomplishments (team_member_id, cycle_year, date DESC) WHERE team_member_id IS NOT NULL` — managed-member lists.
- `refined_statements (user_id, created_at DESC)` — library "my statements" order.

Do not drop the existing single-column indexes in the same change. Do not change pool size. Verify with `supabase db push --local` against project `myepbuddy` only.

### 2. Stop per-accomplishment supervisor RPCs (medium risk, high impact)

In `src/components/dashboard/team-accomplishments-feed.tsx`, call `get_supervisor_chain` once per distinct `user_id`, not once per accomplishment, and reuse the chain. Keep the 500-row caps. Display should match today's chain text.

Same PR, same pattern: `src/app/(app)/decoration/page.tsx` should batch profile and team-member lookups the way `award/page.tsx` already does (collect ids, one `.in()`, then map). No new `useEffect`.

### 3. Parallelize the authenticated layout (low risk)

In `src/app/(app)/layout.tsx`, after `getUser()`, `Promise.all` the profile, `epb_config`, and `teams` reads. Then `Promise.all` subordinate profiles (if any) and `get_visible_managed_members`. Do not remove middleware `getUser()` in this change: it is what refreshes the session cookie before Server Components run.

### Explicitly later (do not fold into the three changes)

- Pagination on entries, library, award shells, decoration shells, and team metrics. Changes what users see; needs a product page size and a Playwright spec. Indexes first so the unbounded queries at least hit a fitting index.
- Caching `epb_config` with `unstable_cache` / `revalidateTag` from the admin config save. Needs a tag wired through `src/app/actions/admin-config.ts`. Easy to serve stale RPM if the tag is missed.
- Streaming `generateText` → `streamText`, or raising client timeouts. Cannot be verified here without provider keys. Do not claim it fixes `generate_failed`.
- Parallel MPA generation inside `POST /api/generate`. Conflicts with sequential verb-variety state unless that state is redesigned.
- Replacing in-memory checkout/email Maps with a shared store. Correctness under multiple instances, not the first latency win.
- Reworking the `default_key_bandwidth` row lock. Correctness-sensitive.
- Scoping `POST /api/scan-entries-batch` with `user_id = auth.uid()` (and deciding managed-member rows). No in-repo caller. Service-role updates of RLS-visible rows are a safety issue, not the first scale win.
- Skipping middleware `getUser()` on `/api/*`. Saves a round trip and can stop session refresh for handlers that never call `getUser()` themselves (`/api/analytics` is one).

## What this survey did not verify

- Production or staging latency, CPU, connection counts, or `pg_stat_statements`.
- `EXPLAIN` plans. Index recommendations are from query shape versus `CREATE INDEX` text.
- Whether hosted `pg_cron` jobs `prune-api-usage` and `prune-billable-request-cache` are scheduled.
- Any live `generate_failed` row. The writer and the sanitizer are verified; the cause of last week's events is not.
- Stripe checkout, webhooks, and LLM provider behavior at runtime (keys empty locally).
- Bundle byte sizes and Core Web Vitals.
- `dictionary-synonyms` internals beyond the route existing.
- Every click handler inside `team/page.tsx` (the metrics query and the file's `.from()` sites were read; the 4k-line file was not executed).
