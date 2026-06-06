#!/usr/bin/env bash
# Forward Stripe webhooks to the local Next.js billing handler.
#
# IMPORTANT: Must use the same STRIPE_SECRET_KEY as the app. If you run plain
# `stripe listen` (CLI default login), events from checkout won't arrive when
# the app uses a different Stripe account/key.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env.local ]]; then
  echo "Missing .env.local — copy env.example and set STRIPE_SECRET_KEY."
  exit 1
fi

# shellcheck disable=SC2046
export $(grep -E '^STRIPE_SECRET_KEY=' .env.local | xargs)

if [[ -z "${STRIPE_SECRET_KEY:-}" ]]; then
  echo "STRIPE_SECRET_KEY not set in .env.local"
  exit 1
fi

echo "Starting Stripe CLI → http://localhost:3000/api/billing/webhook"
echo "Using STRIPE_SECRET_KEY from .env.local (must match your app's checkout account)."
echo ""
echo "When Ready! appears, copy the whsec_... signing secret into"
echo "STRIPE_WEBHOOK_SECRET in .env.local and restart 'npm run dev'."
echo ""

exec stripe listen \
  --api-key "$STRIPE_SECRET_KEY" \
  --forward-to localhost:3000/api/billing/webhook
