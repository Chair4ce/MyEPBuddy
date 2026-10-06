# Account inactivity

Operational notes for the inactivity job. The legal text in Terms §9 and the Privacy “Data Retention” section has to be approved before suspension or deletion is turned on.

## Timeline

Activity is the latest of:

- `auth.users.last_sign_in_at`, or `created_at` when the person has never signed in
- the newest `auth.sessions` `updated_at` / `refreshed_at`
- `profiles.inactivity_activity_at`, which is set when a suspended account comes back, because the auth timestamp can lag that request

From that anchor:

| Inactive | Action |
|---|---|
| 305 days | 60-day notice |
| 335 days, and at least 30 days after the 60-day notice was sent | 30-day notice |
| 365 days, and at least 60 days after the first notice and 30 days after the second | Soft suspend |
| 395 days, and at least 30 days after suspension | Delete |

A late notice pushes the later dates out. It never pulls them in. Each email states the suspension date that rule produced. Deletion is 30 days after the stated suspension date.

Suspension keeps accomplishments, EPBs, and AI credits. Signing in clears `inactivity_suspended_at` and restores access. Deletion removes avatars, the Stripe customer, and the auth user — the same steps as Settings → Delete account. Unused AI credits are lost only at deletion.

## Who is skipped

- Unconfirmed email (nothing is sent, and the account is not deleted)
- `profiles.role = admin` (also seeded `inactivity_exempt`)
- `profiles.inactivity_exempt = true`
- `banned_until` still in the future
- Permanent bounce or complaint (`profiles.email_suppressed_at`): no email is sent. If both notices were already sent, the account can still be suspended and the suspended notice is marked `skipped`. A bounce before those notices keeps the account out of suspension and deletion, because both warnings have to be sent first.

`marketing_email_opt_in` is ignored. These are account messages: no promo, no unsubscribe link.

Unconfirmed accounts are left in place. They are not silently deleted.

## Switches

Cron: `GET /api/cron/inactivity-notices` daily at 09:00 America/Phoenix (`0 16 * * *`). `Authorization: Bearer $CRON_SECRET`.

| Env | Ships as | Values |
|---|---|---|
| `INACTIVITY_NOTICES_MODE` | `dry_run` | `off`, `dry_run`, `live` |
| `INACTIVITY_SUSPEND_MODE` | `off` | `off`, `dry_run`, `live` |
| `INACTIVITY_DELETE_MODE` | `off` | `off`, `dry_run`, `live` |

An unknown value is `off`. `?dry_run=1` forces a `live` switch down to `dry_run`. It cannot turn `off` into a run.

Caps, overridable with the same names: 25 notice emails per Phoenix day (shared with the suspension email), 25 suspensions per run, 25 deletions per Phoenix week (Monday start).

### Dry run vs live

- **off** — that pass does not read candidates.
- **dry_run** — counts only. No email, no notice row, no suspension, no deletion, no cancellation.
- **live** — cancels open notices whose anchor is older than current activity (or the account became exempt), then sends, suspends, or deletes inside the caps.

Do not set suspend or delete to `live` until the Terms and Privacy wording is merged. Suspension also requires both notices to have been sent for that inactivity cycle, so a dry-run-only history cannot suspend anyone.

### Turning notices on

1. Confirm Terms §9 and the Privacy retention paragraph are approved and deployed.
2. Set `INACTIVITY_NOTICES_MODE=live` on the server. Leave suspend and delete `off`.
3. Watch the cron JSON. It has counts only (`cancelled`, `due`, `sent`, `skipped`, `failed`, `acted`, `capped`). It must not contain email addresses.
4. After at least one clean live notice week, set `INACTIVITY_SUSPEND_MODE=live` when you are ready for day-365 suspension.
5. Set `INACTIVITY_DELETE_MODE=live` only when deletion at day 395 is approved. The first deletions cannot happen until 30 days after the first suspensions.

## Exempt or restore someone

Service role or a `postgres` session only. Authenticated users cannot change these columns.

```sql
update public.profiles
set inactivity_exempt = true
where id = '<user uuid>';
```

Promoting `role` to `admin` sets `inactivity_exempt` as well.

A suspended person is restored on their next authenticated request. To clear it by hand:

```sql
select public.inactivity_cancel_user('<user uuid>'::uuid, 'manual');
```

Then clear `inactivity_suspended_at` from `auth.users.raw_app_meta_data` if it is still set. The app does both.

## Email

From `EMAIL_FROM`. Login link: `https://www.myepbuddy.com/login?next=/dashboard&utm_campaign=inactivity-60` (or `inactivity-30`, `inactivity-suspended`). No magic link.

Preview: `/email-preview/inactivity-notice`.

Resend sends use `Idempotency-Key: inactivity/{user}/{type}/{anchorEpoch}` and return the Resend email id onto the notice row. Three failures stop retries. A suppressed address is marked `skipped` and is not retried.

## Lock and data

The run takes `inactivity_try_lock()` (a single-row lock, 20 minutes stale). Two runs do not overlap.

Notice rows live in `account_inactivity_notices`. One open row per user, notice type, and activity anchor. Deleting the auth user sets `user_id` null instead of cascading, so the weekly deletion count survives.
