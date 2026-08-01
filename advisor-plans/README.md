# Advisor Plans

Generated / reconciled by the improve skill on 2026-07-31.

**Scope note:** Repo `plans/` already tracks unrelated assessment/auth work, so advisor output lives in `advisor-plans/`. Working tree was uncommitted on `main` at `e1e258b`.

Execute in the order below within each topic unless dependencies say otherwise. Each executor: read the plan fully before starting, honor its STOP conditions, and update your row when done.

---

## ⛔ Sacred surfaces — DO NOT TOUCH (operator lock)

Unless a plan **explicitly** says otherwise **and** the operator re-confirms in the execution prompt, executors must **not modify, refactor, restyle, or “improve”**:

1. **EPB MPA split view** (two-statement / split editing UI on `/epb`)
2. **EPB MPA sentence drag-and-drop** (reorder / drop between S1–S2, drop overlays, related DnD sensors/handlers)

These took significant investment. Prefer leaving `mpa-section-card.tsx` DnD/split code paths untouched even when the same file is in scope for an unrelated fix (Impact Booster flush, revision `setState`, motion pilots).

**Allowed nearby work** (only the named concern): Impact Booster wiring, generate/revise CTAs, `billableFetch`, revision-history state purity — surgically, without changing split/DnD behavior, props, layout, or motion of those features.

**If a fix appears to require changing split view or sentence DnD:** STOP and report. Do not “just tweak” it.

Search anchors to avoid (do not “clean up” while in the file): `SentenceDropOverlay`, split-view / `usesTwoStatements` layout chrome tied to DnD, `@dnd-kit` sensors/handlers for sentences, sentence reorder state.

---

## Topic A — Variable token pack purchasing

**Not audited (A):** performance, DX, docs, roadmap/direction, unrelated dirty file `src/app/(app)/team/page.tsx`, Supabase migrations outside the grant path already used by this feature.

### Findings table (vetted)

| # | Finding | Category | Tag | Impact | Effort | Risk | Evidence |
|---|---------|----------|-----|--------|--------|------|----------|
| 1 | Harden credit derivation for adjustable qty (subtotal + no stale metadata; retry when undetermined) | correctness | introduced | Paid user can get wrong credits if line-item fetch fails and tax/discounts make `amount_total` non-pack-aligned, then stale session metadata wins | S | MED — money path | `purchase-quantity.ts:49-92`, `webhook/route.ts:15-38`, `webhook/route.ts:75-86`, `stripe/server.ts:97-116` |
| 2 | Expand `creditsFromPaidAmount` / parse edge tests (tax-like totals, null, MAX, stale metadata) | tests | introduced | Money-path regressions slip past the 5 existing unit cases | S | LOW | `purchase-quantity.test.ts:12-65` vs `purchase-quantity.ts:17-92` |

### Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 001  | Harden webhook credit derivation for adjustable quantity | P1 | S | — | DONE (already in tree; verified) |
| 002  | Expand purchase-quantity edge-case tests | P1 | S | 001 soft (write tests against final helper API) | DONE |

Recommended: **001 → 002**.

---

## Topic B — EPB banned-formatting hallucination guard (`w/`, etc.)

Post-implementation improve pass after adding `src/lib/banned-formatting.ts` and wiring it into `/api/generate` + `/api/generate-slot-statement`. Prompt already bans `"w/ "` in `DEFAULT_EPB_SYSTEM_PROMPT`; this is instruction-hallucination repair with a hard 2-attempt LLM ceiling.

**Not audited (B):** award/decoration generate paths, full React Doctor on unrelated dirty UI, performance of QC LLM.

### Findings table (vetted)

| # | Finding | Category | Tag | Impact | Effort | Risk | Evidence |
|---|---------|----------|-----|--------|--------|------|----------|
| 3 | `/api/revise-selection` returns raw LLM text with no banned-formatting repair | correctness | introduced gap | Users reintroduce `w/` / `;` when revising selections after generate already cleaned them | S | LOW | `revise-selection/route.ts:599-614` vs `banned-formatting.ts` + generate wiring |
| 4 | Generate UI ignores `formattingViolations` metadata | dx | introduced | Auto-fix is invisible; no trust signal when the model hallucinated banned strings | S | LOW | `generate/route.ts` results push vs no client `rg` hits for `formattingViolations` |

### Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 003  | Wire banned-formatting repair into revise-selection | P1 | S | — (needs `banned-formatting.ts` present) | DONE (wired in same session) |
| 004  | Surface EPB formatting violation flags in generate UI | P2 | S | — | DONE |

Recommended: **003** first (closes the reintroduce hole), then **004** if you want visible flags.

### Findings considered and rejected (B)

- **Pure-LLM revision instead of deterministic `w/` → `with`:** Rejected as primary path. Deterministic replace is free, reliable, and cannot loop; LLM revision only runs if residue remains (max 2). Expanding `w/` → `with` is natural English in EPB context.
- **Post-QC second LLM repair pass:** QC already runs `sanitizeStatements` → `replaceBannedWords` → deterministic banned-formatting fixes. Extra LLM cost not justified for this pass.
- **Award generate path parity:** Award prompts already ban slash abbreviations and are out of this EPB-focused request.

---

## Topic C — EPB Inline Impact Booster

Implemented 2026-07-31: `epb_shell_sections.impact_booster` (migration 197, local + remote), generate `impactAssessment`, inline panel, persist/clear per MPA, inject on generate. Clarifying-questions modal retired on EPB card (awards modal unchanged).

UX update (same day): collapsed-by-default Impact Booster above every Generate/Revise CTA, also under results after a run; one-time subtle "New" highlight via `epb_impact_booster_intro_seen`.

### Findings table (vetted, post-implementation)

| # | Finding | Category | Tag | Impact | Effort | Risk | Evidence |
|---|---------|----------|-----|--------|--------|------|----------|
| 5 | Duplicate `onEnhance` handlers in MPA section card | tech-debt | introduced | Future bug fix may miss one copy | S | LOW | was two inline handlers; now `handleImpactBoosterEnhance` |
| 6 | Unsaved Impact Booster drafts not applied on Generate / Revise click | dx | introduced | User fills answers then hits Generate without Save — context omitted | M | LOW | panel local draft vs `buildImpactBoosterContext(section.impact_booster)` only |
| 7 | Pre + post panels duplicate draft state when results are open | dx | introduced | Typing in one instance does not appear in the other until save/remount | S | LOW | `*-pre-*` and `*-post-*` mounts in `mpa-section-card.tsx` |

### Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 005  | Dedupe Impact Booster enhance handler | P3 | S | — | DONE |
| 006  | Flush Impact Booster drafts on Generate / Revise (+ sync dual panels) | P2 | S | — | DONE |

### Findings considered and rejected (C)

- **React Doctor score 61 on `--scope changed`:** Dominated by pre-existing dirty-tree issues (ref-during-render in mpa-section-card, unrelated team page). No findings on `impact-booster-panel.tsx`. Not blocking ship of this feature.
- **Persist prompts in DB:** Session-only prompts are intentional; answers/freeform persist. Re-generate refreshes prompts.
- **Only one panel placement (above CTA OR under results):** Rejected for product ask — available before every Generate/Revise CTA and again under results after a run. Collapsed-by-default + single New highlight on pre-CTA keeps noise down; 006 should sync drafts across the two mounts.

---


## Topic D — Entries stewardship impact intake

Implemented 2026-07-31: `accomplishments.stewardship_impact` (migration 198, local + remote), Entries form Man-hours/Funds/Resources/Outcome, composed `impact` string, AI Assessment prompt + coaching wired to AF stewardship levers.

**Not audited (D):** performance, docs, roadmap/direction, `add-team-accomplishment-dialog.tsx` / `add-project-accomplishment-dialog.tsx` (bulk-add, still free-text-only, explicitly deferred below), billing/EPB code (Topics A–C), Supabase RLS/advisors (quick-effort scope — no MCP DB audit run).

### Findings table (vetted, post-implementation)

