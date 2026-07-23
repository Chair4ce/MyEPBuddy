-- Opaque invite tokens so invitees can sign up with a personal email
-- (e.g. Gmail) while still linking to a managed account that was invited
-- via a .mil address. Supervisors can then accept updating the stored email.

-- ---------------------------------------------------------------------------
-- 1. Token table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.managed_member_invite_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  invited_email text NOT NULL,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  consumed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_managed_invite_tokens_team_member
  ON public.managed_member_invite_tokens(team_member_id);

CREATE INDEX IF NOT EXISTS idx_managed_invite_tokens_token_active
  ON public.managed_member_invite_tokens(token)
  WHERE consumed_at IS NULL;

ALTER TABLE public.managed_member_invite_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Supervisors can view own invite tokens"
  ON public.managed_member_invite_tokens;
CREATE POLICY "Supervisors can view own invite tokens"
  ON public.managed_member_invite_tokens
  FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS "Supervisors can create invite tokens"
  ON public.managed_member_invite_tokens;
CREATE POLICY "Supervisors can create invite tokens"
  ON public.managed_member_invite_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.id = team_member_id
        AND tm.supervisor_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Pending-link mismatch columns + supervisor visibility
-- ---------------------------------------------------------------------------
ALTER TABLE public.pending_managed_links
  ADD COLUMN IF NOT EXISTS email_mismatch boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS invited_email text,
  ADD COLUMN IF NOT EXISTS signup_email text,
  ADD COLUMN IF NOT EXISTS email_update_status text
    CHECK (
      email_update_status IS NULL
      OR email_update_status IN ('pending', 'accepted', 'declined')
    );

DROP POLICY IF EXISTS "Supervisors can view pending links for their members"
  ON public.pending_managed_links;
