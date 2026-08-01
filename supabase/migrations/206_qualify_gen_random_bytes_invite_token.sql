-- Production still fails with:
--   function gen_random_bytes(integer) does not exist
-- inside issue_managed_member_invite_token (sqlstate 42883).
-- Migration 205 widened search_path, but hosted PostgREST can still miss
-- extensions depending on role/search_path. Qualify the call explicitly.

CREATE OR REPLACE FUNCTION public.issue_managed_member_invite_token(
  p_team_member_id uuid,
  p_invited_email text,
  p_expires_days integer DEFAULT 14
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_member record;
  v_token text;
  v_id uuid;
  v_expires timestamptz;
  v_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_email := lower(trim(p_invited_email));
  IF v_email IS NULL OR position('@' in v_email) = 0 THEN
    RAISE EXCEPTION 'Valid invited email is required';
  END IF;

  SELECT id, supervisor_id, email, linked_user_id
  INTO v_member
  FROM public.team_members
  WHERE id = p_team_member_id
    AND supervisor_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Team member not found or not authorized';
  END IF;

  IF v_member.linked_user_id IS NOT NULL THEN
    RAISE EXCEPTION 'Team member is already linked';
  END IF;

  UPDATE public.managed_member_invite_tokens
  SET consumed_at = now()
  WHERE team_member_id = p_team_member_id
    AND consumed_at IS NULL;

  -- Fully qualified: do not rely on search_path for pgcrypto
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires := now() + make_interval(days => GREATEST(COALESCE(p_expires_days, 14), 1));

  INSERT INTO public.managed_member_invite_tokens (
    team_member_id,
    invited_email,
    token,
    expires_at,
    created_by
  )
  VALUES (
    p_team_member_id,
    v_email,
    v_token,
    v_expires,
    auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN json_build_object(
    'success', true,
    'token', v_token,
    'token_id', v_id,
    'expires_at', v_expires,
    'invited_email', v_email
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.issue_managed_member_invite_token(uuid, text, integer)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