| # | Finding | Category | Tag | Impact | Effort | Risk | Evidence |
|---|---------|----------|-----|--------|--------|------|----------|
| 8 | Background auto-redaction scan never covers `stewardship_impact` | security | introduced gap | `/api/scan-entry` + `/api/scan-entries-batch` only select/scan/redact `details, impact, metrics`; the JSONB source-of-truth can retain raw PII/CUI/classified text even after the entry is marked "redacted" — it flows back into the edit form (`hydrateStewardshipImpact`) and the next AI assessment prompt | S | MED — background job shared by single + batch scan, JSONB merge must not clobber clean fields | `scan-entry/route.ts:42-60`, `scan-entries-batch/route.ts:51-82`, `sensitive-data-scanner.ts:373-390` (redact allowlist), contrast with correct scanning in `accomplishments.ts:80-96` and `assess-accomplishment/route.ts:98-116` |
| 9 | `AccomplishmentDetailDialog` edit form has no stewardship fields — edits are a silent no-op | bug | introduced gap | View mode prefers structured `stewardship_impact` over legacy `impact` text; supervisors editing "Impact" in the team-feed detail dialog see no visible effect on entries that already have stewardship data, with no error/warning | S | LOW — additive UI reusing already-tested helpers | `accomplishment-detail-dialog.tsx:108-117` (editForm has no stewardship key), `:240-248` (submit sends only `impact`), `:600-649` (view prefers stewardship) |

### Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 007  | Cover `stewardship_impact` in background redaction safety net | P1 | M | — | DONE |
| 008  | Add stewardship fields to Accomplishment Detail edit form | P2 | S | — | DONE |

Recommended: **007** first (security safety-net gap), then **008** (independent, can land in either order).

### Findings considered and rejected (D)

- **Expand team bulk-add dialogs now:** Out of scope for this pass — they still use free-text Impact; DB default `{}` keeps creates valid. Follow-up if supervisors need stewardship there too.
- **New assessment score keys:** Kept existing `impact_significance` / `metrics_quality`.
- **Add dedicated `scanAccomplishmentsForLLM`/route-level automated tests for stewardship wiring:** The pre-save (client + server) and pre-LLM-transmission scanning paths already correctly include the four `stewardship_*` keys and are exercised indirectly by the existing `sensitive-data-scanner.test.ts` suite (which tests the shared `scanForSensitiveData` primitive those call sites all use). No route-test harness exists anywhere in this repo (`src/app/api/**/*.test.ts` — zero files) to add API-level tests without introducing new test infra, which is out of scope for a quick pass. Plan 007 does add a targeted unit test for the one place that was actually missing coverage (the redaction allowlist).
- **Centralize the "which accomplishment fields are scannable" list into one exported constant:** Real follow-up (four call sites — `accomplishments.ts`, both assess routes, and now both scan routes after Plan 007 — each hand-list the same four `stewardship_*` keys), but a refactor-only change with no immediate bug; noted as a maintenance follow-up in Plan 007 rather than spun into its own plan this pass.
- **Supabase RLS / advisor lint pass on the `stewardship_impact` column:** Migration 198 only adds a JSONB column with `NOT NULL DEFAULT '{}'` to a table that already has RLS policies scoped by `user_id`/team relationships; a new column doesn't need its own RLS policy. Not re-run as part of this quick-effort pass (out of scope per the "recon lightly" instruction) — flag for a future `deep` pass if the team wants a full Supabase advisor sweep.

---

## Topic E — Entries Fuse to EPB

Implemented 2026-07-31: multi-select on `/entries`, sticky **Fuse to EPB** bar, modal with MPA / 1–2 sentences / versions / Impact Booster, generate via `/api/generate`, pick a version, create shell if missing, write `epb_shell_sections`, navigate to `/epb`. Shell creation is deferred until Send (not before generate).

**Not audited (E):** full RLS advisor pass, OPB fuse path for officers, Playwright e2e, billing token UX beyond existing `TokenCostBadge`.

### Findings table (vetted, post-implementation)

| # | Finding | Category | Tag | Impact | Effort | Risk | Evidence |
|---|---------|----------|-----|--------|--------|------|----------|
| 10 | Shell create + active-shell lookup duplicated from EPB form | tech-debt | introduced | Archive/managed-member/cycle-year rules will drift between Entries fuse and `/epb` | M | MED | `fuse-to-epb-dialog.tsx` `createShell` / `findActiveShell` vs `epb-shell-form.tsx` `handleCreateShell` |
| 11 | `majorityMpa` + generate payload shaping untested private helpers | tests | introduced | Wrong default MPA or dropped stewardship impact burns tokens silently | S | LOW | `fuse-to-epb-dialog.tsx` top-level `majorityMpa` + `accPayload` in `handleGenerate` |

### Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 009  | Extract shared EPB shell create helper | P2 | M | — | DONE |
| 010  | Unit-test fuse majority MPA + payload helpers | P2 | S | soft: nicer after extracting pure helpers | DONE |

Recommended: **010** can land immediately (extract pure helpers in the same PR); **009** when touching shell create again.

### Findings considered and rejected (E)

- **Require shell before generate:** Rejected — generation only needs ratee + accomplishments; blocking on shell creation forces commitment before the user has seen drafts. Create-on-Send matches the product ask (“don’t take them to EPB until they pick a version”).
- **Full S1/S2 action split UI in the modal:** Rejected for v1 — EPB already has ActionSelectorSheet for fine-grained assignment; Entries fuse passes all selected IDs with `statementCount` 1|2. Polish on `/epb` after Send.
- **OPB fuse for officers:** Out of scope — checkboxes/bar only show for enlisted ratees (`isEnlisted`).
- **React Doctor 58 on `--scope changed`:** Dominated by pre-existing dirty-tree issues; no findings on `fuse-to-epb-dialog.tsx` under `--scope lines`.
- **Wire unused `accomplishments-store` selection helpers:** Local `Set` on the page is enough for the sticky bar; store helpers remain unused and are not required for fuse.
- **`miscellaneous` as fuse target:** Fixed in-session — shell trigger only creates EM/LP/MR/IU/HLR (`042_epb_shells.sql`); picker + `majorityMpa` now use `FUSE_TARGET_MPAS` (ENTRY_MGAS minus miscellaneous).

---

## Dependency notes

- Topic A: 002 should assert the post-001 contract if 001 lands first.
- Topic B: 003 and 004 are independent of Topic A; 004 does not depend on 003.
- Topic C: 005 DONE; **006 DONE** (draft flush + dual-panel sync).
- Topic D: shipped with migration 198. **007** (background redaction coverage) and **008** (detail-dialog stewardship parity) are independent of each other and of Topics A–C — either order is fine. Optional follow-up beyond this pass: team bulk-add stewardship UI (rejected this round, see Topic D).
- Topic E: Fuse to EPB shipped on Entries. **010** (unit tests) is the cheap next step; **009** (shared shell create) before a third create call site appears.
- Topic F–H (2026-08-01 whole-app improve + React Doctor 26/100): see below. Coordinate migration numbers across **011 / 014 / 015 / 016** (next free after `198_*` is `199_*`).

---

## Topic F — Security hardening (whole-app audit)

React Doctor whole-app **26/100** (51 errors). Downgraded: early “no RLS” migration noise (later migrations enable RLS); `.next` “secret in browser artifact” (no service-role/Stripe secrets in client bundles).

### Findings → plans

| # | Finding | Plan | Priority | Effort | Status |
|---|---------|------|----------|--------|--------|
| 1 | `profiles.role` self-escalation via own-row UPDATE | 011 | P1 | M | DONE |
| 4 | Caller-controlled `p_burst_limit` on `consume_credit` | 014 | P1 | S | DONE |
| 5 | `analytics_events` INSERT `WITH CHECK (true)` | 015 | P2 | S | DONE |
| 6–7 | World-readable profiles SELECT + unsupervised teams INSERT | 016 | P1 | M | DONE |

### Execution order

**011 → 014 → 016 → 015** (role freeze + burst pin first; RLS SELECT/INSERT next; analytics last).

---

## Topic G — Credit / generate money-path safety

| # | Finding | Plan | Priority | Effort | Status |
|---|---------|------|----------|--------|--------|
| 2 | EPB/Fuse raw `fetch` skips Idempotency-Key | 012 | P1 | S | DONE |
| 3 | `consume_credit` RPC errors mislabeled as insufficient credits | 013 | P1 | S | DONE |
| 8 | No generate billing contract tests (1 credit / refund empty) | 017 | P1 | M | DONE |
| 9 | Managed-member history FK silent fail | 019 | P2 | M | DONE |
| 10 | Impure `setState` in revision history | 020 | P2 | S | DONE (already pure; verified) |

### Execution order

**013 → 012 → 017**, then **019 / 020** anytime.

---

