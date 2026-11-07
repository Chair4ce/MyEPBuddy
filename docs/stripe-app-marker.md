# Stripe app marker contract

Shared by MyEPBuddy and PeriDocs. Approved by Jacy on Nov 6, 2026, 7:54 PM America/Phoenix. This repo implements the MyEPBuddy side only.

## Marker

| App | `metadata.app` |
| --- | --- |
| MyEPBuddy | `myepbuddy` |
| PeriDocs | `peridocs` |

The key is exactly `app`. Values are lowercase and exact. Stripe metadata is not copied onto related objects except for the documented snapshots (PaymentIntent to Charge, Payment Link to Checkout Session, Subscription to Invoice). Setting it on a Checkout Session does not set it on the Invoice. Each owned object must be stamped on its own.

MyEPBuddy stamps the same map on every new credits Checkout Session:

- `metadata`
- `payment_intent_data.metadata` (copied once onto the Charge)
- `invoice_creation.invoice_data.metadata` (`invoice_creation.enabled` stays true)

The map keeps `user_id`, `packs`, `credits`, and any `campaign_slug` / `campaign_tz` already sent. Hosted and embedded Checkout both use it. Pack quantity stays the line-item quantity (`$1` price times packs).

Do not set `metadata.app` on the Stripe Customer. One Customer may buy from both apps. Do not update an existing Customer to claim a single owner.

There is no subscription, Payment Link, or standalone Invoice create path in this repo. A future subscription create must set `subscription_data.metadata.app` the same way. Do not invent that path here.

## Webhook classification

Endpoint events stay `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Signature verification uses the raw body and `STRIPE_WEBHOOK_SECRET` before any classification. API version on the server client stays `2025-02-24.acacia`. Do not upgrade the SDK or the API version in this change.

After a valid signature, idempotency (`stripe_events`, then `grant_credits` on `stripe_event_id`) runs before fulfillment.

| Session `metadata.app` | Result |
| --- | --- |
| `peridocs` | HTTP 200 `{ received: true, skipped: "foreign_app" }`. No credit grant, no campaign bonus, no `stripe_events` row. |
| `myepbuddy` | Existing paid and pack-quantity grant, only when the line item is a MyEPBuddy price. |
| missing or empty | Same grant path when the line item is a MyEPBuddy price. This is the legacy unmarked purchase. |
| any other value | Not foreign. Grant only when the line item is a MyEPBuddy price. |
| other event types (`invoice.paid`, and anything else) | Not foreign. Existing ack. No credit grant. |

A MyEPBuddy price is either:

- the configured id from `STRIPE_PRICE_100_CREDITS` (fallback `STRIPE_PRICE_150_CREDITS`, then `STRIPE_STARTER_PRICE_ID`), or
- live price `price_1TfRl1RmU7HJ5YzinnKdFWDl` together with product `prod_UelHo41h4odIsL`.

`user_id` chooses which account to credit after ownership is established. It is not proof the payment belongs to this app. Email is ignored. `payment_status` must be `paid`. Credits still come from line-item quantity (then pre-tax subtotal), not from the `credits` metadata string. Unpaid `checkout.session.completed` stays unrecorded so `checkout.session.async_payment_succeeded` can grant once.

An unknown price returns 200 `{ skipped: "invalid_price" }` and records the event so Stripe does not retry a payment this app will not fulfill. A line-item fetch error still returns 500.

## Compatibility

Checkout create already uses `invoice_creation.invoice_data.metadata` on Stripe API `2025-02-24.acacia` (stripe-node 17.7.0). No new webhook event types. No Customer write beyond the existing first-time `user_id` insert. No database migration. No live object updates.

## Tests

`src/lib/stripe/__tests__/checkout-app-marker.test.ts` covers hosted and embedded create params: session metadata, `payment_intent_data.metadata`, and `invoice_creation.invoice_data.metadata`, preserved campaign fields and quantities, and a Customer create that has no `app` key.

`src/app/api/billing/webhook/__tests__/route.test.ts` uses signed local fixtures only. It covers invalid signatures, own-marked paid and async grants exactly once, pack quantity, explicit PeriDocs ack before fulfillment, legacy configured and canonical live prices, unknown price with a generic `user_id`, unknown markers and `invoice.paid` not classified as foreign, and email-only metadata.

## Rollout

1. Review and merge this PR. Do not deploy, backfill, resend events, rotate secrets, or change the live webhook endpoint from the merge.
2. Deploy MyEPBuddy so new Checkout Sessions, PaymentIntents, and Invoices carry `app=myepbuddy`, and so this webhook ignores `app=peridocs` and unmarked unknown prices.
3. Deploy PeriDocs after that. New MyEPBuddy invoices then have invoice metadata PeriDocs can ack. PeriDocs checkout events gain `app=peridocs`, which this webhook already ignores.

Historical invoice `in_1UYu7lRmU7HJ5YzipaCa85xC` and its companion invoice events stay unmarked. This change does not rewrite them and does not resend `evt_1UYu7nRmU7HJ5Yzi8KDqbLnU`. PeriDocs can keep retrying those invoice events until that app accepts them or Stripe stops retrying. MyEPBuddy does not subscribe to those invoice events.

## Residual risk

- An unmarked or oddly marked checkout that still uses the MyEPBuddy price grants credits. `app=peridocs` does not, even on that price.
- Ownership is decided from Checkout Session metadata and the line-item price id returned by the pinned API. This webhook does not read basil `lines.data[].pricing.price_details`.
- A paid own-app session whose line item has no price id is recorded as `invalid_price` and not granted. That needs a manual credit decision, not an automatic retry.
- Foreign deliveries are not stored. Each one returns 200 without granting. A later bug that recorded them would also be safe only because the grant path is skipped.
- `metadata.user_id` on the Customer is unchanged and is not consulted by the webhook.
