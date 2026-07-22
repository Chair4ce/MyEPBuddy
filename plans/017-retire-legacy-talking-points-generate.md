# 017 — Retire legacy feedback talking-points generate path

## Context

Expectations & Feedback now uses **Session Guides + Revise** (`POST /api/revise-feedback-session-guide`). The prior UI (`feedback-session-dialog.tsx`, `use-feedback-talking-points-generate.ts`) was removed. The billable generate route and prompt helpers remain for rollback / shared serialization.

## Goal

Decide keep-vs-delete for the unused generate surface so billing, prompts, and tests stay coherent.

## Work

1. Confirm nothing imports `generate-feedback-talking-points` except its own route + `billable-api` + tests.
2. **Option A (preferred if unused 1+ release):** delete `src/app/api/generate-feedback-talking-points/route.ts`, remove path from `billable-api.ts` / `BillableAction` if unused, keep shared helpers in `feedback-talking-points.ts` that revise still needs (`serializePortfolio`, `serializeAccomplishments`, etc.).
3. **Option B:** keep route as internal engine, document as deprecated, add a thin redirect note in route comment pointing to revise.
4. Update or trim tests that only cover generate-only prompt builders if Option A.
5. Verify: `npx tsc --noEmit`; `npx vitest run src/lib/__tests__/feedback-talking-points.test.ts src/lib/__tests__/feedback-session-guide-revise.test.ts`; `npx react-doctor@latest --verbose --scope changed`.

## Out of scope

- Changing Session Guide UX
- Migrating historical `supervisor_feedbacks` rows