## Topic H — PeriDocs house motion → MyEPBuddy

Port PeriDocs motion rules, CSS tokens, `@/lib/motion/classes`, and `check-house-motion.mjs` into this repo; pilot on Fuse + stewardship + Impact Booster. Source (read-only): `/Users/jacyhoag/Workspace/peridocs/.cursor/rules/motion-*.mdc` + `lib/motion/*`.

| Plan | Title | Priority | Effort | Status |
|------|-------|----------|--------|--------|
| 018  | Adopt PeriDocs house motion into MyEPBuddy | P1 | L | DONE |

Press scale for MyEPBuddy remains **0.98** (product rule), not PeriDocs 0.99. Skip PeriDocs marketing/Figma modules.

### Suggested overall wave

1. **Security:** 011, 014, 016  
2. **Credits:** 013, 012, 017  
3. **Motion:** 018 (can parallelize with wave 1–2 after rules/CSS land)  
4. **Polish:** 015, 019, 020 + leftover Topic A–E TODOs (001, 002, 004, 007–010)

### Execution log (2026-07-31 / 2026-08-01)

Shipped on `main` (descriptive commits, no per-plan branches). Gates: `tsc` between plans; React Doctor `--scope lines` / `--scope changed` monitored (SQL-only plans do not move whole-app 26/100).

| Plan | Result | Notes |
|------|--------|-------|
| 011 | DONE | Migrations `199` + `200` (SECURITY DEFINER `current_user` bug fixed) — local + remote |
| 014 | DONE | Migration `201` — burst/daily caps pinned; app call sites updated |
| 016 | DONE | Migration `203` — local + remote. `profiles` SELECT is now own-row + `can_view_profile()`; `teams` INSERT requires an accepted `team_requests` row; new `search_profile_by_email` / `search_profiles_directory` / `respond_to_team_request` RPCs; 9 client files moved off direct `profiles` scans. Regression harness: `scripts/verify-016-rls.sql` |
| 013 | DONE | `consume_credit` RPC errors → `serviceError` |
| 012 | DONE | EPB/Fuse/`adapt-sentence`/`assess-epb` → `billableFetch` (DnD logic untouched) |
| 017 | DONE | `generate-billing-contract` helper + characterization tests |
| 018 | DONE | Phase A: 7 `.cursor/rules/motion-*.mdc`, house tokens + `t-press`/`t-enter*`/`t-shadow-*` in `globals.css`, `src/lib/motion/{tokens,classes,should-enable-rich-motion}.ts`, `scripts/check-house-motion.mjs` (`npm run motion:check`). Phase B pilots: Fuse bar/dialog, stewardship fields, Impact Booster panel. Phase C: duty-description revise panel entrances. Press scale **0.98**; `mpa-section-card` split view + sentence DnD untouched |
| 015 | DONE | Migration `202` + admin-client analytics insert |
| 019 | DONE | Managed generate → `team_member_id` + supervisor `ratee_id`; insert errors logged |
| 020 | DONE | Already pure outside updater (mpa + duty-description); no DnD touch |
| 001 | DONE | Already in tree (`amountSubtotalCents`); verified |
| 002 | DONE | Edge tests expanded |
| 004 | DONE | Formatting violation badges in generate UI |
| 006 | DONE | Impact Booster draft flush |
| 007 | DONE | Stewardship in background redaction |
| 008 | DONE | Detail-dialog stewardship edit |
| 009 | DONE | Shared EPB shell create helper |
| 010 | DONE | Payload helper extracted + tested |

**Still TODO / pin next walkthrough:** plans 001–020 are all DONE. The motion follow-up noted here (clear the ~60 `npm run motion:check` advisory hits, then grow `ENFORCED_PATHS`) is now planned as **024**. See "Post-wave improve (quick)" below for plans 021–024. Do not touch EPB split view or sentence DnD unless explicitly approved.

### Considered and rejected (F–H)

- Full god-file splits (`mpa-section-card`, `team/page`) — L/HIGH risk; needs characterization tests first (direction follow-up). **Never** include split view or sentence DnD in a god-file split without explicit operator approval.
- Charging 1 credit per version — product decision, not a bug; multi-version fan-out cost tracked as direction only.
- Copying PeriDocs marketing motion / brand look — out of scope for 018.

