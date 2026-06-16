-- Admin: grant AI tokens to individual users or all accounts.
--
-- grant_credits() is service-role only (auth.uid() must be NULL). These RPCs are
-- admin-gated entry points callable from the admin UI via authenticated JWT.

CREATE OR REPLACE FUNCTION admin_assert_is_admin()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied: admin only';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION admin_assert_is_admin() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION admin_search_users(
  p_query TEXT,
  p_limit INTEGER DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_query TEXT := btrim(COALESCE(p_query, ''));
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 10), 1), 25);
BEGIN
  PERFORM admin_assert_is_admin();

  IF char_length(v_query) < 2 THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(u ORDER BY u.email)
    FROM (
      SELECT
        p.id,
        p.email,
        p.full_name,
        p.rank,
        COALESCE(uc.balance, 0) AS balance
      FROM profiles p
      LEFT JOIN user_credits uc ON uc.user_id = p.id
      WHERE p.email ILIKE '%' || v_query || '%'
         OR p.full_name ILIKE '%' || v_query || '%'
      ORDER BY p.email
      LIMIT v_limit
    ) u
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION admin_grant_target_count()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM admin_assert_is_admin();

  RETURN (SELECT COUNT(*)::INTEGER FROM profiles);
END;
$$;

CREATE OR REPLACE FUNCTION admin_grant_credits(
  p_user_ids UUID[],
  p_amount INTEGER,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_email TEXT;
  v_description TEXT;
  v_user_id UUID;
  v_new_balance INT;
  v_granted_count INT := 0;
  v_results JSONB := '[]'::jsonb;
BEGIN
  PERFORM admin_assert_is_admin();

  IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Select at least one user';
  END IF;

  IF p_amount IS NULL OR p_amount < 1 OR p_amount > 10000 THEN
    RAISE EXCEPTION 'Grant amount must be between 1 and 10000';
  END IF;

  SELECT email INTO v_admin_email
  FROM profiles
  WHERE id = auth.uid();

  v_description := format(
    'Admin grant — %s tokens by %s',
    p_amount,
    COALESCE(v_admin_email, 'admin')
  );

  IF NULLIF(btrim(COALESCE(p_note, '')), '') IS NOT NULL THEN
    v_description := v_description || ': ' || btrim(p_note);
  END IF;

  FOREACH v_user_id IN ARRAY p_user_ids
  LOOP
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id) THEN
      RAISE EXCEPTION 'User not found: %', v_user_id;
    END IF;

    INSERT INTO user_credits (user_id, balance, trial_granted, lifetime_purchased, lifetime_consumed)
    VALUES (v_user_id, p_amount, false, 0, 0)
    ON CONFLICT (user_id) DO UPDATE SET
      balance = user_credits.balance + p_amount,
      updated_at = now()
    RETURNING balance INTO v_new_balance;

    INSERT INTO credit_transactions (
      user_id,
      type,
      amount,
      balance_after,
      description
    ) VALUES (
      v_user_id,
      'adjustment',
      p_amount,
      v_new_balance,
      v_description
    );

    v_granted_count := v_granted_count + 1;
    v_results := v_results || jsonb_build_object(
      'user_id', v_user_id,
      'new_balance', v_new_balance
    );
  END LOOP;

  RETURN jsonb_build_object(
    'granted_count', v_granted_count,
    'amount_per_user', p_amount,
    'total_tokens', v_granted_count * p_amount,
    'users', v_results
  );
END;
$$;

CREATE OR REPLACE FUNCTION admin_grant_credits_all(
  p_amount INTEGER,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_email TEXT;
  v_description TEXT;
  v_user_id UUID;
  v_new_balance INT;
  v_granted_count INT := 0;
BEGIN
  PERFORM admin_assert_is_admin();

  IF p_amount IS NULL OR p_amount < 1 OR p_amount > 10000 THEN
    RAISE EXCEPTION 'Grant amount must be between 1 and 10000';
  END IF;

  SELECT email INTO v_admin_email
  FROM profiles
  WHERE id = auth.uid();

  v_description := format(
    'Admin grant (all users) — %s tokens by %s',
    p_amount,
    COALESCE(v_admin_email, 'admin')
  );

  IF NULLIF(btrim(COALESCE(p_note, '')), '') IS NOT NULL THEN
    v_description := v_description || ': ' || btrim(p_note);
  END IF;

  FOR v_user_id IN SELECT id FROM profiles ORDER BY email
  LOOP
    INSERT INTO user_credits (user_id, balance, trial_granted, lifetime_purchased, lifetime_consumed)
    VALUES (v_user_id, p_amount, false, 0, 0)
    ON CONFLICT (user_id) DO UPDATE SET
      balance = user_credits.balance + p_amount,
      updated_at = now()
    RETURNING balance INTO v_new_balance;

    INSERT INTO credit_transactions (
      user_id,
      type,
      amount,
      balance_after,
      description
    ) VALUES (
      v_user_id,
      'adjustment',
      p_amount,
      v_new_balance,
      v_description
    );

    v_granted_count := v_granted_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'granted_count', v_granted_count,
    'amount_per_user', p_amount,
    'total_tokens', v_granted_count * p_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION admin_search_users(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_search_users(TEXT, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION admin_grant_target_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_grant_target_count() TO authenticated;

REVOKE ALL ON FUNCTION admin_grant_credits(UUID[], INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_grant_credits(UUID[], INTEGER, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION admin_grant_credits_all(INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_grant_credits_all(INTEGER, TEXT) TO authenticated;

COMMENT ON FUNCTION admin_search_users(TEXT, INTEGER) IS 'Admin-only. Search profiles by email or name for token grants.';
COMMENT ON FUNCTION admin_grant_target_count() IS 'Admin-only. Count of profiles eligible for bulk token grants.';
COMMENT ON FUNCTION admin_grant_credits(UUID[], INTEGER, TEXT) IS 'Admin-only. Grant tokens to one or more users (adjustment ledger entries).';
COMMENT ON FUNCTION admin_grant_credits_all(INTEGER, TEXT) IS 'Admin-only. Grant tokens to every profile (adjustment ledger entries).';
