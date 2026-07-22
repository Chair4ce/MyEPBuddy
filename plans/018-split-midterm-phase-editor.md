# 018 — Split Midterm/Final phase editor for maintainability

Written against: `2ec396a` (update HEAD when executing if drifted).

## Context

Expectations & Feedback Midterm/Final now use three surfaces (ACA session settings, evidence list, generated Feedback Session Guide). The logic lives mainly in `src/components/team/session-guide-phase-editor.tsx`, which grew large after the dual-pane work.

## Goal

Extract Midterm/Final-specific UI into focused components without behavior change, so Initial stays simple and Midterm/Final remain testable.

## Work

1. Extract `MidtermFinalGuideEditor` (or similar) under `src/components/team/` owning settings textarea, evidence section, generate CTA, and guide textarea.
2. Keep `SessionGuidePhaseEditor` as a thin router: Initial vs Midterm/Final.
3. Leave API routes, prompts, and `FeedbackEvidenceList` as-is unless a prop interface cleanup is required.
4. Verify: `npx tsc --noEmit`; `npx vitest run src/lib/__tests__/feedback-session-guide-*.test.ts`; `npx react-doctor@latest --verbose --scope changed` (no new errors; triage score).

## Out of scope

- Changing generate/revise prompts
- Migration / schema changes
- Ratee-facing shared feedback panel

## Done when

- Phase editor file(s) each stay under ~400 lines where practical
- No useEffect introduced
- Behavior unchanged: Format settings vs Generate guide still distinct
