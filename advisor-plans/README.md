# Advisor Plans

Generated / reconciled by the improve skill on 2026-07-31.

**Scope note:** Repo `plans/` already tracks unrelated assessment/auth work, so advisor output lives in `advisor-plans/`. Working tree was uncommitted on `main` at `e1e258b`.

Execute in the order below within each topic unless dependencies say otherwise. Each executor: read the plan fully before starting, honor its STOP conditions, and update your row when done.

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
| 001  | Harden webhook credit derivation for adjustable quantity | P1 | S | — | TODO |
| 002  | Expand purchase-quantity edge-case tests | P1 | S | 001 soft (write tests against final helper API) | TODO |

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
| 004  | Surface EPB formatting violation flags in generate UI | P2 | S | — | TODO |

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
| 006  | Flush Impact Booster drafts on Generate / Revise (+ sync dual panels) | P2 | S | — | TODO |

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
| 007  | Cover `stewardship_impact` in background redaction safety net | P1 | M | — | TODO |
| 008  | Add stewardship fields to Accomplishment Detail edit form | P2 | S | — | TODO |

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
| 009  | Extract shared EPB shell create helper | P2 | M | — | TODO |
| 010  | Unit-test fuse majority MPA + payload helpers | P2 | S | soft: nicer after extracting pure helpers | TODO |

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
- Topic C: 005 DONE; next is **006** (draft flush + dual-panel sync).
- Topic D: shipped with migration 198. **007** (background redaction coverage) and **008** (detail-dialog stewardship parity) are independent of each other and of Topics A–C — either order is fine. Optional follow-up beyond this pass: team bulk-add stewardship UI (rejected this round, see Topic D).
- Topic E: Fuse to EPB shipped on Entries. **010** (unit tests) is the cheap next step; **009** (shared shell create) before a third create call site appears.