---

## Post-wave improve (quick) — 2026-08-01, commit `044b1be`

Read-only pass run after plans **004, 006, 007, 008, 009, 016 (migration 203), 018, 019, 020** shipped. Scoped to residual risk from that wave plus adjacent hotspots — not a whole-app re-audit. Working tree was dirty (entries refactor + assessment-coaching WIP); nothing in it was modified.

### Findings table (vetted)

| # | Finding | Category | Tag | Impact | Effort | Risk | Confidence | Evidence | Plan |
|---|---------|----------|-----|--------|--------|------|------------|----------|------|
| 1 | `npm test` is red on `main` — coaching tip assertions never updated when the stewardship copy landed | tests | introduced (`a46d3d3`) | The repo's only one-command verification gate has been failing for several commits (1 failed / 403 passed). Every plan uses `npm test` as its done-criteria gate, so a real regression now hides behind a known failure | S | LOW | HIGH | `src/lib/__tests__/assessment-coaching.test.ts:76-81` expects the pre-stewardship bodies vs `src/lib/assessment-coaching.ts:31-38`. Two assertions are stale; vitest only reports the first | **021** |
| 2 | EPB + Award share dialogs query a relation that does not exist (`supervision_history`), silently blanking the supervisor rows in the "who has access" list | bug | pre-existing | The share dialog is the surface used to answer "who else can read this EPB/Award package?" It always answers with zero supervisors. PostgREST errors on the unknown relation; both call sites destructure only `{ data }`, so nothing is logged. Also filters a nonexistent column `end_date` | S | LOW | HIGH | `src/components/epb/epb-shell-share-dialog.tsx:108-127`, `src/components/award/award-shell-share-dialog.tsx:110-129`; correct exemplar at `src/components/decoration/decoration-shell-share-dialog.tsx:121-142` (`team_history` / `ended_at`) and `src/components/entries/supervisor-feedback-panel.tsx:112-118`. No `supervision_history` table in `supabase/migrations/**` or `src/types/supabase.ts` — only the view `my_supervision_history` | **022** |
| 3 | `search_profiles_directory` re-opens directory enumeration that migration 203 was written to close | security | introduced (203) | Unanchored `ILIKE '%q%'` across name **and** email, 10 rows per call, no throttle, `SECURITY DEFINER` so RLS never sees it. Any authenticated account can harvest the roster (`.mil` email + name + rank + AFSC) with generic 3-char fragments. The function's own comment claims the table "cannot be enumerated" | M | MED | HIGH | `supabase/migrations/203_narrow_profiles_select_and_teams_insert.sql:310-342`; wrapper `src/lib/profile-directory.ts:74-92`; raw email rendered to strangers at `src/components/library/share-statement-dialog.tsx:402-409` and the three sibling share dialogs | **023** |
| 4 | House motion port stalled after the pilots — 60 advisory hits, `ENFORCED_PATHS` never grew | tech-debt | introduced gap (018) | Two motion languages in one app, and `npm run motion:check` exits 0 on all 60 hits, so the gate never fires. Phase C's `duty-description-card.tsx` was piloted but never enforced and still has 4 hits | M | LOW | HIGH | `npm run motion:check` → 60 hits across ~40 files; `scripts/check-house-motion.mjs:59-64` still lists only the 4 original pilots | **024** |
| 5 | `statement_history` is a write-only table | tech-debt | pre-existing | Two inserts per generate run (one per accomplishment, one per MPA version), `is_draft: true` never flipped, and `historyIds` is returned to the client with no consumer. Plan 019 correctly repaired the managed-member FK path — but nothing reads the rows it fixed | S (delete) / M (build the reader) | MED | HIGH | Writers at `src/app/api/generate/route.ts:1284-1304` and `:1693-1710`; `rg statement_history src` outside those two sites and `src/types/*` returns nothing | none — see below |

### Considered and rejected (post-wave)

