-- AI Call Credits + Stripe Billing foundation
-- Replaces weekly 20-call limit with lifetime credit balance (100 trial credits)

CREATE TYPE credit_transaction_type AS ENUM (
  'trial',
  'purchase',
  'consume',
  'refund',
  'adjustment'
);

-- Per-user credit balance
CREATE TABLE user_credits (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  balance INT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  trial_granted BOOLEAN NOT NULL DEFAULT false,
  lifetime_purchased INT NOT NULL DEFAULT 0 CHECK (lifetime_purchased >= 0),
  lifetime_consumed INT NOT NULL DEFAULT 0 CHECK (lifetime_consumed >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_credits_balance ON user_credits (balance);

-- Immutable ledger of credit changes
CREATE TABLE credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type credit_transaction_type NOT NULL,
  amount INT NOT NULL,
  balance_after INT NOT NULL CHECK (balance_after >= 0),
  action_type TEXT,
  model_id TEXT,
  stripe_event_id TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_credit_transactions_user_created ON credit_transactions (user_id, created_at DESC);
CREATE UNIQUE INDEX idx_credit_transactions_stripe_event
  ON credit_transactions (stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;

-- Stripe customer mapping
CREATE TABLE stripe_customers (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stripe_customers_stripe_id ON stripe_customers (stripe_customer_id);

-- Webhook idempotency
CREATE TABLE stripe_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Profile billing fields
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS billing_terms_accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_intro_seen_at TIMESTAMPTZ;

-- RLS
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own credits"
  ON user_credits FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can view own credit transactions"
  ON credit_transactions FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can view own stripe customer"
  ON stripe_customers FOR SELECT
  USING ((select auth.uid()) = user_id);

-- stripe_events: no user policies (service role only)

-- Realtime for live balance updates
ALTER TABLE user_credits REPLICA IDENTITY FULL;

-- Grant credits (service role / SECURITY DEFINER only)
CREATE OR REPLACE FUNCTION grant_credits(
  p_user_id UUID,
  p_amount INT,
  p_type credit_transaction_type,
  p_stripe_event_id TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance INT;
  v_new_balance INT;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'grant amount must be positive';
  END IF;

  -- Idempotent grant for Stripe webhooks
  IF p_stripe_event_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM credit_transactions
      WHERE stripe_event_id = p_stripe_event_id
    ) THEN
      SELECT balance INTO v_balance FROM user_credits WHERE user_id = p_user_id;
      RETURN COALESCE(v_balance, 0);
    END IF;
  END IF;

  INSERT INTO user_credits (user_id, balance, trial_granted, lifetime_purchased, lifetime_consumed)
  VALUES (
    p_user_id,
    p_amount,
    p_type = 'trial',
    CASE WHEN p_type = 'purchase' THEN p_amount ELSE 0 END,
    0
  )
  ON CONFLICT (user_id) DO UPDATE SET
    balance = user_credits.balance + p_amount,
    trial_granted = user_credits.trial_granted OR (p_type = 'trial'),
    lifetime_purchased = user_credits.lifetime_purchased +
      CASE WHEN p_type = 'purchase' THEN p_amount ELSE 0 END,
    updated_at = now()
  RETURNING balance INTO v_new_balance;

  INSERT INTO credit_transactions (
    user_id, type, amount, balance_after, stripe_event_id, description
  ) VALUES (
    p_user_id, p_type, p_amount, v_new_balance, p_stripe_event_id, p_description
  );

  RETURN v_new_balance;
END;
$$;

-- Consume one credit for default-key AI actions
-- Return codes:
--   >= 0  = success, value is remaining balance
--   -1    = burst rate limit (5 actions / 60s)
--   -2    = insufficient credits
CREATE OR REPLACE FUNCTION consume_credit(
  p_user_id UUID,
  p_action_type TEXT,
  p_model_id TEXT,
  p_provider TEXT,
  p_burst_limit INT DEFAULT 5
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_burst_count INT;
  v_one_minute_ago TIMESTAMPTZ;
  v_balance INT;
  v_new_balance INT;
BEGIN
  v_one_minute_ago := now() - INTERVAL '60 seconds';

  SELECT COUNT(*) INTO v_burst_count
  FROM api_usage
  WHERE user_id = p_user_id
    AND created_at >= v_one_minute_ago;

  IF v_burst_count >= p_burst_limit THEN
    RETURN -1;
  END IF;

  -- Ensure row exists (should from trial grant)
  INSERT INTO user_credits (user_id, balance)
  VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT balance INTO v_balance
  FROM user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_balance IS NULL OR v_balance <= 0 THEN
    RETURN -2;
  END IF;

  v_new_balance := v_balance - 1;

  UPDATE user_credits SET
    balance = v_new_balance,
    lifetime_consumed = lifetime_consumed + 1,
    updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO credit_transactions (
    user_id, type, amount, balance_after, action_type, model_id
  ) VALUES (
    p_user_id, 'consume', -1, v_new_balance, p_action_type, p_model_id
  );

  INSERT INTO api_usage (user_id, action_type, used_default_key, model_id, provider)
  VALUES (p_user_id, p_action_type, true, p_model_id, p_provider);

  RETURN v_new_balance;
END;
$$;

-- Backfill 100 trial credits for all existing users
INSERT INTO user_credits (user_id, balance, trial_granted, lifetime_purchased, lifetime_consumed)
SELECT p.id, 100, true, 0, 0
FROM profiles p
WHERE NOT EXISTS (SELECT 1 FROM user_credits uc WHERE uc.user_id = p.id);

INSERT INTO credit_transactions (user_id, type, amount, balance_after, description)
SELECT uc.user_id, 'trial', 100, uc.balance, 'Welcome trial — 100 AI calls'
FROM user_credits uc
WHERE uc.trial_granted = true
  AND NOT EXISTS (
    SELECT 1 FROM credit_transactions ct
    WHERE ct.user_id = uc.user_id AND ct.type = 'trial'
  );

-- Grant trial credits on new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, role, rank, afsc, unit, terms_accepted_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture'),
    'member',
    NEW.raw_user_meta_data->>'rank',
    NEW.raw_user_meta_data->>'afsc',
    NEW.raw_user_meta_data->>'unit',
    NULL
  );

  PERFORM grant_credits(NEW.id, 100, 'trial', NULL, 'Welcome trial — 100 AI calls');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION grant_credits FROM PUBLIC;
GRANT EXECUTE ON FUNCTION grant_credits TO service_role;

REVOKE ALL ON FUNCTION consume_credit FROM PUBLIC;
GRANT EXECUTE ON FUNCTION consume_credit TO authenticated, service_role;
