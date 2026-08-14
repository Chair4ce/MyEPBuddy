# Plan 027: Add review-link email preview + route characterization tests

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 3e8a076..HEAD -- src/lib/email/review-link.ts src/app/api/send-review-email/route.ts src/app/email-preview src/lib/__tests__/review-link-email.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (PR that wired Resend for review emails can merge independently)
- **Category**: tests | dx
- **Planned at**: commit `3e8a076`, 2026-08-14
- **Branch context**: follow-up to `cursor/fix-review-share-email-toast-0086` (review share toast no longer mentions SendGrid/Twilio)

## Why this matters

Review-link email HTML is now built in `src/lib/email/review-link.ts` and sent via Resend, matching managed-member invites. Managed invites already have a local preview route (`src/app/email-preview/managed-invite/page.tsx`) so designers/devs can eyeball copy without sending. Review links lack that preview, and `/api/send-review-email` has no characterization tests for the `email_not_configured` / ownership / success shapes. Small gaps — easy to regress the toast contract that users just complained about.

## Current state

- `src/lib/email/review-link.ts` — `buildReviewLinkEmail({ siteUrl, senderDisplayName, rateeName, rateeRank, mentorLabel, reviewUrl, expiresAt, shellType })` returns `{ subject, html, text }`. Covered by `src/lib/__tests__/review-link-email.test.ts` (HTML escape + award wording).
- `src/app/api/send-review-email/route.ts` — auth + rate limit + ownership lookup by public `token` + Resend send. Returns:
  - `{ success: true, emailSent: false, code: "email_not_configured", error: "…Copy and share…" }` when keys missing
  - `{ success: true, emailSent: true }` on send success
  - Builds `reviewUrl` **server-side** from `review_tokens` (do not reintroduce client `reviewUrl` trust).
- Exemplar preview page: `src/app/email-preview/managed-invite/page.tsx` (renders `buildManagedMemberInviteEmail` HTML for new + existing variants).
- Middleware already allows `/email-preview/` as public (`src/lib/supabase/middleware.ts`).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Unit tests | `npm run test -- src/lib/__tests__/review-link-email.test.ts` | pass |
| Lint | `npm run lint` | 0 errors |
| Manual preview | open `http://localhost:3000/email-preview/review-link` after `npm run dev` | HTML renders, no auth redirect |

## Steps

### 1. Add email preview page

Create `src/app/email-preview/review-link/page.tsx` mirroring managed-invite:

- Server component that calls `buildReviewLinkEmail` twice (EPB + award) with safe sample data.
- Render `dangerouslySetInnerHTML` inside an iframe/`div` like the managed-invite preview (copy that file’s layout chrome — do not invent new design).
- Include subject + plain-text `<pre>` for each sample.

**Verify**: with `npm run dev`, `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/email-preview/review-link` → `200`.

### 2. Add light characterization tests for response codes (unit-level)

Do **not** spin up Next request handlers unless the repo already has a pattern for that. Prefer testing pure helpers already exported:

- Keep/expand `review-link-email.test.ts` if preview samples need shared fixtures.
- If you extract a tiny `normalizeSendReviewEmailBody` / response mapper, unit-test `email_not_configured` messaging strings so the UI contract cannot silently return `"SendGrid"` / `"Twilio"` again:

```ts
expect(message).not.toMatch(/sendgrid|twilio/i);
```

**Verify**: `npm run test -- src/lib/__tests__/review-link-email.test.ts` passes; grep the API route for SendGrid/Twilio returns nothing.

### 3. Docs touch (optional, only if README already documents email-preview)

If `README.md` lists email preview URLs, add `/email-preview/review-link`. Otherwise skip.

## Out of scope

- Wiring production Resend keys / DNS
- Changing create-review-link-dialog toast UX further
- Twilio/SMS
- Rate-limit Redis migration
- Any edits under `src/components/epb/mpa-section-card.tsx`

## STOP conditions

- Preview route redirects to login (middleware publicPaths drifted) — fix middleware allowlist first, then continue.
- `buildReviewLinkEmail` signature changed vs excerpts — re-read and adapt; do not invent a second builder.
- Temptation to reintroduce stub “Email service not configured. Please integrate SendGrid…” — STOP; that string must not return.

## Done criteria

- [ ] `/email-preview/review-link` returns 200 and shows EPB + award samples
- [ ] No `SendGrid` / `Twilio` strings in `src/app/api/send-review-email/route.ts`
- [ ] `npm run test -- src/lib/__tests__/review-link-email.test.ts` passes
- [ ] `plans/README.md` row for 027 marked DONE

## Maintenance

Future transactional emails should: (1) live under `src/lib/email/`, (2) use Resend helpers, (3) get an `/email-preview/...` page, (4) never surface vendor names in user-facing toasts.