- **Finding 5 as a plan.** Real, but the fix is a product decision this pass cannot make: either build the "my generated statement history" reader the schema, RLS policies (migrations 022/061), and plan 019's FK work all imply, or delete the write path and the dead `historyIds` response field. Recording it as a finding so it is not re-audited; it needs an operator call before it becomes a plan.
- **`can_view_profile()` gaps in migration 203.** Audited every remaining `from("profiles")` and embedded `profiles!...fkey` read in `src/`. All the substantive ones resolve through an existing branch of the predicate: entry/library creators via `accomplishments.created_by` and `refined_statements.created_by`, award/decoration owners via the `*_shells` branches, share recipients via the five `*_shares` branches, team feed via the chain and co-supervisor branches, managed members via `team_members` / `pending_managed_links`. No fix needed.
- **Workspace/EPB collaboration host name before joining.** `use-workspace-collaboration.ts:221-226` and `use-epb-collaboration.ts:249-254` embed `host_profile` when resolving a session by code; a joiner is not yet a participant, so `can_view_profile()` can be false and the embed comes back null. Both sites already fall back to `"Unknown"` (`use-epb-collaboration.ts:271`). Cosmetic degradation on a pre-join screen, not worth a migration.
- **`search_profile_by_email` as an account-existence oracle.** Inherent to any invite-by-email flow — you cannot tell someone "this address already has an account" without confirming it. Exact-address matching is the accepted tradeoff; plan 023 narrows its returned columns but deliberately leaves the matching alone.
- **Rate-limiting the directory RPC.** The right long-term answer, but this repo has no rate-limit primitive to build on (`rg -l 'rate_limit' supabase/migrations` → nothing). Inventing a throttle table is a bigger project than the enumeration fix; noted as a deferred follow-up inside plan 023.
- **Uncommitted WIP (entries refactor, `hide-on-scroll.tsx`, `isAssessmentStale`, usage indicator, `add-*-accomplishment-dialog`).** Reviewed, no bug found: `npx tsc --noEmit` is clean, the new `isAssessmentStale` tests pass, `hide-on-scroll.tsx` drives motion from an `onScroll` handler with no effect subscription and honors `useReducedMotion()`. Note only: the two new entries components already carry hand-written `active:scale-[0.9x]` and an inline `cubic-bezier`, so they should join the motion migration when they land (flagged in plan 024's maintenance notes). Not planned to completion — it is someone else's in-progress work.
- **Plan 019 RLS completeness.** Verified: with `ratee_id = supervisor` and `team_member_id = member`, managed-member rows still satisfy both the "Users can view own statement history" policy (`061:338-341`) and "Supervisors can view managed member statement history" (`061:366-373`). No policy change needed.
- **Extracting the three near-identical shell share dialogs.** Genuine duplication that has now drifted twice (finding 2 is the second time), but a refactor bundled with a bug fix makes the fix unreviewable. Deferred inside plan 022's maintenance notes.

### Not audited (post-wave quick pass)

Performance, docs, dependency posture (`npm audit` not re-run), roadmap/direction, the award and decoration generate paths, Supabase advisor lint / a full RLS sweep beyond the `profiles` and `statement_history` policies touched above, Playwright or any e2e, React Doctor (`--scope changed` is dominated by the pre-existing dirty tree), the ~30 non-EPB files in the motion backlog, and — by operator lock — the EPB MPA split view and sentence drag-and-drop in `mpa-section-card.tsx`.

### Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 021  | Get `npm test` green again (stale assessment-coaching assertions) | P1 | S | — | TODO |
| 022  | Fix the nonexistent `supervision_history` query in the EPB + Award share dialogs | P1 | S | — | TODO |
| 023  | Close directory enumeration in `search_profiles_directory` (migration `204`) | P2 | M | soft: 021 (so `npm test` is a usable gate) | TODO |
| 024  | Migrate the remaining EPB surfaces to house motion + grow `ENFORCED_PATHS` | P2 | M | — | TODO |

Recommended: **021 → 022 → 023 → 024**. 021 first because it restores the gate every other plan verifies against; 022 is a small independent correctness win; 023 is the only one touching the database (migration `204` — next free number) and should land on a green suite; 024 is visual-only and can run in parallel with any of them.

---

## Topic — One-pending supervisor request (post-impl improve, 2026-08-01)

Migrations **207** / **208** + Sent Requests retract/resend/copy shipped. Remaining handoff:

| Plan | Title | Priority | Effort | Status |
|------|-------|----------|--------|--------|
| 025  | Characterize ensure/retract team_request RPCs (SQL/integration) | P3 | S–M | TODO |