CREATE POLICY "Supervisors can view pending links for their members"
  ON public.pending_managed_links
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.id = team_member_id
        AND tm.supervisor_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Issue invite token (invalidates prior active tokens for member)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.issue_managed_member_invite_token(
  p_team_member_id uuid,
  p_invited_email text,
  p_expires_days integer DEFAULT 14
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Invalidate unused prior tokens for this member
  UPDATE public.managed_member_invite_tokens
  SET consumed_at = now()
  WHERE team_member_id = p_team_member_id
    AND consumed_at IS NULL;

  v_token := encode(gen_random_bytes(32), 'hex');
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

-- ---------------------------------------------------------------------------
-- 4. Consume invite token after signup/login (email may differ)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consume_managed_member_invite(
  p_token text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite record;
  v_member record;
  v_profile record;
  v_link_id uuid;
  v_mismatch boolean;
  v_signup_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
    RAISE EXCEPTION 'Invalid invite token';
  END IF;

  SELECT *
  INTO v_invite
  FROM public.managed_member_invite_tokens
  WHERE token = trim(p_token)
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invite not found');
  END IF;

  IF v_invite.consumed_at IS NOT NULL THEN
    -- Idempotent: already consumed by this user is OK
    IF v_invite.consumed_by = auth.uid() THEN
      RETURN json_build_object(
        'success', true,
        'already_consumed', true,
        'team_member_id', v_invite.team_member_id
      );
    END IF;
    RETURN json_build_object('success', false, 'error', 'Invite already used');
  END IF;

  IF v_invite.expires_at < now() THEN
    RETURN json_build_object('success', false, 'error', 'Invite expired');
  END IF;

  SELECT id, email, full_name
  INTO v_profile
  FROM public.profiles
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Profile not found');
  END IF;

  v_signup_email := lower(trim(COALESCE(v_profile.email, '')));

  SELECT id, supervisor_id, email, linked_user_id, full_name, is_placeholder
  INTO v_member
  FROM public.team_members
  WHERE id = v_invite.team_member_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Managed account no longer exists');
  END IF;

  IF v_member.linked_user_id IS NOT NULL AND v_member.linked_user_id <> auth.uid() THEN
    RETURN json_build_object('success', false, 'error', 'Managed account already linked to another user');
  END IF;

  v_mismatch := (
    v_signup_email <> ''
    AND lower(trim(COALESCE(v_invite.invited_email, ''))) <> v_signup_email
  );

  INSERT INTO public.pending_managed_links (
    user_id,
    team_member_id,
    status,
    email_mismatch,
    invited_email,
    signup_email,
    email_update_status
  )
  VALUES (
    auth.uid(),
    v_invite.team_member_id,
    'pending',
    v_mismatch,
    lower(trim(v_invite.invited_email)),
    NULLIF(v_signup_email, ''),
    CASE WHEN v_mismatch THEN 'pending' ELSE NULL END
  )
  ON CONFLICT (user_id, team_member_id) DO UPDATE
  SET
    status = CASE
      WHEN pending_managed_links.status = 'rejected' THEN 'pending'
      ELSE pending_managed_links.status
    END,
    email_mismatch = EXCLUDED.email_mismatch,
    invited_email = EXCLUDED.invited_email,
    signup_email = EXCLUDED.signup_email,
    email_update_status = CASE
      WHEN EXCLUDED.email_mismatch THEN COALESCE(pending_managed_links.email_update_status, 'pending')
      ELSE pending_managed_links.email_update_status
    END,
    responded_at = CASE
      WHEN pending_managed_links.status = 'rejected' THEN NULL
      ELSE pending_managed_links.responded_at
    END
  RETURNING id INTO v_link_id;

  UPDATE public.team_members
  SET member_status = 'pending_link'
  WHERE id = v_invite.team_member_id
    AND linked_user_id IS NULL;

  UPDATE public.managed_member_invite_tokens
  SET
    consumed_at = now(),
    consumed_by = auth.uid()
  WHERE id = v_invite.id;

  RETURN json_build_object(
    'success', true,
    'link_id', v_link_id,
    'team_member_id', v_invite.team_member_id,
    'email_mismatch', v_mismatch,
    'invited_email', v_invite.invited_email,
    'signup_email', NULLIF(v_signup_email, ''),
    'member_name', v_member.full_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_managed_member_invite(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Supervisor accepts/declines updating managed email to signup email
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_managed_link_email_update(
  p_link_id uuid,
  p_accept boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link record;
  v_member record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT pml.*
  INTO v_link
  FROM public.pending_managed_links pml
  WHERE pml.id = p_link_id
    AND EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.id = pml.team_member_id
        AND tm.supervisor_id = auth.uid()
    );

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Link not found');
  END IF;

  IF NOT v_link.email_mismatch OR v_link.email_update_status IS DISTINCT FROM 'pending' THEN
    RETURN json_build_object('success', false, 'error', 'No pending email update for this link');
  END IF;

  SELECT * INTO v_member
  FROM public.team_members
  WHERE id = v_link.team_member_id
  FOR UPDATE;

  IF p_accept THEN
    IF v_link.signup_email IS NULL OR position('@' in v_link.signup_email) = 0 THEN
      RETURN json_build_object('success', false, 'error', 'Signup email missing');
    END IF;

    UPDATE public.team_members
    SET email = lower(trim(v_link.signup_email))
    WHERE id = v_link.team_member_id;

    UPDATE public.pending_managed_links
    SET
      email_update_status = 'accepted',
      email_mismatch = false
    WHERE id = p_link_id;

    RETURN json_build_object(
      'success', true,
      'accepted', true,
      'updated_email', lower(trim(v_link.signup_email)),
      'member_name', v_member.full_name
    );
  END IF;

  UPDATE public.pending_managed_links
  SET email_update_status = 'declined'
  WHERE id = p_link_id;

  RETURN json_build_object(
    'success', true,
    'accepted', false,
    'member_name', v_member.full_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_managed_link_email_update(uuid, boolean)
  TO authenticated;
