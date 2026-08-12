# 024 — Entries education/award follow-ups

## Context

Feature landed: expanded verbs, `education_context`, `accomplishment_awards`, recognition UI in add-accomplishment modal. Local **and remote** migrations **210** + **211** applied. Award-link replace now diffs add/remove (no delete-all wipe on insert failure).

## Still open (executor handoff)

1. **Refactor `AddAwardDialog`** to consume shared `AwardFields` (`src/components/awards/award-fields.tsx`) so Team awards and entry recognition stay in sync.
2. **Dashboard edit dialog** custom-verb parity (`accomplishment-detail-dialog` still Select-only).
3. **EPB generate path** — inject `formatEducationContextForPrompt` + linked awards into `generate-epb-run` / `/api/generate` the same way assessment already does.
4. **Award create from entries** — prefer a server action (RLS + validation) over client Supabase insert for self/supervisor award creation; tighten `award_team_members` WITH CHECK for self-award path.
5. **Pre-plan auto-assess** — surface soft-fail toast when some entries skip assessment so users know scoring may be incomplete.

## Verification

- `npx vitest run src/lib/__tests__/award-recognition-education.test.ts src/lib/__tests__/generate-epb-run.test.ts`
- `npm run motion:check`
- `npx react-doctor@latest --verbose --scope changed` (ignore pre-existing `mpa-section-card` sacred-surface finding)
- Confirm MyEPBuddy local stack (`project_id=myepbuddy`) before any `supabase db push --local`
