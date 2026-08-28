# Supabase Auth Email Templates

Canonical HTML lives in `supabase/templates/`. Local Auth reads those via
`supabase/config.toml`. **Hosted production does not.** SMTP to Resend only
delivers whatever GoTrue already rendered from the dashboard templates.

## Paste into the hosted dashboard

Authentication → Email Templates. Paste the matching file body (not
`{{ .ConfirmationURL }}`):

| Dashboard template | File | Link `type` |
|---|---|---|
| Confirm signup | `supabase/templates/confirmation.html` | `signup` |
| Magic Link | `supabase/templates/magic_link.html` | `magiclink` |
| Reset Password | `supabase/templates/recovery.html` | `recovery` |
| Change Email Address | `supabase/templates/email_change.html` | `email_change` |
| Invite user | `supabase/templates/invite.html` | `invite` |
| Reauthentication | `supabase/templates/reauthentication.html` | code only |

Every link template must:

1. Point at `/auth/confirm?token_hash={{ .TokenHash }}&type=...` so GET does
   not auto-verify (Menlo / Safe Links prefetch).
2. Prefer `{{ .RedirectTo }}` over `{{ .SiteURL }}` so preview deploys return
   to the requesting origin.
3. Include `{{ .Token }}` as a non-link 6–8 digit fallback.
4. Omit a second copy-paste of the same URL (scanners hit both).

Also set Authentication → Providers → **Email** → OTP expiration to **3600**.
That is not Phone OTP.

## Variables

| Variable | Used for |
|---|---|
| `{{ .Token }}` | Numeric OTP shown in the email |
| `{{ .TokenHash }}` | `/auth/confirm` query param |
| `{{ .RedirectTo }}` | Per-request origin from `emailRedirectTo` |
| `{{ .SiteURL }}` | Fallback origin + logo |
| `{{ .Email }}` / `{{ .NewEmail }}` | Recovery / email-change copy |

## Preview deploys

`{{ .SiteURL }}` is the fixed production Site URL. Links must use
`{{ .RedirectTo }}` when present. Allow-list:

- Site URL: `https://www.myepbuddy.com`
- Redirect URLs: `https://www.myepbuddy.com/**`,
  `https://*-oaiken-projects.vercel.app`,
  `https://*-oaiken-projects.vercel.app/**`

Do not allow `https://*.vercel.app/**`.

## Notes

- Logo is `{{ .SiteURL }}/icon.svg`.
- Confirm / magic / recovery / email-change share one mailer OTP TTL (1 hour).
- Reauthentication stays code-only (no clickable token).
- Test Gmail, Outlook, and a `.mil` / isolated-browser path after pasting.
